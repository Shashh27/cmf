import os
import re
import json
import redis
import decimal
import datetime
import asyncio
from contextvars import ContextVar
import concurrent.futures
from typing import Dict, List, Any, Tuple, AsyncGenerator, Optional
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from sqlalchemy import text
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from DB.database import engine
from DB.models.chatbot import ChatRequest, ChatResponse
from DB.models.access_control import AccessUser
from auth.deps import get_current_user
from chatbot.schema_knowledge import OUT_OF_SCOPE_MESSAGE, build_system_prompt
from chatbot.intent import get_intent_hints
from chatbot.broad_search import is_clearly_off_topic, try_broad_search, extract_search_terms
from chatbot.intent_queries import try_intent_query, has_cmf_signal
from chatbot.material_sql import try_material_query
from chatbot.user_context import (
    UserContext,
    try_user_scoped_query,
    personalized_greeting,
    get_role_suggestions,
    get_user_intent_hints,
)

_chat_user_context: ContextVar[Optional[UserContext]] = ContextVar(
    "chat_user_context", default=None
)
from chatbot.query_patterns import (
    PARTS_FOR_ORDER_SQL,
    OPERATIONS_FOR_ORDER_SQL,
    try_quick_pattern,
)
from chatbot.part_sql import (
    is_part_stock_query,
    part_by_term_sql,
    part_stock_by_term_sql,
    try_part_lookup_query,
    try_part_stock_query,
)
from chatbot.question_classifier import (
    classify_question,
    clarification_message,
    is_off_topic_classification,
    needs_classification,
    route_by_classification,
)
from chatbot.schema_driven_sql import generate_sql_from_schema
from chatbot.result_validator import (
    filter_results_for_question,
    results_look_wrong,
)
from chatbot.order_sql import try_order_query
from chatbot.tool_sql import try_tool_query
from chatbot.context_resolver import resolve_follow_up_question, try_machines_for_order_query
from chatbot.groq_client import groq_follow_ups, is_groq_enabled


# ══════════════════════════════════════════════════════════════════════════════
# JSON ENCODER — handles datetime, date, time, Decimal, UUID etc. returned by
# SQLAlchemy/psycopg2 rows. Without this, json.dumps() raises:
#   TypeError: Object of type datetime is not JSON serializable
# ══════════════════════════════════════════════════════════════════════════════

class CMFJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime.datetime, datetime.date, datetime.time)):
            return obj.isoformat()
        if isinstance(obj, datetime.timedelta):
            return str(obj)
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        try:
            import uuid
            if isinstance(obj, uuid.UUID):
                return str(obj)
        except ImportError:
            pass
        return super().default(obj)


def json_dumps(obj) -> str:
    """Safe JSON dump for SQL rows containing datetime/Decimal/UUID."""
    return json.dumps(obj, cls=CMFJSONEncoder)


def clean_row(row: dict) -> dict:
    """
    Convert a single SQL result row's values into JSON-safe Python types
    (datetime -> ISO string, Decimal -> float, etc). Used before sending
    data to the frontend AND before format_answer() processes it.
    """
    cleaned = {}
    for k, v in row.items():
        if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
            cleaned[k] = v.isoformat()
        elif isinstance(v, datetime.timedelta):
            cleaned[k] = str(v)
        elif isinstance(v, decimal.Decimal):
            cleaned[k] = float(v)
        else:
            cleaned[k] = v
    return cleaned


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — SQL VALIDATOR
# ══════════════════════════════════════════════════════════════════════════════

class SQLValidator:
    FORBIDDEN = re.compile(
        r'\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE)\b',
        re.IGNORECASE
    )

    @classmethod
    def validate(cls, sql: str) -> Tuple[bool, str]:
        s = sql.strip()
        if not s.upper().startswith("SELECT"):
            return False, "Only SELECT queries are allowed."
        if cls.FORBIDDEN.search(s):
            kw = cls.FORBIDDEN.search(s).group(1)
            return False, f"Keyword '{kw}' is not allowed."
        return True, ""

    @staticmethod
    def extract(raw: str) -> str:
        m = re.search(r'```(?:sql)?\s*(SELECT[\s\S]*?)```', raw, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        m = re.search(r'(SELECT[\s\S]+)', raw, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        return raw.strip()


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — REDIS HISTORY
# ══════════════════════════════════════════════════════════════════════════════

class HistoryService:
    def __init__(self):
        self.r = None
        self.enabled = True
        try:
            self.r = redis.from_url(
                os.getenv("REDIS_URL", "redis://localhost:6379"),
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        except Exception:
            self.enabled = False

    def get(self, session_id: str, max_turns: int = 6) -> List[Dict]:
        if not self.enabled or self.r is None:
            return []
        try:
            raw = self.r.lrange(f"chat:{session_id}", 0, max_turns * 2 - 1)
            msgs = []
            for item in reversed(raw):
                try:
                    msgs.append(json.loads(item))
                except Exception:
                    pass
            return msgs
        except Exception:
            self.enabled = False
            return []

    def save(self, session_id: str, question: str, answer: str, data: Optional[List[Dict]] = None):
        if not self.enabled or self.r is None:
            return
        key = f"chat:{session_id}"
        try:
            payload = {"role": "assistant", "content": answer}
            if data:
                payload["data"] = data[:5]
            self.r.lpush(key, json_dumps(payload))
            self.r.lpush(key, json_dumps({"role": "user", "content": question}))
            self.r.ltrim(key, 0, 19)
            self.r.expire(key, 86400)
        except Exception:
            self.enabled = False

    def clear(self, session_id: str):
        if not self.enabled or self.r is None:
            return
        try:
            self.r.delete(f"chat:{session_id}")
        except Exception:
            self.enabled = False


GREETING_RE = re.compile(
    r"^\s*(hi|hello|hey|yo|bro|hii|good\s+(morning|afternoon|evening))(?:[\s,!.].*)?$",
    re.IGNORECASE,
)


def normalize_question(question: str) -> str:
    return re.sub(r"\s+", " ", (question or "").strip())


def is_greeting_only(question: str) -> bool:
    return bool(GREETING_RE.match(normalize_question(question)))


def build_scope_guidance(question: str, ctx: Optional[UserContext] = None) -> Optional[Dict[str, Any]]:
    q = normalize_question(question)
    ctx = ctx or UserContext()
    role_prompts = get_role_suggestions(ctx)
    if not q:
        return {
            "answer": "Ask a question about your CMF data. For example: *show all orders* or *parts for SO-001*.",
            "sql": "",
            "data": [],
            "suggestions": role_prompts[:3],
        }
    if is_greeting_only(q):
        return {
            "answer": personalized_greeting(ctx),
            "sql": "",
            "data": [],
            "suggestions": role_prompts[:3],
        }
    if is_clearly_off_topic(q):
        return {
            "answer": OUT_OF_SCOPE_MESSAGE,
            "sql": "",
            "data": [],
            "suggestions": ["Show all orders", "Pending operations", "Show all customers"],
        }
    return None


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — ANSWER FORMATTER (no second LLM call)
# ══════════════════════════════════════════════════════════════════════════════

def get_context_preamble(question: str, data: List[Dict]) -> str:
    """Generate context preamble based on query type."""
    if not data:
        return ""
    
    q = question.lower()

    if re.search(r"\b(stock|inventory|quantity|level|available)\b", q) and re.search(
        r"\b(schedule|scheduled|planned|operation)\b", q
    ):
        return "Stock availability for scheduled operations (tools and materials):"
    if re.search(r"\b(due\s*date|expected\s+date|completion|deadline)\b", q) and "order" in q:
        return "Here is the due date for your order:"
    if re.search(r"\bstock\b", q) and "order" in q:
        return "Here is the material stock for parts on this order:"
    
    if 'order' in q and 'machine' in q:
        return "Here are the machines assigned to your order:"
    if 'order' in q and ('part' in q or 'component' in q or 'bom' in q):
        return "Here are the parts belonging to your order:"
    if 'order' in q and 'operation' in q:
        return "Here are the operations for your order:"
    if 'operation' in q:
        return "Here are the operations:"
    if 'part' in q:
        return "Here are the parts:"
    if 'order' in q:
        return "Here are the orders in the CMF shop floor:"
    if 'machine' in q:
        return "Here are the machines:"
    if 'work center' in q or 'workcenter' in q:
        return "Here are the work centers:"
    if 'tool' in q:
        if 'schedule' in q or 'machine' in q or 'operation' in q:
            return "Here are the tools required for scheduled operations on machines:"
        return "Here are the tools:"
    if 'operator' in q or 'worker' in q:
        return "Here are the operators:"
    if 'customer' in q:
        return "Here are the customers:"
    if 'product' in q:
        return "Here are the products:"
    if 'material' in q or 'stock' in q:
        if 'part' in q:
            return "Here is the stock level for your part:"
        return "Here is the material stock:"
    if 'vendor' in q or 'supplier' in q:
        return "Here are the vendors:"
    if 'breakdown' in q:
        return "Here are the machine breakdowns:"
    if 'leave' in q or 'absent' in q:
        return "Here are the operator leaves:"
    if 'quality' in q or 'inspection' in q:
        return "Here are the quality inspections:"
    if 'production' in q or 'log' in q:
        return "Here are the production logs:"
    if 'planned' in q or 'gantt' in q or 'reschedul' in q:
        return "Here is the schedule data:"
    if 'notification' in q or 'alert' in q:
        return "Here are the notifications:"
    if 'energy' in q or 'ems' in q or 'power' in q:
        return "Here is the energy data:"
    if 'pm' in q or 'preventive' in q:
        return "Here is the preventive maintenance data:"
    if 'recycle' in q:
        return "Here are the recycled items:"
    if 'outsource' in q:
        return "Here are the outsourced parts:"
    if 'assembly' in q:
        return "Here are the assemblies:"
    if 'oee' in q:
        return "Here is the OEE data:"
    if 'request' in q:
        return "Here are the inventory requests:"
    
    return "Here are the results:"


def get_follow_up_suggestions(
    question: str, data: List[Dict], ctx: Optional[UserContext] = None,
) -> List[str]:
    from chatbot.follow_ups import build_follow_up_suggestions
    if is_groq_enabled() and data:
        ai_suggestions = groq_follow_ups(question, data)
        if len(ai_suggestions) >= 2:
            return ai_suggestions[:3]
    return build_follow_up_suggestions(question, data, ctx)


def format_answer(question: str, data: List[Dict], *, broad: bool = False) -> str:
    count = len(data)
    q = question.lower()

    if count == 0:
        if "stock" in q or "material" in q:
            return (
                "No stock found for that material in the current database.\n\n"
                "Try *show all raw material stock* or ask with the exact material name from your inventory."
            )
        if "operation" in q and "pending" in q:
            return (
                "No pending operations found right now.\n\n"
                "This means there are no operations waiting in `scheduling.operation_status` "
                "or `scheduling.production_logs` with a pending status. "
                "Try *in-progress operations*, *production logs*, or *planned schedule*."
            )
        if "order" in q:
            return (
                "No matching orders found.\n\n"
                "Check the sale order number (e.g. SO-001) or try *show all orders*."
            )
        if "notification" in q or "alert" in q:
            return (
                "No notifications found in the database right now.\n\n"
                "Try *show all orders* or *machine breakdowns* for related activity."
            )
        return (
            "No records found for your query in the current database.\n\n"
            "Try a different keyword from your data — order number, part name, "
            "material, machine, customer, or operator name."
        )

    if broad or (data and data[0].get("source_type")):
        terms = extract_search_terms(question)
        term_text = ", ".join(terms) if terms else "your keywords"
        return (
            f"Found matches across CMF data for: **{term_text}**\n\n"
            f"**{count}** result{'s' if count != 1 else ''}."
        )

    preamble = get_context_preamble(question, data)
    return f"{preamble}\n\n**{count}** result{'s' if count != 1 else ''}."


def make_error_response(message: str, sql: str = "") -> Dict[str, Any]:
    return {
        "answer": message,
        "sql": sql,
        "data": [],
        "suggestions": [
            "Show all orders",
            "Parts for SO-001",
            "Show machine status",
        ],
    }


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — CHAT SERVICE
# ══════════════════════════════════════════════════════════════════════════════

_LLM = None

def get_llm():
    global _LLM
    if _LLM is None:
        _LLM = ChatOllama(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            model=os.getenv("OLLAMA_MODEL", "llama3.2:latest"),
            temperature=0,
            num_ctx=int(os.getenv("OLLAMA_NUM_CTX", "8192")),
            stop=["Human:", "User:"],
        )
    return _LLM


def invoke_llm(question: str, history: List[Dict], ctx: Optional[UserContext] = None) -> str:
    """Generate SQL via Groq when configured, otherwise Ollama."""
    msgs = build_messages(question, history, ctx)

    if is_groq_enabled():
        groq_msgs = []
        for m in msgs:
            if isinstance(m, SystemMessage):
                groq_msgs.append({"role": "system", "content": m.content})
            elif isinstance(m, HumanMessage):
                groq_msgs.append({"role": "user", "content": m.content})
            elif isinstance(m, AIMessage):
                groq_msgs.append({"role": "assistant", "content": m.content})
        raw = groq_chat(groq_msgs, max_tokens=900)
        if raw:
            return raw
        raise RuntimeError(
            "Groq API did not respond. Check GROQ_API_KEY and rate limits at console.groq.com."
        )

    timeout = int(os.getenv("OLLAMA_TIMEOUT_SEC", "8"))
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(get_llm().invoke, msgs)
        try:
            return future.result(timeout=timeout).content.strip()
        except concurrent.futures.TimeoutError:
            raise TimeoutError(
                f"The chatbot model took longer than {timeout}s. "
                "Try a shorter question or check Ollama."
            )


def finish_response(
    question: str, sql: str, data: List[Dict], session_id: str,
    *, broad: bool = False, history: HistoryService = None,
    ctx: Optional[UserContext] = None,
) -> Dict:
    answer = format_answer(question, data, broad=broad)
    suggestions = get_follow_up_suggestions(question, data, ctx)
    if history:
        history.save(session_id, question, answer, data=data)
    return {"answer": answer, "sql": sql, "data": data, "suggestions": suggestions}


def clarify_response(
    question: str,
    session_id: str,
    history: HistoryService,
    ctx: Optional[UserContext] = None,
    clf=None,
) -> Dict:
    """Ask user to rephrase instead of returning wrong table data."""
    from chatbot.question_classifier import QuestionClassification

    clf = clf or QuestionClassification()
    answer = clarification_message(question, clf)
    suggestions = get_follow_up_suggestions(question, [], ctx)
    if history:
        history.save(session_id, question, answer)
    return {"answer": answer, "sql": "", "data": [], "suggestions": suggestions}


def no_data_response(
    question: str, session_id: str, history: HistoryService,
    ctx: Optional[UserContext] = None,
) -> Dict:
    """Fast friendly reply when nothing matched — no LLM wait."""
    from chatbot.intent_queries import detect_fuzzy_intents

    ctx = ctx or UserContext()
    intents = detect_fuzzy_intents(question)
    if intents:
        answer = (
            f"No {intents[0]} records found in the database right now.\n\n"
            "Try a different keyword or one of the suggested questions below."
        )
        suggestions = get_follow_up_suggestions(question, [], ctx)
    else:
        answer = OUT_OF_SCOPE_MESSAGE
        suggestions = get_role_suggestions(ctx)[:3]

    history.save(session_id, question, answer)
    return {"answer": answer, "sql": "", "data": [], "suggestions": suggestions}


def build_messages(question: str, history: List[Dict], ctx: Optional[UserContext] = None) -> list:
    hints = get_intent_hints(question)
    user_hints = get_user_intent_hints(ctx or UserContext())
    if user_hints:
        hints = f"{hints}\n{user_hints}"
    system = build_system_prompt(question, hints)
    msgs = [SystemMessage(content=system)]
    for h in history:
        if h["role"] == "user":
            msgs.append(HumanMessage(content=h["content"]))
        else:
            msgs.append(AIMessage(content=h["content"]))
    msgs.append(HumanMessage(content=question))
    return msgs


def run_broad_search(question: str) -> Tuple[Optional[str], List[Dict]]:
    """Search all major CMF text columns for any word from the user's question."""
    sql, _terms = try_broad_search(question)
    if not sql:
        return None, []
    data, err = execute_sql(sql)
    if err or not data:
        return None, []
    return sql, data


def scope_order_sql(sql: str, ctx: Optional[UserContext]) -> str:
    """Restrict order-backed tables to orders assigned to the current Admin/MC."""
    if not ctx or not ctx.user_id:
        return sql
    scope_column = ctx.order_scope_column()
    if not scope_column:
        return sql

    uid = int(ctx.user_id)
    predicate = f"{scope_column} = {uid}"

    # Scope the canonical orders table. Replacing the table expression works for
    # both FROM and JOIN clauses without having to parse their ON/WHERE syntax.
    scoped = re.sub(
        r"\boms\.orders\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)",
        rf"(SELECT * FROM oms.orders WHERE {predicate}) \1",
        sql,
        flags=re.IGNORECASE,
    )

    # Some order-related queries start from downstream tables and never join
    # oms.orders. Scope those sources through their order foreign key.
    table_scopes = (
        (
            r"\bscheduling\.planned_schedule_items\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)",
            "scheduling.planned_schedule_items",
            "sale_order_id",
        ),
        (
            r"\boms\.order_part_priorities\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)",
            "oms.order_part_priorities",
            "order_id",
        ),
        (
            r"\bscheduling\.part_schedule_status\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)",
            "scheduling.part_schedule_status",
            "sale_order_id",
        ),
        (
            r"\bquality\.stage_inspection\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)",
            "quality.stage_inspection",
            "sale_order_id",
        ),
    )
    for pattern, table, order_key in table_scopes:
        def _replace(match, source=table, key=order_key):
            alias = match.group(1)
            return (
                f"(SELECT scoped_source.* FROM {source} scoped_source "
                f"JOIN oms.orders scoped_order ON scoped_order.id = scoped_source.{key} "
                f"WHERE scoped_order.{predicate}) {alias}"
            )

        scoped = re.sub(pattern, _replace, scoped, flags=re.IGNORECASE)
    return scoped


def execute_sql(sql: str) -> Tuple[List[Dict], str]:
    sql = scope_order_sql(sql, _chat_user_context.get())
    ok, err = SQLValidator.validate(sql)
    if not ok:
        return [], err
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql))
            cols = list(result.keys())
            # clean_row converts datetime/date/time/Decimal -> JSON-safe types
            # immediately, so every downstream consumer (format_answer, SSE,
            # ChatResponse) works with plain str/float/int/None only.
            rows = [clean_row(dict(zip(cols, r))) for r in result.fetchall()]
            return rows, ""
    except Exception as e:
        return [], f"Database error: {str(e)}"


# Words that signal the question is about "parts of an order" — used to trigger
# the safety-net retry when the LLM's SQL returns 0 rows.
PARTS_KEYWORDS = ("part", "component", "item", "bom", "piece")
OPS_KEYWORDS = ("operation", "step", "process", "machining")
ORDER_ID_RE = re.compile(r"order\s*#?(\d+)", re.IGNORECASE)


def maybe_retry_with_fallback(question: str, sql: str, data: List[Dict]) -> Tuple[str, List[Dict], bool]:
    """
    Safety net: if the LLM-generated SQL for a 'parts/operations of order X' style
    question returned ZERO rows, retry using the verified two-stage templates.
    Also guards against LLM using dropped columns (project_name, opp.status, wc.name).
    Returns (sql, data, retried).
    """
    # Fix common LLM mistakes in the generated SQL before running
    fixed_sql = sql
    fixed_sql = re.sub(r'\bwc\.name\b', "wc.work_center_name", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\brm\.material_grade\b', "rm.material_name", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\bv\.vendor_name\b', "v.company_name", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\bol\.leave_date\b', "ol.from_date", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\bol\.leave_type\b', "ol.reason", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\bopp\.status\b', "pss.status", fixed_sql, flags=re.IGNORECASE)
    if fixed_sql != sql:
        retry_data, err = execute_sql(fixed_sql)
        if not err and retry_data:
            return fixed_sql, retry_data, True

    if data:
        return sql, data, False

    q = question.lower()
    m = ORDER_ID_RE.search(q)
    if not m:
        return sql, data, False

    order_id = m.group(1)

    # Retry parts
    if any(k in q for k in PARTS_KEYWORDS):
        retry_sql = PARTS_FOR_ORDER_SQL(order_id).strip()
        retry_data, err = execute_sql(retry_sql)
        if not err:
            return retry_sql, retry_data, True

    # Retry operations
    if any(k in q for k in OPS_KEYWORDS):
        retry_sql = OPERATIONS_FOR_ORDER_SQL(order_id).strip()
        retry_data, err = execute_sql(retry_sql)
        if not err:
            return retry_sql, retry_data, True

    return sql, data, False


def try_schema_driven_query(question: str, clf=None) -> Tuple[Optional[str], List[Dict]]:
    """Groq + live DB schema — portable across different PostgreSQL databases."""
    intents = [clf.intent] if clf and getattr(clf, "intent", None) not in (None, "unknown", "off_topic") else None
    sql = generate_sql_from_schema(question, intents)
    if not sql:
        return None, []
    ok, _ = SQLValidator.validate(sql)
    if not ok:
        return None, []
    data, err = execute_sql(sql)
    if err or not data:
        return None, []
    filtered = filter_results_for_question(question, data)
    return sql, filtered if filtered is not None else data


def apply_result_validation(
    question: str,
    sql: str,
    data: List[Dict],
    clf=None,
) -> Tuple[str, List[Dict], bool]:
    """
    Filter rows to match user's specific terms.
    If results look wrong, retry with schema-driven SQL.
    Returns (sql, data, used_schema_retry).
    """
    if not data:
        return sql, data, False

    if results_look_wrong(question, data):
        alt_sql, alt_data = try_schema_driven_query(question, clf)
        if alt_data:
            return alt_sql, alt_data, True
        filtered = filter_results_for_question(question, data)
        return sql, filtered or [], False

    filtered = filter_results_for_question(question, data)
    if filtered is not None:
        return sql, filtered, False
    return sql, data, False


class ChatService:
    def __init__(self):
        self.history = HistoryService()

    def process(self, question: str, session_id: str, ctx: Optional[UserContext] = None) -> Dict:
        ctx = ctx or UserContext()
        context_token = _chat_user_context.set(ctx)
        try:
            return self._process(question, session_id, ctx)
        except Exception:
            import logging
            logging.exception("Chatbot processing failed for: %s", question)
            answer = (
                "Sorry, I could not process that question right now.\n\n"
                "Please try again with a clear keyword — e.g. *show all raw material stock*, "
                "*parts for order SO-001*, or *stock for EN8*."
            )
            suggestions = get_role_suggestions(ctx)[:3]
            self.history.save(session_id, question, answer)
            return {"answer": answer, "sql": "", "data": [], "suggestions": suggestions}
        finally:
            _chat_user_context.reset(context_token)

    def _process(self, question: str, session_id: str, ctx: UserContext) -> Dict:
        hist = self.history.get(session_id)
        question = normalize_question(question)
        question = resolve_follow_up_question(question, hist)
        guidance = build_scope_guidance(question, ctx)
        if guidance:
            self.history.save(session_id, question, guidance["answer"])
            return guidance

        clf = None
        if is_groq_enabled():
            clf = classify_question(question)
            if is_off_topic_classification(clf):
                answer = clarification_message(question, clf)
                suggestions = get_follow_up_suggestions(question, [], ctx)
                self.history.save(session_id, question, answer)
                return {"answer": answer, "sql": "", "data": [], "suggestions": suggestions}
            if clf.confidence >= 0.7:
                sql, matched = route_by_classification(question, clf)
                if matched:
                    data, err = execute_sql(sql)
                    if not err and data:
                        sql, data, _ = apply_result_validation(question, sql, data, clf)
                        if data:
                            return finish_response(
                                question, sql, data, session_id,
                                history=self.history, ctx=ctx,
                            )

        sql, matched = try_user_scoped_query(question, ctx)
        fast_path = matched

        if not matched:
            sql, matched = try_order_query(question)
            fast_path = matched

        if not matched:
            sql, matched = try_machines_for_order_query(question)
            fast_path = matched

        if not matched:
            sql, matched = try_quick_pattern(question)
            fast_path = matched

        if not matched:
            sql, matched = try_part_stock_query(question)
            fast_path = matched

        if not matched:
            sql, matched = try_tool_query(question)
            fast_path = matched

        if not matched:
            sql, matched = try_material_query(question)
            fast_path = matched
            if matched and needs_classification(question):
                clf = classify_question(question)
                if clf.confidence >= 0.65 and clf.intent not in ("materials", "inventory", "unknown"):
                    alt_sql, alt_matched = route_by_classification(question, clf)
                    if alt_matched:
                        sql, matched = alt_sql, True
                elif clf.confidence < 0.5 or clf.intent == "unknown":
                    return clarify_response(question, session_id, self.history, ctx, clf)

        if not matched:
            sql, matched = try_intent_query(question)
            fast_path = matched
            if matched and needs_classification(question):
                clf = classify_question(question)
                if clf.confidence < 0.55:
                    return clarify_response(question, session_id, self.history, ctx, clf)
                alt_sql, alt_matched = route_by_classification(question, clf)
                if alt_matched and clf.confidence >= 0.65:
                    sql, matched = alt_sql, True

        # Fast path — pattern/intent matched: run SQL immediately, skip LLM entirely
        if fast_path and sql:
            data, err = execute_sql(sql)
            if err:
                return make_error_response(
                    f"Database query failed. {err}",
                    sql=sql,
                )
            if not data:
                alt_sql, alt_data = try_schema_driven_query(question, clf)
                if alt_data:
                    return finish_response(
                        question, alt_sql, alt_data, session_id,
                        history=self.history, ctx=ctx,
                    )
                return no_data_response(question, session_id, self.history, ctx)
            sql, data, _ = apply_result_validation(question, sql, data, clf)
            if not data:
                alt_sql, alt_data = try_schema_driven_query(question, clf)
                if alt_data:
                    return finish_response(
                        question, alt_sql, alt_data, session_id,
                        history=self.history, ctx=ctx,
                    )
                return no_data_response(question, session_id, self.history, ctx)
            return finish_response(
                question, sql, data, session_id, history=self.history, ctx=ctx,
            )

        data: List[Dict] = []
        used_broad = False

        if not matched:
            # Gibberish / no CMF keywords — instant reply, never call LLM
            if not has_cmf_signal(question) and not is_groq_enabled():
                return no_data_response(question, session_id, self.history, ctx)

            if clf is None:
                clf = classify_question(question)
            if is_off_topic_classification(clf):
                return clarify_response(question, session_id, self.history, ctx, clf)
            if clf.confidence >= 0.65:
                sql, matched = route_by_classification(question, clf)
                if matched:
                    data, err = execute_sql(sql)
                    if not err and data:
                        return finish_response(
                            question, sql, data, session_id,
                            history=self.history, ctx=ctx,
                        )
            if clf.confidence < 0.5 or clf.intent == "unknown":
                return clarify_response(question, session_id, self.history, ctx, clf)

            alt_sql, alt_data = try_schema_driven_query(question, clf)
            if alt_data:
                return finish_response(
                    question, alt_sql, alt_data, session_id,
                    history=self.history, ctx=ctx,
                )

            broad_sql, broad_data = run_broad_search(question)
            if broad_data:
                return finish_response(
                    question, broad_sql, broad_data, session_id,
                    broad=True, history=self.history, ctx=ctx,
                )

            hist = self.history.get(session_id)
            try:
                raw = invoke_llm(question, hist, ctx)
            except TimeoutError as e:
                broad_sql, broad_data = run_broad_search(question)
                if broad_data:
                    return finish_response(
                        question, broad_sql, broad_data, session_id,
                        broad=True, history=self.history, ctx=ctx,
                    )
                return make_error_response(str(e))
            except Exception:
                broad_sql, broad_data = run_broad_search(question)
                if broad_data:
                    return finish_response(
                        question, broad_sql, broad_data, session_id,
                        broad=True, history=self.history, ctx=ctx,
                    )
                return make_error_response(
                    "Groq API is not responding. Check GROQ_API_KEY and rate limits at console.groq.com."
                    if is_groq_enabled()
                    else "The chatbot model is not available right now. "
                    "Please check whether Ollama is running and the configured model is installed."
                )

            if raw == "CANNOT_ANSWER":
                broad_sql, broad_data = run_broad_search(question)
                if broad_data:
                    return finish_response(
                        question, broad_sql, broad_data, session_id,
                        broad=True, history=self.history, ctx=ctx,
                    )
                return no_data_response(question, session_id, self.history, ctx)

            sql = SQLValidator.extract(raw)

        if not data:
            data, err = execute_sql(sql)
            if err:
                broad_sql, broad_data = run_broad_search(question)
                if broad_data:
                    sql, data, used_broad = broad_sql, broad_data, True
                else:
                    return make_error_response(
                        f"Database query failed. {err}\n\n"
                        "Try asking with a sale order number, part name, machine, or material name.",
                        sql=sql,
                    )

        if not used_broad:
            sql, data, _ = maybe_retry_with_fallback(question, sql, data)

        if not data and not used_broad:
            broad_sql, broad_data = run_broad_search(question)
            if broad_data:
                sql, data, used_broad = broad_sql, broad_data, True

        if not data:
            return no_data_response(question, session_id, self.history, ctx)

        return finish_response(
            question, sql, data, session_id,
            broad=used_broad, history=self.history, ctx=ctx,
        )


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — ROUTER
# ══════════════════════════════════════════════════════════════════════════════

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["Chatbot"])

_svc: ChatService = None

def get_svc():
    global _svc
    if _svc is None:
        _svc = ChatService()
    return _svc


def _ctx_from_request(request: Request, body: ChatRequest = None) -> UserContext:
    """Build user context from JWT user (request.state.current_user or body ignored for identity)."""
    user = getattr(request.state, "current_user", None)
    if user is None:
        return UserContext(
            user_id=None,
            user_name=None,
            role=None,
            center=None,
        )
    return UserContext(
        user_id=int(user.id),
        user_name=getattr(user, "user_name", None),
        role=getattr(user, "role", None),
        center=getattr(user, "center", None),
    )


def _require_chatbot_role(ctx: UserContext) -> None:
    if not ctx.user_id or ctx.role_key() not in {"admin", "mc"}:
        raise HTTPException(
            status_code=403,
            detail="Chatbot access is limited to Admin and Manufacturing Coordinator users.",
        )


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(
    request: Request,
    body: ChatRequest,
    current_user: AccessUser = Depends(get_current_user),
):
    request.state.current_user = current_user
    ctx = _ctx_from_request(request, body)
    _require_chatbot_role(ctx)
    try:
        result = await asyncio.to_thread(
            get_svc().process, body.question, body.session_id, ctx,
        )
        return ChatResponse(**result)
    except RateLimitExceeded:
        raise HTTPException(429, "Too many requests.")
    except Exception:
        import logging
        logging.exception("Chatbot API error")
        ctx = _ctx_from_request(request, body)
        from chatbot.user_context import get_role_suggestions
        return ChatResponse(
            answer=(
                "Sorry, something went wrong on the server.\n\n"
                "Please rephrase your question or try: *show all raw material stock*, "
                "*list all orders*, *pending operations*."
            ),
            sql="",
            data=[],
            suggestions=get_role_suggestions(ctx)[:3],
        )


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    current_user: AccessUser = Depends(get_current_user),
):
    request.state.current_user = current_user
    ctx = _ctx_from_request(request, body)
    _require_chatbot_role(ctx)

    async def generate():
        result = await asyncio.to_thread(
            get_svc().process, body.question, body.session_id, ctx,
        )
        yield f"data: {json_dumps({'type': 'final', **result})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    get_svc().history.clear(session_id)
    return {"message": "History cleared"}


@router.get("/suggestions")
async def suggestions(
    request: Request,
    user_id: Optional[int] = None,
    user_name: Optional[str] = None,
    role: Optional[str] = None,
    center: Optional[str] = None,
    current_user: AccessUser = Depends(get_current_user),
):
    from chatbot.suggestions import get_dynamic_suggestions

    request.state.current_user = current_user
    _ = (user_id, user_name, role, center)  # ignore client identity
    ctx = _ctx_from_request(request)
    _require_chatbot_role(ctx)
    return await asyncio.to_thread(get_dynamic_suggestions, ctx)


@router.get("/health")
async def health():
    from chatbot.schema_knowledge import RELEVANT_SCHEMAS
    from DB.schemas.chatbot import SchemaService
    try:
        schema = SchemaService.load_schema()
        table_count = sum(len(t) for s in RELEVANT_SCHEMAS if s in schema for t in schema[s])
    except Exception:
        table_count = 0
    return {
        "status": "ok",
        "ai_provider": "groq" if is_groq_enabled() else "ollama",
        "model": os.getenv("GROQ_MODEL", os.getenv("OLLAMA_MODEL", "llama3.2:latest")),
        "patterns": len(__import__("chatbot.query_patterns", fromlist=["QUICK_SQL_PATTERNS"]).QUICK_SQL_PATTERNS),
        "schema_tables": table_count,
    }
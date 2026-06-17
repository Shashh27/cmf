import os
import re
import json
import redis
import decimal
import datetime
import asyncio
from collections import Counter
from typing import Dict, List, Any, Tuple, AsyncGenerator
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from sqlalchemy import text
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from DB.database import engine
from DB.models.chatbot import ChatRequest, ChatResponse


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
# SECTION 1 — SCHEMA CONTEXT (hardcoded, verified against actual backup data)
#
# CONFIRMED RELATIONSHIP CHAIN (this is the core of the algorithm):
#
#   oms.orders (id, product_id, ...)
#        ↓ product_id
#   oms.products (id, product_name)
#        ↓ (via oms.order_part_priorities: order_id + product_id -> part_id)
#   oms.order_part_priorities (order_id, product_id, part_id, priority, status)
#        ↓ part_id
#   oms.parts (id, part_name, part_number, ...)
#        ↓ part_id
#   oms.operations (id, part_id, operation_name, operation_number, ...)
#        ↓ part_id + sale_order_id
#   scheduling.part_schedule_status (part_id, sale_order_id, status, start_date)
#
# order_part_priorities is the JUNCTION table — without it you get ALL parts
# that share a product_id (often 100+), not just the ones selected for THIS order.
# ══════════════════════════════════════════════════════════════════════════════

CMF_SCHEMA_CONTEXT = """
PostgreSQL manufacturing database (CMF). Key tables and VERIFIED relationships:

oms.orders(id, sale_order_number, customer_id, product_id, quantity, due_date, status, order_date, project_name, project_coordinator_id, admin_id, manufacturing_coordinator_id, created_at, updated_at)
oms.products(id, product_name, product_version, created_at, updated_at)
oms.order_part_priorities(id, order_id, product_id, part_id, priority, status, created_at, updated_at)
  -- THIS IS THE JUNCTION TABLE linking an order to its specific parts (via product_id)
  -- status values: 'active','inactive'
oms.parts(id, part_name, part_number, type_id, raw_material_id, assembly_id, product_id, part_detail, qty, vendor_id, size, raw_material_unit_id, required_length, created_at, updated_at)
oms.operations(id, operation_number, operation_name, setup_time, cycle_time, workcenter_id, part_id, machine_id, work_instructions, notes, part_type_id, from_date, to_date, vendor_id, created_at, updated_at)
oms.assemblies(id, assembly_name, assembly_number, product_id, parent_id, created_at, updated_at)

scheduling.part_schedule_status(id, part_id, sale_order_id, status, start_date, created_at, updated_at)
  -- status values: 'active','inactive'
scheduling.operation_status(id, order_id, part_id, operation_id, status, started_at, completed_at, operator_id, created_at, updated_at)
scheduling.machine_schedule(id, order_id, part_id, operation_id, machine_id, start_time, end_time, status, created_at, updated_at)
scheduling.machine_status(id, machine_id, status, created_at, updated_at)
scheduling.production_logs(id, operation_id, operator_id, supervisor_id, notes, remarks, from_date, from_time, to_date, to_time, status, produced_quantity, approved_quantity, created_at)

configuration.customers(id, company_name, address, branch, email, contact_number, contact_person, created_at, updated_at)
configuration.machines(id, work_center_id, type, make, model, year_of_installation, calibration_date, calibration_due_date)
configuration.work_centers(id, name, created_at, updated_at)

inventory.tools_list(id, item_description, identification_code, make, quantity, total_quantity, location, category, sub_category)
inventory.tool_issues(id, tool_id, request_id, tool_issue_qty, operator_id, status, issue_category, created_at, updated_at)
inventory.raw_materials(id, material_name, material_grade, created_at, updated_at)
inventory.vendors(id, vendor_name, contact_person, email, phone, created_at, updated_at)

maintenance.machine_breakdown(id, machine_id, reported_by, issue_category, machine_status, issue_reason, additional_reason, reported_at)

quality.stage_inspection(id, user_id, part_id, sale_order_id, nominal_value, uppertol, lowertol, zone, dimension_type, measured_1, measured_2, measured_3, measured_mean, op_no, is_done, created_at)

production_monitoring.machine_live_status(id, machine_id, status, last_updated, current_order_id, current_part_id, current_operation_id)

accesscontrol.access_users(id, user_name, gmail, role, center, "group")
accesscontrol.operator_leaves(id, operator_id, leave_date, leave_type, status, created_at)

═══ THE CORE CHAIN — ORDER → PRODUCT → PARTS → OPERATIONS → SCHEDULE ═══
1. oms.orders.product_id = oms.products.id
2. oms.order_part_priorities.order_id = oms.orders.id  AND  oms.order_part_priorities.product_id = oms.orders.product_id
3. oms.order_part_priorities.part_id = oms.parts.id
4. oms.operations.part_id = oms.parts.id
5. scheduling.part_schedule_status.part_id = oms.parts.id  AND  scheduling.part_schedule_status.sale_order_id = oms.orders.id
6. scheduling.operation_status.operation_id = oms.operations.id  AND  scheduling.operation_status.order_id = oms.orders.id

OTHER RELATIONSHIPS:
- oms.orders.customer_id = configuration.customers.id
- inventory.tool_issues.tool_id = inventory.tools_list.id
- inventory.tool_issues.operator_id = accesscontrol.access_users.id
- maintenance.machine_breakdown.machine_id = configuration.machines.id
- quality.stage_inspection.part_id = oms.parts.id AND quality.stage_inspection.sale_order_id = oms.orders.id
- production_monitoring.machine_live_status.machine_id = configuration.machines.id
- configuration.machines.work_center_id = configuration.work_centers.id

=== CRITICAL RULE -- "PARTS FOR ORDER X" (or "components", "items", "BOM",
"what's in order X", or any phrasing asking for the parts of an order) ===

An order can be in TWO states:
  - SCHEDULED  -> oms.order_part_priorities HAS rows for this order_id.
                  These are the prioritized parts actually selected for
                  production, with live schedule status.
  - NOT SCHEDULED yet -> oms.order_part_priorities has NO rows for this order_id.
                  Fall back to ALL parts of the order's product via
                  oms.parts.product_id = oms.orders.product_id (no schedule
                  info available yet).

ALWAYS use this exact UNION ALL template for "parts for order X" style questions
(replace <ORDER_ID> with the actual order id):

SELECT p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
       opp.priority, opp.status AS priority_status,
       pss.status AS schedule_status, pss.start_date
FROM oms.order_part_priorities opp
JOIN oms.parts p ON p.id = opp.part_id
LEFT JOIN scheduling.part_schedule_status pss
       ON pss.part_id = p.id AND pss.sale_order_id = opp.order_id
WHERE opp.order_id = <ORDER_ID>

UNION ALL

SELECT p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
       NULL AS priority, NULL AS priority_status,
       NULL AS schedule_status, NULL AS start_date
FROM oms.orders o
JOIN oms.parts p ON p.product_id = o.product_id
WHERE o.id = <ORDER_ID>
  AND NOT EXISTS (
      SELECT 1 FROM oms.order_part_priorities opp2
      WHERE opp2.order_id = o.id
  )

ORDER BY priority ASC NULLS LAST

Apply the SAME two-stage pattern (try order_part_priorities first, fall back to
parts.product_id) for "operations for order X" by joining oms.operations to
whichever part set applies.
"""


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — INSTANT PATTERN MATCHING (0 LLM calls — sub-second response)
# Covers the most common question shapes using the VERIFIED chain above.
# ══════════════════════════════════════════════════════════════════════════════

def _first_group(m: "re.Match") -> str:
    """Return the first non-None captured group (the order ID)."""
    for g in m.groups():
        if g and g.isdigit():
            return g
    return "0"


def PARTS_FOR_ORDER_SQL(order_id: str) -> str:
    """
    Two-stage SQL: prioritized+scheduled parts if order_part_priorities has rows,
    otherwise fall back to all parts of the order's product (pre-scheduling BOM).
    Reusable by both the regex fast-path and the LLM-fallback safety net.
    """
    return f"""
        SELECT
            p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
            opp.priority, opp.status AS priority_status,
            pss.status AS schedule_status, pss.start_date
        FROM oms.order_part_priorities opp
        JOIN oms.parts p ON p.id = opp.part_id
        LEFT JOIN scheduling.part_schedule_status pss
            ON pss.part_id = p.id AND pss.sale_order_id = opp.order_id
        WHERE opp.order_id = {order_id}

        UNION ALL

        SELECT
            p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
            NULL AS priority, NULL AS priority_status,
            NULL AS schedule_status, NULL AS start_date
        FROM oms.orders o
        JOIN oms.parts p ON p.product_id = o.product_id
        WHERE o.id = {order_id}
          AND NOT EXISTS (
              SELECT 1 FROM oms.order_part_priorities opp2
              WHERE opp2.order_id = o.id
          )

        ORDER BY priority ASC NULLS LAST
    """


QUICK_SQL_PATTERNS = [

    # "parts for order 122" / "parts and status for order 122" / "order 122 parts"
    # / "components of order 122" / "what's in order 122" / "BOM for order 122"
    #
    # TWO-STAGE LOGIC:
    #   Stage 1 (scheduled): order_part_priorities has rows -> prioritized parts
    #                          with schedule status from scheduling.part_schedule_status
    #   Stage 2 (not yet scheduled): order_part_priorities is EMPTY -> fall back to
    #                          all parts belonging to the order's product
    #                          (oms.parts.product_id = oms.orders.product_id)
    #                          with no priority/schedule info (NULLs)
    (
        r"order\s*#?(\d+).*(?:part|component|item|bom|piece|material)|"
        r"(?:part|component|item|bom|piece|material).*order\s*#?(\d+)|"
        r"(?:what|which|list|show).*(?:in|for|of)\s*order\s*#?(\d+)",
        lambda m: PARTS_FOR_ORDER_SQL(_first_group(m))
    ),

    # "operations for order 122" / "order 122 operations"
    (
        r"order\s*#?(\d+).*\boperation|\boperation.*order\s*#?(\d+)",
        lambda m: f"""
            SELECT
                p.part_name,
                p.part_number,
                op.operation_number,
                op.operation_name,
                op.setup_time,
                op.cycle_time,
                os.status AS operation_status,
                os.started_at,
                os.completed_at
            FROM oms.order_part_priorities opp
            JOIN oms.parts p ON p.id = opp.part_id
            JOIN oms.operations op ON op.part_id = p.id
            LEFT JOIN scheduling.operation_status os
                ON os.operation_id = op.id AND os.order_id = opp.order_id
            WHERE opp.order_id = {m.group(1) or m.group(2)}
            ORDER BY p.part_name, op.operation_number
        """
    ),

    # "order 122" / "order #122" / "details of order 122" / "order 122 details"
    (
        r"order\s*#?(\d+)",
        lambda m: f"""
            SELECT
                o.id, o.sale_order_number, o.project_name, o.status,
                o.quantity, o.due_date, o.order_date,
                c.company_name AS customer,
                pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE o.id = {m.group(1)}
        """
    ),

    # "all orders" / "list orders" / "show orders"
    (
        r"\ball\s+order|list.*\border|order.*\blist|show.*\border",
        lambda _: """
            SELECT
                o.id, o.sale_order_number, o.project_name, o.status,
                o.quantity, o.due_date,
                c.company_name AS customer,
                pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            ORDER BY o.created_at DESC
            LIMIT 50
        """
    ),

    # "overdue orders"
    (
        r"\boverdue",
        lambda _: """
            SELECT o.id, o.sale_order_number, o.project_name, o.due_date, o.status,
                   c.company_name AS customer
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            WHERE o.due_date < NOW() AND o.status NOT IN ('Completed','Cancelled')
            ORDER BY o.due_date ASC
            LIMIT 50
        """
    ),

    # "pending operations"
    (
        r"\bpending\b.*\boperation|operation.*\bpending",
        lambda _: """
            SELECT os.id, op.operation_name, op.operation_number,
                   p.part_name, o.sale_order_number,
                   os.status, os.created_at,
                   u.user_name AS operator
            FROM scheduling.operation_status os
            JOIN oms.operations op ON op.id = os.operation_id
            JOIN oms.parts p ON p.id = os.part_id
            JOIN oms.orders o ON o.id = os.order_id
            LEFT JOIN accesscontrol.access_users u ON u.id = os.operator_id
            WHERE os.status = 'pending'
            ORDER BY os.created_at ASC
            LIMIT 50
        """
    ),

    # "machine breakdowns"
    (
        r"\bbreakdown|machine.*\bdown|down.*\bmachine",
        lambda _: """
            SELECT mb.id, m.type AS machine_type, m.model,
                   mb.issue_category, mb.machine_status,
                   mb.issue_reason, mb.reported_at,
                   u.user_name AS reported_by
            FROM maintenance.machine_breakdown mb
            JOIN configuration.machines m ON m.id = mb.machine_id
            LEFT JOIN accesscontrol.access_users u ON u.id = mb.reported_by
            ORDER BY mb.reported_at DESC
            LIMIT 30
        """
    ),

    # "tools issued to operator 5" / "operator 5 tools"
    (
        r"tool.*\boperator\s*#?(\d+)|operator\s*#?(\d+).*tool",
        lambda m: f"""
            SELECT ti.id, tl.item_description AS tool_name, tl.identification_code,
                   ti.tool_issue_qty, ti.status, ti.created_at
            FROM inventory.tool_issues ti
            JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            WHERE ti.operator_id = {m.group(1) or m.group(2)}
            ORDER BY ti.created_at DESC
        """
    ),

    # "tool issues" / "tools issued"
    (
        r"tool.*\bissue|issue.*\btool",
        lambda _: """
            SELECT ti.id, tl.item_description AS tool_name, tl.identification_code,
                   ti.tool_issue_qty, ti.status, ti.issue_category,
                   u.user_name AS operator, ti.created_at
            FROM inventory.tool_issues ti
            JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            LEFT JOIN accesscontrol.access_users u ON u.id = ti.operator_id
            ORDER BY ti.created_at DESC
            LIMIT 30
        """
    ),

    # "machine status" / "live machines"
    (
        r"machine.*\blive|live.*\bmachine|machine.*\bstatus",
        lambda _: """
            SELECT m.type, m.model, mls.status,
                   mls.last_updated, mls.current_order_id
            FROM production_monitoring.machine_live_status mls
            JOIN configuration.machines m ON m.id = mls.machine_id
            ORDER BY m.type
        """
    ),

    # "inspection for order 122" / "quality order 122"
    (
        r"(?:quality|inspection).*order\s*#?(\d+)|order\s*#?(\d+).*(?:quality|inspection)",
        lambda m: f"""
            SELECT si.op_no, p.part_name, si.dimension_type,
                   si.nominal_value, si.uppertol, si.lowertol,
                   si.measured_mean, si.is_done, si.created_at
            FROM quality.stage_inspection si
            JOIN oms.parts p ON p.id = si.part_id
            WHERE si.sale_order_id = {m.group(1) or m.group(2)}
            ORDER BY si.op_no
        """
    ),
]


def try_quick_pattern(question: str):
    """Returns (sql, True) on match, else (None, False). Zero LLM calls."""
    q = question.lower()
    for pattern, sql_fn in QUICK_SQL_PATTERNS:
        m = re.search(pattern, q, re.IGNORECASE)
        if m:
            try:
                return sql_fn(m).strip(), True
            except Exception:
                continue
    return None, False


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
        self.r = redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True
        )

    def get(self, session_id: str, max_turns: int = 6) -> List[Dict]:
        raw = self.r.lrange(f"chat:{session_id}", 0, max_turns * 2 - 1)
        msgs = []
        for item in reversed(raw):
            try:
                msgs.append(json.loads(item))
            except Exception:
                pass
        return msgs

    def save(self, session_id: str, question: str, answer: str):
        key = f"chat:{session_id}"
        self.r.lpush(key, json_dumps({"role": "assistant", "content": answer}))
        self.r.lpush(key, json_dumps({"role": "user", "content": question}))
        self.r.ltrim(key, 0, 19)
        self.r.expire(key, 86400)

    def clear(self, session_id: str):
        self.r.delete(f"chat:{session_id}")


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — ANSWER FORMATTER (no second LLM call)
# ══════════════════════════════════════════════════════════════════════════════

def format_answer(question: str, data: List[Dict]) -> str:
    count = len(data)

    if count == 0:
        return (
            "No records found for your query.\n\n"
            "The query ran successfully but returned no matching data. "
            "Try checking the ID or rephrasing your question."
        )

    lines = [f"Found **{count}** record{'s' if count != 1 else ''}."]

    if count <= 15:
        lines.append("")
        cols = list(data[0].keys())
        skip = {c for c in cols if c.endswith("_id") and c != "id"}
        display = [c for c in cols if c not in skip][:6]
        for i, row in enumerate(data, 1):
            parts = []
            for col in display:
                val = row.get(col)
                if val is not None and val != "":
                    label = col.replace("_", " ").title()
                    parts.append(f"**{label}**: {val}")
            lines.append(f"{i}. " + " · ".join(parts))
    else:
        status_col = next(
            (c for c in data[0] if "status" in c.lower()),
            None
        )
        if status_col:
            breakdown = Counter(str(r.get(status_col, "Unknown")) for r in data)
            lines.append("")
            for val, cnt in breakdown.most_common():
                lines.append(f"- **{val}**: {cnt}")

    lines.append("\n*Full data table shown below.*")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — CHAT SERVICE
# ══════════════════════════════════════════════════════════════════════════════

_LLM = None

def get_llm():
    global _LLM
    if _LLM is None:
        _LLM = ChatOllama(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            model=os.getenv("OLLAMA_MODEL", "codellama"),
            temperature=0,
            num_ctx=4096,
            stop=["Human:", "User:"],
        )
    return _LLM


SYSTEM_PROMPT = (
    "You are a PostgreSQL SQL expert for a CMF manufacturing system.\n\n"
    + CMF_SCHEMA_CONTEXT
    + "\n\nRULES:\n"
    "1. Reply with ONLY a raw SELECT SQL query — no explanation, no markdown, no backticks.\n"
    "2. Always prefix tables with schema (e.g. oms.parts not just parts).\n"
    "3. For 'parts for order X' / 'components of order X' / 'BOM for order X' / "
    "'what is in order X' / any question about which parts belong to an order, "
    "follow the CRITICAL RULE above EXACTLY using the UNION ALL two-stage template "
    "(order_part_priorities first, fallback to parts.product_id if empty).\n"
    "4. Add LIMIT 100 unless user asks for specific count.\n"
    "5. If the question cannot be answered from these tables, reply: CANNOT_ANSWER\n"
    "6. Understand synonyms naturally: 'pieces'/'components'/'items'/'BOM' all mean "
    "'parts'; 'job'/'sale order'/'work order' all mean 'order'; 'steps'/'processes'/"
    "'work' mean 'operations'; 'machines'/'equipment'/'CNC' mean 'configuration.machines'.\n"
)


def build_messages(question: str, history: List[Dict]) -> list:
    msgs = [SystemMessage(content=SYSTEM_PROMPT)]
    for h in history:
        if h["role"] == "user":
            msgs.append(HumanMessage(content=h["content"]))
        else:
            msgs.append(AIMessage(content=h["content"]))
    msgs.append(HumanMessage(content=question))
    return msgs


def execute_sql(sql: str) -> Tuple[List[Dict], str]:
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
PARTS_KEYWORDS = ("part", "component", "item", "bom", "piece", "material")
ORDER_ID_RE = re.compile(r"order\s*#?(\d+)", re.IGNORECASE)


def maybe_retry_with_fallback(question: str, sql: str, data: List[Dict]) -> Tuple[str, List[Dict], bool]:
    """
    Safety net: if the LLM-generated SQL for a 'parts of order X' style question
    returned ZERO rows, retry using the verified two-stage PARTS_FOR_ORDER_SQL
    template. Returns (sql, data, retried).
    """
    if data:
        return sql, data, False

    q = question.lower()
    if not any(k in q for k in PARTS_KEYWORDS):
        return sql, data, False

    m = ORDER_ID_RE.search(q)
    if not m:
        return sql, data, False

    retry_sql = PARTS_FOR_ORDER_SQL(m.group(1)).strip()
    retry_data, err = execute_sql(retry_sql)
    if err:
        return sql, data, False

    return retry_sql, retry_data, True


class ChatService:
    def __init__(self):
        self.history = HistoryService()

    def process(self, question: str, session_id: str) -> Dict:
        sql, matched = try_quick_pattern(question)

        if not matched:
            hist = self.history.get(session_id)
            msgs = build_messages(question, hist)
            try:
                raw = get_llm().invoke(msgs).content.strip()
            except Exception as e:
                return {"answer": f"LLM error: {e}", "sql": "", "data": []}

            if raw == "CANNOT_ANSWER":
                answer = (
                    "I can only answer questions about the CMF manufacturing "
                    "database — orders, parts, operations, machines, inventory, "
                    "quality, or operators."
                )
                self.history.save(session_id, question, answer)
                return {"answer": answer, "sql": "", "data": []}

            sql = SQLValidator.extract(raw)

        data, err = execute_sql(sql)
        if err:
            return {"answer": f"⚠️ {err}", "sql": sql, "data": []}

        # Safety net: retry with verified template if LLM SQL returned 0 rows
        # for a "parts of order X" style question
        sql, data, _ = maybe_retry_with_fallback(question, sql, data)

        answer = format_answer(question, data)
        self.history.save(session_id, question, answer)
        return {"answer": answer, "sql": sql, "data": data}

    async def stream(self, question: str, session_id: str) -> AsyncGenerator[str, None]:

        def sse(payload: dict) -> str:
            return f"data: {json_dumps(payload)}\n\n"

        sql, matched = try_quick_pattern(question)

        if not matched:
            hist = self.history.get(session_id)
            msgs = build_messages(question, hist)
            raw = ""
            try:
                async for chunk in get_llm().astream(msgs):
                    token = chunk.content
                    raw += token
                    if token:
                        yield sse({"type": "token", "content": token})
                    await asyncio.sleep(0)
            except Exception as e:
                yield sse({"type": "error", "message": str(e)})
                return

            if raw.strip() == "CANNOT_ANSWER":
                answer = "I can only answer questions about the CMF manufacturing database."
                yield sse({"type": "final", "answer": answer, "sql": "", "data": []})
                yield "data: [DONE]\n\n"
                self.history.save(session_id, question, answer)
                return

            sql = SQLValidator.extract(raw)

        data, err = execute_sql(sql)
        if err:
            yield sse({"type": "final", "answer": f"⚠️ {err}", "sql": sql, "data": []})
            yield "data: [DONE]\n\n"
            return

        # Safety net: retry with verified template if LLM SQL returned 0 rows
        # for a "parts of order X" style question
        sql, data, _ = maybe_retry_with_fallback(question, sql, data)

        answer = format_answer(question, data)
        self.history.save(session_id, question, answer)
        yield sse({"type": "final", "answer": answer, "sql": sql, "data": data})
        yield "data: [DONE]\n\n"


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — ROUTER
# ══════════════════════════════════════════════════════════════════════════════

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()

_svc: ChatService = None

def get_svc():
    global _svc
    if _svc is None:
        _svc = ChatService()
    return _svc


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest):
    try:
        result = get_svc().process(body.question, body.session_id)
        return ChatResponse(**result)
    except RateLimitExceeded:
        raise HTTPException(429, "Too many requests.")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(request: Request, body: ChatRequest):
    return StreamingResponse(
        get_svc().stream(body.question, body.session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    get_svc().history.clear(session_id)
    return {"message": "History cleared"}


@router.get("/health")
async def health():
    return {"status": "ok", "model": os.getenv("OLLAMA_MODEL", "codellama")}
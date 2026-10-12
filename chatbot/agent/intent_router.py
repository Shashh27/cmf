"""High-accuracy intent → validated recipe SQL for the full CMF app.

Goal: 90%+ on day-to-day Admin/MC questions.

Approach (not per-question hardcoded Q→SQL):
1. Understand NL → structured intent (heuristic + optional tiny Groq JSON)
2. Run curated join/list recipes with filled filters (schema-correct SQL)
3. Zero-row retry with broader filters / alternate recipes
4. Only if still unresolved → freeform tool agent

Recipes are FK-correct templates. Intent mapping is NL understanding.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from chatbot.agent.relationships import get_join_recipe
from chatbot.agent.tools import tool_run_select_sql
from chatbot.groq_client import groq_chat, is_groq_enabled, parse_json_object

logger = logging.getLogger(__name__)

# Domains the router can resolve with high confidence via recipes
LIST_ENTITIES = {
    "order", "part", "product", "customer", "machine", "work_center", "vendor",
    "operator", "tool", "tool_issue", "inventory_request", "return_request",
    "raw_material_stock", "schedule", "production_log", "machine_live",
    "quality", "breakdown", "pm", "notification", "assembly", "outsource",
    "downtime", "oee", "energy", "leave",
}

JOIN_PAIRS = {
    ("part", "raw_material"),
    ("part", "raw_material_stock"),
    ("order", "part"),
    ("order", "raw_material"),
    ("order", "schedule"),
    ("order", "product"),
    ("operation", "tool"),
}

INTENT_JSON_PROMPT = """Extract structured intent for a CMF manufacturing chatbot.
Return ONLY JSON (no markdown):
{{
  "mode": "list" | "join" | "search" | "freeform",
  "list_entity": "<entity or null>",
  "from_entity": "<entity or null>",
  "to_entity": "<entity or null>",
  "filters": {{
    "order_no": "<or null>",
    "part_term": "<or null>",
    "material_term": "<or null>",
    "tool_term": "<or null>",
    "machine_term": "<or null>",
    "customer_term": "<or null>",
    "status": "<or null>"
  }},
  "confidence": 0.0
}}

list_entity one of: {entities}
join pairs like part→raw_material, order→schedule, order→part, operation→tool.
Use mode=freeform only if none of the above fit.
confidence 0-1.

User question: {question}
JSON:"""


def _safe(val: str) -> str:
    return (val or "").replace("'", "''").strip()


def extract_filters_heuristic(question: str) -> Dict[str, Optional[str]]:
    q = question or ""
    filters: Dict[str, Optional[str]] = {
        "order_no": None,
        "part_term": None,
        "material_term": None,
        "tool_term": None,
        "machine_term": None,
        "customer_term": None,
        "status": None,
    }

    # order 89 / order ABC2 / SO-001 — allow short numeric ids
    om = re.search(
        r"\border\s+(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]{0,})\b",
        q,
        re.I,
    )
    if om and om.group(1):
        filters["order_no"] = om.group(1).upper()
    else:
        om2 = re.search(r"\b([A-Z]{2,}[\-_]?[A-Z]*\d{2,})\b", q)
        if om2:
            filters["order_no"] = om2.group(1).upper()

    pm = re.search(
        r"\bpart\s+(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]+)\b|"
        r"\b(PRT[\-_]?\d+)\b|"
        r"\b(?:for|of)\s+(?:part\s+)?(\d{2,4})\b",
        q,
        re.I,
    )
    if pm:
        filters["part_term"] = (pm.group(1) or pm.group(2) or pm.group(3) or "").strip()
    # Don't treat the order number as a part when question is about an order
    if filters.get("order_no") and filters.get("part_term"):
        if filters["part_term"].upper() == filters["order_no"].upper():
            filters["part_term"] = None
        # "for order 89" must not set part_term from "for ... 89"
        if re.search(r"\border\b", q, re.I) and not re.search(r"\bpart\b", q, re.I):
            filters["part_term"] = None

    mm = re.search(
        r"\b(EN\s*\d+|FG\s*\d+|45C8|20MnCr5|Aluminium|Aluminum|steel)\b",
        q,
        re.I,
    )
    if mm:
        filters["material_term"] = re.sub(r"\s+", "", mm.group(1))

    sm = re.search(
        r"\b(pending|approved|rejected|completed|in[\s_]?progress|available|exhausted)\b",
        q,
        re.I,
    )
    if sm:
        filters["status"] = sm.group(1).lower().replace(" ", "_")

    return filters


def classify_intent_heuristic(question: str) -> Dict[str, Any]:
    """Fast, high-precision intent without LLM (covers most day-to-day asks)."""
    q = (question or "").lower()
    filters = extract_filters_heuristic(question)
    intent: Dict[str, Any] = {
        "mode": "freeform",
        "list_entity": None,
        "from_entity": None,
        "to_entity": None,
        "filters": filters,
        "confidence": 0.0,
    }

    # Joins first (more specific)
    # Match material / materail / raw mat / rm (typos included)
    wants_material = bool(
        re.search(
            r"\bmater|\braw\s*mat|\br\.?\s*m\.?\b|\brm\b|stock\s*dim|length\s*used|bar\s*stock",
            q,
        )
    )

    if wants_material and filters.get("order_no") and not filters.get("part_term"):
        intent.update({
            "mode": "join",
            "from_entity": "order",
            "to_entity": "raw_material",
            "confidence": 0.93,
        })
        return intent

    if wants_material and (
        filters.get("part_term") or re.search(r"\bpart\b", q)
    ):
        intent.update({
            "mode": "join",
            "from_entity": "part",
            "to_entity": "raw_material",
            "confidence": 0.92,
        })
        return intent

    # "use(d) for order X" with order id → material for order (common shop phrasing)
    if filters.get("order_no") and re.search(r"\b(use[d]?|used|usage)\b", q) and not filters.get("part_term"):
        intent.update({
            "mode": "join",
            "from_entity": "order",
            "to_entity": "raw_material",
            "confidence": 0.9,
        })
        return intent

    if re.search(r"schedule|gantt|planned\s+start", q) and filters.get("order_no"):
        intent.update({
            "mode": "join",
            "from_entity": "order",
            "to_entity": "schedule",
            "confidence": 0.93,
        })
        return intent

    if re.search(r"\bparts?\b", q) and filters.get("order_no") and re.search(
        r"\border\b|\bfor\b|\bon\b", q
    ):
        intent.update({
            "mode": "join",
            "from_entity": "order",
            "to_entity": "part",
            "confidence": 0.9,
        })
        return intent

    if re.search(r"\btools?\b", q) and re.search(r"\b(operation|part)\b", q):
        intent.update({
            "mode": "join",
            "from_entity": "operation",
            "to_entity": "tool",
            "confidence": 0.85,
        })
        return intent

    # Lists
    list_rules: List[Tuple[str, str, float]] = [
        (r"\breturn\s*requests?\b", "return_request", 0.95),
        (r"\btool\s*issues?\b", "tool_issue", 0.95),
        (r"\binventory\s*requests?\b|\btool\s*requests?\b", "inventory_request", 0.94),
        (r"\bmachine\s+live|shop\s*floor|live\s+(?:machine\s+)?status\b", "machine_live", 0.93),
        (r"\bproduction\s+logs?\b", "production_log", 0.92),
        (r"\bbreakdowns?\b", "breakdown", 0.92),
        (r"\bpreventive|\bpm\s+schedule\b", "pm", 0.9),
        (r"\bquality\b|\binspection\b", "quality", 0.88),
        (r"\bdowntimes?\b", "downtime", 0.9),
        (r"\boee\b", "oee", 0.92),
        (r"\benergy\b|\bems\b|\bpower\b", "energy", 0.88),
        (r"\bleaves?\b", "leave", 0.9),
        (r"\bnotifications?|\balerts?\b", "notification", 0.88),
        (r"\bassembl(?:y|ies)\b", "assembly", 0.9),
        (r"\boutsourc", "outsource", 0.9),
        (r"\bvendors?|\bsuppliers?\b", "vendor", 0.92),
        (r"\bcustomers?\b", "customer", 0.93),
        (r"\bwork\s*centers?\b", "work_center", 0.93),
        (r"\boperators?\b|\busers?\b", "operator", 0.85),
        (r"\bmachines?\b", "machine", 0.9),
        (r"\bproducts?\b", "product", 0.88),
        (r"\bschedule|gantt\b", "schedule", 0.86),
        (r"\b(?:list|show|give|get|all).{0,25}\btools?\b|\btools?\s*list\b", "tool", 0.94),
        (r"\braw\s*material\s*stock|\b(?:list|show|all)\s+stock\b", "raw_material_stock", 0.92),
        (r"\b(?:list|show|all|give).{0,20}\bparts?\b|\bparts?\s*list\b", "part", 0.9),
        (r"\b(?:list|show|all|give).{0,20}\borders?\b|\borders?\s*list\b", "order", 0.94),
    ]
    for pat, entity, conf in list_rules:
        if re.search(pat, q):
            intent.update({
                "mode": "list",
                "list_entity": entity,
                "confidence": conf,
            })
            return intent

    # Bare "orders" / "machines" list-ish
    if re.fullmatch(r"\s*(orders?|machines?|customers?|tools?|parts?)\s*", q):
        entity = {
            "order": "order", "orders": "order",
            "machine": "machine", "machines": "machine",
            "customer": "customer", "customers": "customer",
            "tool": "tool", "tools": "tool",
            "part": "part", "parts": "part",
        }[q.strip()]
        intent.update({"mode": "list", "list_entity": entity, "confidence": 0.9})
        return intent

    return intent


def classify_intent_llm(question: str) -> Optional[Dict[str, Any]]:
    if not is_groq_enabled():
        return None
    raw = groq_chat(
        [{
            "role": "user",
            "content": INTENT_JSON_PROMPT.format(
                entities=", ".join(sorted(LIST_ENTITIES)),
                question=question,
            ),
        }],
        max_tokens=250,
    )
    obj = parse_json_object(raw or "")
    if not obj:
        return None
    mode = str(obj.get("mode") or "freeform").lower()
    conf = float(obj.get("confidence") or 0.5)
    filters = obj.get("filters") if isinstance(obj.get("filters"), dict) else {}
    # merge heuristic filters for IDs LLM may miss
    heur = extract_filters_heuristic(question)
    for k, v in heur.items():
        if v and not filters.get(k):
            filters[k] = v
    return {
        "mode": mode,
        "list_entity": obj.get("list_entity"),
        "from_entity": obj.get("from_entity"),
        "to_entity": obj.get("to_entity"),
        "filters": filters,
        "confidence": conf,
    }


def is_chitchat(question: str) -> bool:
    """Greetings / thanks / help — never need Groq or SQL."""
    q = re.sub(r"\s+", " ", (question or "").strip().lower())
    q = q.replace("\ufeff", "").replace("\u200b", "")
    if not q or len(q) > 80:
        return False
    if re.fullmatch(
        r"(hi|hii|hiii|hello|hey|yo|bro|hola|namaste|good (morning|afternoon|evening))"
        r"([\s,!.🙏😊👋].*)?",
        q,
    ):
        return True
    if re.fullmatch(r"(thanks|thank you|thx|ok|okay|bye|goodbye|cool|great|nice)[!.,]*", q):
        return True
    if re.fullmatch(r"(help|what can you do|how (do|can) (i|you) (help|work))\??", q):
        return True
    return False


def chitchat_answer(question: str, ctx=None) -> Dict[str, Any]:
    from chatbot.user_context import UserContext, get_role_suggestions, personalized_greeting

    ctx = ctx or UserContext()
    q = (question or "").strip().lower()
    if re.search(r"help|what can you do|how (do|can)", q):
        answer = (
            "I can look up CMF manufacturing data for you.\n\n"
            "Try: *list all orders*, *material for part PRT-002*, "
            "*tool issues*, *machine live status*, or *schedule for order …*."
        )
    elif re.fullmatch(r"(thanks|thank you|thx|ok|okay|cool|great|nice)[!.,]*", q):
        answer = "You're welcome. Ask anytime about orders, parts, stock, or machines."
    elif re.fullmatch(r"(bye|goodbye)[!.,]*", q):
        answer = "Goodbye — open the assistant anytime you need CMF data."
    else:
        answer = personalized_greeting(ctx)
    return {
        "answer": answer,
        "sql": "",
        "data": [],
        "suggestions": get_role_suggestions(ctx)[:3],
        "intent": {"mode": "chitchat", "confidence": 1.0},
    }


def resolve_intent(question: str) -> Dict[str, Any]:
    """Heuristic first; LLM only if confidence < 0.85 and question looks data-related."""
    if is_chitchat(question):
        return {
            "mode": "chitchat",
            "list_entity": None,
            "from_entity": None,
            "to_entity": None,
            "filters": {},
            "confidence": 1.0,
        }
    intent = classify_intent_heuristic(question)
    if intent.get("confidence", 0) >= 0.85:
        return intent
    # Do not burn Groq TPM on short / empty freeform — fallback agent can retry later
    q = (question or "").strip()
    if len(q) < 4 or (intent.get("mode") == "freeform" and len(q.split()) <= 2):
        return intent
    llm = classify_intent_llm(question)
    if llm and float(llm.get("confidence") or 0) >= float(intent.get("confidence") or 0):
        return llm
    return intent


def _fill_recipe_sql(sql_hint: str, filters: Dict[str, Optional[str]]) -> str:
    sql = sql_hint
    part = _safe(filters.get("part_term") or "")
    order = _safe(filters.get("order_no") or "")
    material = _safe(filters.get("material_term") or "")

    # Common placeholders used in relationships.py
    if part:
        # Short numeric codes (e.g. 002) must not match 0020-4 mid-string
        if part.isdigit() and len(part) <= 4:
            tight = (
                f"(p.part_number ~* '(^|[^0-9]){part}([^0-9]|$)' "
                f"OR UPPER(p.part_number) IN "
                f"(UPPER('PRT-{part}'), UPPER('PRT_{part}'), UPPER('{part}')) "
                f"OR p.part_name ILIKE '%{part}%')"
            )
            loose = "(p.part_number ILIKE '%PART%' OR p.part_name ILIKE '%PART%')"
            if loose in sql:
                sql = sql.replace(loose, tight)
            else:
                sql = sql.replace("%PART%", part)
        else:
            sql = sql.replace("%PART%", part)
        sql = sql.replace("%PART_NO%", part)
    if order:
        # Prefer %ORDER_NO% first so bare ORDER_NO still works after
        sql = sql.replace("%ORDER_NO%", order).replace("%ORDER%", order)
        sql = sql.replace("ORDER_NO", order)
    if material:
        sql = sql.replace("%MATERIAL%", material)

    return sql


def _sql_still_has_placeholders(sql: str) -> bool:
    return bool(
        re.search(r"%PART%|%ORDER%|%ORDER_NO%|%MATERIAL%|\bORDER_NO\b|\bPART_NO\b", sql)
    )


def _inject_before_order_by(sql: str, clause: str) -> str:
    """Insert AND/WHERE clause immediately before ORDER BY (or LIMIT)."""
    if re.search(r"\bWHERE\b", sql, re.I):
        frag = f"AND {clause}\n"
    else:
        frag = f"WHERE {clause}\n"
    if re.search(r"\bORDER BY\b", sql, re.I):
        return re.sub(r"\bORDER BY\b", f"{frag}ORDER BY", sql, count=1, flags=re.I)
    if re.search(r"\bLIMIT\b", sql, re.I):
        return re.sub(r"\bLIMIT\b", f"{frag}LIMIT", sql, count=1, flags=re.I)
    return f"{sql.rstrip()}\n{frag.strip()}"


def _apply_list_filters(sql: str, domain: str, filters: Dict[str, Optional[str]]) -> str:
    """Tighten list recipes when the user named a specific id/term."""
    order = _safe(filters.get("order_no") or "")
    part = _safe(filters.get("part_term") or "")
    material = _safe(filters.get("material_term") or "")
    status = _safe(filters.get("status") or "")
    tool = _safe(filters.get("tool_term") or "")
    machine = _safe(filters.get("machine_term") or "")
    customer = _safe(filters.get("customer_term") or "")

    if domain == "order" and order:
        # Prefer exact / prefix match so "ABC2" does not return every order
        sql = _inject_before_order_by(
            sql,
            f"(UPPER(o.sale_order_number) = UPPER('{order}') "
            f"OR o.sale_order_number ILIKE '{order}%')",
        )
    elif domain == "part" and part:
        if part.isdigit() and len(part) <= 4:
            sql = _inject_before_order_by(
                sql,
                f"(p.part_number ~* '(^|[^0-9]){part}([^0-9]|$)' "
                f"OR UPPER(p.part_number) IN "
                f"(UPPER('PRT-{part}'), UPPER('PRT_{part}'), UPPER('{part}')))",
            )
        else:
            sql = _inject_before_order_by(
                sql,
                f"(p.part_number ILIKE '%{part}%' OR p.part_name ILIKE '%{part}%')",
            )
    elif domain == "raw_material_stock" and material:
        sql = _inject_before_order_by(sql, f"rm.material_name ILIKE '%{material}%'")
    elif domain == "tool" and tool:
        sql = _inject_before_order_by(
            sql,
            f"(tl.item_description ILIKE '%{tool}%' OR tl.identification_code ILIKE '%{tool}%')",
        )
    elif domain == "machine" and machine:
        sql = _inject_before_order_by(
            sql,
            f"(m.type ILIKE '%{machine}%' OR m.model ILIKE '%{machine}%')",
        )
    elif domain == "customer" and customer:
        sql = _inject_before_order_by(sql, f"c.company_name ILIKE '%{customer}%'")

    if status and domain in ("tool_issue", "inventory_request", "return_request", "order"):
        col = {
            "tool_issue": "ti.status",
            "inventory_request": "ir.status",
            "return_request": "rr.status",
            "order": "o.status",
        }[domain]
        sql = _inject_before_order_by(sql, f"{col} ILIKE '%{status}%'")

    return sql


def _row_matches_order(row: Dict[str, Any], order_no: str) -> bool:
    term = (order_no or "").strip().upper()
    if not term:
        return True
    for key in (
        "sale_order_number", "order_no", "order_number", "project",
        "sale_order_no",
    ):
        val = row.get(key)
        if val is None:
            continue
        s = str(val).strip().upper()
        if s == term or s.startswith(term):
            return True
    return False


def _row_matches_part(row: Dict[str, Any], part_term: str) -> bool:
    term = (part_term or "").strip().upper()
    if not term:
        return True
    bare = re.sub(r"^PRT[\-_]", "", term, flags=re.I)
    for key in ("part_number", "part_name", "part"):
        val = row.get(key)
        if val is None:
            continue
        s = str(val).strip().upper()
        if term in s or bare in s or s.endswith(bare):
            # Avoid 002 matching 0020-4 when term is pure digits
            if bare.isdigit() and len(bare) <= 4:
                if re.search(rf"(^|[^0-9]){re.escape(bare)}([^0-9]|$)", s):
                    return True
                if s in {f"PRT-{bare}", f"PRT_{bare}", bare}:
                    return True
                continue
            return True
    return False


def filter_rows_to_asked_entity(
    rows: List[Dict[str, Any]],
    filters: Dict[str, Optional[str]],
) -> List[Dict[str, Any]]:
    """Hard guard: never return unrelated rows when user named an order/part."""
    if not rows:
        return []
    order = (filters or {}).get("order_no")
    part = (filters or {}).get("part_term")
    out = list(rows)
    if order:
        narrowed = [r for r in out if _row_matches_order(r, order)]
        # Only apply if at least one column looked like an order field exists
        has_order_col = any(
            k in (rows[0] or {})
            for k in ("sale_order_number", "order_no", "order_number", "project", "sale_order_no")
        )
        if has_order_col:
            out = narrowed
    if part:
        has_part_col = any(
            k in (rows[0] or {}) for k in ("part_number", "part_name", "part")
        )
        if has_part_col:
            out = [r for r in out if _row_matches_part(r, part)]
    return out


def _specific_answer(intent: Dict[str, Any], rows: List[Dict]) -> str:
    n = len(rows or [])
    filters = intent.get("filters") or {}
    order = filters.get("order_no")
    part = filters.get("part_term")
    if n == 0:
        if order:
            return f"No order found matching **{order}**."
        if part:
            return f"No part found matching **{part}**."
        return "No matching rows found for that request."
    if order and n == 1:
        return f"Here is order **{order}**."
    if order:
        return f"Found **{n}** row(s) for order **{order}**."
    if part and intent.get("mode") == "join":
        return f"Found **{n}** material/stock row(s) for part **{part}**."
    if part:
        return f"Found **{n}** row(s) for part **{part}**."
    if intent.get("from_entity") == "order" and intent.get("to_entity") == "raw_material" and order:
        return f"Found **{n}** raw-material row(s) for order **{order}**."
    return f"Found **{n}** matching row(s)."


def execute_intent(
    intent: Dict[str, Any],
    execute_fn,
    *,
    min_confidence: float = 0.8,
) -> Optional[Dict[str, Any]]:
    """
    Run validated recipe SQL for intent.
    Returns {sql, rows, ok, domain} or None if should freeform.
    """
    conf = float(intent.get("confidence") or 0)
    mode = (intent.get("mode") or "").lower()
    filters = intent.get("filters") or {}

    if conf < min_confidence or mode in ("freeform", "search", "chitchat", ""):
        return None

    recipe = None
    domain = None

    if mode == "list":
        entity = (intent.get("list_entity") or "").strip().lower()
        if entity not in LIST_ENTITIES:
            return None
        recipe = get_join_recipe("list", entity)
        domain = entity
    elif mode == "join":
        src = (intent.get("from_entity") or "").strip().lower()
        dst = (intent.get("to_entity") or "").strip().lower()
        if (src, dst) not in JOIN_PAIRS and not get_join_recipe(src, dst):
            return None
        recipe = get_join_recipe(src, dst)
        domain = f"{src}_{dst}"
        # Need identifiers for filtered joins
        if dst in ("raw_material", "raw_material_stock") and not filters.get("part_term"):
            # order → raw_material uses order_no instead of part
            if not (src == "order" and filters.get("order_no") and dst == "raw_material"):
                return None
        if dst == "schedule" and not filters.get("order_no"):
            return None
        if src == "order" and dst == "raw_material" and not filters.get("order_no"):
            return None

    if not recipe or not recipe.get("sql_hint"):
        return None

    sql = _fill_recipe_sql(recipe["sql_hint"], filters)
    if _sql_still_has_placeholders(sql):
        return None

    if mode == "list" and domain:
        sql = _apply_list_filters(sql, domain, filters)

    # Safety: specific order/part ask must never run an unfiltered list
    if filters.get("order_no") and mode == "list" and domain == "order":
        if "sale_order_number" not in sql.lower() or "where" not in sql.lower():
            sql = _apply_list_filters(sql, "order", filters)
    if filters.get("part_term") and mode == "list" and domain == "part":
        if "where" not in sql.lower():
            sql = _apply_list_filters(sql, "part", filters)

    result = tool_run_select_sql(sql, execute_fn)
    rows = result.get("rows") or []
    used_sql = result.get("sql") or sql

    # Zero-row retry: broaden part match once (keep order filter strict)
    if result.get("ok") and not rows:
        retry_sql = None
        if filters.get("part_term") and len(filters["part_term"]) >= 2:
            term = filters["part_term"]
            alt = re.sub(r"^PRT[\-_]?", "", term, flags=re.I)
            if alt != term:
                filters2 = dict(filters)
                filters2["part_term"] = alt
                retry_sql = _fill_recipe_sql(recipe["sql_hint"], filters2)
                if mode == "list" and domain:
                    retry_sql = _apply_list_filters(retry_sql, domain, filters2)
        if retry_sql and retry_sql != sql and not _sql_still_has_placeholders(retry_sql):
            result2 = tool_run_select_sql(retry_sql, execute_fn)
            if result2.get("ok") and result2.get("rows"):
                rows2 = filter_rows_to_asked_entity(result2["rows"], filters)
                return {
                    "ok": True,
                    "sql": result2.get("sql") or retry_sql,
                    "rows": rows2,
                    "domain": domain,
                    "intent": intent,
                }

    if not result.get("ok"):
        return None

    rows = filter_rows_to_asked_entity(rows, filters)
    return {
        "ok": True,
        "sql": used_sql,
        "rows": rows,
        "domain": domain,
        "intent": intent,
    }


def try_high_accuracy_path(question: str, execute_fn, ctx=None) -> Optional[Dict[str, Any]]:
    """
    Public entry: intent → recipe → rows.
    Returns payload ready for _finalize, or None to continue freeform agent.
    """
    if is_chitchat(question):
        return chitchat_answer(question, ctx)

    intent = resolve_intent(question)
    logger.info(
        "intent mode=%s entity=%s join=%s→%s conf=%.2f",
        intent.get("mode"),
        intent.get("list_entity"),
        intent.get("from_entity"),
        intent.get("to_entity"),
        float(intent.get("confidence") or 0),
    )
    if intent.get("mode") == "chitchat":
        return chitchat_answer(question, ctx)

    executed = execute_intent(intent, execute_fn, min_confidence=0.8)
    if not executed:
        return None
    rows = executed.get("rows") or []
    n = len(rows)
    answer = _specific_answer(intent, rows)
    if n == 0:
        # Specific id ask with 0 rows — still a valid scoped answer (don't dump all rows)
        if intent.get("filters", {}).get("order_no") or intent.get("filters", {}).get("part_term"):
            return {
                "answer": answer,
                "sql": executed.get("sql") or "",
                "data": [],
                "intent": intent,
            }
        if intent.get("mode") == "list" and float(intent.get("confidence") or 0) >= 0.9:
            return {
                "answer": answer,
                "sql": executed.get("sql") or "",
                "data": [],
                "intent": intent,
            }
        return None
    return {
        "answer": answer,
        "sql": executed.get("sql") or "",
        "data": rows,
        "intent": intent,
    }

"""Agent tools — schema inspect, entity search, join paths, SELECT runner."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text

from chatbot.agent.relationships import (
    get_join_recipe,
    list_join_keys,
    normalize_entity,
    relationship_prompt_block,
)
from DB.database import engine

# OpenAI/Groq tool schemas
TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "inspect_schema",
            "description": (
                "Inspect live PostgreSQL columns for a schema or schema.table "
                "(e.g. 'oms', 'oms.parts', 'inventory.raw_material_stock')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "table_or_schema": {
                        "type": "string",
                        "description": "Schema name or schema.table",
                    },
                },
                "required": ["table_or_schema"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_join_path",
            "description": (
                "Get the correct JOIN or LIST SQL recipe for ANY CMF module. "
                "Use from_entity='list' and to_entity one of: "
                "order, part, product, customer, machine, work_center, vendor, operator, "
                "tool, tool_issue, inventory_request, return_request, raw_material_stock, "
                "schedule, production_log, machine_live, quality, breakdown, pm, "
                "notification, assembly, outsource, downtime, oee, energy, leave. "
                "Or join pairs like part→raw_material, order→schedule, order→part, "
                "operation→tool."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "from_entity": {"type": "string"},
                    "to_entity": {"type": "string"},
                },
                "required": ["from_entity", "to_entity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_entity",
            "description": (
                "Lookup entities by kind and search term. "
                "kind: order | part | material | tool | machine | product | customer | vendor | operator"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": [
                            "order", "part", "material", "tool", "machine",
                            "product", "customer", "vendor", "operator",
                        ],
                    },
                    "term": {"type": "string"},
                    "limit": {"type": "integer", "default": 10},
                },
                "required": ["kind", "term"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_select_sql",
            "description": (
                "Execute one SELECT query against the CMF database. "
                "Must be SELECT only, schema-qualified tables, LIMIT <= 100."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string"},
                },
                "required": ["sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plan_display_columns",
            "description": (
                "Column planner agent: given the user question (and optional domain), "
                "return the MAIN chatbot display columns only — not full table dumps. "
                "Call before writing SELECT so you only fetch what the UI needs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "domain": {
                        "type": "string",
                        "description": (
                            "Optional: order | part | part_material | raw_material_stock | "
                            "schedule | operation | tool | machine | product | notification"
                        ),
                    },
                },
                "required": ["question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish_answer",
            "description": (
                "Finish the conversation turn with a SHORT natural-language answer "
                "(1–2 sentences). Do not paste tables or long row lists — the UI shows data. "
                "Call only AFTER run_select_sql (or search) returned the needed rows, "
                "or when clarifying / reporting zero rows."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "answer": {
                        "type": "string",
                        "description": "Markdown-friendly natural language answer for the user",
                    },
                    "sql_used": {
                        "type": "string",
                        "description": "Last successful SELECT SQL, or empty",
                    },
                },
                "required": ["answer"],
            },
        },
    },
]


def _safe_term(term: str) -> str:
    return (term or "").replace("'", "''").strip()[:80]


def tool_inspect_schema(table_or_schema: str) -> Dict[str, Any]:
    from DB.schemas.chatbot import SchemaService

    live = SchemaService.load_schema()
    target = (table_or_schema or "").strip().lower()
    if not target:
        return {"error": "table_or_schema is required", "schemas": list(live.keys())}

    if "." in target:
        schema, table = target.split(".", 1)
        cols = (live.get(schema) or {}).get(table)
        if cols is None:
            return {"error": f"Unknown table {target}", "available_in_schema": list((live.get(schema) or {}).keys())}
        return {"table": f"{schema}.{table}", "columns": cols}

    tables = live.get(target)
    if tables is None:
        return {"error": f"Unknown schema {target}", "schemas": list(live.keys())}
    return {
        "schema": target,
        "tables": {name: cols for name, cols in list(tables.items())[:40]},
        "table_count": len(tables),
    }


def tool_get_join_path(from_entity: str, to_entity: str) -> Dict[str, Any]:
    recipe = get_join_recipe(from_entity, to_entity)
    if not recipe:
        return {
            "error": "No curated join path for that pair",
            "from": normalize_entity(from_entity),
            "to": normalize_entity(to_entity),
            "available": list_join_keys(),
            "hint": relationship_prompt_block()[:1200],
        }
    return recipe


SEARCH_SQL = {
    "order": """
        SELECT o.id, o.sale_order_number, o.status, o.approval_status, o.quantity, o.due_date,
               pr.product_name, c.company_name AS customer
        FROM oms.orders o
        LEFT JOIN oms.products pr ON pr.id = o.product_id
        LEFT JOIN configuration.customers c ON c.id = o.customer_id
        WHERE o.sale_order_number ILIKE :pat OR o.project_name ILIKE :pat
        ORDER BY o.id DESC LIMIT :lim
    """,
    "part": """
        SELECT p.id, p.part_number, p.part_name, p.qty, p.size,
               rm.material_name AS bom_raw_material, pr.product_name
        FROM oms.parts p
        LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
        LEFT JOIN oms.products pr ON pr.id = p.product_id
        WHERE (p.part_number ILIKE :pat OR p.part_name ILIKE :pat)
          AND COALESCE(p.recycle_bin, false) = false
        ORDER BY p.part_number LIMIT :lim
    """,
    "material": """
        SELECT rm.id, rm.material_name, rm.density, rm.cost_per_kg,
               COUNT(rms.id) AS stock_rows,
               COALESCE(SUM(rms.available_quantity), 0) AS total_available
        FROM inventory.raw_materials rm
        LEFT JOIN inventory.raw_material_stock rms ON rms.material_id = rm.id
        WHERE rm.material_name ILIKE :pat
        GROUP BY rm.id, rm.material_name, rm.density, rm.cost_per_kg
        ORDER BY rm.material_name LIMIT :lim
    """,
    "tool": """
        SELECT tl.id, tl.item_description, tl.identification_code, tl.make,
               tl.quantity, tl.type, cat.name AS category
        FROM inventory.tools_list tl
        LEFT JOIN inventory.categories cat ON cat.id = tl.category_id
        WHERE tl.item_description ILIKE :pat
           OR tl.identification_code ILIKE :pat
           OR tl.make ILIKE :pat
        ORDER BY tl.item_description LIMIT :lim
    """,
    "machine": """
        SELECT m.id, m.type, m.make, m.model, wc.work_center_name,
               m.calibration_due_date
        FROM configuration.machines m
        LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
        WHERE m.type ILIKE :pat OR m.model ILIKE :pat OR m.make ILIKE :pat
        ORDER BY m.type LIMIT :lim
    """,
    "product": """
        SELECT pr.id, pr.product_name, pr.product_version
        FROM oms.products pr
        WHERE pr.product_name ILIKE :pat
        ORDER BY pr.product_name LIMIT :lim
    """,
    "customer": """
        SELECT c.id, c.company_name AS customer, c.branch, c.email,
               c.contact_person, c.contact_number
        FROM configuration.customers c
        WHERE c.company_name ILIKE :pat OR c.contact_person ILIKE :pat
        ORDER BY c.company_name LIMIT :lim
    """,
    "vendor": """
        SELECT v.id, v.company_name AS vendor
        FROM inventory.vendors v
        WHERE v.company_name ILIKE :pat
        ORDER BY v.company_name LIMIT :lim
    """,
    "operator": """
        SELECT u.id, u.user_name, u.role, u.center, u.gmail
        FROM accesscontrol.access_users u
        WHERE u.user_name ILIKE :pat OR u.gmail ILIKE :pat OR u.role ILIKE :pat
        ORDER BY u.user_name LIMIT :lim
    """,
}


def tool_search_entity(kind: str, term: str, limit: int = 10) -> Dict[str, Any]:
    k = (kind or "").strip().lower()
    if k not in SEARCH_SQL:
        return {"error": f"Unknown kind {kind}", "allowed": list(SEARCH_SQL.keys())}
    lim = max(1, min(int(limit or 10), 30))
    pat = f"%{_safe_term(term)}%"
    if pat == "%%":
        return {"error": "term is required"}
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(SEARCH_SQL[k]), {"pat": pat, "lim": lim}).mappings().all()
            data = [dict(r) for r in rows]
        return {"kind": k, "term": term, "count": len(data), "rows": data}
    except Exception as e:
        return {"error": f"search failed: {e}"}


def _ensure_limit(sql: str, max_limit: int = 100) -> str:
    s = sql.strip().rstrip(";")
    if re.search(r"\blimit\s+\d+\b", s, re.I):
        def _cap(m):
            n = int(m.group(1))
            return f"LIMIT {min(n, max_limit)}"
        return re.sub(r"\blimit\s+(\d+)\b", _cap, s, flags=re.I)
    return f"{s}\nLIMIT {max_limit}"


def tool_run_select_sql(sql: str, execute_fn) -> Dict[str, Any]:
    """execute_fn(sql) -> (rows: list[dict], err: str) — uses chatbot.execute_sql for scoping."""
    from chatbot.chatbot import SQLValidator

    raw = (sql or "").strip()
    if not raw:
        return {"error": "sql is required", "rows": [], "sql": ""}
    capped = _ensure_limit(raw)
    ok, err = SQLValidator.validate(capped)
    if not ok:
        return {"error": err, "rows": [], "sql": capped}
    rows, db_err = execute_fn(capped)
    if db_err:
        return {"error": db_err, "rows": [], "sql": capped}
    return {
        "ok": True,
        "sql": capped,
        "count": len(rows or []),
        "rows": (rows or [])[:100],
        "columns": list((rows or [{}])[0].keys()) if rows else [],
    }


def tool_plan_display_columns(question: str, domain: str = "") -> Dict[str, Any]:
    from chatbot.agent.column_agent import detect_domain, pick_columns
    from chatbot.agent.column_plans import COLUMN_LABELS, main_columns_for

    dom = (domain or "").strip().lower() or detect_domain(question, None)
    # Fake availability = full main list so agent knows what to SELECT
    fake_row = {c: None for c in main_columns_for(dom)}
    _, cols = pick_columns(question, [fake_row] if fake_row else [], domain=dom, max_cols=10)
    if not cols:
        cols = main_columns_for(dom)[:10]
    return {
        "domain": dom,
        "main_columns": cols,
        "labels": {c: COLUMN_LABELS.get(c, c) for c in cols},
        "hint": "SELECT only these aliases (plus join keys if needed). Do not SELECT *.",
    }


def dispatch_tool(
    name: str,
    arguments: Dict[str, Any],
    *,
    execute_fn,
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """
    Run a tool. Returns (tool_result_dict, finish_payload_or_none).
    finish_payload is set when finish_answer is called.
    """
    args = arguments or {}
    if name == "inspect_schema":
        return tool_inspect_schema(args.get("table_or_schema", "")), None
    if name == "get_join_path":
        return tool_get_join_path(args.get("from_entity", ""), args.get("to_entity", "")), None
    if name == "search_entity":
        return tool_search_entity(
            args.get("kind", ""),
            args.get("term", ""),
            args.get("limit", 10),
        ), None
    if name == "plan_display_columns":
        return tool_plan_display_columns(
            args.get("question", ""),
            args.get("domain", ""),
        ), None
    if name == "run_select_sql":
        return tool_run_select_sql(args.get("sql", ""), execute_fn), None
    if name == "finish_answer":
        payload = {
            "answer": str(args.get("answer") or "").strip(),
            "sql_used": str(args.get("sql_used") or "").strip(),
        }
        return {"finished": True}, payload
    return {"error": f"Unknown tool {name}"}, None


def dumps_tool_result(result: Dict[str, Any]) -> str:
    try:
        # Keep tool payloads small to stay under Groq TPM limits
        payload = result
        if isinstance(result, dict) and isinstance(result.get("rows"), list):
            payload = dict(result)
            rows = payload["rows"][:15]
            payload["rows"] = rows
            payload["count"] = result.get("count", len(result.get("rows") or []))
            if len(result.get("rows") or []) > 15:
                payload["truncated"] = True
        return json.dumps(payload, default=str)[:6000]
    except Exception:
        return json.dumps({"error": "could not serialize tool result"})

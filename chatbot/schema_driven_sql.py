"""Generate SQL from live database schema — works on any connected PostgreSQL DB."""

from __future__ import annotations

import re
from typing import List, Optional

from chatbot.groq_client import groq_chat, is_groq_enabled
from chatbot.schema_knowledge import SQL_RULES, get_compact_live_schema

_SQL_FENCE = re.compile(r"```(?:sql)?\s*(SELECT[\s\S]*?)```", re.I)
_SELECT = re.compile(r"(SELECT[\s\S]+)", re.I)


def _extract_sql(raw: str) -> str:
    if not raw:
        return ""
    m = _SQL_FENCE.search(raw)
    if m:
        return m.group(1).strip()
    m = _SELECT.search(raw)
    if m:
        return m.group(1).strip()
    return raw.strip()


def _tables_in_sql(sql: str) -> List[str]:
    found = re.findall(
        r"\b(?:from|join)\s+([a-z_][\w]*\.[a-z_][\w]*|[a-z_][\w]*)",
        sql,
        re.I,
    )
    return [t.lower() for t in found]


def _sql_uses_live_schema(sql: str, live_schema: dict) -> bool:
    """Reject SQL that references tables not present in the connected DB."""
    tables = _tables_in_sql(sql)
    if not tables:
        return False
    known = set()
    for schema, tbls in live_schema.items():
        for tbl in tbls:
            known.add(f"{schema}.{tbl}".lower())
            known.add(tbl.lower())
    for t in tables:
        if t not in known:
            return False
    return True


def generate_sql_from_schema(
    question: str,
    intents: Optional[List[str]] = None,
) -> Optional[str]:
    """
    Ask Groq to write SQL using ONLY columns/tables introspected from the live DB.
    Portable path — works when you connect a different database.
    """
    if not is_groq_enabled():
        return None

    from DB.schemas.chatbot import SchemaService

    live = SchemaService.load_schema()
    if not live:
        return None

    schema_text = get_compact_live_schema(intents)
    prompt = f"""You are a PostgreSQL expert. Write ONE SELECT query to answer the user's question.

CRITICAL:
- Use ONLY tables and columns listed in LIVE SCHEMA below (introspected from the connected database).
- Do NOT invent column names like category, vendor_name, material_grade, work_centers.name.
- Use schema-qualified table names (e.g. oms.orders).
- Filter specific IDs/names the user mentioned (part numbers, order numbers, material names).
- If user asks about stock/inventory, use inventory/raw material tables when they exist.
- If user asks about a specific part number, filter with ILIKE on part_number/part_name.
- Never return all rows when user named one item — add WHERE with ILIKE.
- LIMIT 100 unless counting.

LIVE SCHEMA:
{schema_text}

{SQL_RULES}

USER QUESTION: {question}

Reply with ONLY the SQL query:"""

    raw = groq_chat([{"role": "user", "content": prompt}], max_tokens=900)
    sql = _extract_sql(raw or "")
    if not sql.upper().startswith("SELECT"):
        return None
    if not _sql_uses_live_schema(sql, live):
        return None
    return sql

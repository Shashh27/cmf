"""Column planner agent — decides which main columns to show for an answer.

Walks CMF module intent (orders, parts, inventory, schedule, tools, machines)
and projects result rows to essentials only for the chatbot table.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from chatbot.agent.column_plans import (
    COLUMN_LABELS,
    DOMAIN_EXTRA_HINTS,
    DOMAIN_MAIN_COLUMNS,
    main_columns_for,
    prompt_block,
)
from chatbot.groq_client import groq_chat, is_groq_enabled, parse_json_object

logger = logging.getLogger(__name__)

# Prefer exact domain detection without Groq (rate limits). Groq only if ambiguous.
_USE_GROQ_COLUMN_AGENT = False  # set True via env in decide_domain if needed
import os

_USE_GROQ_COLUMN_AGENT = os.getenv("CHATBOT_COLUMN_AGENT_GROQ", "0").strip() in (
    "1",
    "true",
    "yes",
)


def detect_domain(question: str, sample_row: Optional[Dict[str, Any]] = None) -> str:
    """Pick module domain from the question and/or result keys."""
    q = (question or "").lower()
    keys = set((sample_row or {}).keys())

    # Result-shape hints first (reliable after SQL)
    if keys & {
        "length_used_mm",
        "bom_raw_material",
        "extracted_material",
        "planned_material",
        "stock_dimensions",
    }:
        if keys & {"part_number", "part_name"}:
            return "part_material"
    if keys & {"schedule_status", "planned_start_time", "planned_end_time"}:
        return "schedule"
    if keys & {"request_no", "purpose_of_use"} or (
        "requested_by" in keys and "quantity" in keys and "tool_name" in keys and "issue_no" not in keys
    ):
        return "inventory_request"
    if keys & {"return_no", "returned_qty", "total_requested_qty"}:
        return "return_request"
    if keys & {"issue_qty", "issue_category", "issue_raised_by"} or (
        "tool_name" in keys and "project" in keys and "issue_no" in keys
    ):
        return "tool_issue"
    if keys & {"item_description", "identification_code"} and "material_name" not in keys:
        return "tool"
    if keys & {"material_name", "form_type", "bar_remaining_length_mm", "available_quantity"}:
        if "part_number" in keys and (
            "stock_dimensions" in keys or "length_used_mm" in keys or "bom_raw_material" in keys
        ):
            return "part_material"
        return "raw_material_stock"
    if keys & {"sale_order_number", "approval_status"} and "part_number" not in keys:
        return "order"
    if keys & {"operation_number", "operation_name"} and "planned_start_time" not in keys:
        return "operation"
    if keys & {"calibration_due_date", "mhr"} or (
        keys & {"type", "model"} and "work_center_name" in keys and "part_number" not in keys
    ):
        return "machine"

    # Question intent
    if re.search(r"\bschedule|gantt|planned\s+start\b", q):
        return "schedule"
    if re.search(r"\b(?:raw\s*)?materi|stock\s*dim|length\s*used|bar\s*stock\b", q) and re.search(
        r"\bpart\b|\bprt[\-_]?\d+|\bfor\s+\d{2,4}\b|\bused\s+for\b", q
    ):
        return "part_material"
    if re.search(r"\b(?:raw\s*)?materi|barstock|inventory\s+stock\b", q):
        return "raw_material_stock"
    if re.search(r"\breturn\s*requests?\b", q):
        return "return_request"
    if re.search(r"\binventory\s*requests?\b|\btool\s*requests?\b|\bpending\s+requests?\b", q):
        return "inventory_request"
    if re.search(r"\btool\s*issues?\b|\bissues?\b.{0,15}\btools?\b", q):
        return "tool_issue"
    if re.search(r"\btools?\b", q):
        return "tool"
    if re.search(r"\bmachines?\b", q):
        return "machine"
    if re.search(r"\boperations?\b|\brouting\b", q):
        return "operation"
    if re.search(r"\bcustomers?\b", q):
        return "customer"
    if re.search(r"\bvendors?|\bsuppliers?\b", q):
        return "vendor"
    if re.search(r"\bwork\s*centers?\b", q):
        return "work_center"
    if re.search(r"\bmachine\s+live|shop\s*floor|live\s+status\b", q):
        return "machine_live"
    if re.search(r"\bproduction\s+logs?\b", q):
        return "production_log"
    if re.search(r"\bbreakdowns?|maintenance\b", q):
        return "breakdown"
    if re.search(r"\bpreventive|\bpm\b", q):
        return "pm"
    if re.search(r"\bquality\b|\binspection\b", q):
        return "quality"
    if re.search(r"\boee\b", q):
        return "oee"
    if re.search(r"\benergy\b|\bems\b", q):
        return "energy"
    if re.search(r"\bleaves?\b", q):
        return "leave"
    if re.search(r"\boutsourc", q):
        return "outsource"
    if re.search(r"\bassembl", q):
        return "assembly"
    if re.search(r"\borders?\b|\bsale\s*order\b", q) and not re.search(r"\bpart\b", q):
        return "order"
    if re.search(r"\bparts?\b|\bbom\b", q):
        return "part"
    if re.search(r"\bproducts?\b", q):
        return "product"
    if re.search(r"\bnotif|\balert", q):
        return "notification"

    if _USE_GROQ_COLUMN_AGENT and is_groq_enabled():
        guessed = _groq_detect_domain(question, list(keys)[:20])
        if guessed:
            return guessed

    # Default from keys
    if "part_number" in keys:
        return "part"
    if "sale_order_number" in keys or "order_no" in keys:
        return "order"
    return "part"


def _groq_detect_domain(question: str, columns: List[str]) -> Optional[str]:
    domains = ", ".join(DOMAIN_MAIN_COLUMNS.keys())
    raw = groq_chat(
        [
            {
                "role": "user",
                "content": (
                    "Pick ONE CMF chatbot display domain for this question.\n"
                    f"Domains: {domains}\n"
                    f"Question: {question}\n"
                    f"Result columns: {columns}\n"
                    'Return JSON only: {"domain":"..."}'
                ),
            }
        ],
        max_tokens=40,
    )
    obj = parse_json_object(raw or "")
    if not obj:
        return None
    domain = str(obj.get("domain") or "").strip().lower()
    return domain if domain in DOMAIN_MAIN_COLUMNS else None


def pick_columns(
    question: str,
    rows: Sequence[Dict[str, Any]],
    *,
    domain: Optional[str] = None,
    max_cols: int = 10,
) -> Tuple[str, List[str]]:
    """
    Decide display columns for chatbot table.
    Returns (domain, ordered column keys present in data).
    """
    sample = rows[0] if rows else {}
    domain = domain or detect_domain(question, sample)
    available = list(sample.keys()) if sample else []
    available_set = set(available)

    chosen: List[str] = []
    for col in main_columns_for(domain):
        if col in available_set and col not in chosen:
            chosen.append(col)

    # Question-driven extras (still capped)
    q = (question or "").lower()
    for pattern, extras in (DOMAIN_EXTRA_HINTS.get(domain) or {}).items():
        if re.search(pattern, q, re.I):
            for col in extras:
                if col in available_set and col not in chosen:
                    chosen.append(col)

    # If almost nothing matched, keep first non-id keys
    if len(chosen) < 2 and available:
        skip = {"id", "created_at", "updated_at", "user_id"}
        for col in available:
            if col in skip or (col.endswith("_id") and col not in ("unit_id",)):
                continue
            if col not in chosen:
                chosen.append(col)
            if len(chosen) >= max_cols:
                break

    return domain, chosen[:max_cols]


def project_rows(
    rows: Sequence[Dict[str, Any]],
    columns: Sequence[str],
) -> List[Dict[str, Any]]:
    """Keep only planned columns (order preserved)."""
    if not rows or not columns:
        return list(rows or [])
    out: List[Dict[str, Any]] = []
    for row in rows:
        out.append({c: row.get(c) for c in columns if c in row})
    return out


def apply_column_plan(
    question: str,
    data: List[Dict[str, Any]],
    *,
    max_cols: int = 10,
) -> Dict[str, Any]:
    """
    Run the column agent on query results.
    Returns {domain, columns, data, labels}.
    """
    if not data:
        return {
            "domain": detect_domain(question, None),
            "columns": [],
            "data": [],
            "labels": {},
        }

    domain, columns = pick_columns(question, data, max_cols=max_cols)
    projected = project_rows(data, columns)
    labels = {c: COLUMN_LABELS.get(c, c) for c in columns}
    logger.debug(
        "column_agent domain=%s cols=%s (from %d keys)",
        domain,
        columns,
        len(data[0]) if data else 0,
    )
    return {
        "domain": domain,
        "columns": columns,
        "data": projected,
        "labels": labels,
    }


def plan_prompt_for_sql_agent() -> str:
    return prompt_block()

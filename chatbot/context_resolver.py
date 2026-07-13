"""Resolve follow-up questions like 'this order' using chat history."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

ORDER_ID_RE = re.compile(
    r"\b(SO[\s\-]?\d+|ILP\d+|TEST\d+|[A-Z]{2,}\d{2,})\b",
    re.IGNORECASE,
)
PART_ID_RE = re.compile(
    r"\b(ADSN\d+|PRT\d+|[A-Z]{1,6}[\-_]?\d{3,})\b",
    re.IGNORECASE,
)

FOLLOW_UP_RE = re.compile(
    r"\b(this|that|the|same)\s+(order|part|product|machine|operation)\b",
    re.IGNORECASE,
)


@dataclass
class ChatContext:
    order_ref: Optional[str] = None
    part_ref: Optional[str] = None
    product_name: Optional[str] = None
    last_user_question: Optional[str] = None


def _from_data_rows(rows: List[Dict]) -> ChatContext:
    ctx = ChatContext()
    if not rows:
        return ctx
    row = rows[0]
    for key in ("sale_order_number", "order_no", "order_number"):
        if row.get(key):
            ctx.order_ref = str(row[key])
            break
    for key in ("part_number", "part_no"):
        if row.get(key):
            ctx.part_ref = str(row[key])
            break
    if row.get("part_name") and not ctx.part_ref:
        ctx.part_ref = str(row["part_name"])
    if row.get("product_name"):
        ctx.product_name = str(row["product_name"])
    return ctx


def extract_context_from_history(history: List[Dict]) -> ChatContext:
    """Walk recent messages (newest first) to find order/part from prior turns."""
    ctx = ChatContext()

    for msg in reversed(history or []):
        role = msg.get("role", "")
        content = msg.get("content") or ""

        if role == "user" and not ctx.last_user_question:
            ctx.last_user_question = content
            m = ORDER_ID_RE.search(content)
            if m and not ctx.order_ref:
                ctx.order_ref = m.group(1).upper().replace(" ", "-")
            p = PART_ID_RE.search(content)
            if p and not ctx.part_ref:
                ctx.part_ref = p.group(1).upper()

        if role == "assistant" or role == "bot":
            m = ORDER_ID_RE.search(content)
            if m and not ctx.order_ref:
                ctx.order_ref = m.group(1).upper().replace(" ", "-")
            p = PART_ID_RE.search(content)
            if p and not ctx.part_ref:
                ctx.part_ref = p.group(1).upper()

        data = msg.get("data")
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = None
        if isinstance(data, list) and data:
            row_ctx = _from_data_rows(data)
            if row_ctx.order_ref and not ctx.order_ref:
                ctx.order_ref = row_ctx.order_ref
            if row_ctx.part_ref and not ctx.part_ref:
                ctx.part_ref = row_ctx.part_ref
            if row_ctx.product_name and not ctx.product_name:
                ctx.product_name = row_ctx.product_name

        if ctx.order_ref and ctx.part_ref:
            break

    return ctx


def resolve_follow_up_question(question: str, history: List[Dict]) -> str:
    """
    Expand 'this order' → 'order TEST1001' using prior chat context.
    Returns the original question if no follow-up detected.
    """
    q = (question or "").strip()
    if not q or not FOLLOW_UP_RE.search(q):
        return q

    ctx = extract_context_from_history(history)
    resolved = q

    if ctx.order_ref:
        resolved = re.sub(
            r"\bfor\s+(this|that|the)\s+order\b",
            f"for order {ctx.order_ref}",
            resolved,
            flags=re.I,
        )
        resolved = re.sub(
            r"\b(this|that|the|same)\s+order\b",
            f"order {ctx.order_ref}",
            resolved,
            flags=re.I,
        )

    if re.search(r"\b(this|that|the|same)\s+part\b", resolved, re.I) and ctx.part_ref:
        resolved = re.sub(
            r"\b(this|that|the|same)\s+part\b",
            f"part {ctx.part_ref}",
            resolved,
            flags=re.I,
        )

    if re.search(r"\b(this|that|same)\s+product\b", resolved, re.I):
        if ctx.product_name:
            resolved = re.sub(
                r"\b(this|that|same)\s+product\b",
                f"product {ctx.product_name}",
                resolved,
                flags=re.I,
            )
        elif ctx.order_ref:
            resolved = re.sub(
                r"\b(this|that|same)\s+product\b",
                f"product for order {ctx.order_ref}",
                resolved,
                flags=re.I,
            )

    return resolved.strip()


def machines_for_order_sql(order_no: str) -> str:
    safe = order_no.replace("'", "''")
    return f"""
        SELECT DISTINCT o.sale_order_number AS order_no,
               pr.product_name,
               m.type AS machine,
               m.model AS machine_model,
               m.make AS machine_make,
               wc.work_center_name,
               p.part_name,
               p.part_number,
               op.operation_number,
               op.operation_name,
               psi.planned_start_time,
               psi.planned_end_time,
               psi.status AS schedule_status
        FROM oms.orders o
        JOIN oms.products pr ON pr.id = o.product_id
        JOIN scheduling.planned_schedule_items psi
            ON psi.sale_order_number = o.sale_order_number
        JOIN configuration.machines m ON m.id = psi.machine_id
        LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
        JOIN oms.parts p ON p.id = psi.part_id
        JOIN oms.operations op ON op.id = psi.operation_id
        WHERE o.sale_order_number ILIKE '%{safe}%'
        ORDER BY psi.planned_start_time NULLS LAST, op.operation_number
        LIMIT 100
    """.strip()


def is_machines_for_order_query(question: str) -> bool:
    q = (question or "").lower()
    has_machine = bool(re.search(r"\bmachine", q))
    has_order = bool(ORDER_ID_RE.search(question or "")) or "order" in q
    has_assign = bool(re.search(r"\b(assign|assigned|manufactur|schedule|which|what)\b", q))
    return has_machine and has_order and has_assign


def try_machines_for_order_query(question: str) -> tuple[Optional[str], bool]:
    if not is_machines_for_order_query(question):
        return None, False
    m = ORDER_ID_RE.search(question or "")
    if not m:
        return None, False
    return machines_for_order_sql(m.group(1)), True

"""Inventory request / return-request SQL — Inventory module screens."""

from __future__ import annotations

import re
from typing import Optional, Tuple

INVENTORY_REQUESTS_SELECT = """
    SELECT ir.id AS request_no,
           tl.item_description AS tool_name,
           tl.identification_code,
           o.sale_order_number AS project,
           p.part_name AS part,
           p.part_number,
           CASE
             WHEN op.operation_name IS NULL THEN NULL
             WHEN op.operation_number IS NULL THEN op.operation_name
             ELSE CONCAT(op.operation_name, ' #', op.operation_number)
           END AS operation,
           u.user_name AS requested_by,
           ir.quantity,
           ir.purpose_of_use,
           ir.status,
           ir.created_at AS requested_at
    FROM inventory.inventory_requests ir
    LEFT JOIN inventory.tools_list tl ON tl.id = ir.tool_id
    LEFT JOIN oms.orders o ON o.id = ir.project_id
    LEFT JOIN oms.parts p ON p.id = ir.part_id
    LEFT JOIN oms.operations op ON op.id = ir.operation_id
    LEFT JOIN accesscontrol.access_users u ON u.id = ir.operator_id
"""

RETURN_REQUESTS_SELECT = """
    SELECT rr.id AS return_no,
           tl.item_description AS tool_name,
           tl.identification_code,
           o.sale_order_number AS project,
           p.part_name AS part,
           u.user_name AS requested_by,
           rr.total_requested_qty,
           rr.returned_qty,
           rr.status,
           rr.created_at AS requested_at
    FROM inventory.inventory_return_requests rr
    LEFT JOIN inventory.inventory_requests ir ON ir.id = rr.requested_id
    LEFT JOIN inventory.tools_list tl ON tl.id = ir.tool_id
    LEFT JOIN oms.orders o ON o.id = ir.project_id
    LEFT JOIN oms.parts p ON p.id = ir.part_id
    LEFT JOIN accesscontrol.access_users u ON u.id = rr.operator_id
"""


def inventory_requests_list_sql(limit: int = 50) -> str:
    return f"""
        {INVENTORY_REQUESTS_SELECT}
        ORDER BY ir.created_at DESC NULLS LAST
        LIMIT {limit}
    """.strip()


def return_requests_list_sql(limit: int = 50) -> str:
    return f"""
        {RETURN_REQUESTS_SELECT}
        ORDER BY rr.created_at DESC NULLS LAST
        LIMIT {limit}
    """.strip()


def is_inventory_requests_query(question: str) -> bool:
    q = (question or "").lower()
    if re.search(r"\breturn\s*requests?\b", q):
        return False
    return bool(
        re.search(
            r"\binventory\s*requests?\b|"
            r"\btool\s*requests?\b|"
            r"\b(?:list|show|give|get)\b.{0,30}\b(?:inventory\s*)?requests?\b|"
            r"\bpending\s+requests?\b",
            q,
        )
    )


def is_return_requests_query(question: str) -> bool:
    q = (question or "").lower()
    return bool(
        re.search(
            r"\breturn\s*requests?\b|"
            r"\b(?:list|show|give|get)\b.{0,30}\breturns?\b",
            q,
        )
    )


def try_inventory_module_query(question: str) -> Tuple[Optional[str], bool, str]:
    """
    Returns (sql, ok, kind) where kind is inventory_request | return_request.
    """
    if is_return_requests_query(question):
        return return_requests_list_sql(), True, "return_request"
    if is_inventory_requests_query(question):
        return inventory_requests_list_sql(), True, "inventory_request"
    return None, False, ""

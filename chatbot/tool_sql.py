"""Tool SQL — correct schema (category_id join, not category column)."""

import re
from typing import Optional, Tuple

TOOLS_LIST_SELECT = """
    SELECT tl.item_description AS tool_name,
           tl.identification_code,
           tl.make,
           tl.quantity,
           tl.total_quantity,
           tl.location,
           tl.type AS tool_type,
           cat.name AS category,
           subcat.name AS sub_category,
           tl.calibration_due_date
    FROM inventory.tools_list tl
    LEFT JOIN inventory.categories cat ON cat.id = tl.category_id
    LEFT JOIN inventory.categories subcat ON subcat.id = tl.sub_category_id
"""

SCHEDULED_STOCK_AVAILABILITY_SQL = """
    SELECT psi.sale_order_number AS order_no,
           m.type AS machine,
           m.model AS machine_model,
           wc.work_center_name,
           p.part_name,
           p.part_number,
           op.operation_number,
           op.operation_name,
           tl.item_description AS required_tool,
           tl.identification_code AS tool_id_code,
           COALESCE(tl.quantity, 0) AS tool_available_qty,
           CASE
               WHEN twp.tool_id IS NULL THEN 'No tool assigned'
               WHEN COALESCE(tl.quantity, 0) <= 0 THEN 'Out of Stock'
               ELSE 'In Stock'
           END AS tool_stock_status,
           rm.material_name,
           COALESCE(mat_stock.available_qty, 0) AS material_available_qty,
           CASE
               WHEN p.raw_material_id IS NULL THEN 'No material linked'
               WHEN COALESCE(mat_stock.available_qty, 0) <= 0 THEN 'Out of Stock'
               ELSE 'In Stock'
           END AS material_stock_status,
           CASE
               WHEN twp.tool_id IS NOT NULL AND COALESCE(tl.quantity, 0) <= 0 THEN 'Tool shortage'
               WHEN p.raw_material_id IS NOT NULL AND COALESCE(mat_stock.available_qty, 0) <= 0 THEN 'Material shortage'
               WHEN twp.tool_id IS NULL AND p.raw_material_id IS NULL THEN 'Review BOM'
               ELSE 'OK'
           END AS overall_status,
           psi.planned_start_time,
           psi.status AS schedule_status
    FROM scheduling.planned_schedule_items psi
    JOIN configuration.machines m ON m.id = psi.machine_id
    LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
    JOIN oms.parts p ON p.id = psi.part_id
    JOIN oms.operations op ON op.id = psi.operation_id
    LEFT JOIN oms.tools_with_part twp ON twp.operation_id = op.id
    LEFT JOIN inventory.tools_list tl ON tl.id = twp.tool_id
    LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
    LEFT JOIN LATERAL (
        SELECT SUM(rms.available_quantity) AS available_qty
        FROM inventory.raw_material_stock rms
        WHERE rms.material_id = p.raw_material_id
    ) mat_stock ON TRUE
    ORDER BY psi.planned_start_time NULLS LAST, m.type, op.operation_number, tl.item_description
    LIMIT 150
""".strip()


TOOLS_FOR_SCHEDULED_OPERATIONS_SQL = """
    SELECT m.type AS machine,
           m.model AS machine_model,
           wc.work_center_name,
           psi.sale_order_number,
           p.part_name,
           p.part_number,
           op.operation_number,
           op.operation_name,
           tl.item_description AS tool_name,
           tl.identification_code,
           tl.make,
           tl.type AS tool_type,
           cat.name AS category,
           tl.quantity AS tool_available_qty,
           psi.planned_start_time,
           psi.planned_end_time,
           psi.status AS schedule_status
    FROM scheduling.planned_schedule_items psi
    JOIN configuration.machines m ON m.id = psi.machine_id
    LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
    JOIN oms.parts p ON p.id = psi.part_id
    JOIN oms.operations op ON op.id = psi.operation_id
    LEFT JOIN oms.tools_with_part twp ON twp.operation_id = op.id
    LEFT JOIN inventory.tools_list tl ON tl.id = twp.tool_id
    LEFT JOIN inventory.categories cat ON cat.id = tl.category_id
    ORDER BY psi.planned_start_time NULLS LAST, m.type, op.operation_number
    LIMIT 100
""".strip()


def all_tools_sql(limit: int = 50) -> str:
    return f"""
        {TOOLS_LIST_SELECT}
        ORDER BY tl.item_description
        LIMIT {limit}
    """.strip()


def tools_by_name_sql(term: str, limit: int = 50) -> str:
    safe = term.replace("'", "''")
    return f"""
        {TOOLS_LIST_SELECT}
        WHERE tl.item_description ILIKE '%{safe}%'
           OR tl.identification_code ILIKE '%{safe}%'
           OR tl.make ILIKE '%{safe}%'
        ORDER BY tl.item_description
        LIMIT {limit}
    """.strip()


def is_scheduled_stock_check_query(question: str) -> bool:
    """e.g. are tools and parts in stock for scheduled operations?"""
    q = (question or "").lower()
    has_stock = bool(re.search(r"\b(stock|in\s+stock|available|availability)\b", q))
    has_schedule = bool(re.search(r"\b(schedule|scheduled|planned|planning|operation)\b", q))
    has_items = bool(re.search(r"\b(tools?|parts?|materials?|required)\b", q))
    return has_stock and has_schedule and has_items


def is_scheduled_tools_query(question: str) -> bool:
    if is_scheduled_stock_check_query(question):
        return False
    q = (question or "").lower()
    has_tools = bool(re.search(r"\btools?\b", q))
    has_schedule = bool(re.search(r"\b(schedule|scheduled|planning|planned|machine|operation)\b", q))
    has_need = bool(re.search(r"\b(required|needed|need|which|what)\b", q))
    return has_tools and has_schedule and (has_need or "for" in q)


def try_tool_query(question: str) -> Tuple[Optional[str], bool]:
    if is_scheduled_stock_check_query(question):
        return SCHEDULED_STOCK_AVAILABILITY_SQL, True

    if is_scheduled_tools_query(question):
        return TOOLS_FOR_SCHEDULED_OPERATIONS_SQL, True

    issues_sql, issues_ok = try_tool_issues_query(question)
    if issues_ok:
        return issues_sql, True

    q = (question or "").lower()
    if re.search(
        r"\b(?:list|show|give|get)\s+(?:me\s+)?(?:all\s+)?tools?\b|"
        r"\btools?\s*list\b|"
        r"^(?:tools?|list\s+tools?|show\s+tools?)\s*$",
        q,
    ):
        # Avoid matching "tool issues"
        if re.search(r"\bissues?\b", q):
            return tool_issues_list_sql(), True
        return all_tools_sql(), True

    return None, False


TOOL_ISSUES_SELECT = """
    SELECT ti.id AS issue_no,
           tl.item_description AS tool_name,
           tl.range AS tool_range,
           tl.identification_code,
           o.sale_order_number AS project,
           COALESCE(p.part_name, '') AS part,
           p.part_number,
           CASE
             WHEN op.operation_name IS NULL THEN NULL
             WHEN op.operation_number IS NULL THEN op.operation_name
             ELSE CONCAT(op.operation_name, ' #', op.operation_number)
           END AS operation,
           u.user_name AS issue_raised_by,
           ti.created_at AS issue_raised_at,
           ti.tool_issue_qty AS issue_qty,
           ti.issue_category,
           ti.description,
           ti.status
    FROM inventory.tool_issues ti
    LEFT JOIN inventory.tools_list tl ON tl.id = ti.tool_id
    LEFT JOIN inventory.inventory_requests ir ON ir.id = ti.request_id
    LEFT JOIN oms.orders o ON o.id = ir.project_id
    LEFT JOIN oms.parts p ON p.id = ir.part_id
    LEFT JOIN oms.operations op ON op.id = ir.operation_id
    LEFT JOIN accesscontrol.access_users u ON u.id = ti.operator_id
"""


def tool_issues_list_sql(limit: int = 50) -> str:
    return f"""
        {TOOL_ISSUES_SELECT}
        ORDER BY ti.created_at DESC NULLS LAST
        LIMIT {limit}
    """.strip()


def is_tool_issues_query(question: str) -> bool:
    q = (question or "").lower()
    return bool(
        re.search(r"\btool\s*issues?\b|\bissues?\s+(?:list|of\s+tools?|for\s+tools?)\b", q)
        or re.search(r"\b(?:list|show|give|get)\b.{0,20}\btool\s*issues?\b", q)
    )


def try_tool_issues_query(question: str) -> Tuple[Optional[str], bool]:
    if not is_tool_issues_query(question):
        return None, False
    return tool_issues_list_sql(), True

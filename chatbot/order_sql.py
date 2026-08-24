"""Order-specific SQL — route by what user asks about an order, not always the same table."""

import re
from typing import Optional, Tuple

ORDER_ID_RE = re.compile(
    r"\b(SO[\s\-]?\d+|ILP\d+|TEST\d+|[A-Za-z]{2,}\d{2,})\b",
    re.IGNORECASE,
)

DUE_DATE_QUERY_RE = re.compile(
    r"\b(due\s*date|expected\s+date|completion\s+date|when\s+will|when\s+is|deadline)\b",
    re.IGNORECASE,
)

ORDER_STOCK_QUERY_RE = re.compile(
    r"\b(stock|inventory|quantity|level|available)\b.*\border\b|"
    r"\border\b.*\b(stock|inventory|quantity|level|available)\b|"
    r"\bstock\b.*\bproduct\b.*\border\b",
    re.IGNORECASE,
)

SCHEDULE_QUERY_RE = re.compile(
    r"\b(schedule|scheduled|scheduling|planned|plan|gantt)\b",
    re.IGNORECASE,
)

SHOW_ORDER_RE = re.compile(
    r"^(?:show|get|find|display|list|give)\s+(?:me\s+)?(?:the\s+)?(?:order|so)\b|"
    r"^order\s+[A-Za-z0-9]",
    re.IGNORECASE,
)


def extract_order_number(question: str) -> Optional[str]:
    q = question or ""
    m = re.search(
        r"\b(?:order|so)\s*(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]+)\b",
        q,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).strip()
    m = ORDER_ID_RE.search(q)
    return m.group(0).strip() if m else None


def show_order_sql(order_no: str) -> str:
    safe = order_no.replace("'", "''")
    return f"""
        SELECT o.sale_order_number, o.status, o.approval_status,
               o.quantity, o.due_date, o.order_date,
               c.company_name AS customer, pr.product_name
        FROM oms.orders o
        JOIN configuration.customers c ON c.id = o.customer_id
        JOIN oms.products pr ON pr.id = o.product_id
        WHERE UPPER(o.sale_order_number) = UPPER('{safe}')
           OR o.sale_order_number ILIKE '%{safe}%'
        LIMIT 10
    """.strip()


def due_date_for_order_sql(order_no: str) -> str:
    safe = order_no.replace("'", "''")
    return f"""
        SELECT o.sale_order_number AS order_no,
               o.due_date,
               o.status,
               o.approval_status,
               pr.product_name,
               c.company_name AS customer,
               o.quantity
        FROM oms.orders o
        JOIN configuration.customers c ON c.id = o.customer_id
        JOIN oms.products pr ON pr.id = o.product_id
        WHERE UPPER(o.sale_order_number) = UPPER('{safe}')
           OR o.sale_order_number ILIKE '%{safe}%'
        LIMIT 5
    """.strip()


def stock_for_order_sql(order_no: str) -> str:
    """Raw material stock for all parts on this order's product."""
    safe = order_no.replace("'", "''")
    return f"""
        SELECT o.sale_order_number AS order_no,
               pr.product_name,
               p.part_name,
               p.part_number,
               p.qty AS part_qty,
               rm.material_name,
               rms.form_type,
               rms.process_type,
               rms.diameter,
               rms.length,
               rms.quantity AS material_stock_qty,
               rms.available_quantity,
               rms.allocated_quantity,
               rms.status AS stock_status,
               ru.remaining_length AS bar_remaining_mm
        FROM oms.orders o
        JOIN oms.products pr ON pr.id = o.product_id
        JOIN oms.parts p ON p.product_id = o.product_id
        LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
        LEFT JOIN inventory.raw_material_stock rms ON rms.material_id = rm.id
        LEFT JOIN inventory.raw_material_units ru ON ru.stock_id = rms.id
        WHERE (UPPER(o.sale_order_number) = UPPER('{safe}')
           OR o.sale_order_number ILIKE '%{safe}%')
          AND COALESCE(p.recycle_bin, false) = false
        ORDER BY p.part_name, rms.form_type, ru.id
        LIMIT 100
    """.strip()


def schedule_for_order_sql(order_no: str) -> str:
    """Planned schedule / Gantt rows for a specific sale order."""
    safe = order_no.replace("'", "''")
    return f"""
        SELECT psi.sale_order_number AS order_no,
               p.part_name,
               p.part_number,
               op.operation_number,
               op.operation_name,
               m.type AS machine,
               m.model AS machine_model,
               wc.work_center_name,
               psi.planned_start_time,
               psi.planned_end_time,
               psi.total_quantity,
               psi.remaining_quantity,
               psi.status AS schedule_status
        FROM scheduling.planned_schedule_items psi
        JOIN oms.parts p ON p.id = psi.part_id
        JOIN oms.operations op ON op.id = psi.operation_id
        LEFT JOIN configuration.machines m ON m.id = psi.machine_id
        LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
        WHERE UPPER(psi.sale_order_number) = UPPER('{safe}')
           OR psi.sale_order_number ILIKE '%{safe}%'
        ORDER BY psi.planned_start_time NULLS LAST, op.operation_number
        LIMIT 100
    """.strip()


def try_order_query(question: str) -> Tuple[Optional[str], bool]:
    """Pick the right order query — stock, due date, or order details."""
    order_no = extract_order_number(question)
    if not order_no:
        return None, False

    q = question or ""

    if SCHEDULE_QUERY_RE.search(q):
        return schedule_for_order_sql(order_no), True

    if DUE_DATE_QUERY_RE.search(q):
        return due_date_for_order_sql(order_no), True

    if ORDER_STOCK_QUERY_RE.search(q):
        return stock_for_order_sql(order_no), True

    if SHOW_ORDER_RE.search(q.strip()):
        return show_order_sql(order_no), True

    # "order TEST1001" alone
    if re.match(r"^(?:order|so)\s+[A-Za-z0-9][\w\-/]+\s*$", q.strip(), re.I):
        return show_order_sql(order_no), True

    return None, False

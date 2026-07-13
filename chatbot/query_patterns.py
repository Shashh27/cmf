"""Fast-path SQL patterns — zero LLM calls for common question shapes."""

from chatbot.material_sql import all_material_stock_sql, material_stock_by_name_sql
from chatbot.part_sql import part_stock_by_term_sql
from chatbot.tool_sql import (
    SCHEDULED_STOCK_AVAILABILITY_SQL,
    TOOLS_FOR_SCHEDULED_OPERATIONS_SQL,
    all_tools_sql,
    is_scheduled_stock_check_query,
    is_scheduled_tools_query,
)

import re
from typing import Callable, List, Tuple

SqlFn = Callable[[re.Match], str]
Pattern = Tuple[str, SqlFn]

# Words that must never be used as search terms (material names, part names, etc.)
STOP_WORDS = frozenset({
    "show", "list", "all", "get", "find", "search", "give", "me", "the", "my", "our",
    "please", "what", "which", "how", "many", "tell", "about", "for", "of", "in", "a",
    "an", "is", "are", "can", "you", "i", "want", "need", "see", "display", "fetch",
    "pull", "any", "some", "every", "current", "latest", "today", "now", "stock",
    "stocks", "material", "materials", "raw", "quantity", "available", "order", "orders",
})


def _first_group(m: re.Match) -> str:
    for g in m.groups():
        if g and g.isdigit():
            return g
    return "0"


def _text_group(m: re.Match) -> str:
    for g in m.groups():
        if g and g.strip():
            return g.strip().replace("'", "''")
    return ""


def _search_term(m: re.Match) -> str:
    """Extract a real search term; reject command/stop words like 'show' or 'all'."""
    raw = _text_group(m)
    if not raw:
        raise ValueError("empty search term")
    words = [w for w in raw.split() if w.lower() not in STOP_WORDS]
    if not words:
        raise ValueError("stop words only")
    term = " ".join(words).replace("'", "''")
    if len(term) < 2:
        raise ValueError("term too short")
    return term


def PARTS_FOR_ORDER_SQL(order_id: str) -> str:
    return f"""
        SELECT o.sale_order_number,
               p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
               opp.priority,
               pss.status AS schedule_status, pss.start_date
        FROM oms.order_part_priorities opp
        JOIN oms.orders o ON o.id = opp.order_id
        JOIN oms.parts p ON p.id = opp.part_id
        LEFT JOIN scheduling.part_schedule_status pss
            ON pss.part_id = p.id AND pss.sale_order_id = opp.order_id
        WHERE opp.order_id = {order_id}

        UNION ALL

        SELECT o.sale_order_number,
               p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
               NULL AS priority,
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


def OPERATIONS_FOR_ORDER_SQL(order_id: str) -> str:
    return f"""
        SELECT o.sale_order_number,
               p.part_name, p.part_number,
               op.operation_number, op.operation_name,
               op.setup_time, op.cycle_time,
               opp.priority,
               CASE WHEN opp.id IS NOT NULL THEN 'scheduled' ELSE 'not_scheduled' END AS schedule_status,
               pl.status AS operation_status,
               pl.from_date, pl.to_date,
               u.user_name AS operator,
               pl.produced_quantity, pl.approved_quantity
        FROM oms.orders o
        JOIN oms.parts p ON p.product_id = o.product_id
        JOIN oms.operations op ON op.part_id = p.id
        LEFT JOIN oms.order_part_priorities opp ON opp.order_id = o.id AND opp.part_id = p.id
        LEFT JOIN scheduling.production_logs pl ON pl.operation_id = op.id
        LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
        WHERE o.id = {order_id}
        ORDER BY opp.priority ASC NULLS LAST, p.part_name, op.operation_number
    """


QUICK_SQL_PATTERNS: List[Pattern] = [

    # ── NOTIFICATIONS (before generic patterns that might overlap)
    (
        r"(?:give\s+)?(?:me\s+)?(?:notifications?|alerts?|notif\w*)(?:\s+list)?|"
        r"list\s+(?:all\s+)?notifications?|(?:show|get)\s+(?:all\s+)?notifications?|"
        r"^notifications?$|^alerts?$",
        lambda _: """
            SELECT * FROM (
                SELECT 'order' AS notification_type,
                       COALESCE(o.sale_order_number, 'Order #' || on2.order_id::text) AS reference,
                       CASE WHEN COALESCE(on2.mc_is_ack, false) THEN 'read' ELSE 'unread' END AS status,
                       on2.created_at
                FROM notifications.order_notifications on2
                LEFT JOIN oms.orders o ON o.id = on2.order_id

                UNION ALL

                SELECT 'machine',
                       'Breakdown #' || mn.machine_breakdown_id::text,
                       CASE WHEN COALESCE(mn.is_ack, false) THEN 'read' ELSE 'unread' END,
                       mn.created_at
                FROM notifications.machine_notifications mn

                UNION ALL

                SELECT 'tool',
                       'Tool issue #' || tin.tool_issues_id::text,
                       CASE WHEN COALESCE(tin.is_ack, false) THEN 'read' ELSE 'unread' END,
                       tin.created_at
                FROM notifications.tool_issues_notification tin

                UNION ALL

                SELECT 'activity',
                       COALESCE(al.entity_type, 'event') || ' #' || COALESCE(al.entity_id::text, ''),
                       CASE WHEN COALESCE(pcn.is_read, false) THEN 'read' ELSE 'unread' END,
                       al.created_at
                FROM notifications.pc_notifications pcn
                JOIN notifications.activity_log al ON al.id = pcn.activity_log_id
            ) n
            ORDER BY n.created_at DESC NULLS LAST
            LIMIT 50
        """,
    ),

    # ── ORDER-SPECIFIC (text SO number) — most specific first
    (
        r"(?:part|component|item|bom|piece).*?(?:order|so)[\s\-#]*([A-Za-z0-9][\w\-/]*)|"
        r"(?:order|so)[\s\-#]*([A-Za-z0-9][\w\-/]*).*(?:part|component|item|bom|piece)",
        lambda m: f"""
            SELECT o.sale_order_number, p.part_name, p.part_number, p.size, p.qty,
                   opp.priority,
                   CASE WHEN opp.id IS NOT NULL THEN 'scheduled' ELSE 'not_scheduled' END AS in_order_priority,
                   pss.status AS part_schedule_status, pss.start_date
            FROM oms.orders o
            JOIN oms.parts p ON p.product_id = o.product_id
            LEFT JOIN oms.order_part_priorities opp ON opp.order_id = o.id AND opp.part_id = p.id
            LEFT JOIN scheduling.part_schedule_status pss
                ON pss.part_id = p.id AND pss.sale_order_id = o.id
            WHERE UPPER(o.sale_order_number) = UPPER('{_text_group(m)}')
               OR o.sale_order_number ILIKE '%{_text_group(m)}%'
            ORDER BY opp.priority ASC NULLS LAST, p.part_name
            LIMIT 100
        """,
    ),
    (
        r"operation.*?(?:order|so)[\s\-#]*([A-Za-z0-9][\w\-/]*)|"
        r"(?:order|so)[\s\-#]*([A-Za-z0-9][\w\-/]*).*operation",
        lambda m: f"""
            SELECT o.sale_order_number, p.part_name, op.operation_number, op.operation_name,
                   pl.status AS operation_status, pl.produced_quantity, pl.approved_quantity,
                   u.user_name AS operator
            FROM oms.orders o
            JOIN oms.order_part_priorities opp ON opp.order_id = o.id
            JOIN oms.parts p ON p.id = opp.part_id
            JOIN oms.operations op ON op.part_id = p.id
            LEFT JOIN scheduling.production_logs pl ON pl.operation_id = op.id
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            WHERE UPPER(o.sale_order_number) = UPPER('{_text_group(m)}')
               OR o.sale_order_number ILIKE '%{_text_group(m)}%'
            ORDER BY opp.priority, p.part_name, op.operation_number
            LIMIT 100
        """,
    ),
    (
        r"(?:planned\s+schedule|schedule\s+plan).*?(?:order|so)[\s\-#]*([A-Za-z0-9][\w\-/]*)|"
        r"(?:order|so)[\s\-#]*([A-Za-z0-9][\w\-/]*).*planned",
        lambda m: f"""
            SELECT psi.sale_order_number, p.part_name, op.operation_name,
                   m.type AS machine, psi.planned_start_time, psi.planned_end_time,
                   psi.total_quantity, psi.remaining_quantity, psi.status
            FROM scheduling.planned_schedule_items psi
            JOIN oms.parts p ON p.id = psi.part_id
            JOIN oms.operations op ON op.id = psi.operation_id
            LEFT JOIN configuration.machines m ON m.id = psi.machine_id
            WHERE UPPER(psi.sale_order_number) = UPPER('{_text_group(m)}')
               OR psi.sale_order_number ILIKE '%{_text_group(m)}%'
            ORDER BY psi.planned_start_time
            LIMIT 100
        """,
    ),
    (
        r"^(?:show|get|find|display)\s+(?:order|so)\s*[\s\-#]*([A-Za-z0-9][\w\-/]+)\s*$|"
        r"^order\s+([A-Za-z0-9][\w\-/]+)\s*$",
        lambda m: f"""
            SELECT o.id, o.sale_order_number, o.project_name, o.status, o.approval_status,
                   o.quantity, o.due_date, c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE UPPER(o.sale_order_number) = UPPER('{_text_group(m)}')
               OR o.sale_order_number ILIKE '%{_text_group(m)}%'
            LIMIT 20
        """,
    ),

    # ── ORDER BY NUMERIC ID
    (
        r"order\s*#?(\d+).*(?:part|component|item|bom|piece)|"
        r"(?:part|component|item|bom|piece).*order\s*#?(\d+)|"
        r"(?:what|which|list|show).*(?:in|for|of)\s*order\s*#?(\d+)",
        lambda m: PARTS_FOR_ORDER_SQL(_first_group(m)),
    ),
    (
        r"order\s*#?(\d+).*\boperation|\boperation.*order\s*#?(\d+)",
        lambda m: OPERATIONS_FOR_ORDER_SQL(_first_group(m)),
    ),
    (
        r"schedule.*order\s*#?(\d+)|order\s*#?(\d+).*schedule",
        lambda m: f"""
            SELECT p.part_name, pss.status AS schedule_status, pss.start_date, opp.priority
            FROM oms.order_part_priorities opp
            JOIN oms.parts p ON p.id = opp.part_id
            LEFT JOIN scheduling.part_schedule_status pss
                ON pss.part_id = p.id AND pss.sale_order_id = opp.order_id
            WHERE opp.order_id = {_first_group(m)}
            ORDER BY opp.priority
        """,
    ),
    (
        r"quality.*order\s*#?(\d+)|order\s*#?(\d+).*quality|inspection.*order\s*#?(\d+)",
        lambda m: f"""
            SELECT si.op_no, p.part_name, si.dimension_type, si.nominal_value,
                   si.uppertol, si.lowertol, si.measured_mean, si.is_done
            FROM quality.stage_inspection si
            JOIN oms.parts p ON p.id = si.part_id
            WHERE si.sale_order_id = {_first_group(m)}
            ORDER BY si.op_no LIMIT 100
        """,
    ),
    (
        r"order\s*#?(\d+)",
        lambda m: f"""
            SELECT o.id, o.sale_order_number, o.status, o.approval_status, o.quantity,
                   o.due_date, c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE o.id = {m.group(1)}
        """,
    ),

    # ── ORDERS LIST / SEARCH
    (
        r"order.*\bproduct\b.*?([\w\d\-/]+(?:\s+[\w\d\-/]+){0,3})|\bproduct\b.*?([\w\d\-/]+(?:\s+[\w\d\-/]+){0,3}).*order",
        lambda m: f"""
            SELECT o.sale_order_number, o.status, o.quantity, o.due_date,
                   c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE pr.product_name ILIKE '%{_text_group(m)}%'
            ORDER BY o.created_at DESC LIMIT 50
        """,
    ),
    (
        r"orders?\s+(?:from|by|for)\s+([\w\d\s\-]+?)\s*$|order.*customer.*?([\w\d\s\-]+?)\s*$",
        lambda m: f"""
            SELECT o.sale_order_number, o.status, o.due_date, c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE c.company_name ILIKE '%{_text_group(m)}%'
            ORDER BY o.created_at DESC LIMIT 50
        """,
    ),
    (
        r"\b(pending\s+approval|approval\s+pending)\b.*\border|\border.*\b(pending\s+approval|approval\s+pending)\b",
        lambda _: """
            SELECT o.sale_order_number, o.status, o.approval_status, o.due_date,
                   c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE o.approval_status ILIKE '%pending%'
            ORDER BY o.created_at DESC LIMIT 50
        """,
    ),
    (
        r"\boverdue\b",
        lambda _: """
            SELECT o.sale_order_number, o.due_date, o.status, c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE o.due_date < NOW() AND o.status NOT IN ('Completed','Cancelled')
            ORDER BY o.due_date LIMIT 50
        """,
    ),
    (
        r"\ball\s+order|list.*\border|show.*\border|all\s+sale\s+order",
        lambda _: """
            SELECT o.sale_order_number, o.status, o.approval_status, o.quantity, o.due_date,
                   c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            ORDER BY o.created_at DESC LIMIT 50
        """,
    ),

    # ── PART STOCK (before generic parts list)
    (
        r"(?:stock|inventory|quantity|level).*\bpart\b.*\b([A-Za-z0-9][\w\-/]+)\b|"
        r"\bpart\b.*(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]+).*\b(?:stock|inventory|quantity|level)\b",
        lambda m: part_stock_by_term_sql(_text_group(m)),
    ),

    # ── PARTS / ASSEMBLIES
    (
        r"(?:show|find|search|get|list)\s+part\s+([\w\d\s\-/]+?)\s*$|part\s+(?:named?|called)\s+([\w\d\s\-/]+?)\s*$",
        lambda m: f"""
            SELECT p.part_name, p.part_number, p.size, p.qty, pt.type_name,
                   rm.material_name AS raw_material, pr.product_name
            FROM oms.parts p
            LEFT JOIN oms.part_types pt ON pt.id = p.type_id
            LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
            LEFT JOIN oms.products pr ON pr.id = p.product_id
            WHERE (p.part_name ILIKE '%{_text_group(m)}%' OR p.part_number ILIKE '%{_text_group(m)}%')
              AND COALESCE(p.recycle_bin, false) = false
            ORDER BY p.part_name LIMIT 50
        """,
    ),
    (
        r"\b(assembly|assemblies)\b",
        lambda _: """
            SELECT a.assembly_name, a.assembly_number, pr.product_name, a.recycle_bin
            FROM oms.assemblies a
            JOIN oms.products pr ON pr.id = a.product_id
            WHERE COALESCE(a.recycle_bin, false) = false
            ORDER BY a.assembly_name LIMIT 50
        """,
    ),
    (
        r"\brecycle\s*bin|deleted\s+parts?\b",
        lambda _: """
            SELECT p.part_name, p.part_number, pr.product_name, p.recycle_bin
            FROM oms.parts p
            LEFT JOIN oms.products pr ON pr.id = p.product_id
            WHERE p.recycle_bin = true
            ORDER BY p.part_name LIMIT 50
        """,
    ),
    (
        r"\bout\s*source|outsourced\b",
        lambda _: """
            SELECT o.sale_order_number, p.part_name, p.part_number, os.start_date, os.to_date, os.status
            FROM oms.out_source_parts_status os
            JOIN oms.parts p ON p.id = os.part_id
            JOIN oms.orders o ON o.id = os.order_id
            ORDER BY os.start_date DESC LIMIT 50
        """,
    ),

    # ── OPERATIONS / PRODUCTION
    (
        r"operation.*part\s+([\w\d\s\-/]+?)\s*$|part\s+([\w\d\s\-/]+?).*operation",
        lambda m: f"""
            SELECT p.part_name, op.operation_number, op.operation_name, op.setup_time, op.cycle_time,
                   wc.work_center_name, m.type AS machine_type
            FROM oms.parts p
            JOIN oms.operations op ON op.part_id = p.id
            LEFT JOIN configuration.work_centers wc ON wc.id = op.workcenter_id
            LEFT JOIN configuration.machines m ON m.id = op.machine_id
            WHERE p.part_name ILIKE '%{_text_group(m)}%' OR p.part_number ILIKE '%{_text_group(m)}%'
            ORDER BY op.operation_number LIMIT 100
        """,
    ),
    (
        r"\bpending\b.*\boperation|operation.*\bpending",
        lambda _: """
            SELECT op.operation_name, op.operation_number, p.part_name, os.status,
                   o.sale_order_number, u.user_name AS operator
            FROM scheduling.operation_status os
            JOIN oms.operations op ON op.id = os.operation_id
            JOIN oms.parts p ON p.id = os.part_id
            LEFT JOIN oms.orders o ON o.id = os.order_id
            LEFT JOIN accesscontrol.access_users u ON u.id = os.operator_id
            WHERE os.status NOT IN ('completed', 'in_progress', 'inprogress')

            UNION ALL

            SELECT op.operation_name, op.operation_number, p.part_name, pl.status,
                   NULL AS sale_order_number, u.user_name AS operator
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            WHERE pl.status NOT IN ('completed', 'inprogress')

            LIMIT 50
        """,
    ),
    (
        r"\bin.?progress\b.*\boperation|operation.*\bin.?progress",
        lambda _: """
            SELECT op.operation_name, p.part_name, pl.status, pl.from_date, u.user_name AS operator,
                   pl.produced_quantity, pl.approved_quantity
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            WHERE pl.status = 'inprogress'
            ORDER BY pl.created_at DESC LIMIT 50
        """,
    ),
    (
        r"\bcompleted\b.*\boperation|operation.*\bcompleted",
        lambda _: """
            SELECT op.operation_name, p.part_name, pl.to_date, pl.produced_quantity, pl.approved_quantity
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            WHERE pl.status = 'completed'
            ORDER BY pl.created_at DESC LIMIT 50
        """,
    ),
    (
        r"\ball\s+operation|list.*\boperation|show.*\boperation",
        lambda _: """
            SELECT op.operation_name, op.operation_number, p.part_name, pl.status, pl.from_date
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            ORDER BY pl.created_at DESC LIMIT 50
        """,
    ),
    (
        r"production.*log|log.*production",
        lambda _: """
            SELECT op.operation_name, p.part_name, u.user_name AS operator,
                   pl.from_date, pl.to_date, pl.status,
                   pl.produced_quantity, pl.approved_quantity, pl.rework_quantity, pl.rejected_quantity
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            ORDER BY pl.created_at DESC LIMIT 50
        """,
    ),

    # ── SCHEDULING
    (
        r"\bplanned\s+schedule|schedule\s+plan|gantt\b",
        lambda _: """
            SELECT psi.sale_order_number, p.part_name, op.operation_name, m.type AS machine,
                   psi.planned_start_time, psi.planned_end_time, psi.status, psi.remaining_quantity
            FROM scheduling.planned_schedule_items psi
            JOIN oms.parts p ON p.id = psi.part_id
            JOIN oms.operations op ON op.id = psi.operation_id
            LEFT JOIN configuration.machines m ON m.id = psi.machine_id
            ORDER BY psi.planned_start_time LIMIT 100
        """,
    ),
    (
        r"\breschedul",
        lambda _: """
            SELECT ri.order_number, ri.part_number, ri.operation_number, m.type AS machine,
                   ri.start_time, ri.end_time, ri.status, ri.remaining_qty
            FROM scheduling.rescheduling_items ri
            LEFT JOIN configuration.machines m ON m.id = ri.machine_id
            ORDER BY ri.start_time DESC LIMIT 50
        """,
    ),
    (
        r"\bmachine\s+schedule\b",
        lambda _: """
            SELECT o.sale_order_number, p.part_name, op.operation_name, m.type AS machine,
                   ms.start_time, ms.end_time, ms.status
            FROM scheduling.machine_schedule ms
            JOIN oms.orders o ON o.id = ms.order_id
            JOIN oms.parts p ON p.id = ms.part_id
            JOIN oms.operations op ON op.id = ms.operation_id
            JOIN configuration.machines m ON m.id = ms.machine_id
            ORDER BY ms.start_time DESC LIMIT 50
        """,
    ),
    (
        r"\bdowntime|machine\s+down\b",
        lambda _: """
            SELECT m.type AS machine, md.start_time, md.end_time, md.status_name, md.description
            FROM scheduling.machine_downtimes md
            JOIN configuration.machines m ON m.id = md.machine_id
            ORDER BY md.start_time DESC LIMIT 50
        """,
    ),

    # ── MACHINES
    (
        r"machine.*\blive|live.*\bmachine|shop\s*floor|machine.*\bstatus",
        lambda _: """
            SELECT m.type, m.model, mls.status, mls.last_updated,
                   o.sale_order_number, p.part_name, op.operation_name
            FROM production_monitoring.machine_live_status mls
            JOIN configuration.machines m ON m.id = mls.machine_id
            LEFT JOIN oms.orders o ON o.id = mls.current_order_id
            LEFT JOIN oms.parts p ON p.id = mls.current_part_id
            LEFT JOIN oms.operations op ON op.id = mls.current_operation_id
            ORDER BY m.type
        """,
    ),
    (
        r"\bcalibration\s+due|due\s+calibration\b",
        lambda _: """
            SELECT m.type, m.model, m.calibration_date, m.calibration_due_date, wc.work_center_name
            FROM configuration.machines m
            LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
            WHERE m.calibration_due_date IS NOT NULL AND m.calibration_due_date <= CURRENT_DATE + INTERVAL '30 days'
            ORDER BY m.calibration_due_date LIMIT 50
        """,
    ),
    (
        r"\ball\s+machine|list.*\bmachine|show.*\bmachine",
        lambda _: """
            SELECT m.type, m.make, m.model, m.calibration_due_date, m.mhr, wc.work_center_name
            FROM configuration.machines m
            LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
            ORDER BY m.type LIMIT 50
        """,
    ),
    (
        r"\bwork\s*center|\bworkcenter",
        lambda _: """
            SELECT wc.code, wc.work_center_name, wc.is_schedulable, COUNT(m.id) AS machine_count
            FROM configuration.work_centers wc
            LEFT JOIN configuration.machines m ON m.work_center_id = wc.id
            GROUP BY wc.id, wc.code, wc.work_center_name, wc.is_schedulable
            ORDER BY wc.work_center_name
        """,
    ),
    (
        r"\boee\b|shift\s+summary",
        lambda _: """
            SELECT m.type AS machine, ss.shift, ss.oee, ss.availability, ss.performance,
                   ss.quality, ss.total_parts, ss.good_parts
            FROM production_monitoring.shift_summary ss
            JOIN configuration.machines m ON m.id = ss.machine_id
            ORDER BY ss.shift DESC LIMIT 50
        """,
    ),

    # ── MAINTENANCE
    (
        r"\bbreakdown|machine.*\bdown\b",
        lambda _: """
            SELECT m.type AS machine, mb.issue_category, mb.machine_status, mb.issue_reason, mb.reported_at
            FROM maintenance.machine_breakdown mb
            JOIN configuration.machines m ON m.id = mb.machine_id
            ORDER BY mb.reported_at DESC LIMIT 30
        """,
    ),
    (
        r"\bcomponent\s+issue",
        lambda _: """
            SELECT m.type AS machine, o.sale_order_number, p.part_name, ci.component_status, ci.description
            FROM maintenance.component_issues ci
            JOIN configuration.machines m ON m.id = ci.machine_id
            LEFT JOIN oms.orders o ON o.id = ci.production_order_id
            LEFT JOIN oms.parts p ON p.id = ci.part_id
            ORDER BY ci.reported_at DESC LIMIT 30
        """,
    ),
    (
        r"\bhelp\s+support|support\s+ticket",
        lambda _: """
            SELECT m.type AS machine, hs.description, hs.mc_reply, hs.reported_at
            FROM maintenance.help_support hs
            JOIN configuration.machines m ON m.id = hs.machine_id
            ORDER BY hs.reported_at DESC LIMIT 30
        """,
    ),

    # ── INVENTORY / TOOLS
    (
        r"\btool\s+request|inventory\s+request|pending\s+request",
        lambda _: """
            SELECT ir.id, tl.item_description AS tool, o.sale_order_number, p.part_name,
                   ir.quantity, ir.status, u.user_name AS operator
            FROM inventory.inventory_requests ir
            LEFT JOIN inventory.tools_list tl ON tl.id = ir.tool_id
            LEFT JOIN oms.orders o ON o.id = ir.project_id
            LEFT JOIN oms.parts p ON p.id = ir.part_id
            LEFT JOIN accesscontrol.access_users u ON u.id = ir.operator_id
            ORDER BY ir.created_at DESC LIMIT 50
        """,
    ),
    (
        r"tool.*\boperator\b.*?([A-Za-z][\w\s]+?)\s*$|operator\b.*?([A-Za-z][\w\s]+?)\s*.*tool",
        lambda m: f"""
            SELECT tl.item_description AS tool, ti.tool_issue_qty, ti.status, u.user_name AS operator
            FROM inventory.tool_issues ti
            JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            JOIN accesscontrol.access_users u ON u.id = ti.operator_id
            WHERE u.user_name ILIKE '%{_text_group(m)}%'
            ORDER BY ti.created_at DESC LIMIT 30
        """,
    ),
    (
        r"tool.*\bissue|issue.*\btool",
        lambda _: """
            SELECT COALESCE(tl.item_description, 'Tool #' || ti.tool_id::text) AS tool,
                   ti.tool_issue_qty, ti.status, ti.issue_category, u.user_name AS operator
            FROM inventory.tool_issues ti
            LEFT JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            LEFT JOIN accesscontrol.access_users u ON u.id = ti.operator_id
            ORDER BY ti.created_at DESC LIMIT 30
        """,
    ),
    (
        r"(?:all\s+)?raw\s*material\s*stock|stock.*raw\s*material|show\s+(?:all\s+)?(?:raw\s+)?(?:material\s+)?stock|list\s+(?:all\s+)?stock|^(?:show|list)\s+stock\s*$",
        lambda _: all_material_stock_sql(100),
    ),
    (
        r"(?:stock|quantity|available)\s+(?:of|for)\s+([A-Za-z0-9][\w\-/]+(?:\s+[A-Za-z0-9\-/]+){0,2})\s*$|"
        r"^([A-Za-z0-9][\w\-/]+(?:\s+[A-Za-z0-9\-/]+){0,2})\s+(?:stock|quantity|available)\s*$",
        lambda m: material_stock_by_name_sql(_search_term(m)),
    ),
    (
        r"\b(?:material|raw\s*material).*(?:dimension|unit|stock)|(?:dimension|unit|stock).*(?:material|raw\s*material)",
        lambda _: all_material_stock_sql(100),
    ),
    (
        r"\braw\s*material(?!.*stock)|material.*\blist",
        lambda _: """
            SELECT material_name, density, cost_per_kg FROM inventory.raw_materials
            ORDER BY material_name LIMIT 50
        """,
    ),
    # ── SCHEDULED STOCK CHECK (tools + parts/materials availability)
    (
        r"(?:stock|in\s+stock|available).*(?:tool|part|material).*(?:schedule|scheduled|operation)|"
        r"(?:tool|part|material).*(?:stock|in\s+stock|available).*(?:schedule|scheduled|operation)|"
        r"are\s+(?:all\s+)?(?:the\s+)?(?:required\s+)?(?:tools?|parts?).*(?:stock|available).*(?:schedule|operation)",
        lambda _: SCHEDULED_STOCK_AVAILABILITY_SQL,
    ),

    # ── TOOLS (scheduled operations on machines — before generic tools list)
    (
        r"tools?\s+(?:required|needed|for).*(?:operation|schedule|machine)|"
        r"(?:operation|schedule|machine).*(?:tools?\s+(?:required|needed))|"
        r"which\s+tools?.*(?:operation|machine|schedule)|"
        r"tools?.*scheduled.*machine",
        lambda _: TOOLS_FOR_SCHEDULED_OPERATIONS_SQL,
    ),

    # ── TOOLS LIST
    (
        r"\btools?\s+list|list\s+tools?|^(?:show\s+)?(?:all\s+)?tools?\s*$",
        lambda _: all_tools_sql(50),
    ),

    # ── MASTER DATA
    (
        r"\bvendor|\bsupplier",
        lambda _: "SELECT company_name FROM inventory.vendors ORDER BY company_name LIMIT 50",
    ),
    (
        r"\bcustomer|\bclient",
        lambda _: """
            SELECT company_name, branch, contact_person, email, contact_number
            FROM configuration.customers ORDER BY company_name LIMIT 50
        """,
    ),
    (
        r"\ball\s+product|list.*\bproduct|show.*\bproduct",
        lambda _: "SELECT product_name, product_version FROM oms.products ORDER BY product_name LIMIT 50",
    ),
    (
        r"\ball\s+operator|list.*\boperator|show.*\boperator",
        lambda _: """
            SELECT user_name, role, center, "group" FROM accesscontrol.access_users
            WHERE role ILIKE '%operator%' ORDER BY user_name
        """,
    ),
    (
        r"\bleave|\babsent",
        lambda _: """
            SELECT u.user_name AS operator, ol.from_date, ol.to_date, ol.reason, ol.status
            FROM accesscontrol.operator_leaves ol
            JOIN accesscontrol.access_users u ON u.id = ol.operator_id
            ORDER BY ol.from_date DESC LIMIT 50
        """,
    ),

    # ── QUALITY
    (
        r"\bquality|\binspection\b",
        lambda _: """
            SELECT p.part_name, si.op_no, si.dimension_type, si.nominal_value,
                   si.measured_mean, si.is_done
            FROM quality.stage_inspection si
            JOIN oms.parts p ON p.id = si.part_id
            ORDER BY si.created_at DESC LIMIT 50
        """,
    ),

    # ── PM / EMS
    (
        r"\bpm\s+due|preventive\s+maintenance|pm\s+schedule\b",
        lambda _: """
            SELECT m.type AS machine, pc.name AS checklist, ps.next_due_date, ps.last_completed_date
            FROM configuration.pm_schedule ps
            JOIN configuration.pm_assignment_items pai ON pai.id = ps.assignment_item_id
            JOIN configuration.pm_machine_assignments pma ON pma.id = pai.assignment_id
            JOIN configuration.machines m ON m.id = pma.machine_id
            JOIN configuration.pm_checklists pc ON pc.id = pma.checklist_id
            WHERE ps.next_due_date <= CURRENT_DATE + INTERVAL '30 days'
            ORDER BY ps.next_due_date LIMIT 50
        """,
    ),
    (
        r"\benergy|\bems\b|power\s+consumption",
        lambda _: """
            SELECT m.type AS machine, el.status, el.total_instantaneous_power, el.active_energy_delivered, el.timestamp
            FROM ems.machine_ems_live el
            JOIN configuration.machines m ON m.id = el.machine_id
            ORDER BY m.type LIMIT 50
        """,
    ),
]


def try_quick_pattern(question: str):
    q = question.lower()
    for pattern, sql_fn in QUICK_SQL_PATTERNS:
        m = re.search(pattern, q, re.IGNORECASE)
        if m:
            try:
                return sql_fn(m).strip(), True
            except Exception:
                continue
    return None, False

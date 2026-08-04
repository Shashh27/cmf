"""Login-aware chatbot context — role-based suggestions and user-scoped SQL."""

import re
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field


class UserContext(BaseModel):
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    role: Optional[str] = None
    center: Optional[str] = None

    def is_logged_in(self) -> bool:
        return bool(self.user_id)

    def role_key(self) -> str:
        r = (self.role or "").lower().replace("_", " ").strip()
        if "admin" in r:
            return "admin"
        if "manufacturing coordinator" in r or r == "mc":
            return "mc"
        if "project coordinator" in r or r == "pc":
            return "pc"
        if "inventory supervisor" in r:
            return "inventory_supervisor"
        if "supervisor" in r:
            return "supervisor"
        if "operator" in r:
            return "operator"
        return "user"

    def order_scope_column(self) -> Optional[str]:
        """Database column used to restrict this user's assigned orders."""
        role = self.role_key()
        if role == "admin":
            return "admin_id"
        if role == "mc":
            return "manufacturing_coordinator_id"
        return None


ROLE_SUGGESTIONS: Dict[str, List[str]] = {
    "admin": [
        "Show all orders",
        "Show overdue orders",
        "Pending operations",
        "Show all raw material stock",
        "Notifications",
    ],
    "mc": [
        "My orders",
        "Pending operations",
        "Planned schedule",
        "Show all raw material stock",
        "My notifications",
    ],
    "pc": [
        "My orders",
        "Orders pending approval",
        "Show all customers",
        "My notifications",
    ],
    "supervisor": [
        "In-progress operations",
        "Production logs",
        "Machine live status",
        "Operator leaves",
        "Machine breakdowns",
    ],
    "operator": [
        "My operations",
        "My tool issues",
        "My leaves",
        "Machine live status",
        "Show all tools",
    ],
    "inventory_supervisor": [
        "Show all raw material stock",
        "Pending tool requests",
        "Tool issues",
        "List vendors",
        "List all tools",
    ],
    "user": [
        "Show all orders",
        "Pending operations",
        "Show machine status",
    ],
}


def get_role_suggestions(ctx: UserContext) -> List[str]:
    return ROLE_SUGGESTIONS.get(ctx.role_key(), ROLE_SUGGESTIONS["user"])


def personalized_greeting(ctx: UserContext) -> str:
    name = (ctx.user_name or "").strip()
    role = (ctx.role or "user").replace("_", " ")
    if name:
        return (
            f"Hi **{name}**! I'm your CMF Assistant ({role}).\n\n"
            "Ask about orders, parts, machines, stock, operations, or notifications."
        )
    return (
        "Hi! I can help with your CMF manufacturing data.\n\n"
        "Ask about orders, parts, operations, machines, inventory, or notifications."
    )


MY_QUERY_RE = re.compile(
    r"\b(?:my|mine)\b.*\b(orders?|notifications?|operations?|tools?|leaves?|tasks?)\b|"
    r"\b(orders?|notifications?|operations?|tools?|leaves?)\b.*\b(?:for\s+me|assigned\s+to\s+me)\b",
    re.IGNORECASE,
)


def try_user_scoped_query(question: str, ctx: UserContext) -> Tuple[Optional[str], bool]:
    """Fast SQL for 'my orders', 'my notifications', etc. based on logged-in user."""
    if not ctx.user_id or not MY_QUERY_RE.search(question or ""):
        return None, False

    uid = int(ctx.user_id)
    q = (question or "").lower()
    role = ctx.role_key()

    if "notification" in q:
        if role == "mc":
            return f"""
                SELECT 'order' AS notification_type,
                       COALESCE(o.sale_order_number, 'Order #' || on2.order_id::text) AS reference,
                       CASE WHEN COALESCE(on2.mc_is_ack, false) THEN 'read' ELSE 'unread' END AS status,
                       on2.created_at
                FROM notifications.order_notifications on2
                LEFT JOIN oms.orders o ON o.id = on2.order_id
                WHERE o.manufacturing_coordinator_id = {uid}
                   OR on2.order_id IN (
                       SELECT id FROM oms.orders WHERE manufacturing_coordinator_id = {uid}
                   )
                ORDER BY on2.created_at DESC NULLS LAST
                LIMIT 50
            """.strip(), True
        if role == "pc":
            return f"""
                SELECT COALESCE(al.entity_type, 'activity') AS notification_type,
                       COALESCE(al.action, '') AS reference,
                       CASE WHEN COALESCE(pcn.is_read, false) THEN 'read' ELSE 'unread' END AS status,
                       al.created_at
                FROM notifications.pc_notifications pcn
                JOIN notifications.activity_log al ON al.id = pcn.activity_log_id
                WHERE pcn.pc_user_id = {uid}
                ORDER BY al.created_at DESC NULLS LAST
                LIMIT 50
            """.strip(), True
        return """
            SELECT * FROM (
                SELECT 'order' AS notification_type,
                       COALESCE(o.sale_order_number, 'Order #' || on2.order_id::text) AS reference,
                       CASE WHEN COALESCE(on2.mc_is_ack, false) THEN 'read' ELSE 'unread' END AS status,
                       on2.created_at
                FROM notifications.order_notifications on2
                LEFT JOIN oms.orders o ON o.id = on2.order_id
                UNION ALL
                SELECT 'machine', 'Breakdown #' || mn.machine_breakdown_id::text,
                       CASE WHEN COALESCE(mn.is_ack, false) THEN 'read' ELSE 'unread' END, mn.created_at
                FROM notifications.machine_notifications mn
            ) n ORDER BY n.created_at DESC NULLS LAST LIMIT 50
        """.strip(), True

    if "order" in q:
        if role == "mc":
            where = f"o.manufacturing_coordinator_id = {uid}"
        elif role == "pc":
            where = f"o.project_coordinator_id = {uid}"
        elif role == "admin":
            where = f"o.admin_id = {uid}"
        else:
            where = f"(o.user_id = {uid} OR o.manufacturing_coordinator_id = {uid} OR o.project_coordinator_id = {uid})"
        return f"""
            SELECT o.sale_order_number, o.status, o.approval_status, o.quantity, o.due_date,
                   c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE {where}
            ORDER BY o.created_at DESC LIMIT 50
        """.strip(), True

    if "operation" in q and role == "operator":
        return f"""
            SELECT op.operation_name, p.part_name, pl.status, pl.from_date, pl.to_date,
                   pl.produced_quantity, pl.approved_quantity
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            WHERE pl.operator_id = {uid}
            ORDER BY pl.created_at DESC LIMIT 50
        """.strip(), True

    if "tool" in q and role == "operator":
        return f"""
            SELECT tl.item_description AS tool, ti.tool_issue_qty, ti.status, ti.issue_category
            FROM inventory.tool_issues ti
            JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            WHERE ti.operator_id = {uid}
            ORDER BY ti.created_at DESC LIMIT 50
        """.strip(), True

    if "leave" in q:
        return f"""
            SELECT ol.from_date, ol.to_date, ol.reason, ol.status
            FROM accesscontrol.operator_leaves ol
            WHERE ol.operator_id = {uid}
            ORDER BY ol.from_date DESC LIMIT 50
        """.strip(), True

    return None, False


def get_user_intent_hints(ctx: UserContext) -> str:
    if not ctx.is_logged_in():
        return ""
    lines = [
        f"Logged-in user: {ctx.user_name or 'unknown'} (id={ctx.user_id}, role={ctx.role or 'unknown'})"
    ]
    if ctx.center:
        lines.append(f"User center: {ctx.center}")
    role = ctx.role_key()
    if role == "mc":
        lines.append("For 'my orders' filter oms.orders.manufacturing_coordinator_id = user id")
    elif role == "pc":
        lines.append("For 'my orders' filter oms.orders.project_coordinator_id = user id")
    elif role == "operator":
        lines.append("For 'my operations' filter scheduling.production_logs.operator_id = user id")
    return "\n".join(lines)

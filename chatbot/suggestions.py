"""Dynamic chatbot prompt suggestions — built from live database + static categories."""

from typing import Any, Dict, List, Optional

from sqlalchemy import text

from DB.database import engine
from chatbot.user_context import UserContext, get_role_suggestions

STATIC_CATEGORIES: List[Dict[str, Any]] = [
    {
        "label": "Orders",
        "prompts": [
            "Show all orders",
            "Show overdue orders",
            "Orders pending approval",
        ],
    },
    {
        "label": "Production",
        "prompts": [
            "Pending operations",
            "In-progress operations",
            "Production logs",
            "Planned schedule",
            "Machine live status",
        ],
    },
    {
        "label": "Inventory",
        "prompts": [
            "Show all raw material stock",
            "List all tools",
            "Pending tool requests",
            "Tool issues",
            "List vendors",
        ],
    },
    {
        "label": "Machines & Maintenance",
        "prompts": [
            "List all machines",
            "Work centers",
            "Machine breakdowns",
            "Calibration due",
            "PM due",
        ],
    },
    {
        "label": "People & Quality",
        "prompts": [
            "List operators",
            "Operator leaves",
            "Quality inspections",
            "Show all customers",
            "Notifications",
        ],
    },
]


def _safe_rows(sql: str, limit: int = 5) -> List[str]:
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql))
            return [str(row[0]) for row in result.fetchmany(limit) if row[0]]
    except Exception:
        return []


def get_dynamic_suggestions(ctx: Optional[UserContext] = None) -> Dict[str, Any]:
    """Build suggestions from the current database state and logged-in role."""
    ctx = ctx or UserContext()
    role_prompts = get_role_suggestions(ctx)
    from_db: List[str] = []
    scope_column = ctx.order_scope_column()
    scope_filter = (
        f" AND {scope_column} = {int(ctx.user_id)}"
        if scope_column and ctx.user_id
        else ""
    )
    joined_scope_filter = (
        f" AND o.{scope_column} = {int(ctx.user_id)}"
        if scope_column and ctx.user_id
        else ""
    )

    for so in _safe_rows(
        "SELECT sale_order_number FROM oms.orders "
        f"WHERE sale_order_number IS NOT NULL{scope_filter} "
        "ORDER BY created_at DESC LIMIT 5"
    ):
        from_db.append(f"Show order {so}")
        from_db.append(f"Parts for order {so}")

    for material in _safe_rows(
        "SELECT material_name FROM inventory.raw_materials "
        "WHERE material_name IS NOT NULL ORDER BY material_name LIMIT 5"
    ):
        from_db.append(f"Stock for {material}")

    for product in _safe_rows(
        "SELECT DISTINCT p.product_name FROM oms.products p "
        "JOIN oms.orders o ON o.product_id = p.id "
        f"WHERE p.product_name IS NOT NULL{joined_scope_filter} "
        "ORDER BY p.product_name LIMIT 3"
    ):
        from_db.append(f"Orders for product {product}")

    for machine in _safe_rows(
        "SELECT type FROM configuration.machines "
        "WHERE type IS NOT NULL ORDER BY type LIMIT 3"
    ):
        from_db.append(f"Machine live status for {machine}")

    from_db.append("Are all required tools and parts in stock for scheduled operations?")

    scheduled_count = _safe_rows(
        "SELECT COUNT(*)::text FROM scheduling.planned_schedule_items psi "
        "JOIN oms.orders o ON o.id = psi.sale_order_id "
        f"WHERE psi.machine_id IS NOT NULL{joined_scope_filter} "
        "LIMIT 1"
    )
    if scheduled_count and scheduled_count[0] not in ("0", "None"):
        from_db.append("Tools for scheduled operations on machines")

    # Deduplicate while preserving order
    seen = set()
    unique_from_db = []
    for p in from_db:
        key = p.lower()
        if key not in seen:
            seen.add(key)
            unique_from_db.append(p)

    flat = list(unique_from_db[:4])
    for p in role_prompts:
        if p not in flat:
            flat.append(p)
    for cat in STATIC_CATEGORIES:
        for p in cat["prompts"]:
            if p not in flat:
                flat.append(p)
            if len(flat) >= 12:
                break
        if len(flat) >= 12:
            break

    return {
        "categories": STATIC_CATEGORIES,
        "from_database": unique_from_db[:12],
        "role_prompts": role_prompts,
        "prompts": flat[:12],
    }

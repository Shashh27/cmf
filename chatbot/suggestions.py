"""Dynamic chatbot prompt suggestions — built from live database + static categories."""

from typing import Any, Dict, List

from sqlalchemy import text

from DB.database import engine

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


def get_dynamic_suggestions() -> Dict[str, Any]:
    """Build suggestions from the current database state."""
    from_db: List[str] = []

    for so in _safe_rows(
        "SELECT sale_order_number FROM oms.orders "
        "WHERE sale_order_number IS NOT NULL ORDER BY created_at DESC LIMIT 5"
    ):
        from_db.append(f"Show order {so}")
        from_db.append(f"Parts for order {so}")

    for material in _safe_rows(
        "SELECT material_name FROM inventory.raw_materials "
        "WHERE material_name IS NOT NULL ORDER BY material_name LIMIT 5"
    ):
        from_db.append(f"Stock for {material}")

    for product in _safe_rows(
        "SELECT product_name FROM oms.products "
        "WHERE product_name IS NOT NULL ORDER BY product_name LIMIT 3"
    ):
        from_db.append(f"Orders for product {product}")

    for machine in _safe_rows(
        "SELECT type FROM configuration.machines "
        "WHERE type IS NOT NULL ORDER BY type LIMIT 3"
    ):
        from_db.append(f"Machine live status for {machine}")

    # Deduplicate while preserving order
    seen = set()
    unique_from_db = []
    for p in from_db:
        key = p.lower()
        if key not in seen:
            seen.add(key)
            unique_from_db.append(p)

    flat = []
    for cat in STATIC_CATEGORIES:
        flat.extend(cat["prompts"])
    flat.extend(unique_from_db[:12])

    return {
        "categories": STATIC_CATEGORIES,
        "from_database": unique_from_db[:12],
        "prompts": flat[:30],
    }

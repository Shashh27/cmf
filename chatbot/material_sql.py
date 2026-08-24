"""Material / stock SQL — dimensions, quantities, and per-unit bars."""

import re
from typing import Optional, Tuple

from chatbot.part_sql import is_part_material_query

MATERIAL_QUERY_RE = re.compile(
    r"\b(stock|stocks|raw\s*material|raw\s*materials|material|materials|inventory|"
    r"barstock|bar\s*stock|en\d+|quantity|available\s*quantity|allocated)\b",
    re.IGNORECASE,
)

DIMENSION_INVENTORY_RE = re.compile(
    r"\b(dimension|dimensions)\b.{0,30}\b(stock|inventory|material)|"
    r"\b(stock|inventory|material).{0,30}\b(dimension|dimensions)\b",
    re.IGNORECASE,
)

# Dimension words alone often mean quality inspection — require material context too.
DIMENSION_MATERIAL_RE = re.compile(
    r"\b(dimension|dimensions|diameter|length|units?)\b.{0,40}\b(stock|material|raw|bar|en\d+)\b|"
    r"\b(stock|material|raw|bar|en\d+)\b.{0,40}\b(dimension|dimensions|diameter|length|units?)\b",
    re.IGNORECASE,
)

TOOL_QUERY_RE = re.compile(
    r"\b(tools?\s*list|list\s*tools?|tool\s*issue|tool\s*request|consumable|"
    r"cutting\s*tool|inserts?)\b",
    re.IGNORECASE,
)


def is_material_query(question: str) -> bool:
    q = question or ""
    if is_part_material_query(q):
        return False
    if re.search(r"\border\b", q, re.IGNORECASE) and re.search(
        r"\b(stock|inventory|quantity|level|available)\b", q, re.IGNORECASE
    ):
        return False
    if re.search(r"\bpart\b", q, re.IGNORECASE) and re.search(
        r"\b(stock|inventory|quantity|level|available)\b", q, re.IGNORECASE
    ):
        return False
    if TOOL_QUERY_RE.search(q) and not MATERIAL_QUERY_RE.search(q):
        return False
    return bool(
        MATERIAL_QUERY_RE.search(q)
        or DIMENSION_MATERIAL_RE.search(q)
        or DIMENSION_INVENTORY_RE.search(q)
    )


def is_tool_query(question: str) -> bool:
    q = question or ""
    if is_material_query(q) and not TOOL_QUERY_RE.search(q):
        return False
    return bool(TOOL_QUERY_RE.search(q))


MATERIAL_STOCK_SELECT = """
    SELECT rm.material_name,
           rms.form_type,
           rms.process_type,
           rms.diameter,
           rms.length,
           rms.breadth,
           rms.height,
           rms.inner_diameter,
           rms.outer_diameter,
           rms.quantity,
           rms.available_quantity,
           rms.allocated_quantity,
           rms.mass AS unit_mass_kg,
           rms.volume AS unit_volume_m3,
           rms.weight AS unit_weight_n,
           rms.status AS stock_status,
           rms.order_status,
           ru.total_length AS bar_total_length_mm,
           ru.remaining_length AS bar_remaining_length_mm,
           ru.mass AS bar_mass_kg,
           ru.status AS bar_status
    FROM inventory.raw_material_stock rms
    JOIN inventory.raw_materials rm ON rm.id = rms.material_id
    LEFT JOIN inventory.raw_material_units ru ON ru.stock_id = rms.id
"""


def all_material_stock_sql(limit: int = 100) -> str:
    return f"""
        {MATERIAL_STOCK_SELECT}
        ORDER BY rm.material_name, rms.form_type, rms.diameter, ru.id
        LIMIT {limit}
    """.strip()


def material_stock_by_name_sql(term: str, limit: int = 50) -> str:
    safe = term.replace("'", "''")
    return f"""
        {MATERIAL_STOCK_SELECT}
        WHERE rm.material_name ILIKE '%{safe}%'
        ORDER BY rm.material_name, rms.form_type, rms.diameter, ru.id
        LIMIT {limit}
    """.strip()


def try_material_query(question: str) -> Tuple[Optional[str], bool]:
    """Fast path for any material/stock question — never returns tools."""
    if not is_material_query(question):
        return None, False

    q = (question or "").lower()

    if re.search(r"^(?:show\s+|list\s+|all\s+)*(?:stocks?|inventory)\s*$", q):
        return all_material_stock_sql(), True

    if re.search(
        r"(?:all\s+)?(?:raw\s+)?(?:material\s+)?stock|list\s+(?:all\s+)?stock|"
        r"show\s+(?:all\s+)?(?:raw\s+)?(?:material\s+)?stock|^(?:show|list)\s+stock\s*$",
        q,
    ):
        return all_material_stock_sql(), True

    m = re.search(
        r"(?:stock|quantity|available)\s+(?:of|for)\s+([A-Za-z0-9][\w\-/]+(?:\s+[A-Za-z0-9\-/]+){0,2})\s*$|"
        r"^([A-Za-z0-9][\w\-/]+(?:\s+[A-Za-z0-9\-/]+){0,2})\s+(?:stock|quantity|available)\s*$",
        question or "",
        re.IGNORECASE,
    )
    if m:
        term = next((g for g in m.groups() if g and g.strip()), "")
        words = [w for w in term.split() if w.lower() not in {
            "show", "list", "all", "get", "stock", "material", "raw", "for", "of",
        }]
        if words:
            return material_stock_by_name_sql(" ".join(words)), True

    # Named material token only e.g. "EN8" or "stock EN8"
    tokens = re.findall(r"[A-Za-z0-9][\w\-/]*", question or "")
    stop = {
        "show", "list", "all", "get", "stock", "material", "materials",
        "raw", "for", "of", "the", "related", "dimension", "dimensions", "unit", "units",
        "quantity", "available", "give", "me", "what", "is", "used", "part", "parts",
        "linked", "which", "tell",
    }
    names = [t for t in tokens if t.lower() not in stop and len(t) >= 2]
    if names:
        return material_stock_by_name_sql(names[0]), True

    if re.search(
        r"(?:show|list|get|give|all)\b.*\b(?:stock|material|raw)|"
        r"\b(?:stock|material|raw)\b.*(?:show|list|get|give|all)",
        q,
    ):
        return all_material_stock_sql(), True

    return None, False

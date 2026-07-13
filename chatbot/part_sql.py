"""Part-specific SQL — stock level, lookup by part number or name."""

import re
from typing import Optional, Tuple

PART_ID_RE = re.compile(
    r"\b([A-Za-z]{1,6}[\-_]?\d{2,}|[A-Za-z0-9][\w\-/]{2,})\b",
)

PART_STOCK_QUERY_RE = re.compile(
    r"\b(?:stock|inventory|quantity|level|available)\b.*\bpart\b|\bpart\b.*\b(?:stock|inventory|quantity|level|available)\b",
    re.IGNORECASE,
)


def is_part_stock_query(question: str) -> bool:
    return bool(PART_STOCK_QUERY_RE.search(question or ""))


def extract_part_term(question: str) -> Optional[str]:
    """Pull the most likely part number/name from a stock-for-part question."""
    q = question or ""
    m = re.search(
        r"\bpart\s+(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]+)\b",
        q,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).strip()

    stop = {
        "what", "is", "the", "current", "stock", "level", "for", "part", "of",
        "show", "get", "find", "quantity", "available", "inventory", "a", "an",
    }
    for tok in re.findall(r"[A-Za-z0-9][\w\-/]*", q):
        if tok.lower() in stop or len(tok) < 3:
            continue
        if re.search(r"\d", tok) or re.match(r"[A-Z]{2,}\d", tok, re.I):
            return tok
    return None


def part_stock_by_term_sql(term: str, limit: int = 50) -> str:
    safe = term.replace("'", "''")
    return f"""
        SELECT p.part_name,
               p.part_number,
               p.qty AS part_qty,
               p.size,
               pr.product_name,
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
        FROM oms.parts p
        LEFT JOIN oms.products pr ON pr.id = p.product_id
        LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
        LEFT JOIN inventory.raw_material_stock rms ON rms.material_id = rm.id
        LEFT JOIN inventory.raw_material_units ru ON ru.stock_id = rms.id
        WHERE (p.part_number ILIKE '%{safe}%' OR p.part_name ILIKE '%{safe}%')
          AND COALESCE(p.recycle_bin, false) = false
        ORDER BY p.part_number, rms.form_type, ru.id
        LIMIT {limit}
    """.strip()


def part_by_term_sql(term: str, limit: int = 20) -> str:
    safe = term.replace("'", "''")
    return f"""
        SELECT p.part_name, p.part_number, p.size, p.qty, pt.type_name,
               rm.material_name AS raw_material, pr.product_name
        FROM oms.parts p
        LEFT JOIN oms.part_types pt ON pt.id = p.type_id
        LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
        LEFT JOIN oms.products pr ON pr.id = p.product_id
        WHERE (p.part_name ILIKE '%{safe}%' OR p.part_number ILIKE '%{safe}%')
          AND COALESCE(p.recycle_bin, false) = false
        ORDER BY p.part_name
        LIMIT {limit}
    """.strip()


def try_part_stock_query(question: str) -> Tuple[Optional[str], bool]:
    if not is_part_stock_query(question):
        return None, False
    term = extract_part_term(question)
    if not term:
        return None, False
    return part_stock_by_term_sql(term), True


def try_part_lookup_query(question: str) -> Tuple[Optional[str], bool]:
    """Part detail when Groq/search_term provides a part id without stock keyword."""
    q = (question or "").lower()
    if "part" not in q:
        return None, False
    term = extract_part_term(question)
    if not term:
        m = PART_ID_RE.search(question or "")
        term = m.group(1) if m else None
    if not term or term.lower() in {"part", "parts", "house", "in"}:
        return None, False
    if re.search(r"\b(?:list|all|show)\s+(?:all\s+)?parts?\b", q):
        return None, False
    return part_by_term_sql(term), True

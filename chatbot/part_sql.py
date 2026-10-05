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

PART_MATERIAL_QUERY_RE = re.compile(
    r"\b(?:raw\s+)?materi[a-z]*\b.{0,50}\b(?:used|for|of|linked|this)\b.{0,30}\bpart\b|"
    r"\bpart\b.{0,50}\b(?:raw\s+)?materi[a-z]*\b|"
    r"\bwhich\b.{0,30}\b(?:raw\s+)?materi[a-z]*\b.{0,30}\bpart\b",
    re.IGNORECASE,
)

THESE_PARTS_STOCK_RE = re.compile(
    r"\b(?:stock|inventory|quantity|level|available)\b.{0,30}\b(?:these|those|the|same)\s+parts?\b|"
    r"\b(?:these|those|the|same)\s+parts?\b.{0,30}\b(?:stock|inventory|quantity|level|available)\b",
    re.IGNORECASE,
)

PARTS_STOCK_FOR_ORDER_RE = re.compile(
    r"\b(?:stock|inventory|quantity|level|available)\b.{0,50}\bparts?\b.{0,30}\border\b|"
    r"\bparts?\b.{0,30}\border\b.{0,50}\b(?:stock|inventory|quantity|level|available)\b",
    re.IGNORECASE,
)


def is_part_stock_query(question: str) -> bool:
    q = question or ""
    if PART_MATERIAL_QUERY_RE.search(q):
        return False
    return bool(PART_STOCK_QUERY_RE.search(q))


def is_part_material_query(question: str) -> bool:
    q = question or ""
    if PART_MATERIAL_QUERY_RE.search(q):
        return True
    if re.search(r"\bpart\b", q, re.I) and re.search(r"\b(?:raw|materi\w*)\b", q, re.I):
        return True
    return False


def is_these_parts_stock_query(question: str) -> bool:
    q = question or ""
    return bool(THESE_PARTS_STOCK_RE.search(q) or PARTS_STOCK_FOR_ORDER_RE.search(q))


def _order_ref_from_question(question: str) -> Optional[str]:
    m = re.search(
        r"\border\s+([A-Za-z0-9][\w\-/]+)\b",
        question or "",
        re.IGNORECASE,
    )
    return m.group(1).upper().replace(" ", "-") if m else None


def extract_part_term(question: str) -> Optional[str]:
    """Pull the most likely part number/name from a part-related question."""
    q = question or ""
    patterns = [
        r"\bpart\s+(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]+)\b",
        r"\bfor\s+(?:this|that|the)\s+part\s+([A-Za-z0-9][\w\-/]+)\b",
        r"\bpart\s+([A-Za-z]{2,}[\-_]\d+)\b",
        r"\b(PRT[\-_]?\d+)\b",
    ]
    for pat in patterns:
        m = re.search(pat, q, re.IGNORECASE)
        if m:
            return m.group(1).strip().upper().replace(" ", "-")

    stop = {
        "what", "is", "the", "current", "stock", "level", "for", "part", "of",
        "show", "get", "find", "quantity", "available", "inventory", "a", "an",
        "which", "raw", "material", "materials", "used", "this", "that", "linked",
    }
    for tok in re.findall(r"[A-Za-z0-9][\w\-/]*", q):
        if tok.lower() in stop or len(tok) < 3:
            continue
        if re.match(r"PRT[\-_]?\d+", tok, re.I):
            return tok.upper().replace("_", "-")
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


def part_raw_material_sql(term: str, limit: int = 20) -> str:
    """Raw material for a part: BOM link + PDF extraction + planned material."""
    safe = term.replace("'", "''")
    return f"""
        SELECT p.part_number,
               p.part_name,
               p.size,
               p.qty AS part_qty,
               pr.product_name,
               rm.material_name AS bom_raw_material,
               ded.material AS extracted_material,
               ded.stock_size AS extracted_stock_size,
               prm.material_name AS planned_material,
               ded.planned_form_type,
               ded.planned_diameter,
               ded.planned_length,
               ded.planned_breadth,
               ded.planned_height
        FROM oms.parts p
        LEFT JOIN oms.products pr ON pr.id = p.product_id
        LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
        LEFT JOIN LATERAL (
            SELECT d.material, d.stock_size, d.planned_form_type, d.planned_diameter,
                   d.planned_length, d.planned_breadth, d.planned_height,
                   d.planned_raw_material_id
            FROM oms.document_extracted_data d
            WHERE d.part_id = p.id
            ORDER BY d.updated_at DESC NULLS LAST, d.id DESC
            LIMIT 1
        ) ded ON TRUE
        LEFT JOIN inventory.raw_materials prm ON prm.id = ded.planned_raw_material_id
        WHERE (p.part_number ILIKE '%{safe}%' OR p.part_name ILIKE '%{safe}%')
          AND COALESCE(p.recycle_bin, false) = false
        ORDER BY p.part_number
        LIMIT {limit}
    """.strip()


def parts_stock_for_order_sql(order_ref: str, limit: int = 100) -> str:
    """Part stock + linked raw material stock for all parts on an order."""
    safe = order_ref.replace("'", "''")
    return f"""
        SELECT o.sale_order_number,
               p.part_number,
               p.part_name,
               p.qty AS part_qty,
               rm.material_name AS raw_material,
               rms.form_type,
               rms.process_type,
               rms.diameter,
               rms.length,
               rms.quantity AS material_stock_qty,
               rms.available_quantity,
               rms.allocated_quantity,
               rms.status AS stock_status
        FROM oms.orders o
        JOIN oms.order_part_priorities opp ON opp.order_id = o.id
        JOIN oms.parts p ON p.id = opp.part_id
        LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
        LEFT JOIN inventory.raw_material_stock rms ON rms.material_id = rm.id
        WHERE o.sale_order_number ILIKE '%{safe}%'
          AND COALESCE(p.recycle_bin, false) = false

        UNION ALL

        SELECT o.sale_order_number,
               p.part_number,
               p.part_name,
               p.qty AS part_qty,
               rm.material_name AS raw_material,
               rms.form_type,
               rms.process_type,
               rms.diameter,
               rms.length,
               rms.quantity AS material_stock_qty,
               rms.available_quantity,
               rms.allocated_quantity,
               rms.status AS stock_status
        FROM oms.orders o
        JOIN oms.parts p ON p.product_id = o.product_id
        LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
        LEFT JOIN inventory.raw_material_stock rms ON rms.material_id = rm.id
        WHERE o.sale_order_number ILIKE '%{safe}%'
          AND COALESCE(p.recycle_bin, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM oms.order_part_priorities opp2 WHERE opp2.order_id = o.id
          )
        ORDER BY part_number, form_type
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


def try_part_material_query(question: str) -> Tuple[Optional[str], bool]:
    if not is_part_material_query(question):
        return None, False
    term = extract_part_term(question)
    if not term:
        return None, False
    return part_raw_material_sql(term), True


def try_part_stock_query(question: str) -> Tuple[Optional[str], bool]:
    if not is_part_stock_query(question):
        return None, False
    term = extract_part_term(question)
    if not term:
        return None, False
    return part_stock_by_term_sql(term), True


def try_these_parts_stock_query(question: str, order_ref: Optional[str] = None) -> Tuple[Optional[str], bool]:
    if not is_these_parts_stock_query(question):
        return None, False
    ref = order_ref or _order_ref_from_question(question)
    if not ref:
        return None, False
    return parts_stock_for_order_sql(ref), True


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

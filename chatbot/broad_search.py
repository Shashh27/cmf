"""
Universal fallback search — matches ANY meaningful word from the user's question
against text columns across the CMF database.
"""

import re
from typing import List, Optional, Tuple

# Shared with query_patterns — command words, not search targets
STOP_WORDS = frozenset({
    "show", "list", "all", "get", "find", "search", "give", "me", "the", "my", "our",
    "please", "what", "which", "how", "many", "tell", "about", "for", "of", "in", "a",
    "an", "is", "are", "can", "you", "i", "want", "need", "see", "display", "fetch",
    "any", "some", "every", "current", "latest", "today", "now", "from", "with",
    "and", "or", "on", "at", "to", "do", "does", "did", "have", "has", "had",
    "this", "that", "these", "those", "there", "here", "also", "just", "only",
    "cmf", "data", "database", "info", "information", "details", "detail",
    "many", "much", "count", "total", "number", "sum", "average",
})

OFF_TOPIC_RE = re.compile(
    r"\b(weather|cricket|football|movie|joke|recipe|poem|bitcoin|cryptocurrency|"
    r"who\s+won|capital\s+of|tell\s+me\s+a\s+story|write\s+code|python\s+tutorial)\b",
    re.IGNORECASE,
)


def extract_search_terms(question: str) -> List[str]:
    """Pull every meaningful token from the question for ILIKE matching."""
    from chatbot.intent_queries import expand_domain_terms
    return expand_domain_terms(question)


def _extract_raw_terms(question: str) -> List[str]:
    """Pull every meaningful token from the question for ILIKE matching."""
    if not question:
        return []
    tokens = re.findall(r"[A-Za-z0-9][\w\-/]*", question)
    terms = []
    seen = set()
    for tok in tokens:
        key = tok.lower()
        if len(key) < 2 or key in STOP_WORDS:
            continue
        if key in seen:
            continue
        seen.add(key)
        terms.append(tok.replace("'", "''"))
    return terms[:6]


def is_clearly_off_topic(question: str) -> bool:
    return bool(OFF_TOPIC_RE.search(question or ""))


def is_domain_relevant(question: str) -> bool:
    """Allow almost everything — only block obvious non-manufacturing topics."""
    q = (question or "").strip()
    if not q:
        return False
    if is_clearly_off_topic(q):
        return False
    return bool(re.search(r"[a-z0-9]{2,}", q, re.IGNORECASE))


def _term_clause(alias: str, terms: List[str]) -> str:
    """Build OR clause: alias ILIKE '%term%' for each term."""
    return " OR ".join(f"{alias} ILIKE '%{t}%'" for t in terms)


def build_broad_search_sql(terms: List[str]) -> Optional[str]:
    if not terms:
        return None

    tc = _term_clause
    operator_blob = "CONCAT_WS(' ', u.user_name, u.role, u.center, u.\"group\")"
    blocks = [
        f"""
        SELECT 'Order' AS source_type, o.sale_order_number AS title,
               COALESCE(pr.product_name, c.company_name, '') AS subtitle,
               o.status::text AS status
        FROM oms.orders o
        LEFT JOIN oms.products pr ON pr.id = o.product_id
        LEFT JOIN configuration.customers c ON c.id = o.customer_id
        WHERE {tc("CONCAT_WS(' ', o.sale_order_number, o.project_name, o.status::text, c.company_name, pr.product_name)", terms)}
        """,
        f"""
        SELECT 'Part' AS source_type, p.part_name AS title,
               COALESCE(p.part_number, '') AS subtitle,
               COALESCE(pt.type_name, '') AS status
        FROM oms.parts p
        LEFT JOIN oms.part_types pt ON pt.id = p.type_id
        WHERE {tc("CONCAT_WS(' ', p.part_name, p.part_number, p.size, pt.type_name)", terms)}
        """,
        f"""
        SELECT 'Product' AS source_type, p.product_name AS title,
               COALESCE(p.product_version, '') AS subtitle, '' AS status
        FROM oms.products p
        WHERE {tc("CONCAT_WS(' ', p.product_name, p.product_version)", terms)}
        """,
        f"""
        SELECT 'Operation' AS source_type, op.operation_name AS title,
               COALESCE(p.part_name, '') AS subtitle,
               COALESCE(op.operation_number::text, '') AS status
        FROM oms.operations op
        LEFT JOIN oms.parts p ON p.id = op.part_id
        WHERE {tc("CONCAT_WS(' ', op.operation_name, op.operation_number::text, p.part_name)", terms)}
        """,
        f"""
        SELECT 'Customer' AS source_type, c.company_name AS title,
               COALESCE(c.contact_person, '') AS subtitle,
               COALESCE(c.branch, '') AS status
        FROM configuration.customers c
        WHERE {tc("CONCAT_WS(' ', c.company_name, c.contact_person, c.branch, c.email)", terms)}
        """,
        f"""
        SELECT 'Machine' AS source_type,
               CONCAT_WS(' ', m.type, m.make, m.model) AS title,
               COALESCE(wc.work_center_name, '') AS subtitle,
               COALESCE(m.calibration_due_date::text, '') AS status
        FROM configuration.machines m
        LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
        WHERE {tc("CONCAT_WS(' ', m.type, m.make, m.model, wc.work_center_name)", terms)}
        """,
        f"""
        SELECT 'Material' AS source_type, rm.material_name AS title,
               COALESCE(rms.form_type, '') AS subtitle,
               COALESCE(rms.status, '') AS status
        FROM inventory.raw_materials rm
        LEFT JOIN inventory.raw_material_stock rms ON rms.material_id = rm.id
        WHERE {tc("CONCAT_WS(' ', rm.material_name, rms.form_type, rms.status)", terms)}
        """,
        f"""
        SELECT 'Tool' AS source_type, tl.item_description AS title,
               COALESCE(tl.identification_code, '') AS subtitle,
               COALESCE(tl.type, '') AS status
        FROM inventory.tools_list tl
        WHERE {tc("CONCAT_WS(' ', tl.item_description, tl.identification_code, tl.make, tl.location)", terms)}
        """,
        f"""
        SELECT 'Operator' AS source_type, u.user_name AS title,
               COALESCE(u.role, '') AS subtitle,
               COALESCE(u.center, '') AS status
        FROM accesscontrol.access_users u
        WHERE {tc(operator_blob, terms)}
        """,
        f"""
        SELECT 'Vendor' AS source_type, v.company_name AS title, '' AS subtitle, '' AS status
        FROM inventory.vendors v
        WHERE {tc("v.company_name", terms)}
        """,
        f"""
        SELECT 'Notification' AS source_type,
               COALESCE(o.sale_order_number, 'Order #' || on2.order_id::text) AS title,
               'order notification' AS subtitle,
               CASE WHEN COALESCE(on2.mc_is_ack, false) THEN 'read' ELSE 'unread' END AS status
        FROM notifications.order_notifications on2
        LEFT JOIN oms.orders o ON o.id = on2.order_id
        WHERE {tc("CONCAT_WS(' ', o.sale_order_number, 'notification', 'order')", terms)}
        """,
    ]

    return f"""
        SELECT * FROM (
            {" UNION ALL ".join(blocks)}
        ) hits
        LIMIT 50
    """


def try_broad_search(question: str) -> Tuple[Optional[str], List]:
    terms = extract_search_terms(question)
    sql = build_broad_search_sql(terms)
    if not sql:
        return None, []
    return sql, terms

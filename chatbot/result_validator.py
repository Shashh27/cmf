"""Validate chatbot results match what the user actually asked."""

import re
from typing import Any, Dict, List, Optional, Set

IDENTIFIER_PATTERNS = [
    re.compile(r"\b(SO[\s\-]?\d+|ILP\d+|TEST\d+|ADSN\d+|[A-Z]{2,}\d{2,})\b", re.I),
    re.compile(r"\border\s+(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]+)\b", re.I),
    re.compile(r"\bpart\s+(?:no\.?|number|#)?\s*([A-Za-z0-9][\w\-/]+)\b", re.I),
    re.compile(r"\b(?:stock|material)\s+(?:for|of)\s+([A-Za-z0-9][\w\-/]+)\b", re.I),
]

SEARCH_COLUMNS = (
    "part_number", "part_name", "sale_order_number", "order_no", "material_name",
    "item_description", "tool_name", "identification_code", "title", "reference",
    "product_name", "company_name",
)

STOP_TERMS = frozenset({
    "show", "list", "all", "get", "find", "stock", "stocks", "part", "parts",
    "order", "orders", "tool", "tools", "machine", "the", "for", "what", "how",
    "many", "current", "level", "inventory", "required", "scheduled", "operation",
})


def extract_search_terms(question: str) -> List[str]:
    q = question or ""
    terms: List[str] = []
    seen: Set[str] = set()
    for pat in IDENTIFIER_PATTERNS:
        for m in pat.finditer(q):
            val = (m.group(1) if m.lastindex else m.group(0)).strip()
            key = val.lower()
            if len(val) >= 3 and key not in seen and key not in STOP_TERMS:
                seen.add(key)
                terms.append(val)
    return terms[:5]


def is_broad_list_question(question: str) -> bool:
    q = (question or "").lower()
    if extract_search_terms(question):
        return False
    return bool(re.search(
        r"\b(show|list|all|get|give)\b.*\b(orders?|parts?|tools?|machines?|stock|materials?|operators?)\b|"
        r"^(?:orders?|parts?|tools?|stocks?|machines?)\s*$",
        q,
    ))


def _row_matches_terms(row: Dict[str, Any], terms: List[str]) -> bool:
    blob = " ".join(str(v) for v in row.values() if v is not None).lower()
    return any(t.lower() in blob for t in terms)


def filter_results_for_question(
    question: str,
    data: List[Dict],
) -> Optional[List[Dict]]:
    """
    If the user named a specific part/order/material, keep only matching rows.
    Returns None if no filtering needed (broad list question).
    """
    if not data:
        return data
    if is_broad_list_question(question):
        return data

    terms = extract_search_terms(question)
    if not terms:
        return data

    cols = set(data[0].keys())
    targeted = [c for c in SEARCH_COLUMNS if c in cols]
    filtered: List[Dict] = []

    for row in data:
        if targeted:
            matched = False
            for col in targeted:
                val = str(row.get(col) or "").lower()
                if any(t.lower() in val or val in t.lower() for t in terms):
                    matched = True
                    break
            if matched:
                filtered.append(row)
        elif _row_matches_terms(row, terms):
            filtered.append(row)

    return filtered


def results_look_wrong(question: str, data: List[Dict], limit: int = 15) -> bool:
    """True when user asked for something specific but got a big unrelated list."""
    if not data or is_broad_list_question(question):
        return False
    terms = extract_search_terms(question)
    if not terms:
        return False
    if len(data) < limit:
        filtered = filter_results_for_question(question, data)
        return filtered is not None and len(filtered) == 0
    filtered = filter_results_for_question(question, data) or []
    return len(filtered) == 0

"""
AI intent classifier — understands what the user actually asked before running SQL.

Uses Groq (free API) when GROQ_API_KEY is set, otherwise Ollama.
Falls back to rule-based hints when both are unavailable.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

import requests

from chatbot.groq_client import groq_chat, is_groq_enabled, parse_json_object
from chatbot.intent_queries import IDENTIFIER_RE, INTENT_LIST_SQL, detect_fuzzy_intents
from chatbot.material_sql import all_material_stock_sql, material_stock_by_name_sql
from chatbot.order_sql import try_order_query, extract_order_number
from chatbot.part_sql import (
    is_part_material_query,
    is_part_stock_query,
    part_by_term_sql,
    part_raw_material_sql,
    part_stock_by_term_sql,
    try_part_stock_query,
)
from chatbot.query_patterns import (
    OPERATIONS_FOR_ORDER_SQL,
    PARTS_FOR_ORDER_SQL,
    try_quick_pattern,
)
from chatbot.tool_sql import (
    TOOLS_FOR_SCHEDULED_OPERATIONS_SQL,
    all_tools_sql,
    is_scheduled_stock_check_query,
    is_scheduled_tools_query,
    SCHEDULED_STOCK_AVAILABILITY_SQL,
    tools_by_name_sql,
)

VALID_INTENTS = frozenset({
    "orders", "parts", "materials", "tools", "machines", "scheduling",
    "notifications", "quality", "maintenance", "operators", "energy",
    "documents", "pm", "inventory", "search", "off_topic", "unknown",
})

CLASSIFIER_PROMPT = """You classify questions for a CMF manufacturing database chatbot.
Return ONLY one JSON object (no markdown, no explanation):
{{"intent":"orders|parts|materials|tools|machines|scheduling|notifications|quality|maintenance|operators|energy|documents|pm|inventory|search|off_topic|unknown","confidence":0.0-1.0,"order_ref":null or "SO-001","search_term":null or "EN8","action":"list|detail|count|search"}}

Rules:
- "materials" = raw material stock, bar stock, EN8/EN19 grades, quantities in inventory
- "tools" = cutting tools, consumables, tool requests/issues (NOT raw materials)
- "parts" = BOM components; "stock for part X" = part + linked raw material stock (NOT all parts list)
- "materials" = raw material stock only (EN8, bar stock) — NOT finished part numbers
- "scheduling" = planned schedule, production logs, operation status
- "notifications" = alerts, unread messages
- "quality" = inspections, tolerances, measured dimensions on parts
- "maintenance" = machine breakdowns, repairs
- "off_topic" = casual chat, food, sports, social apps, jokes — NOT about manufacturing
- If unclear manufacturing question, set intent "unknown" and confidence below 0.5
- Extract order_ref when user mentions SO-xxx or order numbers
- Extract search_term for material names, part names, machine types

Question: {question}
JSON:"""


@dataclass
class QuestionClassification:
    intent: str = "unknown"
    confidence: float = 0.0
    order_ref: Optional[str] = None
    search_term: Optional[str] = None
    action: str = "list"
    source: str = "rules"


def _call_groq(question: str) -> Optional[dict]:
    if not is_groq_enabled():
        return None
    content = groq_chat(
        [{"role": "user", "content": CLASSIFIER_PROMPT.format(question=question)}],
        max_tokens=120,
    )
    return parse_json_object(content or "")


def _call_ollama(question: str) -> Optional[dict]:
    if is_groq_enabled():
        return None
    base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv(
        "CHATBOT_CLASSIFIER_MODEL",
        os.getenv("OLLAMA_CLASSIFIER_MODEL", "llama3.2:latest"),
    )
    timeout = int(os.getenv("CLASSIFIER_TIMEOUT_SEC", "4"))
    try:
        resp = requests.post(
            f"{base}/api/generate",
            json={
                "model": model,
                "prompt": CLASSIFIER_PROMPT.format(question=question),
                "stream": False,
                "options": {"temperature": 0, "num_predict": 120},
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        return parse_json_object(resp.json().get("response", ""))
    except Exception:
        return None


def _rule_based_classification(question: str) -> QuestionClassification:
    intents = detect_fuzzy_intents(question)
    intent = intents[0] if intents else "unknown"
    conf = 0.65 if len(intents) == 1 else 0.35
    m = IDENTIFIER_RE.search(question or "")
    order_ref = m.group(0).upper().replace(" ", "-") if m else None
    return QuestionClassification(
        intent=intent,
        confidence=conf,
        order_ref=order_ref,
        action="detail" if order_ref else "list",
        source="rules",
    )


def classify_question(question: str) -> QuestionClassification:
    """Classify user intent with AI; fall back to fuzzy rules."""
    parsed = _call_groq(question) or _call_ollama(question)
    if parsed:
        intent = str(parsed.get("intent", "unknown")).lower().strip()
        if intent not in VALID_INTENTS:
            intent = "unknown"
        try:
            confidence = float(parsed.get("confidence", 0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        order_ref = parsed.get("order_ref")
        search_term = parsed.get("search_term")
        action = str(parsed.get("action", "list")).lower()
        source = "groq" if is_groq_enabled() else "ollama"
        return QuestionClassification(
            intent=intent,
            confidence=confidence,
            order_ref=str(order_ref).strip() if order_ref else None,
            search_term=str(search_term).strip() if search_term else None,
            action=action,
            source=source,
        )
    return _rule_based_classification(question)


def is_off_topic_classification(clf: QuestionClassification) -> bool:
    return clf.intent == "off_topic" and clf.confidence >= 0.6


def needs_classification(question: str) -> bool:
    """True when regex routing is likely to pick the wrong domain."""
    if is_groq_enabled():
        return True
    intents = detect_fuzzy_intents(question)
    if len(intents) > 1:
        return True
    q = (question or "").lower()
    weak_material = bool(
        re.search(r"\b(dimension|dimensions|diameter|length|unit)\b", q)
        and not re.search(r"\b(stock|material|raw|bar|en\d+)\b", q)
    )
    if weak_material:
        return True
    if re.search(r"\b(component|item)\b", q) and "order" not in q and "part" not in q:
        return True
    return False


def _order_id_from_ref(ref: str) -> Optional[str]:
    if not ref:
        return None
    m = re.search(r"\d+", ref)
    return m.group(0) if m else None


def route_by_classification(
    question: str,
    clf: QuestionClassification,
) -> Tuple[Optional[str], bool]:
    """Map classified intent to the correct SQL query."""
    if clf.intent in ("unknown", "off_topic", "search"):
        return None, False
    if clf.confidence < 0.55:
        return None, False

    q = (question or "").lower()
    intent = clf.intent

    if intent == "orders":
        sql, matched = try_order_query(question)
        if matched:
            return sql, True
        if clf.order_ref or clf.search_term:
            term = clf.search_term or clf.order_ref
            if term:
                from chatbot.order_sql import show_order_sql
                return show_order_sql(term), True

    if intent == "materials":
        if is_scheduled_stock_check_query(question):
            return SCHEDULED_STOCK_AVAILABILITY_SQL, True
        if clf.search_term:
            return material_stock_by_name_sql(clf.search_term), True
        if re.search(r"\b(stock|material|raw|en\d+)\b", q):
            return all_material_stock_sql(), True
        return all_material_stock_sql(), True

    if intent == "tools":
        if is_scheduled_stock_check_query(question):
            return SCHEDULED_STOCK_AVAILABILITY_SQL, True
        if is_scheduled_tools_query(question):
            return TOOLS_FOR_SCHEDULED_OPERATIONS_SQL, True
        if clf.search_term:
            return tools_by_name_sql(clf.search_term), True
        return all_tools_sql(), True

    if intent == "scheduling" and is_scheduled_tools_query(question):
        return TOOLS_FOR_SCHEDULED_OPERATIONS_SQL, True

    if intent == "parts":
        if is_part_material_query(question):
            term = clf.search_term
            if not term:
                from chatbot.part_sql import extract_part_term
                term = extract_part_term(question)
            if term:
                return part_raw_material_sql(term), True
        if clf.search_term:
            if is_part_stock_query(question):
                return part_stock_by_term_sql(clf.search_term), True
            return part_by_term_sql(clf.search_term), True
        if clf.order_ref:
            oid = _order_id_from_ref(clf.order_ref)
            if oid:
                return PARTS_FOR_ORDER_SQL(oid), True
        if clf.action in ("list", "count", "search", "detail"):
            from chatbot.intent_queries import is_broad_list_request
            if is_broad_list_request(question, "parts"):
                return INTENT_LIST_SQL["parts"].strip(), True
        return None, False

    if intent == "scheduling":
        if clf.order_ref or extract_order_number(question):
            term = clf.order_ref or extract_order_number(question)
            if term:
                from chatbot.order_sql import schedule_for_order_sql
                return schedule_for_order_sql(term), True
        if is_scheduled_stock_check_query(question):
            return SCHEDULED_STOCK_AVAILABILITY_SQL, True
        if is_scheduled_tools_query(question):
            return TOOLS_FOR_SCHEDULED_OPERATIONS_SQL, True
        if clf.order_ref:
            oid = _order_id_from_ref(clf.order_ref)
            if oid:
                return OPERATIONS_FOR_ORDER_SQL(oid), True
        return INTENT_LIST_SQL["scheduling"].strip(), True

    if intent in INTENT_LIST_SQL and clf.action in ("list", "count", "search", "detail"):
        if intent == "inventory":
            intent = "materials"
        return INTENT_LIST_SQL[intent].strip(), True

    return None, False


def classify_and_route(question: str) -> Tuple[Optional[str], bool, QuestionClassification]:
    """Classify then route — used when pattern matching is ambiguous."""
    sql, matched = try_quick_pattern(question)
    if matched:
        return sql, True, QuestionClassification(intent="pattern", confidence=1.0, source="pattern")

    clf = classify_question(question)
    sql, matched = route_by_classification(question, clf)
    return sql, matched, clf


def clarification_message(question: str, clf: QuestionClassification) -> str:
    if clf.intent == "off_topic":
        return (
            "I can only answer questions about **CMF manufacturing data** "
            "(orders, parts, machines, stock, operations, notifications).\n\n"
            "Try: *Show all orders*, *Stock for EN8*, or *My notifications*."
        )
    intents = detect_fuzzy_intents(question)
    if len(intents) > 1:
        options = ", ".join(intents)
        return (
            f"I found multiple possible meanings in your question ({options}).\n\n"
            "Please be more specific — for example:\n"
            "- **Show all orders**\n"
            "- **Stock for EN8**\n"
            "- **Parts for order SO-001**\n"
            "- **My notifications**"
        )
    if clf.intent == "unknown" or clf.confidence < 0.5:
        return (
            "I'm not sure what you're asking for.\n\n"
            "Try one of these formats:\n"
            "- **Show all orders** / **My orders**\n"
            "- **Stock for EN8** / **Show all raw material stock**\n"
            "- **Parts for order SO-001**\n"
            "- **Notifications** / **Pending operations**"
        )
    return (
        f"I think you mean **{clf.intent}**, but I'm not confident enough to run the query.\n\n"
        "Please rephrase with a clearer keyword (order, part, stock, machine, tool, notification)."
    )

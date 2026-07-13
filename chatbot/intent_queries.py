"""
Fuzzy intent routing — understands informal phrasing and typos like
'give notifictaiosn', 'show machins', 'lst orders'.
"""

import difflib
import re
from typing import Dict, List, Optional, Tuple

IDENTIFIER_RE = re.compile(
    r"\b(?:so[\s\-]?\d+|order[\s#:-]*\d+|[A-Za-z]{1,4}[\s\-]?\d{2,})\b",
    re.IGNORECASE,
)

LIST_VERB_FORMS = [
    "give", "show", "list", "get", "fetch", "display", "see", "want", "need", "pull", "send", "share",
]


def _is_list_verb_token(token: str) -> bool:
    tl = token.lower()
    if tl in LIST_VERB_FORMS:
        return True
    return bool(difflib.get_close_matches(tl, LIST_VERB_FORMS, n=1, cutoff=0.75))


def has_list_verb(question: str) -> bool:
    return any(_is_list_verb_token(t) for t in _tokens(question))

STOP_WORDS = frozenset({
    "show", "list", "all", "get", "find", "search", "give", "me", "the", "my", "our",
    "please", "what", "which", "how", "many", "tell", "about", "for", "of", "in", "a",
    "an", "is", "are", "can", "you", "i", "want", "need", "see", "display", "fetch",
    "any", "some", "every", "current", "latest", "today", "now", "from", "with",
    "and", "or", "on", "at", "to", "do", "does", "did", "have", "has", "had",
    "this", "that", "these", "those", "there", "here", "also", "just", "only",
    "cmf", "data", "database", "info", "information", "details", "detail",
    "many", "much", "count", "total", "number", "sum", "average", "bro", "pls",
})

# Canonical keyword forms per intent (used for fuzzy matching)
INTENT_KEYWORDS: Dict[str, List[str]] = {
    "notifications": [
        "notification", "notifications", "alert", "alerts", "notify", "notif", "unread", "acknowledge",
    ],
    "orders": ["order", "orders", "saleorder", "sale", "job", "workorder", "customer", "product"],
    "parts": ["part", "parts", "component", "components", "bom", "assembly", "assemblies", "piece"],
    "materials": [
        "stock", "stocks", "material", "materials", "raw", "barstock", "dimension", "dimensions",
        "diameter", "unit", "units", "quantity", "en8", "en9", "en19", "en24",
    ],
    "tools": ["tool", "tools", "consumable", "cutter", "insert"],
    "inventory": [
        "inventory", "vendor", "vendors", "supplier",
    ],
    "machines": [
        "machine", "machines", "cnc", "workcenter", "workcentre", "calibration", "shopfloor", "oee",
    ],
    "scheduling": [
        "schedule", "scheduling", "scheduled", "planned", "plan", "gantt", "reschedule", "downtime",
    ],
    "quality": ["quality", "inspection", "inspections", "tolerance", "boc", "measured"],
    "maintenance": ["breakdown", "breakdowns", "maintenance", "repair", "breakdownissue"],
    "operators": ["operator", "operators", "worker", "workers", "supervisor", "leave", "absent", "user", "users"],
    "energy": ["energy", "power", "ems", "electricity", "kwh", "consumption"],
    "documents": ["document", "documents", "folder", "upload"],
    "pm": ["pm", "preventive", "checkpoint", "preventivemaintenance"],
}

FUZZY_THRESHOLD = 0.72


def _tokens(question: str) -> List[str]:
    return re.findall(r"[A-Za-z0-9][\w\-/]*", question or "")


def fuzzy_intent_for_token(token: str) -> Optional[str]:
    tl = token.lower()
    if len(tl) < 3:
        return None
    best_intent = None
    best_score = 0.0
    for intent, keywords in INTENT_KEYWORDS.items():
        for kw in keywords:
            if tl == kw or tl in kw or kw in tl:
                return intent
            score = difflib.SequenceMatcher(None, tl, kw).ratio()
            if score > best_score:
                best_score = score
                best_intent = intent
    if best_score >= FUZZY_THRESHOLD:
        return best_intent
    return None


def detect_fuzzy_intents(question: str) -> List[str]:
    found = []
    seen = set()
    for tok in _tokens(question):
        intent = fuzzy_intent_for_token(tok)
        if intent and intent not in seen:
            seen.add(intent)
            found.append(intent)
    return found


def is_broad_list_request(question: str, intent: str) -> bool:
    if IDENTIFIER_RE.search(question or ""):
        return False
    tokens = [t for t in _tokens(question) if t.lower() not in STOP_WORDS]
    if not tokens:
        return False

    intent_tokens = [t for t in tokens if fuzzy_intent_for_token(t) == intent]
    if not intent_tokens:
        return False

    other_tokens = [
        t for t in tokens
        if fuzzy_intent_for_token(t) != intent and not _is_list_verb_token(t)
    ]
    if has_list_verb(question):
        return len(other_tokens) == 0

    if len(tokens) <= 2 and not other_tokens:
        return True

    return False


NOTIFICATIONS_LIST_SQL = """
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
"""

from chatbot.material_sql import all_material_stock_sql, is_material_query, is_tool_query
from chatbot.tool_sql import TOOLS_FOR_SCHEDULED_OPERATIONS_SQL, all_tools_sql

INTENT_LIST_SQL: Dict[str, str] = {
    "notifications": NOTIFICATIONS_LIST_SQL,
    "orders": """
        SELECT o.sale_order_number, o.status, o.approval_status, o.quantity, o.due_date,
               c.company_name AS customer, pr.product_name
        FROM oms.orders o
        JOIN configuration.customers c ON c.id = o.customer_id
        JOIN oms.products pr ON pr.id = o.product_id
        ORDER BY o.created_at DESC LIMIT 50
    """,
    "parts": """
        SELECT p.part_name, p.part_number, p.size, p.qty, pt.type_name, pr.product_name
        FROM oms.parts p
        LEFT JOIN oms.part_types pt ON pt.id = p.type_id
        LEFT JOIN oms.products pr ON pr.id = p.product_id
        WHERE COALESCE(p.recycle_bin, false) = false
        ORDER BY p.part_name LIMIT 50
    """,
    "materials": all_material_stock_sql(100),
    "tools": all_tools_sql(50),
    "inventory": all_material_stock_sql(100),
    "machines": """
        SELECT m.type, m.make, m.model, wc.work_center_name, m.calibration_due_date
        FROM configuration.machines m
        LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
        ORDER BY wc.work_center_name, m.type LIMIT 50
    """,
    "scheduling": """
        SELECT psi.sale_order_number, p.part_name, op.operation_name, m.type AS machine,
               psi.planned_start_time, psi.planned_end_time, psi.status
        FROM scheduling.planned_schedule_items psi
        JOIN oms.parts p ON p.id = psi.part_id
        JOIN oms.operations op ON op.id = psi.operation_id
        LEFT JOIN configuration.machines m ON m.id = psi.machine_id
        ORDER BY psi.planned_start_time LIMIT 100
    """,
    "quality": """
        SELECT si.op_no, p.part_name, si.dimension_type, si.nominal_value,
               si.measured_mean, si.is_done
        FROM quality.stage_inspection si
        JOIN oms.parts p ON p.id = si.part_id
        ORDER BY si.created_at DESC LIMIT 50
    """,
    "maintenance": """
        SELECT mb.id, m.type AS machine, mb.from_date, mb.to_date, mb.status, mb.reason
        FROM maintenance.machine_breakdown mb
        LEFT JOIN configuration.machines m ON m.id = mb.machine_id
        ORDER BY mb.from_date DESC LIMIT 50
    """,
    "operators": """
        SELECT user_name, role, center, "group"
        FROM accesscontrol.access_users
        WHERE role ILIKE '%operator%' OR role ILIKE '%supervisor%'
        ORDER BY user_name LIMIT 50
    """,
    "energy": """
        SELECT m.type AS machine, mel.power, mel.voltage, mel.current, mel.recorded_at
        FROM ems.machine_ems_live mel
        LEFT JOIN configuration.machines m ON m.id = mel.machine_id
        ORDER BY mel.recorded_at DESC LIMIT 50
    """,
    "documents": """
        SELECT gd.document_name, gd.folder_name, gd.uploaded_at
        FROM documents.general_documents gd
        ORDER BY gd.uploaded_at DESC LIMIT 50
    """,
    "pm": """
        SELECT ps.schedule_name, ps.frequency, ps.next_due_date, m.type AS machine
        FROM configuration.pm_schedule ps
        LEFT JOIN configuration.pm_machine_assignments pma ON pma.pm_schedule_id = ps.id
        LEFT JOIN configuration.machines m ON m.id = pma.machine_id
        ORDER BY ps.next_due_date LIMIT 50
    """,
}


def try_intent_query(question: str) -> Tuple[Optional[str], bool]:
    """Route informal / typo questions to list-all SQL for the detected domain."""
    intents = detect_fuzzy_intents(question)
    if not intents:
        return None, False

    for intent in intents:
        if not is_broad_list_request(question, intent):
            continue
        sql = INTENT_LIST_SQL.get(intent)
        if sql:
            return sql.strip(), True

    return None, False


def has_cmf_signal(question: str) -> bool:
    """True if the question has any recognizable CMF domain keyword or ID."""
    if IDENTIFIER_RE.search(question or ""):
        return True
    if detect_fuzzy_intents(question):
        return True
    return any(fuzzy_intent_for_token(t) for t in _raw_tokens(question))


def _raw_tokens(question: str) -> List[str]:
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


def expand_domain_terms(question: str) -> List[str]:
    """Map typo tokens to canonical domain words for broad ILIKE search."""
    terms = _raw_tokens(question)
    expanded = []
    seen = set()
    for term in terms:
        intent = fuzzy_intent_for_token(term)
        if intent and intent in INTENT_KEYWORDS:
            canonical = INTENT_KEYWORDS[intent][0]
            key = canonical.lower()
            if key not in seen:
                seen.add(key)
                expanded.append(canonical.replace("'", "''"))
        key = term.lower()
        if key not in seen:
            seen.add(key)
            expanded.append(term)
    return expanded[:6]

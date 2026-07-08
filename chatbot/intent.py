"""Intent detection — routes questions to the right tables and pattern families."""

import re
from typing import List, Tuple

from chatbot.schema_knowledge import DOMAIN_KEYWORDS

IDENTIFIER_RE = re.compile(
    r"\b(?:so[\s\-]?\d+|order[\s#:-]*\d+|[A-Za-z]{1,4}[\s\-]?\d{2,})\b",
    re.IGNORECASE,
)

INTENT_RULES: List[Tuple[str, re.Pattern, List[str]]] = [
    (
        "scheduling",
        re.compile(
            r"\b(planned\s+schedule|schedule|scheduling|reschedul|gantt|planned\s+start|"
            r"machine\s+schedule|part\s+schedule|order\s+schedule|downtime|shift\s+assign)\b",
            re.I,
        ),
        ["scheduling.planned_schedule_items", "scheduling.part_schedule_status",
         "scheduling.machine_schedule", "scheduling.rescheduling_items",
         "scheduling.order_schedule_status", "scheduling.production_logs"],
    ),
    (
        "orders",
        re.compile(
            r"\b(order|orders|sale\s+order|so[\s\-]?\d|job|work\s+order|customer|product|"
            r"approval|due\s+date|overdue|project)\b",
            re.I,
        ),
        ["oms.orders", "oms.products", "oms.order_part_priorities", "configuration.customers"],
    ),
    (
        "parts",
        re.compile(
            r"\b(part|parts|component|bom|assembly|assemblies|piece|routing|recycle)\b",
            re.I,
        ),
        ["oms.parts", "oms.assemblies", "oms.operations", "oms.order_part_priorities"],
    ),
    (
        "inventory",
        re.compile(
            r"\b(stock|inventory|raw\s+material|material|tool|tools|vendor|supplier|"
            r"request|checkout|return|consumable)\b",
            re.I,
        ),
        ["inventory.raw_material_stock", "inventory.raw_materials", "inventory.tools_list",
         "inventory.inventory_requests", "inventory.tool_issues", "inventory.vendors"],
    ),
    (
        "machines",
        re.compile(
            r"\b(machine|machines|cnc|work\s*center|workcenter|calibration|live\s+status|"
            r"shop\s+floor|oee|shift\s+summary)\b",
            re.I,
        ),
        ["configuration.machines", "configuration.work_centers",
         "production_monitoring.machine_live_status", "production_monitoring.shift_summary",
         "scheduling.machine_downtimes"],
    ),
    (
        "quality",
        re.compile(r"\b(quality|inspection|dimension|tolerance|boc|ftp)\b", re.I),
        ["quality.stage_inspection", "quality.inspection_plan_status", "quality.master_boc"],
    ),
    (
        "maintenance",
        re.compile(
            r"\b(breakdown|maintenance|component\s+issue|oee\s+issue|help\s+support|repair)\b",
            re.I,
        ),
        ["maintenance.machine_breakdown", "maintenance.component_issues",
         "maintenance.oee_issues", "maintenance.help_support"],
    ),
    (
        "notifications",
        re.compile(r"\b(notification|notifications|alert|alerts|acknowledge|unread)\b", re.I),
        ["notifications.order_notifications", "notifications.machine_notifications",
         "notifications.tool_issues_notification", "notifications.activity_log"],
    ),
    (
        "energy",
        re.compile(r"\b(energy|power|ems|consumption|kwh|electricity)\b", re.I),
        ["ems.machine_ems_live", "ems.machine_ems_history", "ems.shiftwise_energy_live"],
    ),
    (
        "users",
        re.compile(
            r"\b(operator|operators|supervisor|coordinator|user|users|leave|absent|role)\b",
            re.I,
        ),
        ["accesscontrol.access_users", "accesscontrol.operator_leaves"],
    ),
    (
        "documents",
        re.compile(r"\b(document|documents|folder|upload)\b", re.I),
        ["oms.documents", "oms.order_documents", "documents.general_documents"],
    ),
    (
        "pm",
        re.compile(r"\b(pm|preventive\s+maintenance|checkpoint|pm\s+schedule|pm\s+due)\b", re.I),
        ["configuration.pm_schedule", "configuration.pm_machine_assignments",
         "configuration.pm_checkpoint_submissions"],
    ),
]


def detect_intents(question: str) -> List[str]:
    q = (question or "").lower()
    found = [name for name, pattern, _ in INTENT_RULES if pattern.search(q)]
    return found or ["orders"]


def get_intent_hints(question: str) -> str:
    intents = detect_intents(question)
    lines = [f"Detected intents: {', '.join(intents)}"]
    seen = set()
    intent_tables = {name: tables for name, _, tables in INTENT_RULES}
    for name in intents:
        for table in intent_tables.get(name, []):
            if table not in seen:
                seen.add(table)
                lines.append(f"  - prefer {table}")
    return "\n".join(lines)


def is_domain_relevant(question: str) -> bool:
    from chatbot.broad_search import is_domain_relevant as _is_relevant
    return _is_relevant(question)

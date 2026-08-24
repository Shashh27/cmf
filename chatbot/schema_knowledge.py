"""Verified CMF schema knowledge + dynamic DB introspection for the chatbot."""

from typing import List, Optional

from DB.schemas.chatbot import SchemaService

RELEVANT_SCHEMAS = (
    "oms", "scheduling", "inventory", "configuration", "maintenance",
    "quality", "notifications", "production_monitoring", "documents",
    "ems", "accesscontrol",
)

STATIC_SCHEMA_CONTEXT = """
PostgreSQL CMF manufacturing database. Use schema-qualified table names.

═══ CORE ORDER CHAIN ═══
oms.orders → oms.products → oms.parts → oms.operations
oms.order_part_priorities (order_id, part_id, priority) = parts selected for a specific order
scheduling.part_schedule_status (part_id, sale_order_id, status, start_date)
scheduling.production_logs = PRIMARY source for operation execution (status: inprogress, completed)
scheduling.operation_status is often EMPTY — prefer production_logs

oms.orders(id, sale_order_number, project_name, customer_id, product_id, quantity, due_date, status,
  approval_status, order_date, user_id, project_coordinator_id, admin_id, manufacturing_coordinator_id)
oms.products(id, product_name, product_version)
oms.assemblies(id, assembly_name, assembly_number, product_id, parent_id, recycle_bin)
oms.parts(id, part_name, part_number, type_id, raw_material_id, assembly_id, product_id, part_detail, qty, size, vendor_id, recycle_bin)
oms.document_extracted_data(part_id, material, stock_size, planned_form_type, planned_raw_material_id, planned_length, planned_breadth, planned_height) — PDF extracted + planned RM
oms.operations(id, operation_number, operation_name, setup_time, cycle_time, workcenter_id, part_id, machine_id, vendor_id)
oms.order_part_priorities(id, order_id, product_id, part_id, priority)  -- NO status column
oms.out_source_parts_status(part_id, order_id, start_date, to_date, status)
oms.order_additional_costs(order_id, cost_name, cost_value)
oms.documents, oms.order_documents, oms.operation_documents (document_name, document_url, document_type)

═══ SCHEDULING (no ORM — raw SQL only) ═══
scheduling.part_schedule_status(part_id, sale_order_id, status, start_date)
scheduling.order_schedule_status(order_id, product_id, active_parts_count, status)
scheduling.operation_status(order_id, part_id, operation_id, status, operator_id) — often empty
scheduling.machine_schedule(order_id, part_id, operation_id, machine_id, start_time, end_time, status)
scheduling.planned_schedule_items(part_id, sale_order_id, sale_order_number, operation_id, machine_id,
  planned_start_time, planned_end_time, total_quantity, remaining_quantity, status)
scheduling.rescheduling_items(order_id, part_id, operation_id, machine_id, start_time, end_time, status)
scheduling.production_logs(operation_id, operator_id, supervisor_id, from_date, to_date, status,
  produced_quantity, approved_quantity, rework_quantity, rejected_quantity)
scheduling.machine_status(machine_id, status_id, available_from, available_to)
scheduling.machine_downtimes(machine_id, start_time, end_time, status_name, description)
scheduling.status(id, name) — lookup for machine status
scheduling.shift_hours_configuration, scheduling.shift_timing_configuration
scheduling.machine_operator_shift_assignment(machine_id, operator_id, shift_config_id)

═══ INVENTORY ═══
inventory.raw_materials(id, material_name, density, cost_per_kg)  -- NO material_grade
inventory.raw_material_stock(material_id, form_type, process_type, diameter, length, quantity,
  available_quantity, allocated_quantity, status, source_type, source_order_id, cost)
inventory.raw_material_units(stock_id, total_length, remaining_length, status)
inventory.raw_material_usage(raw_material_unit_id, part_id, used_length)
inventory.vendors(id, company_name)  -- ONLY company_name
inventory.tools_list(id, item_description, identification_code, make, quantity, location, type, category_id, sub_category_id)
inventory.categories(id, name, parent_id)  -- join for category name: category_id, sub_category_id
oms.tools_with_part(tool_id, part_id, operation_id)  -- tools required per operation
inventory.inventory_requests(tool_id, operator_id, project_id, part_id, operation_id, quantity, status)
inventory.inventory_return_requests(requested_id, operator_id, returned_qty, status)
inventory.tool_issues(tool_id, request_id, tool_issue_qty, operator_id, status, issue_category)
inventory.categories(id, name, parent_id)

═══ CONFIGURATION ═══
configuration.customers(id, company_name, branch, email, contact_person, contact_number)
configuration.work_centers(id, code, work_center_name, description, is_schedulable)  -- NOT .name
configuration.machines(id, work_center_id, type, make, model, calibration_date, calibration_due_date, mhr)
configuration.operation_checklists, operation_checklist_assign, submissions, submission_details
configuration.pm_checklists, pm_checklist_items, pm_machine_assignments, pm_assignment_items,
  pm_schedule(assignment_item_id, last_completed_date, next_due_date), pm_checkpoint_submissions

═══ MAINTENANCE ═══
maintenance.machine_breakdown(machine_id, reported_by, issue_category, machine_status, issue_reason, reported_at)
maintenance.component_issues(machine_id, production_order_id, part_id, operation_id, component_status, description)
maintenance.oee_issues(machine_id, issue_category, issue_reason, start_time, end_time)
maintenance.help_support(machine_id, production_order_id, part_id, operation_id, description, mc_reply)

═══ QUALITY ═══
quality.stage_inspection(part_id, sale_order_id, op_no, dimension_type, nominal_value, uppertol, lowertol, measured_mean, is_done)
quality.inspection_plan_status(part_number, sales_order_id, status)
quality.master_boc(part_id, sales_order_id)
quality.ftp_status(order_id)
quality.notes(part_id)

═══ PRODUCTION MONITORING & EMS ═══
production_monitoring.machine_live_status(machine_id, status, current_order_id, current_part_id, current_operation_id)
production_monitoring.machine_live_history(machine_id, status, last_updated)
production_monitoring.shift_summary(machine_id, shift, oee, availability, performance, quality, total_parts, good_parts)
production_monitoring.oee_issue(machine_id, issue_category, start_time, end_time)
ems.machine_ems_live(machine_id, power, energy readings)
ems.shiftwise_energy_live(machine_id, first_shift, second_shift, total_energy)

═══ NOTIFICATIONS ═══
notifications.order_notifications(order_id, mc_is_ack, pc_is_ack, admin_is_ack)
notifications.machine_notifications(machine_breakdown_id, is_ack)
notifications.tool_issues_notification(tool_issues_id, is_ack)
notifications.component_issues_notification(comp_issues_id, is_ack)
notifications.machine_calibration_notification(machine_id, is_ack)
notifications.activity_log(entity_type, entity_id, action, order_id, user_id, details)
notifications.pc_notifications(activity_log_id, pc_user_id, is_read)
notifications.mc_notifications(document_id, mc_user_id, is_acknowledged)

═══ DOCUMENTS (MinIO-backed) ═══
documents.general_folders, general_documents
documents.machine_folders, machine_documents(machine_id)
documents.common_folders, common_documents

═══ ACCESS ═══
accesscontrol.access_users(id, user_name, gmail, role, center, "group")
accesscontrol.operator_leaves(operator_id, from_date, to_date, reason, status)  -- NO leave_date/leave_type

═══ CRITICAL: THREE INVENTORY DOMAINS (do not mix) ═══
1. PARTS (BOM) → oms.parts — finished/semi-finished components (part_number, part_name)
   Linked to raw material via oms.parts.raw_material_id → inventory.raw_materials
2. RAW MATERIAL STOCK → inventory.raw_material_stock + raw_material_units — bar/pipe stock (EN8, FG260, etc.)
3. TOOLS → inventory.tools_list — cutting tools, gauges, consumables (NOT raw materials)

"Raw material for part X" → oms.parts + document_extracted_data (extracted material) + planned_raw_material_id + parts.raw_material_id (BOM)
"Stock for part X" → part + its linked raw_material_stock rows
"Raw material stock" / "EN8 stock" → inventory.raw_material_stock only
"List tools" → inventory.tools_list only

═══ CRITICAL: PARTS FOR ORDER X ═══
Use UNION ALL: order_part_priorities first; if none exist, fall back to parts via product_id.

═══ SYNONYMS ═══
sale order/SO/job/work order → oms.orders.sale_order_number
BOM/components/pieces/items → oms.parts
steps/processes/routing → oms.operations
shop floor/live/running → production_monitoring.machine_live_status + production_logs
planned schedule/Gantt → scheduling.planned_schedule_items
tool request/checkout → inventory.inventory_requests
PM/preventive maintenance → configuration.pm_schedule
energy/power consumption → ems.*
alerts/notifications → notifications.*
recycle bin/deleted parts → oms.parts WHERE recycle_bin = true
outsourced/vendor parts → oms.out_source_parts_status
"""

DOMAIN_KEYWORDS = {
    "order", "orders", "sale order", "so", "project", "customer", "product", "part",
    "parts", "component", "components", "bom", "assembly", "assemblies", "operation",
    "operations", "machine", "machines", "work center", "workcenter", "inventory",
    "stock", "material", "materials", "raw material", "vendor", "vendors", "supplier",
    "tool", "tools", "operator", "operators", "quality", "inspection", "production",
    "schedule", "scheduling", "planned", "reschedule", "breakdown", "maintenance",
    "job", "jobs", "manufacturing", "cmf", "oee", "downtime", "energy", "ems",
    "notification", "notifications", "alert", "calibration", "pm", "preventive",
    "recycle", "outsource", "outsourced", "supervisor", "coordinator", "shift",
    "document", "documents", "checklist", "help", "support", "issue", "issues",
    "tracking", "progress", "live", "shop floor", "gantt", "log", "logs",
}

OUT_OF_SCOPE_MESSAGE = (
    "I can only answer questions about CMF manufacturing data in this system.\n\n"
    "Supported areas: orders, products, parts, operations, scheduling, machines, "
    "inventory, quality, maintenance, notifications, energy, PM, and operators.\n\n"
    "Examples: *show order SO-001*, *planned schedule for order 5*, "
    "*machine live status*, *pending tool requests*, *stock for EN8*"
)

SQL_RULES = """
RULES:
1. Reply with ONLY a raw SELECT query — no markdown, no explanation.
2. Always schema-qualify tables (oms.orders not orders).
3. NEVER use configuration.work_centers.name — use work_center_name.
4. NEVER use rm.material_grade — use material_name.
5. NEVER use v.vendor_name — use company_name.
6. NEVER use ol.leave_date/leave_type — use from_date, to_date, reason, status.
7. NEVER use oms.order_part_priorities.status — column does not exist.
8. For operation execution use scheduling.production_logs (status: inprogress, completed).
9. For parts of order X use UNION ALL template (order_part_priorities then product parts fallback).
10. Filter specific material names with ILIKE on material_name.
11. Add LIMIT 100 unless user asks for all.
12. NEVER reply CANNOT_ANSWER — always write a SELECT with ILIKE '%keyword%' on relevant text columns.
13. If unsure which table, search multiple tables with UNION ALL and ILIKE on name/title columns.
14. Use ILIKE '%value%' for partial word matches on names, numbers, and status fields.
"""


def get_compact_live_schema(intents: Optional[List[str]] = None) -> str:
    """Load live column names from PostgreSQL for relevant schemas."""
    try:
        full = SchemaService.load_schema()
    except Exception:
        return ""

    priority_schemas = list(RELEVANT_SCHEMAS)
    if intents:
        intent_schema_map = {
            "orders": ["oms", "configuration"],
            "scheduling": ["scheduling", "oms"],
            "inventory": ["inventory", "oms"],
            "machines": ["configuration", "production_monitoring", "scheduling"],
            "quality": ["quality", "oms"],
            "maintenance": ["maintenance", "configuration"],
            "notifications": ["notifications"],
            "energy": ["ems", "configuration"],
            "documents": ["documents", "oms"],
            "users": ["accesscontrol"],
        }
        extra = []
        for intent in intents:
            extra.extend(intent_schema_map.get(intent, []))
        priority_schemas = list(dict.fromkeys(extra + list(RELEVANT_SCHEMAS)))

    lines = ["\n═══ LIVE DB COLUMNS (introspected) ═══"]
    for schema in priority_schemas:
        tables = full.get(schema)
        if not tables:
            continue
        lines.append(f"\n[{schema}]")
        for table, cols in sorted(tables.items())[:40]:
            lines.append(f"  {table}: {', '.join(cols[:25])}")
    return "\n".join(lines)


def build_system_prompt(question: str, intent_hints: str = "") -> str:
    live = get_compact_live_schema()
    return (
        "You are a PostgreSQL SQL expert for the CMF manufacturing system.\n\n"
        + STATIC_SCHEMA_CONTEXT
        + (f"\n\nINTENT HINTS FOR THIS QUESTION:\n{intent_hints}\n" if intent_hints else "")
        + live
        + "\n\n"
        + SQL_RULES
    )

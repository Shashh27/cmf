"""CMF relationship map — join recipes from dump FKs + domain rules.

Parts ≠ raw material stock ≠ tools. Agent must pick the correct join path.
"""

from __future__ import annotations

from typing import Dict, List, Optional

# Entity aliases the agent / get_join_path accept
ENTITY_ALIASES: Dict[str, str] = {
    "order": "order",
    "orders": "order",
    "so": "order",
    "sale_order": "order",
    "part": "part",
    "parts": "part",
    "bom": "part",
    "component": "part",
    "material": "raw_material",
    "materials": "raw_material",
    "raw_material": "raw_material",
    "raw_materials": "raw_material",
    "stock": "raw_material_stock",
    "raw_material_stock": "raw_material_stock",
    "barstock": "raw_material_stock",
    "tool": "tool",
    "tools": "tool",
    "tool_issue": "tool_issue",
    "tool_issues": "tool_issue",
    "inventory_request": "inventory_request",
    "inventory_requests": "inventory_request",
    "tool_request": "inventory_request",
    "tool_requests": "inventory_request",
    "return_request": "return_request",
    "return_requests": "return_request",
    "machine": "machine",
    "machines": "machine",
    "operation": "operation",
    "operations": "operation",
    "schedule": "schedule",
    "planned_schedule": "schedule",
    "gantt": "schedule",
    "customer": "customer",
    "customers": "customer",
    "product": "product",
    "products": "product",
    "list": "list",
    "customer": "customer",
    "customers": "customer",
    "vendor": "vendor",
    "vendors": "vendor",
    "supplier": "vendor",
    "work_center": "work_center",
    "work_centers": "work_center",
    "workcenter": "work_center",
    "operator": "operator",
    "operators": "operator",
    "user": "operator",
    "users": "operator",
    "production_log": "production_log",
    "production_logs": "production_log",
    "machine_live": "machine_live",
    "live_status": "machine_live",
    "shop_floor": "machine_live",
    "quality": "quality",
    "inspection": "quality",
    "breakdown": "breakdown",
    "breakdowns": "breakdown",
    "maintenance": "breakdown",
    "pm": "pm",
    "preventive": "pm",
    "notification": "notification",
    "notifications": "notification",
    "alert": "notification",
    "assembly": "assembly",
    "assemblies": "assembly",
    "outsource": "outsource",
    "outsourced": "outsource",
    "downtime": "downtime",
    "oee": "oee",
    "energy": "energy",
    "ems": "energy",
    "leave": "leave",
    "leaves": "leave",
}

DOMAIN_RULES = """
CRITICAL DOMAIN RULES (do not mix):
1. PARTS (BOM) = oms.parts — part_number / part_name. Linked material via:
   - oms.parts.raw_material_id → inventory.raw_materials (BOM)
   - oms.document_extracted_data (extracted material + planned_raw_material_id)
2. RAW MATERIAL STOCK = inventory.raw_material_stock + raw_material_units
   (EN8, 45C8 bars/pipes) — NOT tools, NOT finished parts list
   Length used for a part = inventory.raw_material_usage.used_length
   (join via unit_id / part_id; parts.raw_material_unit_id when linked)
3. TOOLS = inventory.tools_list — join categories via category_id / sub_category_id
   (NOT a column named category). Link to ops via oms.tools_with_part
4. SCHEDULE for an order = scheduling.planned_schedule_items
   (sale_order_number / sale_order_id) — not oms.orders alone
5. Parts for an order: prefer oms.order_part_priorities; fallback parts via product_id
6. Always schema-qualify tables. Never invent columns (no material_grade, vendor_name, work_centers.name)
7. SELECT only, LIMIT 100 unless counting
"""

# Join recipes: (from_entity, to_entity) -> description + example SQL fragment
JOIN_RECIPES: Dict[str, Dict[str, str]] = {
    "order->part": {
        "description": "Parts on a sale order (priority list, else product BOM)",
        "sql_hint": """
-- Prefer priorities; fallback to product parts
SELECT o.sale_order_number, p.part_number, p.part_name, p.qty, opp.priority
FROM oms.orders o
JOIN oms.order_part_priorities opp ON opp.order_id = o.id
JOIN oms.parts p ON p.id = opp.part_id
WHERE o.sale_order_number ILIKE '%ORDER_NO%'
  AND COALESCE(p.recycle_bin, false) = false
UNION ALL
SELECT o.sale_order_number, p.part_number, p.part_name, p.qty, NULL
FROM oms.orders o
JOIN oms.parts p ON p.product_id = o.product_id
WHERE o.sale_order_number ILIKE '%ORDER_NO%'
  AND COALESCE(p.recycle_bin, false) = false
  AND NOT EXISTS (SELECT 1 FROM oms.order_part_priorities x WHERE x.order_id = o.id)
LIMIT 100
""".strip(),
    },
    "order->raw_material": {
        "description": "Raw material / stock used for parts on a sale order",
        "sql_hint": """
SELECT o.sale_order_number AS order_no, p.part_number, p.part_name,
       COALESCE(rm.material_name, ded.material, prm.material_name) AS raw_material,
       rms.form_type AS stock_form, rms.diameter, rms.length AS stock_length_mm,
       rms.available_quantity, rms.status AS stock_status,
       COALESCE(usage.length_used_mm, 0) AS length_used_mm
FROM oms.orders o
JOIN (
  SELECT opp.order_id, opp.part_id FROM oms.order_part_priorities opp
  UNION
  SELECT o2.id AS order_id, p2.id AS part_id
  FROM oms.orders o2
  JOIN oms.parts p2 ON p2.product_id = o2.product_id
  WHERE NOT EXISTS (
    SELECT 1 FROM oms.order_part_priorities x WHERE x.order_id = o2.id
  )
) oparts ON oparts.order_id = o.id
JOIN oms.parts p ON p.id = oparts.part_id AND COALESCE(p.recycle_bin, false) = false
LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
LEFT JOIN LATERAL (
  SELECT d.material, d.planned_raw_material_id
  FROM oms.document_extracted_data d
  WHERE d.part_id = p.id
  ORDER BY d.updated_at DESC NULLS LAST, d.id DESC
  LIMIT 1
) ded ON TRUE
LEFT JOIN inventory.raw_materials prm ON prm.id = ded.planned_raw_material_id
LEFT JOIN inventory.raw_material_units linked_unit ON linked_unit.id = p.raw_material_unit_id
LEFT JOIN inventory.raw_material_stock rms ON (
  (p.raw_material_unit_id IS NOT NULL AND rms.id = linked_unit.stock_id)
  OR (p.raw_material_unit_id IS NULL
      AND rms.material_id = COALESCE(p.raw_material_id, ded.planned_raw_material_id))
)
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(u.used_length), 0) AS length_used_mm
  FROM inventory.raw_material_usage u
  WHERE u.part_id = p.id
) usage ON TRUE
WHERE UPPER(o.sale_order_number) = UPPER('ORDER_NO')
   OR o.sale_order_number ILIKE 'ORDER_NO%'
   OR o.sale_order_number ILIKE '%ORDER_NO%'
ORDER BY p.part_number, rms.id NULLS LAST
LIMIT 100
""".strip(),
    },
    "part->raw_material": {
        "description": (
            "Raw material for a part: BOM + extracted/planned + stock dimensions, "
            "unit lengths, and length used"
        ),
        "sql_hint": """
SELECT p.part_number, p.part_name,
       rm.material_name AS bom_raw_material,
       ded.material AS extracted_material,
       prm.material_name AS planned_material,
       ded.stock_size AS extracted_stock_size,
       ded.planned_form_type, ded.planned_diameter,
       ded.planned_length, ded.planned_breadth, ded.planned_height,
       rms.form_type AS stock_form, rms.diameter, rms.breadth, rms.height,
       rms.length AS stock_length_mm, rms.inner_diameter, rms.outer_diameter,
       CASE
         WHEN rms.diameter IS NOT NULL
           THEN CONCAT('Dia ', rms.diameter, ' x ', COALESCE(rms.length::text, '?'), 'mm')
         WHEN rms.outer_diameter IS NOT NULL
           THEN CONCAT('Dia ', rms.outer_diameter, '/', COALESCE(rms.inner_diameter::text, '?'),
                       ' x ', COALESCE(rms.length::text, '?'), 'mm')
         WHEN rms.breadth IS NOT NULL OR rms.height IS NOT NULL
           THEN CONCAT(COALESCE(rms.breadth::text, '?'), ' x ', COALESCE(rms.height::text, '?'),
                       ' x ', COALESCE(rms.length::text, '?'), 'mm')
         ELSE COALESCE(ded.stock_size, NULL)
       END AS stock_dimensions,
       rms.quantity AS stock_qty, rms.available_quantity, rms.status AS stock_status,
       ru.id AS unit_id, ru.total_length AS unit_total_length_mm,
       ru.remaining_length AS unit_remaining_length_mm, ru.status AS unit_status,
       usage.length_used_mm
FROM oms.parts p
LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
LEFT JOIN LATERAL (
  SELECT d.material, d.stock_size, d.planned_form_type, d.planned_diameter,
         d.planned_length, d.planned_breadth, d.planned_height, d.planned_raw_material_id
  FROM oms.document_extracted_data d
  WHERE d.part_id = p.id
  ORDER BY d.updated_at DESC NULLS LAST, d.id DESC
  LIMIT 1
) ded ON TRUE
LEFT JOIN inventory.raw_materials prm ON prm.id = ded.planned_raw_material_id
LEFT JOIN inventory.raw_material_units linked_unit ON linked_unit.id = p.raw_material_unit_id
LEFT JOIN inventory.raw_material_stock rms ON (
  (p.raw_material_unit_id IS NOT NULL AND rms.id = linked_unit.stock_id)
  OR (p.raw_material_unit_id IS NULL
      AND rms.material_id = COALESCE(p.raw_material_id, ded.planned_raw_material_id))
)
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(u.used_length), 0) AS length_used_mm,
         (ARRAY_AGG(u.raw_material_unit_id ORDER BY u.used_length DESC NULLS LAST))[1]
           AS preferred_unit_id
  FROM inventory.raw_material_usage u
  WHERE u.part_id = p.id
) usage ON TRUE
LEFT JOIN inventory.raw_material_units ru ON ru.id = COALESCE(
  p.raw_material_unit_id, usage.preferred_unit_id
)
WHERE (p.part_number ILIKE '%PART%' OR p.part_name ILIKE '%PART%')
  AND COALESCE(p.recycle_bin, false) = false
ORDER BY p.part_number, rms.id NULLS LAST
LIMIT 50
""".strip(),
    },
    "part->raw_material_stock": {
        "description": "Warehouse stock dims + units + used length for material linked to a part",
        "sql_hint": """
SELECT p.part_number, p.part_name, rm.material_name,
       rms.form_type, rms.diameter, rms.breadth, rms.height,
       rms.length AS stock_length_mm, rms.inner_diameter, rms.outer_diameter,
       CASE
         WHEN rms.diameter IS NOT NULL
           THEN CONCAT('Dia ', rms.diameter, ' x ', COALESCE(rms.length::text, '?'), 'mm')
         WHEN rms.outer_diameter IS NOT NULL
           THEN CONCAT('Dia ', rms.outer_diameter, '/', COALESCE(rms.inner_diameter::text, '?'),
                       ' x ', COALESCE(rms.length::text, '?'), 'mm')
         WHEN rms.breadth IS NOT NULL OR rms.height IS NOT NULL
           THEN CONCAT(COALESCE(rms.breadth::text, '?'), ' x ', COALESCE(rms.height::text, '?'),
                       ' x ', COALESCE(rms.length::text, '?'), 'mm')
         ELSE NULL
       END AS stock_dimensions,
       rms.quantity, rms.available_quantity, rms.allocated_quantity, rms.status AS stock_status,
       ru.id AS unit_id, ru.total_length AS unit_total_length_mm,
       ru.remaining_length AS unit_remaining_length_mm, ru.status AS unit_status,
       usage.length_used_mm
FROM oms.parts p
LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
LEFT JOIN inventory.raw_material_units linked_unit ON linked_unit.id = p.raw_material_unit_id
LEFT JOIN inventory.raw_material_stock rms ON (
  (p.raw_material_unit_id IS NOT NULL AND rms.id = linked_unit.stock_id)
  OR (p.raw_material_unit_id IS NULL AND rms.material_id = rm.id)
)
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(u.used_length), 0) AS length_used_mm,
         (ARRAY_AGG(u.raw_material_unit_id ORDER BY u.used_length DESC NULLS LAST))[1]
           AS preferred_unit_id
  FROM inventory.raw_material_usage u
  WHERE u.part_id = p.id
) usage ON TRUE
LEFT JOIN inventory.raw_material_units ru ON ru.id = COALESCE(
  p.raw_material_unit_id, usage.preferred_unit_id
)
WHERE (p.part_number ILIKE '%PART%' OR p.part_name ILIKE '%PART%')
  AND COALESCE(p.recycle_bin, false) = false
ORDER BY p.part_number, rms.id NULLS LAST
LIMIT 50
""".strip(),
    },
    "raw_material->raw_material_stock": {
        "description": "Stock rows for a named material (EN8, 45C8, …) with dimensions + units",
        "sql_hint": """
SELECT rm.material_name, rms.form_type, rms.process_type,
       rms.diameter, rms.breadth, rms.height, rms.length AS stock_length_mm,
       rms.inner_diameter, rms.outer_diameter,
       rms.quantity, rms.available_quantity, rms.allocated_quantity, rms.status,
       ru.id AS unit_id, ru.total_length AS unit_total_length_mm,
       ru.remaining_length AS unit_remaining_length_mm, ru.status AS unit_status
FROM inventory.raw_material_stock rms
JOIN inventory.raw_materials rm ON rm.id = rms.material_id
LEFT JOIN inventory.raw_material_units ru ON ru.stock_id = rms.id
WHERE rm.material_name ILIKE '%MATERIAL%'
ORDER BY rm.material_name, rms.form_type, ru.id
LIMIT 100
""".strip(),
    },
    "order->schedule": {
        "description": "Planned schedule / Gantt for a sale order",
        "sql_hint": """
SELECT psi.sale_order_number AS order_no, p.part_name, p.part_number,
       op.operation_number, op.operation_name, m.type AS machine, m.model AS machine_model,
       wc.work_center_name, psi.planned_start_time, psi.planned_end_time,
       psi.total_quantity, psi.remaining_quantity, psi.status AS schedule_status
FROM scheduling.planned_schedule_items psi
JOIN oms.parts p ON p.id = psi.part_id
JOIN oms.operations op ON op.id = psi.operation_id
LEFT JOIN configuration.machines m ON m.id = psi.machine_id
LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
WHERE UPPER(psi.sale_order_number) = UPPER('ORDER_NO')
   OR psi.sale_order_number ILIKE '%ORDER_NO%'
ORDER BY psi.planned_start_time NULLS LAST
LIMIT 100
""".strip(),
    },
    "part->operation": {
        "description": "Operations / routing for a part",
        "sql_hint": """
SELECT p.part_number, p.part_name, op.operation_number, op.operation_name,
       op.setup_time, op.cycle_time, m.type AS machine
FROM oms.parts p
JOIN oms.operations op ON op.part_id = p.id
LEFT JOIN configuration.machines m ON m.id = op.machine_id
WHERE (p.part_number ILIKE '%PART%' OR p.part_name ILIKE '%PART%')
  AND COALESCE(p.recycle_bin, false) = false
ORDER BY op.operation_number
LIMIT 100
""".strip(),
    },
    "operation->tool": {
        "description": "Tools required for an operation / part",
        "sql_hint": """
SELECT p.part_number, op.operation_number, op.operation_name,
       tl.item_description AS tool_name, tl.identification_code, tl.quantity,
       cat.name AS category
FROM oms.operations op
JOIN oms.parts p ON p.id = op.part_id
JOIN oms.tools_with_part twp ON twp.operation_id = op.id
JOIN inventory.tools_list tl ON tl.id = twp.tool_id
LEFT JOIN inventory.categories cat ON cat.id = tl.category_id
WHERE (p.part_number ILIKE '%PART%' OR p.part_name ILIKE '%PART%')
LIMIT 100
""".strip(),
    },
    "order->product": {
        "description": "Product and customer for an order",
        "sql_hint": """
SELECT o.sale_order_number, o.status, o.approval_status, o.quantity, o.due_date,
       pr.product_name, c.company_name AS customer
FROM oms.orders o
JOIN oms.products pr ON pr.id = o.product_id
JOIN configuration.customers c ON c.id = o.customer_id
WHERE o.sale_order_number ILIKE '%ORDER_NO%'
LIMIT 10
""".strip(),
    },
    # --- List templates (agent: get_join_path('list', '<entity>')) ---
    "list->tool": {
        "description": "List tools from inventory.tools_list",
        "sql_hint": """
SELECT tl.item_description AS tool_name, tl.identification_code, tl.quantity,
       cat.name AS category, tl.location, tl.make
FROM inventory.tools_list tl
LEFT JOIN inventory.categories cat ON cat.id = tl.category_id
ORDER BY tl.item_description
LIMIT 50
""".strip(),
    },
    "list->tool_issue": {
        "description": "List tool issues (Inventory Tools Issues screen)",
        "sql_hint": """
SELECT ti.id AS issue_no, tl.item_description AS tool_name, tl.identification_code,
       o.sale_order_number AS project, p.part_name AS part,
       CASE WHEN op.operation_name IS NULL THEN NULL
            WHEN op.operation_number IS NULL THEN op.operation_name
            ELSE CONCAT(op.operation_name, ' #', op.operation_number) END AS operation,
       u.user_name AS issue_raised_by, ti.tool_issue_qty AS issue_qty,
       ti.issue_category, ti.status, ti.created_at AS issue_raised_at
FROM inventory.tool_issues ti
LEFT JOIN inventory.tools_list tl ON tl.id = ti.tool_id
LEFT JOIN inventory.inventory_requests ir ON ir.id = ti.request_id
LEFT JOIN oms.orders o ON o.id = ir.project_id
LEFT JOIN oms.parts p ON p.id = ir.part_id
LEFT JOIN oms.operations op ON op.id = ir.operation_id
LEFT JOIN accesscontrol.access_users u ON u.id = ti.operator_id
ORDER BY ti.created_at DESC NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->inventory_request": {
        "description": "List inventory / tool requests",
        "sql_hint": """
SELECT ir.id AS request_no, tl.item_description AS tool_name, tl.identification_code,
       o.sale_order_number AS project, p.part_name AS part,
       CASE WHEN op.operation_name IS NULL THEN NULL
            WHEN op.operation_number IS NULL THEN op.operation_name
            ELSE CONCAT(op.operation_name, ' #', op.operation_number) END AS operation,
       u.user_name AS requested_by, ir.quantity, ir.status,
       ir.purpose_of_use, ir.created_at AS requested_at
FROM inventory.inventory_requests ir
LEFT JOIN inventory.tools_list tl ON tl.id = ir.tool_id
LEFT JOIN oms.orders o ON o.id = ir.project_id
LEFT JOIN oms.parts p ON p.id = ir.part_id
LEFT JOIN oms.operations op ON op.id = ir.operation_id
LEFT JOIN accesscontrol.access_users u ON u.id = ir.operator_id
ORDER BY ir.created_at DESC NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->return_request": {
        "description": "List inventory return requests",
        "sql_hint": """
SELECT rr.id AS return_no, tl.item_description AS tool_name, tl.identification_code,
       o.sale_order_number AS project, p.part_name AS part,
       u.user_name AS requested_by, rr.total_requested_qty, rr.returned_qty,
       rr.status, rr.created_at AS requested_at
FROM inventory.inventory_return_requests rr
LEFT JOIN inventory.inventory_requests ir ON ir.id = rr.requested_id
LEFT JOIN inventory.tools_list tl ON tl.id = ir.tool_id
LEFT JOIN oms.orders o ON o.id = ir.project_id
LEFT JOIN oms.parts p ON p.id = ir.part_id
LEFT JOIN accesscontrol.access_users u ON u.id = rr.operator_id
ORDER BY rr.created_at DESC NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->raw_material_stock": {
        "description": "List raw material stock rows",
        "sql_hint": """
SELECT rm.material_name, rms.form_type, rms.diameter, rms.length AS stock_length_mm,
       rms.quantity, rms.available_quantity, rms.status AS stock_status
FROM inventory.raw_material_stock rms
JOIN inventory.raw_materials rm ON rm.id = rms.material_id
ORDER BY rm.material_name, rms.form_type
LIMIT 100
""".strip(),
    },
    "list->order": {
        "description": "List sale orders",
        "sql_hint": """
SELECT o.sale_order_number, o.status, o.approval_status, o.quantity, o.due_date,
       pr.product_name, c.company_name AS customer
FROM oms.orders o
LEFT JOIN oms.products pr ON pr.id = o.product_id
LEFT JOIN configuration.customers c ON c.id = o.customer_id
ORDER BY o.id DESC
LIMIT 50
""".strip(),
    },
    "list->part": {
        "description": "List parts (BOM)",
        "sql_hint": """
SELECT p.part_number, p.part_name, p.qty, p.size, pr.product_name,
       rm.material_name AS bom_raw_material
FROM oms.parts p
LEFT JOIN oms.products pr ON pr.id = p.product_id
LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
WHERE COALESCE(p.recycle_bin, false) = false
ORDER BY p.part_number
LIMIT 50
""".strip(),
    },
    "list->product": {
        "description": "List products",
        "sql_hint": """
SELECT pr.product_name, pr.product_version
FROM oms.products pr
ORDER BY pr.product_name
LIMIT 50
""".strip(),
    },
    "list->customer": {
        "description": "List customers",
        "sql_hint": """
SELECT c.company_name AS customer, c.branch, c.email, c.contact_person, c.contact_number
FROM configuration.customers c
ORDER BY c.company_name
LIMIT 50
""".strip(),
    },
    "list->machine": {
        "description": "List machines",
        "sql_hint": """
SELECT m.type, m.make, m.model, wc.work_center_name,
       m.calibration_due_date, m.mhr
FROM configuration.machines m
LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
ORDER BY m.type, m.model
LIMIT 50
""".strip(),
    },
    "list->work_center": {
        "description": "List work centers",
        "sql_hint": """
SELECT wc.code, wc.work_center_name, wc.description, wc.is_schedulable
FROM configuration.work_centers wc
ORDER BY wc.work_center_name
LIMIT 50
""".strip(),
    },
    "list->vendor": {
        "description": "List vendors / suppliers",
        "sql_hint": """
SELECT v.company_name AS vendor
FROM inventory.vendors v
ORDER BY v.company_name
LIMIT 50
""".strip(),
    },
    "list->operator": {
        "description": "List operators / users",
        "sql_hint": """
SELECT u.user_name, u.role, u.center, u.gmail
FROM accesscontrol.access_users u
ORDER BY u.user_name
LIMIT 50
""".strip(),
    },
    "list->production_log": {
        "description": "Recent production / operation execution logs",
        "sql_hint": """
SELECT pl.status, pl.produced_quantity, pl.approved_quantity, pl.rework_quantity,
       pl.rejected_quantity, pl.from_date, pl.to_date,
       op.operation_number, op.operation_name, p.part_number, p.part_name,
       u.user_name AS operator
FROM scheduling.production_logs pl
LEFT JOIN oms.operations op ON op.id = pl.operation_id
LEFT JOIN oms.parts p ON p.id = op.part_id
LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
ORDER BY pl.from_date DESC NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->machine_live": {
        "description": "Shop-floor live machine status",
        "sql_hint": """
SELECT m.type AS machine, m.model, mls.status,
       o.sale_order_number AS current_order,
       p.part_number AS current_part,
       op.operation_name AS current_operation
FROM production_monitoring.machine_live_status mls
JOIN configuration.machines m ON m.id = mls.machine_id
LEFT JOIN oms.orders o ON o.id = mls.current_order_id
LEFT JOIN oms.parts p ON p.id = mls.current_part_id
LEFT JOIN oms.operations op ON op.id = mls.current_operation_id
ORDER BY m.type
LIMIT 50
""".strip(),
    },
    "list->quality": {
        "description": "Stage inspection / quality dimensions",
        "sql_hint": """
SELECT p.part_number, p.part_name, si.op_no, si.dimension_type,
       si.nominal_value, si.uppertol, si.lowertol, si.measured_mean, si.is_done
FROM quality.stage_inspection si
JOIN oms.parts p ON p.id = si.part_id
ORDER BY si.id DESC
LIMIT 50
""".strip(),
    },
    "list->breakdown": {
        "description": "Machine breakdowns / maintenance issues",
        "sql_hint": """
SELECT m.type AS machine, m.model, mb.issue_category, mb.machine_status,
       mb.issue_reason, mb.reported_at, u.user_name AS reported_by
FROM maintenance.machine_breakdown mb
LEFT JOIN configuration.machines m ON m.id = mb.machine_id
LEFT JOIN accesscontrol.access_users u ON u.id = mb.reported_by
ORDER BY mb.reported_at DESC NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->pm": {
        "description": "Preventive maintenance schedule",
        "sql_hint": """
SELECT m.type AS machine, m.model, pms.last_completed_date, pms.next_due_date
FROM configuration.pm_schedule pms
LEFT JOIN configuration.pm_assignment_items pai ON pai.id = pms.assignment_item_id
LEFT JOIN configuration.pm_machine_assignments pma ON pma.id = pai.assignment_id
LEFT JOIN configuration.machines m ON m.id = pma.machine_id
ORDER BY pms.next_due_date NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->notification": {
        "description": "Recent order notifications",
        "sql_hint": """
SELECT o.sale_order_number, onf.mc_is_ack, onf.pc_is_ack, onf.admin_is_ack
FROM notifications.order_notifications onf
JOIN oms.orders o ON o.id = onf.order_id
ORDER BY onf.id DESC
LIMIT 50
""".strip(),
    },
    "list->assembly": {
        "description": "List assemblies",
        "sql_hint": """
SELECT a.assembly_number, a.assembly_name, pr.product_name
FROM oms.assemblies a
LEFT JOIN oms.products pr ON pr.id = a.product_id
WHERE COALESCE(a.recycle_bin, false) = false
ORDER BY a.assembly_number
LIMIT 50
""".strip(),
    },
    "list->outsource": {
        "description": "Outsourced / vendor parts status",
        "sql_hint": """
SELECT o.sale_order_number, p.part_number, p.part_name,
       osp.start_date, osp.to_date, osp.status
FROM oms.out_source_parts_status osp
JOIN oms.parts p ON p.id = osp.part_id
JOIN oms.orders o ON o.id = osp.order_id
ORDER BY osp.id DESC
LIMIT 50
""".strip(),
    },
    "list->downtime": {
        "description": "Machine downtimes",
        "sql_hint": """
SELECT m.type AS machine, m.model, md.start_time, md.end_time,
       md.status_name, md.description
FROM scheduling.machine_downtimes md
JOIN configuration.machines m ON m.id = md.machine_id
ORDER BY md.start_time DESC NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->oee": {
        "description": "Shift OEE summary",
        "sql_hint": """
SELECT m.type AS machine, m.model, ss.shift, ss.oee, ss.availability,
       ss.performance, ss.quality, ss.total_parts, ss.good_parts
FROM production_monitoring.shift_summary ss
JOIN configuration.machines m ON m.id = ss.machine_id
ORDER BY ss.id DESC
LIMIT 50
""".strip(),
    },
    "list->energy": {
        "description": "EMS / energy readings",
        "sql_hint": """
SELECT m.type AS machine, m.model, e.power
FROM ems.machine_ems_live e
JOIN configuration.machines m ON m.id = e.machine_id
ORDER BY m.type
LIMIT 50
""".strip(),
    },
    "list->leave": {
        "description": "Operator leaves",
        "sql_hint": """
SELECT u.user_name AS operator, ol.from_date, ol.to_date, ol.reason, ol.status
FROM accesscontrol.operator_leaves ol
JOIN accesscontrol.access_users u ON u.id = ol.operator_id
ORDER BY ol.from_date DESC NULLS LAST
LIMIT 50
""".strip(),
    },
    "list->schedule": {
        "description": "Recent planned schedule items",
        "sql_hint": """
SELECT psi.sale_order_number AS order_no, p.part_number, p.part_name,
       op.operation_number, op.operation_name, m.type AS machine,
       psi.planned_start_time, psi.planned_end_time,
       psi.total_quantity, psi.remaining_quantity, psi.status AS schedule_status
FROM scheduling.planned_schedule_items psi
JOIN oms.parts p ON p.id = psi.part_id
JOIN oms.operations op ON op.id = psi.operation_id
LEFT JOIN configuration.machines m ON m.id = psi.machine_id
ORDER BY psi.planned_start_time DESC NULLS LAST
LIMIT 50
""".strip(),
    },
}


def normalize_entity(name: str) -> Optional[str]:
    key = (name or "").strip().lower().replace("-", "_").replace(" ", "_")
    return ENTITY_ALIASES.get(key) or ENTITY_ALIASES.get(key.replace("_", ""))


def get_join_recipe(from_entity: str, to_entity: str) -> Optional[Dict[str, str]]:
    src = normalize_entity(from_entity)
    dst = normalize_entity(to_entity)
    if not src or not dst:
        return None
    key = f"{src}->{dst}"
    if key in JOIN_RECIPES:
        return {"key": key, **JOIN_RECIPES[key]}
    # try reverse label only for documentation
    rev = f"{dst}->{src}"
    if rev in JOIN_RECIPES:
        return {"key": rev, **JOIN_RECIPES[rev], "note": "recipe defined in reverse direction"}
    return None


def list_join_keys() -> List[str]:
    return sorted(JOIN_RECIPES.keys())


def relationship_prompt_block() -> str:
    lines = [
        DOMAIN_RULES,
        "",
        "KNOWN JOIN PATHS:",
    ]
    for key, recipe in JOIN_RECIPES.items():
        lines.append(f"- {key}: {recipe['description']}")
    return "\n".join(lines)

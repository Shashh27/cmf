import os
import re
import json
import redis
import decimal
import datetime
import asyncio
from collections import Counter
from typing import Dict, List, Any, Tuple, AsyncGenerator
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from sqlalchemy import text
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from DB.database import engine
from DB.models.chatbot import ChatRequest, ChatResponse


# ══════════════════════════════════════════════════════════════════════════════
# JSON ENCODER — handles datetime, date, time, Decimal, UUID etc. returned by
# SQLAlchemy/psycopg2 rows. Without this, json.dumps() raises:
#   TypeError: Object of type datetime is not JSON serializable
# ══════════════════════════════════════════════════════════════════════════════

class CMFJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime.datetime, datetime.date, datetime.time)):
            return obj.isoformat()
        if isinstance(obj, datetime.timedelta):
            return str(obj)
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        try:
            import uuid
            if isinstance(obj, uuid.UUID):
                return str(obj)
        except ImportError:
            pass
        return super().default(obj)


def json_dumps(obj) -> str:
    """Safe JSON dump for SQL rows containing datetime/Decimal/UUID."""
    return json.dumps(obj, cls=CMFJSONEncoder)


def clean_row(row: dict) -> dict:
    """
    Convert a single SQL result row's values into JSON-safe Python types
    (datetime -> ISO string, Decimal -> float, etc). Used before sending
    data to the frontend AND before format_answer() processes it.
    """
    cleaned = {}
    for k, v in row.items():
        if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
            cleaned[k] = v.isoformat()
        elif isinstance(v, datetime.timedelta):
            cleaned[k] = str(v)
        elif isinstance(v, decimal.Decimal):
            cleaned[k] = float(v)
        else:
            cleaned[k] = v
    return cleaned


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — SCHEMA CONTEXT (hardcoded, verified against actual backup data)
#
# CONFIRMED RELATIONSHIP CHAIN (this is the core of the algorithm):
#
#   oms.orders (id, product_id, ...)
#        ↓ product_id
#   oms.products (id, product_name)
#        ↓ (via oms.order_part_priorities: order_id + product_id -> part_id)
#   oms.order_part_priorities (order_id, product_id, part_id, priority)  -- NO status col
#        ↓ part_id
#   oms.parts (id, part_name, part_number, ...)
#        ↓ part_id
#   oms.operations (id, part_id, operation_name, operation_number, ...)
#        ↓ part_id + sale_order_id
#   scheduling.part_schedule_status (part_id, sale_order_id, status, start_date)
#
# order_part_priorities is the JUNCTION table — without it you get ALL parts
# that share a product_id (often 100+), not just the ones selected for THIS order.
# ══════════════════════════════════════════════════════════════════════════════

CMF_SCHEMA_CONTEXT = """
PostgreSQL manufacturing database (CMF). Key tables and VERIFIED relationships:

oms.orders(id, sale_order_number, project_name, customer_id, product_id, quantity, due_date, status, order_date, approval_status, approval_remarks, approved_at, user_id, project_coordinator_id, admin_id, manufacturing_coordinator_id, created_at, updated_at)
  -- sale_order_number is the human-readable order identifier (e.g. 'SO-001'). project_name is an optional label.
  -- status values examples: 'In Progress', 'Completed', 'Pending', 'Cancelled'
  -- approval_status: 'Pending Approval', 'Approved', 'Rejected'

oms.products(id, product_name, product_version, user_id, created_at, updated_at)

oms.order_part_priorities(id, order_id, product_id, part_id, priority, status, created_at, updated_at)
  -- THIS IS THE JUNCTION TABLE linking an order to its specific prioritized parts.
  -- priority is an integer (lower = higher priority). status: active/inactive.
  -- Rows only exist AFTER scheduling is done for an order.

oms.parts(id, part_name, part_number, type_id, raw_material_id, assembly_id, product_id, part_detail, qty, vendor_id, size, raw_material_unit_id, required_length, created_at, updated_at)
  -- part_detail: 'WITH_RAW_MATERIAL' | 'WITHOUT_RAW_MATERIAL' (for outsourced parts)

oms.operations(id, operation_number, operation_name, setup_time, cycle_time, workcenter_id, part_id, machine_id, work_instructions, notes, part_type_id, from_date, to_date, vendor_id, created_at, updated_at)

oms.assemblies(id, assembly_name, assembly_number, product_id, parent_id, created_at, updated_at)

scheduling.part_schedule_status(id, part_id, sale_order_id, status, start_date, created_at, updated_at)
  -- sale_order_id references oms.orders.id
  -- status: 'active', 'inactive', 'completed', 'pending'

scheduling.operation_status(id, order_id, part_id, operation_id, status, started_at, completed_at, operator_id, created_at, updated_at)
  -- status: 'pending', 'in_progress', 'completed'

scheduling.machine_schedule(id, order_id, part_id, operation_id, machine_id, start_time, end_time, status, created_at, updated_at)
scheduling.machine_status(id, machine_id, status, created_at, updated_at)
scheduling.production_logs(id, operation_id, operator_id, supervisor_id, notes, remarks, from_date, from_time, to_date, to_time, status, produced_quantity, approved_quantity, rework_quantity, rejected_quantity, remaining_quantity_to_be_produced, operator_status, created_at)
  -- status values: 'inprogress' (NO underscore), 'completed'
  -- This is the PRIMARY source for operation execution data. scheduling.operation_status is often empty.

configuration.customers(id, company_name, address, branch, email, contact_number, contact_person, created_at, updated_at)
configuration.machines(id, work_center_id, type, make, model, year_of_installation, calibration_date, calibration_due_date, cnc_controller, mhr)
configuration.work_centers(id, code, work_center_name, description, is_schedulable)
  -- NOTE: column is work_center_name NOT name

inventory.tools_list(id, item_description, range, identification_code, make, quantity, total_quantity, location, type, issues_qty, category, sub_category)
  -- type: 'CONSUMABLES' | 'NON-CONSUMABLES'. category and sub_category are plain text strings (NOT FK ids).
inventory.tool_issues(id, tool_id, request_id, tool_issue_qty, operator_id, status, issue_category, description, remarks, created_at, updated_at)
inventory.raw_materials(id, material_name, density, cost_per_kg, user_id, created_at, updated_at)
  -- NO material_grade column. density in kg/m³, cost_per_kg in currency.
inventory.raw_material_stock(id, material_id, process_type, form_type, diameter, length, breadth, height, quantity, status, source_type, source_order_id, order_status, allocated_quantity, available_quantity, cost, created_at, updated_at)
  -- form_type: 'Round'|'Square'|'Pipe'. source_type: 'general'|'order'. status: 'available'|'exhausted'
  -- material_id FK -> inventory.raw_materials.id
inventory.vendors(id, company_name, created_at, updated_at)
  -- ONLY has company_name. NO vendor_name, contact_person, email, phone columns.

maintenance.machine_breakdown(id, machine_id, reported_by, issue_category, machine_status, issue_reason, additional_reason, reported_at)

quality.stage_inspection(id, user_id, part_id, sale_order_id, nominal_value, uppertol, lowertol, zone, dimension_type, measured_1, measured_2, measured_3, measured_mean, op_no, is_done, created_at)

production_monitoring.machine_live_status(id, machine_id, status, last_updated, current_order_id, current_part_id, current_operation_id)

accesscontrol.access_users(id, user_name, gmail, role, center, "group", password, createdAt, updatedAt)
accesscontrol.operator_leaves(id, operator_id, from_date, to_date, reason, additional_remarks, status, created_at, updated_at)
  -- NO leave_date or leave_type columns. status: 'pending'|'acknowledged'|'rejected'

═══ THE CORE CHAIN — ORDER → PRODUCT → PARTS → OPERATIONS → SCHEDULE ═══
1. oms.orders.product_id = oms.products.id
2. oms.order_part_priorities.order_id = oms.orders.id  AND  oms.order_part_priorities.product_id = oms.orders.product_id
3. oms.order_part_priorities.part_id = oms.parts.id
4. oms.operations.part_id = oms.parts.id
5. scheduling.part_schedule_status.part_id = oms.parts.id  AND  scheduling.part_schedule_status.sale_order_id = oms.orders.id
6. scheduling.operation_status.operation_id = oms.operations.id  AND  scheduling.operation_status.order_id = oms.orders.id

OTHER RELATIONSHIPS:
- oms.orders.customer_id = configuration.customers.id
- inventory.tool_issues.tool_id = inventory.tools_list.id
- inventory.tool_issues.operator_id = accesscontrol.access_users.id
- maintenance.machine_breakdown.machine_id = configuration.machines.id
- quality.stage_inspection.part_id = oms.parts.id AND quality.stage_inspection.sale_order_id = oms.orders.id
- production_monitoring.machine_live_status.machine_id = configuration.machines.id
- configuration.machines.work_center_id = configuration.work_centers.id

=== CRITICAL RULE -- "PARTS FOR ORDER X" (or "components", "items", "BOM",
"what's in order X", or any phrasing asking for the parts of an order) ===

An order can be in TWO states:
  - SCHEDULED  -> oms.order_part_priorities HAS rows for this order_id.
                  These are the prioritized parts actually selected for
                  production, with live schedule status.
  - NOT SCHEDULED yet -> oms.order_part_priorities has NO rows for this order_id.
                  Fall back to ALL parts of the order's product via
                  oms.parts.product_id = oms.orders.product_id (no schedule
                  info available yet).

ALWAYS use this exact UNION ALL template for "parts for order X" style questions
(replace <ORDER_ID> with the actual order id):

SELECT p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
       opp.priority,
       pss.status AS schedule_status, pss.start_date
FROM oms.order_part_priorities opp
JOIN oms.parts p ON p.id = opp.part_id
LEFT JOIN scheduling.part_schedule_status pss
       ON pss.part_id = p.id AND pss.sale_order_id = opp.order_id
WHERE opp.order_id = <ORDER_ID>

UNION ALL

SELECT p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
       NULL AS priority,
       NULL AS schedule_status, NULL AS start_date
FROM oms.orders o
JOIN oms.parts p ON p.product_id = o.product_id
WHERE o.id = <ORDER_ID>
  AND NOT EXISTS (
      SELECT 1 FROM oms.order_part_priorities opp2
      WHERE opp2.order_id = o.id
  )

ORDER BY priority ASC NULLS LAST

Apply the SAME two-stage pattern (try order_part_priorities first, fall back to
parts.product_id) for "operations for order X" by joining oms.operations to
whichever part set applies.

SYNONYMS / USER QUERY GUIDE:
- 'sale order number', 'SO number', 'order number' -> o.sale_order_number (text search with ILIKE)
- 'project name', 'job name' -> o.project_name (optional label on order) OR o.sale_order_number OR p.product_name
- 'product' / 'machine name' -> oms.products.product_name
- 'customer' / 'company' -> configuration.customers.company_name
- 'operator' / 'worker' -> accesscontrol.access_users.user_name where role = 'Operator'
- 'work center' / 'workcenter' -> configuration.work_centers.work_center_name
- 'pieces'/'components'/'items'/'BOM' -> oms.parts
- 'job'/'sale order'/'work order' -> oms.orders
- 'steps'/'processes'/'machining steps' -> oms.operations
- 'machines'/'equipment'/'CNC' -> configuration.machines
"""


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — INSTANT PATTERN MATCHING (0 LLM calls — sub-second response)
# Covers the most common question shapes using the VERIFIED chain above.
# ══════════════════════════════════════════════════════════════════════════════

def _first_group(m: "re.Match") -> str:
    """Return the first non-None captured group (the order ID)."""
    for g in m.groups():
        if g and g.isdigit():
            return g
    return "0"


def PARTS_FOR_ORDER_SQL(order_id: str) -> str:
    """
    Two-stage SQL: prioritized+scheduled parts if order_part_priorities has rows,
    otherwise fall back to all parts of the order's product (pre-scheduling BOM).
    Reusable by both the regex fast-path and the LLM-fallback safety net.
    """
    return f"""
        SELECT o.sale_order_number,
               p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
               opp.priority, opp.status AS priority_status,
               pss.status AS schedule_status, pss.start_date
        FROM oms.order_part_priorities opp
        JOIN oms.orders o ON o.id = opp.order_id
        JOIN oms.parts p ON p.id = opp.part_id
        LEFT JOIN scheduling.part_schedule_status pss
            ON pss.part_id = p.id AND pss.sale_order_id = opp.order_id
        WHERE opp.order_id = {order_id}

        UNION ALL

        SELECT o.sale_order_number,
               p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
               NULL AS priority, NULL AS priority_status,
               NULL AS schedule_status, NULL AS start_date
        FROM oms.orders o
        JOIN oms.parts p ON p.product_id = o.product_id
        WHERE o.id = {order_id}
          AND NOT EXISTS (
              SELECT 1 FROM oms.order_part_priorities opp2
              WHERE opp2.order_id = o.id
          )

        ORDER BY priority ASC NULLS LAST
    """


def OPERATIONS_FOR_ORDER_SQL(order_id: str) -> str:
    """Operations SQL: shows all product operations with scheduled flag, uses production_logs."""
    return f"""
        SELECT o.sale_order_number,
               p.part_name, p.part_number,
               op.operation_number, op.operation_name,
               op.setup_time, op.cycle_time,
               opp.priority,
               CASE WHEN opp.id IS NOT NULL THEN 'scheduled' ELSE 'not_scheduled' END AS schedule_status,
               pl.status AS operation_status,
               pl.from_date, pl.to_date,
               u.user_name AS operator,
               pl.produced_quantity, pl.approved_quantity
        FROM oms.orders o
        JOIN oms.parts p ON p.product_id = o.product_id
        JOIN oms.operations op ON op.part_id = p.id
        LEFT JOIN oms.order_part_priorities opp ON opp.order_id = o.id AND opp.part_id = p.id
        LEFT JOIN scheduling.production_logs pl ON pl.operation_id = op.id
        LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
        WHERE o.id = {order_id}
        ORDER BY opp.priority ASC NULLS LAST, p.part_name, op.operation_number
    """


QUICK_SQL_PATTERNS = [

    # ── PARTS FOR ORDER by sale_order_number text e.g. "parts for SO-001" or "parts for order PO111333444"
    # MUST come before generic order lookup to prevent order lookup from matching first
    # Shows ALL parts from the product, with scheduled flag indicating which are in order_part_priorities
    (
        r"(?:part|component|item|bom|piece).*?(?:order|so)[\s\-#]*([A-Za-z]{1,3}[-\s]?\d+|[A-Za-z]{1,3}\d+)|(?:order|so)[\s\-#]*([A-Za-z]{1,3}[-\s]?\d+|[A-Za-z]{1,3}\d+).*(?:part|component|item|bom|piece)",
        lambda m: f"""
            SELECT o.sale_order_number,
                   p.id AS part_id, p.part_name, p.part_number, p.size, p.qty,
                   opp.priority,
                   CASE WHEN opp.id IS NOT NULL THEN 'scheduled' ELSE 'not_scheduled' END AS schedule_status,
                   pss.status AS part_schedule_status, pss.start_date
            FROM oms.orders o
            JOIN oms.parts p ON p.product_id = o.product_id
            LEFT JOIN oms.order_part_priorities opp ON opp.order_id = o.id AND opp.part_id = p.id
            LEFT JOIN scheduling.part_schedule_status pss
                   ON pss.part_id = p.id AND pss.sale_order_id = o.id
            WHERE UPPER(o.sale_order_number) = UPPER('{(m.group(1) or m.group(2)).strip()}')
            ORDER BY opp.priority ASC NULLS LAST, p.part_name
        """
    ),

    # ── OPERATIONS FOR ORDER by sale_order_number text
    # Uses production_logs since operation_status table is often empty
    # MUST come BEFORE generic order lookup to prevent order lookup from matching first
    (
        r"operation.*?(?:order|so)[\s\-#]*([A-Za-z]{1,3}[-\s]?\d+|[A-Za-z]{1,3}\d+)|(?:order|so)[\s\-#]*([A-Za-z]{1,3}[-\s]?\d+|[A-Za-z]{1,3}\d+).*operation",
        lambda m: f"""
            SELECT o.sale_order_number,
                   p.part_name, p.part_number,
                   op.operation_number, op.operation_name,
                   op.setup_time, op.cycle_time,
                   opp.priority,
                   pl.status AS operation_status,
                   pl.from_date, pl.to_date,
                   u.user_name AS operator,
                   pl.produced_quantity, pl.approved_quantity
            FROM oms.orders o
            JOIN oms.order_part_priorities opp ON opp.order_id = o.id
            JOIN oms.parts p ON p.id = opp.part_id
            JOIN oms.operations op ON op.part_id = p.id
            LEFT JOIN scheduling.production_logs pl
                ON pl.operation_id = op.id
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            WHERE UPPER(o.sale_order_number) = UPPER('{(m.group(1) or m.group(2)).strip()}')
            ORDER BY opp.priority ASC NULLS LAST, p.part_name, op.operation_number
        """
    ),

    # ── ORDER LOOKUP BY SALE ORDER NUMBER (text) e.g. "show order SO-001" / "details of SO-042"
    # MUST come AFTER parts/operations for order patterns to prevent matching first
    (
        r"(?:order|so)[\s\-#]*([A-Za-z]{1,3}[-\s]?\d+)|sale\s*order\s*(?:number\s*)?([A-Za-z]{0,3}[-\s]?\d+)",
        lambda m: f"""
            SELECT
                o.id, o.sale_order_number, o.project_name, o.status, o.approval_status,
                o.quantity, o.due_date, o.order_date,
                c.company_name AS customer,
                pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE UPPER(o.sale_order_number) = UPPER('{(m.group(1) or m.group(2)).strip()}')
               OR o.sale_order_number ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
        """
    ),

    # ── PARTS FOR ORDER by numeric ID
    (
        r"order\s*#?(\d+).*(?:part|component|item|bom|piece|material)|"
        r"(?:part|component|item|bom|piece|material).*order\s*#?(\d+)|"
        r"(?:what|which|list|show).*(?:in|for|of)\s*order\s*#?(\d+)",
        lambda m: PARTS_FOR_ORDER_SQL(_first_group(m))
    ),

    # ── OPERATIONS FOR ORDER by numeric ID
    (
        r"order\s*#?(\d+).*\boperation|\boperation.*order\s*#?(\d+)",
        lambda m: OPERATIONS_FOR_ORDER_SQL(_first_group(m))
    ),

    # ── ORDER DETAILS by numeric ID (MUST come AFTER more-specific order patterns above)
    (
        r"order\s*#?(\d+)",
        lambda m: f"""
            SELECT
                o.id, o.sale_order_number, o.status, o.approval_status,
                o.quantity, o.due_date, o.order_date,
                c.company_name AS customer,
                pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE o.id = {m.group(1)}
        """
    ),

    # ── SEARCH ORDERS BY PRODUCT NAME e.g. "orders for product DMU60" / "DMU60 orders"
    (
        r"order.*\bproduct\b.*?([\w\d\-/]+(?:\s+[\w\d\-/]+){0,3})|\bproduct\b.*?([\w\d\-/]+(?:\s+[\w\d\-/]+){0,3}).*order",
        lambda m: f"""
            SELECT o.id, o.sale_order_number, o.status, o.quantity, o.due_date,
                   c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE pr.product_name ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
            ORDER BY o.created_at DESC LIMIT 50
        """
    ),

    # ── SEARCH ORDERS BY CUSTOMER NAME e.g. "orders from Tata" / "Tata orders"
    (
        r"order.*\bcustomer\b.*?([\w\d\s\-]+?)\s*$|orders\s+(?:from|by|for)\s+([\w\d\s\-]+?)\s*$",
        lambda m: f"""
            SELECT o.id, o.sale_order_number, o.status, o.quantity, o.due_date,
                   c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE c.company_name ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
            ORDER BY o.created_at DESC LIMIT 50
        """
    ),

    # ── ALL ORDERS / LIST ORDERS
    (
        r"\ball\s+order|list.*\border|order.*\blist|show.*\border|all\s+sale\s+order",
        lambda _: """
            SELECT
                o.id, o.sale_order_number, o.status, o.approval_status,
                o.quantity, o.due_date,
                c.company_name AS customer,
                pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            ORDER BY o.created_at DESC
            LIMIT 50
        """
    ),

    # ── OVERDUE ORDERS
    (
        r"\boverdue",
        lambda _: """
            SELECT o.id, o.sale_order_number, o.due_date, o.status,
                   c.company_name AS customer, pr.product_name
            FROM oms.orders o
            JOIN configuration.customers c ON c.id = o.customer_id
            JOIN oms.products pr ON pr.id = o.product_id
            WHERE o.due_date < NOW() AND o.status NOT IN ('Completed','Cancelled')
            ORDER BY o.due_date ASC
            LIMIT 50
        """
    ),

    # ── PARTS BY NAME e.g. "show part flange" / "find part housing"
    (
        r"(?:show|find|search|get|list)\s+part\s+([\w\d\s\-/]+?)\s*$|part\s+(?:named?|called)\s+([\w\d\s\-/]+?)\s*$",
        lambda m: f"""
            SELECT p.id, p.part_name, p.part_number, p.size, p.qty,
                   pt.type_name, rm.material_name AS raw_material,
                   pr.product_name, a.assembly_name
            FROM oms.parts p
            LEFT JOIN oms.part_types pt ON pt.id = p.type_id
            LEFT JOIN inventory.raw_materials rm ON rm.id = p.raw_material_id
            LEFT JOIN oms.products pr ON pr.id = p.product_id
            LEFT JOIN oms.assemblies a ON a.id = p.assembly_id
            WHERE p.part_name ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
               OR p.part_number ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
            ORDER BY p.part_name LIMIT 50
        """
    ),

    # ── OPERATIONS FOR PART BY NAME e.g. "operations for part flange"
    (
        r"operation.*part\s+([\w\d\s\-/]+?)\s*$|part\s+([\w\d\s\-/]+?).*operation",
        lambda m: f"""
            SELECT p.part_name, p.part_number,
                   op.operation_number, op.operation_name,
                   op.setup_time, op.cycle_time,
                   wc.work_center_name, m.type AS machine_type
            FROM oms.parts p
            JOIN oms.operations op ON op.part_id = p.id
            LEFT JOIN configuration.work_centers wc ON wc.id = op.workcenter_id
            LEFT JOIN configuration.machines m ON m.id = op.machine_id
            WHERE p.part_name ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
               OR p.part_number ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
            ORDER BY p.part_name, op.operation_number LIMIT 100
        """
    ),

    # ── PENDING OPERATIONS
    # operation_status table may be empty — fall back to production_logs with status 'pending'
    (
        r"\bpending\b.*\boperation|operation.*\bpending",
        lambda _: """
            SELECT pl.id, op.operation_name, op.operation_number,
                   p.part_name, o.sale_order_number,
                   pl.status, pl.from_date,
                   u.user_name AS operator,
                   pl.produced_quantity, pl.approved_quantity
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN oms.orders o ON o.id = (
                SELECT os2.order_id FROM scheduling.operation_status os2
                WHERE os2.operation_id = pl.operation_id LIMIT 1
            )
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            WHERE pl.status NOT IN ('completed', 'inprogress')
            ORDER BY pl.created_at DESC
            LIMIT 50
        """
    ),

    # ── IN-PROGRESS OPERATIONS
    # production_logs uses 'inprogress' (no underscore). operation_status table is often empty.
    (
        r"\bin.?progress\b.*\boperation|operation.*\bin.?progress",
        lambda _: """
            SELECT pl.id, op.operation_name, op.operation_number,
                   p.part_name, o.sale_order_number,
                   pl.status, pl.from_date, pl.to_date,
                   u.user_name AS operator,
                   pl.produced_quantity, pl.approved_quantity
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN oms.orders o ON o.id = (
                SELECT os2.order_id FROM scheduling.operation_status os2
                WHERE os2.operation_id = pl.operation_id LIMIT 1
            )
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            WHERE pl.status = 'inprogress'
            ORDER BY pl.created_at DESC
            LIMIT 50
        """
    ),

    # ── ALL OPERATIONS / SHOW OPERATIONS
    (
        r"\ball\s+operation|list.*\boperation|show.*\boperation",
        lambda _: """
            SELECT pl.id, op.operation_name, op.operation_number,
                   p.part_name, o.sale_order_number,
                   pl.status, pl.from_date, pl.to_date,
                   u.user_name AS operator,
                   pl.produced_quantity, pl.approved_quantity
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN oms.orders o ON o.id = (
                SELECT os2.order_id FROM scheduling.operation_status os2
                WHERE os2.operation_id = pl.operation_id LIMIT 1
            )
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            ORDER BY pl.created_at DESC
            LIMIT 50
        """
    ),

    # ── PRODUCTION LOGS
    (
        r"production.*log|log.*production",
        lambda _: """
            SELECT pl.id, op.operation_name, op.operation_number,
                   p.part_name,
                   u.user_name AS operator,
                   pl.from_date, pl.to_date, pl.status,
                   pl.produced_quantity, pl.approved_quantity,
                   pl.rework_quantity, pl.rejected_quantity, pl.notes
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN accesscontrol.access_users u ON u.id = pl.operator_id
            ORDER BY pl.created_at DESC
            LIMIT 50
        """
    ),

    # ── MACHINE BREAKDOWNS
    (
        r"\bbreakdown|machine.*\bdown|down.*\bmachine",
        lambda _: """
            SELECT mb.id, m.type AS machine_type, m.model,
                   mb.issue_category, mb.machine_status,
                   mb.issue_reason, mb.reported_at,
                   u.user_name AS reported_by
            FROM maintenance.machine_breakdown mb
            JOIN configuration.machines m ON m.id = mb.machine_id
            LEFT JOIN accesscontrol.access_users u ON u.id = mb.reported_by
            ORDER BY mb.reported_at DESC
            LIMIT 30
        """
    ),

    # ── TOOLS ISSUED TO OPERATOR by ID
    (
        r"tool.*\boperator\s*#?(\d+)|operator\s*#?(\d+).*tool",
        lambda m: f"""
            SELECT ti.id, tl.item_description AS tool_name, tl.identification_code,
                   ti.tool_issue_qty, ti.status, ti.created_at
            FROM inventory.tool_issues ti
            JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            WHERE ti.operator_id = {m.group(1) or m.group(2)}
            ORDER BY ti.created_at DESC
        """
    ),

    # ── TOOLS ISSUED TO OPERATOR BY NAME e.g. "tools for operator Ravi"
    (
        r"tool.*\boperator\b.*?([A-Za-z][\w\s]+?)\s*$|operator\b.*?([A-Za-z][\w\s]+?)\s*.*tool",
        lambda m: f"""
            SELECT ti.id, tl.item_description AS tool_name, tl.identification_code,
                   ti.tool_issue_qty, ti.status, ti.created_at,
                   u.user_name AS operator
            FROM inventory.tool_issues ti
            JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            JOIN accesscontrol.access_users u ON u.id = ti.operator_id
            WHERE u.user_name ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
            ORDER BY ti.created_at DESC
        """
    ),

    # ── TOOL ISSUES / TOOLS ISSUED (general)
    # Use LEFT JOIN on tools_list — tool_id FK may not always resolve (data integrity)
    (
        r"tool.*\bissue|issue.*\btool",
        lambda _: """
            SELECT ti.id,
                   COALESCE(tl.item_description, 'Tool ID: ' || ti.tool_id::text) AS tool_name,
                   tl.identification_code,
                   ti.tool_issue_qty, ti.status, ti.issue_category,
                   u.user_name AS operator, ti.created_at
            FROM inventory.tool_issues ti
            LEFT JOIN inventory.tools_list tl ON tl.id = ti.tool_id
            LEFT JOIN accesscontrol.access_users u ON u.id = ti.operator_id
            ORDER BY ti.created_at DESC
            LIMIT 30
        """
    ),

    # ── MACHINE LIVE STATUS
    (
        r"machine.*\blive|live.*\bmachine|machine.*\bstatus",
        lambda _: """
            SELECT m.type, m.model, mls.status,
                   mls.last_updated, mls.current_order_id
            FROM production_monitoring.machine_live_status mls
            JOIN configuration.machines m ON m.id = mls.machine_id
            ORDER BY m.type
        """
    ),

    # ── ALL MACHINES / LIST MACHINES
    (
        r"\ball\s+machine|list.*\bmachine|show.*\bmachine",
        lambda _: """
            SELECT m.id, m.type, m.make, m.model, m.year_of_installation,
                   m.calibration_due_date, m.mhr,
                   wc.work_center_name
            FROM configuration.machines m
            LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
            ORDER BY m.type
        """
    ),

    # ── WORK CENTERS
    (
        r"\bwork\s*center|\bworkcenter",
        lambda _: """
            SELECT wc.id, wc.code, wc.work_center_name, wc.description, wc.is_schedulable,
                   COUNT(m.id) AS machine_count
            FROM configuration.work_centers wc
            LEFT JOIN configuration.machines m ON m.work_center_id = wc.id
            GROUP BY wc.id, wc.code, wc.work_center_name, wc.description, wc.is_schedulable
            ORDER BY wc.work_center_name
        """
    ),

    # ── QUALITY INSPECTION FOR ORDER by numeric ID
    (
        r"(?:quality|inspection).*order\s*#?(\d+)|order\s*#?(\d+).*(?:quality|inspection)",
        lambda m: f"""
            SELECT si.op_no, p.part_name, si.dimension_type,
                   si.nominal_value, si.uppertol, si.lowertol,
                   si.measured_mean, si.is_done, si.created_at
            FROM quality.stage_inspection si
            JOIN oms.parts p ON p.id = si.part_id
            WHERE si.sale_order_id = {_first_group(m)}
            ORDER BY si.op_no
        """
    ),

    # ── STOCK FOR A SPECIFIC NAMED MATERIAL
    # Handles: "stock of 45C8", "45C8 stock", "how many 45C8 stock",
    #          "stock inside raw material 45C8", "stock for EN8", "EN31 available quantity"
    (
        r"(?:stock|stocks|quantity|how\s+many|available).*?(?:raw\s+material\s+|material\s+|of\s+|for\s+|in\s+)?([A-Za-z0-9][A-Za-z0-9\-/]+(?:\s+[A-Za-z0-9\-/]+){0,2})\s*$|"
        r"([A-Za-z0-9][A-Za-z0-9\-/]+(?:\s+[A-Za-z0-9\-/]+){0,2})\s+(?:stock|stocks|quantity|available)",
        lambda m: f"""
            SELECT rm.material_name, rms.form_type, rms.process_type,
                   rms.diameter, rms.length, rms.breadth, rms.height,
                   rms.quantity, rms.available_quantity, rms.allocated_quantity,
                   rms.status, rms.source_type, rms.cost
            FROM inventory.raw_material_stock rms
            JOIN inventory.raw_materials rm ON rm.id = rms.material_id
            WHERE rm.material_name ILIKE '%{(m.group(1) or m.group(2)).strip()}%'
            ORDER BY rms.form_type, rms.status
        """
    ),

    # ── ALL RAW MATERIAL STOCK (generic "show all stock" / "raw material stock")
    (
        r"(?:all\s+)?raw\s*material\s*stock|stock.*raw\s*material|show\s+(?:all\s+)?stock",
        lambda _: """
            SELECT rm.material_name, rms.form_type, rms.process_type,
                   rms.diameter, rms.length, rms.quantity,
                   rms.available_quantity, rms.allocated_quantity,
                   rms.status, rms.source_type, rms.cost
            FROM inventory.raw_material_stock rms
            JOIN inventory.raw_materials rm ON rm.id = rms.material_id
            ORDER BY rm.material_name, rms.form_type
            LIMIT 50
        """
    ),

    # ── RAW MATERIALS master list (only when no specific material or stock keyword)
    (
        r"\braw\s*material(?!.*stock)|material.*\blist",
        lambda _: """
            SELECT rm.id, rm.material_name, rm.density, rm.cost_per_kg,
                   rm.created_at
            FROM inventory.raw_materials rm
            ORDER BY rm.material_name
            LIMIT 50
        """
    ),

    # ── VENDORS
    (
        r"\bvendor|\bsupplier",
        lambda _: """
            SELECT v.id, v.company_name
            FROM inventory.vendors v
            ORDER BY v.company_name
            LIMIT 50
        """
    ),

    # ── CUSTOMERS / LIST CUSTOMERS
    (
        r"\bcustomer|\bclient",
        lambda _: """
            SELECT c.id, c.company_name, c.branch, c.contact_person,
                   c.email, c.contact_number
            FROM configuration.customers c
            ORDER BY c.company_name
            LIMIT 50
        """
    ),

    # ── OPERATORS / LIST OPERATORS
    (
        r"\ball\s+operator|list.*\boperator|show.*\boperator|\boperator\s+list",
        lambda _: """
            SELECT u.id, u.user_name, u.role, u.center, u."group"
            FROM accesscontrol.access_users u
            WHERE u.role ILIKE '%operator%'
            ORDER BY u.user_name
        """
    ),

    # ── ALL PRODUCTS
    (
        r"\ball\s+product|list.*\bproduct|show.*\bproduct",
        lambda _: """
            SELECT p.id, p.product_name, p.product_version, p.created_at
            FROM oms.products p
            ORDER BY p.product_name
            LIMIT 50
        """
    ),

    # ── OPERATOR LEAVES
    (
        r"\bleave|\babsent|\boperator.*leave|leave.*operator",
        lambda _: """
            SELECT ol.id, u.user_name AS operator,
                   ol.from_date, ol.to_date, ol.reason,
                   ol.status, ol.created_at
            FROM accesscontrol.operator_leaves ol
            JOIN accesscontrol.access_users u ON u.id = ol.operator_id
            ORDER BY ol.from_date DESC
            LIMIT 50
        """
    ),

    # ── SCHEDULE STATUS FOR ALL PARTS IN AN ORDER (by numeric ID)
    (
        r"schedule.*order\s*#?(\d+)|order\s*#?(\d+).*schedule",
        lambda m: f"""
            SELECT p.part_name, p.part_number,
                   pss.status AS schedule_status,
                   pss.start_date,
                   opp.priority
            FROM oms.order_part_priorities opp
            JOIN oms.parts p ON p.id = opp.part_id
            LEFT JOIN scheduling.part_schedule_status pss
                   ON pss.part_id = p.id AND pss.sale_order_id = opp.order_id
            WHERE opp.order_id = {_first_group(m)}
            ORDER BY opp.priority ASC
        """
    ),
]


def try_quick_pattern(question: str):
    """Returns (sql, True) on match, else (None, False). Zero LLM calls."""
    q = question.lower()
    for pattern, sql_fn in QUICK_SQL_PATTERNS:
        m = re.search(pattern, q, re.IGNORECASE)
        if m:
            try:
                return sql_fn(m).strip(), True
            except Exception:
                continue
    return None, False


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — SQL VALIDATOR
# ══════════════════════════════════════════════════════════════════════════════

class SQLValidator:
    FORBIDDEN = re.compile(
        r'\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE)\b',
        re.IGNORECASE
    )

    @classmethod
    def validate(cls, sql: str) -> Tuple[bool, str]:
        s = sql.strip()
        if not s.upper().startswith("SELECT"):
            return False, "Only SELECT queries are allowed."
        if cls.FORBIDDEN.search(s):
            kw = cls.FORBIDDEN.search(s).group(1)
            return False, f"Keyword '{kw}' is not allowed."
        return True, ""

    @staticmethod
    def extract(raw: str) -> str:
        m = re.search(r'```(?:sql)?\s*(SELECT[\s\S]*?)```', raw, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        m = re.search(r'(SELECT[\s\S]+)', raw, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        return raw.strip()


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — REDIS HISTORY
# ══════════════════════════════════════════════════════════════════════════════

class HistoryService:
    def __init__(self):
        self.r = redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True
        )

    def get(self, session_id: str, max_turns: int = 6) -> List[Dict]:
        raw = self.r.lrange(f"chat:{session_id}", 0, max_turns * 2 - 1)
        msgs = []
        for item in reversed(raw):
            try:
                msgs.append(json.loads(item))
            except Exception:
                pass
        return msgs

    def save(self, session_id: str, question: str, answer: str):
        key = f"chat:{session_id}"
        self.r.lpush(key, json_dumps({"role": "assistant", "content": answer}))
        self.r.lpush(key, json_dumps({"role": "user", "content": question}))
        self.r.ltrim(key, 0, 19)
        self.r.expire(key, 86400)

    def clear(self, session_id: str):
        self.r.delete(f"chat:{session_id}")


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — ANSWER FORMATTER (no second LLM call)
# ══════════════════════════════════════════════════════════════════════════════

def get_context_preamble(question: str, data: List[Dict]) -> str:
    """Generate context preamble based on query type."""
    if not data:
        return ""
    
    q = question.lower()
    
    if 'order' in q and ('part' in q or 'component' in q or 'bom' in q):
        return "Here are the parts belonging to your order:"
    if 'order' in q and 'operation' in q:
        return "Here are the operations for your order:"
    if 'operation' in q:
        return "Here are the operations:"
    if 'part' in q:
        return "Here are the parts:"
    if 'order' in q:
        return "Here are the orders in the CMF shop floor:"
    if 'machine' in q:
        return "Here are the machines:"
    if 'work center' in q or 'workcenter' in q:
        return "Here are the work centers:"
    if 'tool' in q:
        return "Here are the tools:"
    if 'operator' in q or 'worker' in q:
        return "Here are the operators:"
    if 'customer' in q:
        return "Here are the customers:"
    if 'product' in q:
        return "Here are the products:"
    if 'material' in q or 'stock' in q:
        return "Here is the material stock:"
    if 'vendor' in q or 'supplier' in q:
        return "Here are the vendors:"
    if 'breakdown' in q:
        return "Here are the machine breakdowns:"
    if 'leave' in q or 'absent' in q:
        return "Here are the operator leaves:"
    if 'quality' in q or 'inspection' in q:
        return "Here are the quality inspections:"
    if 'production' in q or 'log' in q:
        return "Here are the production logs:"
    
    return "Here are the results:"


def get_follow_up_suggestions(question: str, data: List[Dict]) -> List[str]:
    """Generate follow-up suggestions based on query type and data context."""
    if not data:
        return []
    
    q = question.lower()
    suggestions = []
    
    # Extract context from first row for more specific suggestions
    first_row = data[0] if data else {}
    
    if 'order' in q:
        # Get the order identifier (sale_order_number or id)
        order_id = first_row.get('sale_order_number') or first_row.get('id')
        if order_id:
            suggestions.append(f"Show parts for order {order_id}")
            suggestions.append(f"Show operations for order {order_id}")
            suggestions.append(f"Show schedule status for order {order_id}")
        else:
            suggestions.append("Show parts for this order")
            suggestions.append("Show operations for this order")
            suggestions.append("Show schedule status for this order")
    if 'part' in q or 'component' in q:
        part_name = first_row.get('part_name') or first_row.get('name')
        if part_name:
            suggestions.append(f"Show operations for {part_name}")
            suggestions.append(f"Show raw materials for {part_name}")
        else:
            suggestions.append("Show operations for these parts")
            suggestions.append("Show raw materials for these parts")
    if 'operation' in q:
        suggestions.append("Show production logs for these operations")
        suggestions.append("Show machine status")
    if 'machine' in q:
        suggestions.append("Show work centers")
        suggestions.append("Show machine breakdowns")
    if 'operator' in q or 'worker' in q:
        operator_name = first_row.get('user_name') or first_row.get('name')
        if operator_name:
            suggestions.append(f"Show leaves for {operator_name}")
            suggestions.append(f"Show tools issued to {operator_name}")
        else:
            suggestions.append("Show operator leaves")
            suggestions.append("Show tools issued to operators")
    if 'material' in q or 'stock' in q:
        material_name = first_row.get('material_name') or first_row.get('name')
        if material_name:
            suggestions.append(f"Show stock for {material_name}")
            suggestions.append("Show all raw materials")
        else:
            suggestions.append("Show all raw materials")
            suggestions.append("Show vendors")
    
    return suggestions[:3]  # Limit to 3 suggestions


def format_answer(question: str, data: List[Dict]) -> str:
    count = len(data)

    if count == 0:
        return (
            "No records found for your query.\n\n"
            "The query ran successfully but returned no matching data. "
            "Try checking the sale order number, ID, or rephrasing your question.\n"
            "Examples: *\"show all orders\"*, *\"parts for order 5\"*, *\"operations for SO-001\"*"
        )

    preamble = get_context_preamble(question, data)
    lines = [preamble, "", f"Found **{count}** record{'s' if count != 1 else ''}."]

    if count <= 20:
        lines.append("")
        cols = list(data[0].keys())
        # Show all meaningful columns — only skip raw FK _id cols when a named col already shows the value
        named_cols = {c for c in cols if not c.endswith("_id")}
        skip = {c for c in cols if c.endswith("_id") and c != "id" and any(
            c.replace("_id", "") in nc or c.replace("_id", "_name") in cols or c.replace("_id", "_number") in cols
            for nc in named_cols
        )}
        display = [c for c in cols if c not in skip][:8]
        for i, row in enumerate(data, 1):
            parts = []
            for col in display:
                val = row.get(col)
                if val is not None and val != "":
                    label = col.replace("_", " ").title()
                    parts.append(f"**{label}**: {val}")
            lines.append(f"{i}. " + " · ".join(parts))
    else:
        status_col = next(
            (c for c in data[0] if "status" in c.lower()),
            None
        )
        if status_col:
            breakdown = Counter(str(r.get(status_col, "Unknown")) for r in data)
            lines.append("")
            for val, cnt in breakdown.most_common():
                lines.append(f"- **{val}**: {cnt}")

    lines.append("\n*Full data table shown below.*")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — CHAT SERVICE
# ══════════════════════════════════════════════════════════════════════════════

_LLM = None

def get_llm():
    global _LLM
    if _LLM is None:
        _LLM = ChatOllama(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            model=os.getenv("OLLAMA_MODEL", "codellama"),
            temperature=0,
            num_ctx=4096,
            stop=["Human:", "User:"],
        )
    return _LLM


SYSTEM_PROMPT = (
    "You are a PostgreSQL SQL expert for a CMF manufacturing system.\n\n"
    + CMF_SCHEMA_CONTEXT
    + "\n\nRULES:\n"
    "1. Reply with ONLY a raw SELECT SQL query — no explanation, no markdown, no backticks.\n"
    "2. Always prefix tables with schema (e.g. oms.parts not just parts).\n"
    "3. NEVER reference configuration.work_centers.name — use work_center_name instead.\n"
    "4. NEVER use rm.material_grade — inventory.raw_materials has NO material_grade. Use material_name, density, cost_per_kg.\n"
    "5. NEVER use v.vendor_name — inventory.vendors only has company_name (and id, created_at, updated_at).\n"
    "6. NEVER use ol.leave_date or ol.leave_type — accesscontrol.operator_leaves has from_date, to_date, reason, status.\n"
    "7. When user asks about stock/quantity for a SPECIFIC material name (e.g. '45C8', 'EN8', 'EN31'), "
    "always filter: WHERE rm.material_name ILIKE '%<material_name>%'. "
    "NEVER return all stock when a specific material is mentioned.\n"
    "8. For operation execution queries (in-progress, completed, pending operations), use scheduling.production_logs NOT scheduling.operation_status (which is often empty). "
    "Status in production_logs is 'inprogress' (no underscore) or 'completed'.\n"
    "9. For 'parts for order X' / 'components of order X' / 'BOM for order X' / "
    "'what is in order X' / any question about which parts belong to an order, "
    "follow the CRITICAL RULE above EXACTLY using the UNION ALL two-stage template "
    "(order_part_priorities first, fallback to parts.product_id if empty).\n"
    "10. Add LIMIT 100 unless user asks for specific count.\n"
    "11. If the question cannot be answered from these tables, reply: CANNOT_ANSWER\n"
    "12. For text searches (product name, customer name, part name, sale_order_number) use ILIKE '%value%'.\n"
    "13. Understand synonyms: 'pieces'/'components'/'items'/'BOM' = oms.parts; "
    "'job'/'sale order'/'work order'/'order number' = oms.orders (search by sale_order_number); "
    "'steps'/'processes'/'machining steps' = oms.operations; "
    "'machines'/'equipment'/'CNC' = configuration.machines; "
    "'project name'/'job name' -> search o.project_name or o.sale_order_number or product_name.\n"
)


def build_messages(question: str, history: List[Dict]) -> list:
    msgs = [SystemMessage(content=SYSTEM_PROMPT)]
    for h in history:
        if h["role"] == "user":
            msgs.append(HumanMessage(content=h["content"]))
        else:
            msgs.append(AIMessage(content=h["content"]))
    msgs.append(HumanMessage(content=question))
    return msgs


def execute_sql(sql: str) -> Tuple[List[Dict], str]:
    ok, err = SQLValidator.validate(sql)
    if not ok:
        return [], err
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql))
            cols = list(result.keys())
            # clean_row converts datetime/date/time/Decimal -> JSON-safe types
            # immediately, so every downstream consumer (format_answer, SSE,
            # ChatResponse) works with plain str/float/int/None only.
            rows = [clean_row(dict(zip(cols, r))) for r in result.fetchall()]
            return rows, ""
    except Exception as e:
        return [], f"Database error: {str(e)}"


# Words that signal the question is about "parts of an order" — used to trigger
# the safety-net retry when the LLM's SQL returns 0 rows.
PARTS_KEYWORDS = ("part", "component", "item", "bom", "piece", "material")
OPS_KEYWORDS = ("operation", "step", "process", "machining")
ORDER_ID_RE = re.compile(r"order\s*#?(\d+)", re.IGNORECASE)


def maybe_retry_with_fallback(question: str, sql: str, data: List[Dict]) -> Tuple[str, List[Dict], bool]:
    """
    Safety net: if the LLM-generated SQL for a 'parts/operations of order X' style
    question returned ZERO rows, retry using the verified two-stage templates.
    Also guards against LLM using dropped columns (project_name, opp.status, wc.name).
    Returns (sql, data, retried).
    """
    # Fix common LLM mistakes in the generated SQL before running
    fixed_sql = sql
    fixed_sql = re.sub(r'\bwc\.name\b', "wc.work_center_name", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\brm\.material_grade\b', "rm.material_name", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\bv\.vendor_name\b', "v.company_name", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\bol\.leave_date\b', "ol.from_date", fixed_sql, flags=re.IGNORECASE)
    fixed_sql = re.sub(r'\bol\.leave_type\b', "ol.reason", fixed_sql, flags=re.IGNORECASE)
    if fixed_sql != sql:
        retry_data, err = execute_sql(fixed_sql)
        if not err and retry_data:
            return fixed_sql, retry_data, True

    if data:
        return sql, data, False

    q = question.lower()
    m = ORDER_ID_RE.search(q)
    if not m:
        return sql, data, False

    order_id = m.group(1)

    # Retry parts
    if any(k in q for k in PARTS_KEYWORDS):
        retry_sql = PARTS_FOR_ORDER_SQL(order_id).strip()
        retry_data, err = execute_sql(retry_sql)
        if not err:
            return retry_sql, retry_data, True

    # Retry operations
    if any(k in q for k in OPS_KEYWORDS):
        retry_sql = OPERATIONS_FOR_ORDER_SQL(order_id).strip()
        retry_data, err = execute_sql(retry_sql)
        if not err:
            return retry_sql, retry_data, True

    return sql, data, False


class ChatService:
    def __init__(self):
        self.history = HistoryService()

    def process(self, question: str, session_id: str) -> Dict:
        sql, matched = try_quick_pattern(question)

        if not matched:
            hist = self.history.get(session_id)
            msgs = build_messages(question, hist)
            try:
                raw = get_llm().invoke(msgs).content.strip()
            except Exception as e:
                return {"answer": f"LLM error: {e}", "sql": "", "data": []}

            if raw == "CANNOT_ANSWER":
                answer = (
                    "I can only answer questions about the CMF manufacturing "
                    "database — orders, parts, operations, machines, inventory, "
                    "quality, or operators."
                )
                self.history.save(session_id, question, answer)
                return {"answer": answer, "sql": "", "data": []}

            sql = SQLValidator.extract(raw)

        data, err = execute_sql(sql)
        if err:
            return {"answer": f"⚠️ {err}", "sql": sql, "data": []}

        # Safety net: retry with verified template if LLM SQL returned 0 rows
        # for a "parts of order X" style question
        sql, data, _ = maybe_retry_with_fallback(question, sql, data)

        answer = format_answer(question, data)
        suggestions = get_follow_up_suggestions(question, data)
        self.history.save(session_id, question, answer)
        return {"answer": answer, "sql": sql, "data": data, "suggestions": suggestions}

    async def stream(self, question: str, session_id: str) -> AsyncGenerator[str, None]:

        def sse(payload: dict) -> str:
            return f"data: {json_dumps(payload)}\n\n"

        sql, matched = try_quick_pattern(question)

        if not matched:
            hist = self.history.get(session_id)
            msgs = build_messages(question, hist)
            raw = ""
            try:
                async for chunk in get_llm().astream(msgs):
                    token = chunk.content
                    raw += token
                    if token:
                        yield sse({"type": "token", "content": token})
                    await asyncio.sleep(0)
            except Exception as e:
                yield sse({"type": "error", "message": str(e)})
                return

            if raw.strip() == "CANNOT_ANSWER":
                answer = "I can only answer questions about the CMF manufacturing database."
                yield sse({"type": "final", "answer": answer, "sql": "", "data": []})
                yield "data: [DONE]\n\n"
                self.history.save(session_id, question, answer)
                return

            sql = SQLValidator.extract(raw)

        data, err = execute_sql(sql)
        if err:
            yield sse({"type": "final", "answer": f"⚠️ {err}", "sql": sql, "data": []})
            yield "data: [DONE]\n\n"
            return

        # Safety net: retry with verified template if LLM SQL returned 0 rows
        # for a "parts of order X" style question
        sql, data, _ = maybe_retry_with_fallback(question, sql, data)

        answer = format_answer(question, data)
        suggestions = get_follow_up_suggestions(question, data)
        self.history.save(session_id, question, answer)
        yield sse({"type": "final", "answer": answer, "sql": sql, "data": data, "suggestions": suggestions})
        yield "data: [DONE]\n\n"


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — ROUTER
# ══════════════════════════════════════════════════════════════════════════════

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()

_svc: ChatService = None

def get_svc():
    global _svc
    if _svc is None:
        _svc = ChatService()
    return _svc


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest):
    try:
        result = get_svc().process(body.question, body.session_id)
        return ChatResponse(**result)
    except RateLimitExceeded:
        raise HTTPException(429, "Too many requests.")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(request: Request, body: ChatRequest):
    return StreamingResponse(
        get_svc().stream(body.question, body.session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    get_svc().history.clear(session_id)
    return {"message": "History cleared"}


@router.get("/health")
async def health():
    return {"status": "ok", "model": os.getenv("OLLAMA_MODEL", "codellama")}
import logging
from bisect import insort_right
from threading import active_count
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func

# from sqlalchemy import cast, Integer  


from sqlalchemy import exists, text, and_
from DB.database import get_db

from DB.models.oms import Order, Part, Product, Document
from DB.models.scheduling import PartScheduleStatus, OrderScheduleStatus, MachineSchedule, ScheduleHistory, PlannedScheduleItem, EfficiencyFactor, ShiftHoursConfiguration, OperationStatus, Rescheduling, ProductionLog
from DB.models.oms import Order, Part, Product
from DB.models.configuration import Machine, WorkCenter
from DB.models.oms import Operation, Part, Order, PartType, OrderPartPriority, OutSourceOperationStatus
from DB.models.inventory import RawMaterialUsage

from DB.schemas.machine_scheduling import (
    PartStatusUpdate, UpdatePartStatusResponse, OrderScheduleStatusResponse,
    OperationStatusResponse, OperationStatusUpdate, OperationStatusWithDetails,
    OutSourceOperationStatusCreate, OutSourceOperationStatusUpdate,
    OutSourceOperationStatusResponse, OutSourceOperationWithDetails, SimulatePrioritySwapRequest
)
from DB.schemas.oms import OrderPartPrioritySwap
from shift_assignment_helpers import validate_priority_changed_by, priority_changed_by_audit
from machine_breakdown_helpers import (
    get_job_card_activation_block_message,
    get_machine_breakdown_block_message,
)
from production_log_helpers import (
    get_operator_activation_block_reason,
    get_operation_work_due,
    is_schedulable_operation,
    total_approved_for_operation,
)

from datetime import datetime, timedelta, timezone, time as dtime
from typing import Optional, List, Dict, Tuple
import calendar





router = APIRouter(prefix="/scheduling", tags=["scheduling"])
logger = logging.getLogger(__name__)





def overlap_with_shift(downtime_start: datetime, downtime_end: datetime, shift_start_hour: int = 6,
                       shift_end_hour: int = 22) -> float:
    """
    Calculate the overlap in hours between a downtime interval and working shift hours for each day.
    shift_start_hour: hour when shift starts (inclusive)
    shift_end_hour: hour when shift ends (exclusive)
    Returns total overlap in hours (float)
    """
    # Optimize: If downtime is completely outside shift hours, return 0
    if downtime_end <= downtime_start:
        return 0.0

    # Optimize: If downtime spans multiple days, calculate more efficiently
    total_overlap = 0.0
    current = downtime_start

    # Calculate shift duration once
    shift_duration = shift_end_hour - shift_start_hour

    while current < downtime_end:
        # Define shift for this day
        shift_start = current.replace(hour=shift_start_hour, minute=0, second=0, microsecond=0)
        shift_end = current.replace(hour=shift_end_hour, minute=0, second=0, microsecond=0)

        # If shift_end is before shift_start (overnight shift), add a day
        if shift_end <= shift_start:
            shift_end += timedelta(days=1)

        # Calculate overlap for this day
        interval_start = max(current, shift_start)
        interval_end = min(downtime_end, shift_end)

        if interval_start < interval_end:
            total_overlap += (interval_end - interval_start).total_seconds() / 3600

        # Move to next day
        next_day = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        current = next_day

    return total_overlap


def _check_part_has_2d_drawing(part_id: int, db: Session) -> tuple[bool, str]:
    """
    Check if a part has a 2D drawing uploaded.
    
    Returns:
        (has_2d, message): Tuple where has_2d is True if 2D drawing exists,
                          and message explains the status.
    
    Logic:
        - If part has 2D drawing (any of: 2D, 2d, 2D Drawing, drawing) → allow
        - If part has both 2D and 3D → allow
        - If part has only 3D (no 2D) → block
        - If part has no documents → block
    """
    # Get all documents for this part
    documents = db.query(Document).filter(
        Document.part_id == part_id
    ).all()
    
    if not documents:
        return False, "No documents uploaded for this part"
    
    # Check document types (case-insensitive)
    has_2d = False
    has_3d = False
    
    for doc in documents:
        doc_type_lower = doc.document_type.lower()
        
        # Check for 2D drawing types
        if doc_type_lower in ["2d", "2d drawing", "drawing"]:
            has_2d = True
        
        # Check for 3D model types
        if doc_type_lower in ["3d", "3d model", "step"]:
            has_3d = True
    
    if has_2d:
        return True, "2D drawing available"
    elif has_3d and not has_2d:
        return False, "Only 3D model uploaded. 2D drawing is required for activation"
    else:
        return False, "No 2D drawing uploaded for this part"


_OPEN_PRODUCTION_LOG_STATUSES = ("pending", "inprogress", "rework", "rejected")


def _production_logs_indicate_in_progress(logs: List[ProductionLog]) -> bool:
    """True when an operator is working or a log awaits supervisor review."""
    return any(
        (log.operator_status == "inprogress" and log.to_time is None)
        or (
            log.operator_status == "completed"
            and log.status in _OPEN_PRODUCTION_LOG_STATUSES
        )
        for log in logs
    )


def _operation_production_is_complete(logs: List[ProductionLog]) -> bool:
    """True when the latest production run for the operation is fully approved/done."""
    if not logs:
        return False
    last_log = max(logs, key=lambda log: log.id)
    return (
        last_log.status == "completed"
        and (last_log.remaining_quantity_to_be_produced or 0) == 0
    )


def _is_part_fully_completed_by_logs(db: Session, part_id: int) -> bool:
    """
    True when every operation on the part has at least one supervisor-approved
    production_log (status='completed'). Parts with zero operations are not completed.
    """
    op_ids = [
        row[0] for row in db.query(Operation.id)
        .filter(Operation.part_id == part_id).all()
    ]
    if not op_ids:
        return False

    completed_count = db.execute(
        text("""
            SELECT COUNT(DISTINCT operation_id)
            FROM scheduling.production_logs
            WHERE operation_id = ANY(:op_ids)
              AND status = 'completed'
        """),
        {"op_ids": op_ids},
    ).scalar() or 0
    return completed_count == len(op_ids)


def _part_is_schedule_completed(
    db: Session, sale_order_id: int, part_id: int
) -> bool:
    """True when the part is retired from the live queue as completed."""
    from production_log_helpers import part_has_production_log_history

    # Cleared production history means stale 'completed' flags must not block
    # deactivation or other schedule actions.
    if not part_has_production_log_history(db, part_id):
        return False

    schedule_record = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.part_id == part_id,
    ).first()
    if schedule_record and schedule_record.status == "completed":
        return True

    priority_row = db.query(OrderPartPriority).filter(
        OrderPartPriority.order_id == sale_order_id,
        OrderPartPriority.part_id == part_id,
    ).first()
    if priority_row and priority_row.status == "completed":
        return True

    return _is_part_fully_completed_by_logs(db, part_id)


def _get_completed_part_deactivation_blockers(
    db: Session, sale_order_id: int, part_ids: List[int]
) -> List[dict]:
    """Return completed parts that must not be deactivated."""
    blockers: List[dict] = []
    for part_id in part_ids:
        if not _part_is_schedule_completed(db, sale_order_id, part_id):
            continue
        part = db.query(Part).filter(Part.id == part_id).first()
        blockers.append({
            "part_id": part_id,
            "part_number": part.part_number if part else str(part_id),
            "part_name": part.part_name if part else None,
            "block_reason": "Part production is completed — deactivation is not allowed",
        })
    return blockers


def _classify_operation_production_block(
    db: Session,
    part_id: int,
    op: Operation,
    logs: List[ProductionLog],
    part_has_started: bool,
) -> Optional[dict]:
    """
    Return blocker fields when this operation blocks part deactivation, else None.
    """
    if logs and _operation_production_is_complete(logs):
        return None

    op_status = db.query(OperationStatus).filter(
        OperationStatus.operation_id == op.id,
        OperationStatus.part_id == part_id,
    ).first()

    if _production_logs_indicate_in_progress(logs):
        active_log = next(
            (log for log in logs if log.operator_status == "inprogress" and log.to_time is None),
            None,
        )
        if active_log:
            return {
                "operation_started": True,
                "production_stage": "in_progress",
                "block_reason": (
                    "Started — operator is actively working on this operation "
                    f"(production log {active_log.id})"
                ),
            }
        return {
            "operation_started": True,
            "production_stage": "awaiting_review",
            "block_reason": (
                "Started — production log submitted, awaiting supervisor approval"
            ),
        }

    if op_status and op_status.status == "inprogress":
        return {
            "operation_started": True,
            "production_stage": "job_card_active",
            "block_reason": "Started — job card is activated",
        }

    if logs and not _operation_production_is_complete(logs):
        last_log = max(logs, key=lambda log: log.id)
        remaining = last_log.remaining_quantity_to_be_produced
        remaining_label = str(remaining) if remaining is not None else "open"
        return {
            "operation_started": True,
            "production_stage": "incomplete",
            "block_reason": (
                "Started — production incomplete "
                f"({remaining_label} unit(s) remaining on this operation)"
            ),
        }

    if not logs and part_has_started:
        return {
            "operation_started": False,
            "production_stage": "not_started",
            "block_reason": (
                "Not started — production has not begun on this operation yet"
            ),
        }

    return None


def _get_part_production_blockers(db: Session, part_id: int) -> List[dict]:
    """
    Return operations on this part that are currently in production and block
    deactivation. Uses the same rules as priority-swap in-production detection.

    Also blocks when production has started on any operation but other operations
    on the same part are not yet complete (e.g. 1 of 3 ops done).
    """
    from production_log_helpers import part_has_production_log_history

    blockers: List[dict] = []
    operations = (
        db.query(Operation)
        .filter(Operation.part_id == part_id)
        .order_by(Operation.operation_number.asc(), Operation.id.asc())
        .all()
    )
    part_has_started = part_has_production_log_history(db, part_id)

    for op in operations:
        logs = (
            db.query(ProductionLog)
            .filter(ProductionLog.operation_id == op.id)
            .order_by(ProductionLog.created_at.asc())
            .all()
        )

        block = _classify_operation_production_block(
            db, part_id, op, logs, part_has_started
        )
        if not block:
            continue

        blockers.append({
            "part_id": part_id,
            "operation_id": op.id,
            "operation_number": str(op.operation_number),
            "operation_name": op.operation_name,
            "operation_started": block["operation_started"],
            "production_stage": block["production_stage"],
            "block_reason": block["block_reason"],
        })

    return blockers


def _get_order_production_blockers(db: Session, part_ids: List[int]) -> List[dict]:
    """Aggregate in-production blockers for all parts on an order."""
    blockers: List[dict] = []
    for part_id in part_ids:
        part_blockers = _get_part_production_blockers(db, part_id)
        if not part_blockers:
            continue
        part = db.query(Part).filter(Part.id == part_id).first()
        for entry in part_blockers:
            entry["part_number"] = part.part_number if part else str(part_id)
            entry["part_name"] = part.part_name if part else None
        blockers.extend(part_blockers)
    return blockers


def _raise_deactivation_blocked(blockers: List[dict]) -> None:
    """Raise a consistent 400 when deactivation is blocked by live production."""
    if not blockers:
        raise HTTPException(
            status_code=400,
            detail={"message": "Cannot deactivate — production is in progress"},
        )

    part_ids = {b.get("part_id") for b in blockers}
    not_started_count = sum(
        1 for b in blockers if b.get("production_stage") == "not_started"
    )
    started_count = len(blockers) - not_started_count

    if len(part_ids) == 1:
        part_label = (
            blockers[0].get("part_name")
            or blockers[0].get("part_number")
            or f"part {blockers[0].get('part_id')}"
        )
        message = f"Cannot deactivate part {part_label} — production is in progress"
    else:
        message = (
            f"Cannot deactivate — production is in progress on "
            f"{len(blockers)} operation(s) across {len(part_ids)} part(s)"
        )

    detail_parts: List[str] = []
    if not_started_count:
        op_word = "operation" if not_started_count == 1 else "operations"
        detail_parts.append(f"{not_started_count} {op_word} yet to start")
    if started_count:
        op_word = "operation" if started_count == 1 else "operations"
        detail_parts.append(f"{started_count} {op_word} in progress")
    if detail_parts:
        message = f"{message}, {', '.join(detail_parts)}"

    summary_parts = []
    for blocker in blockers[:5]:
        op_num = blocker.get("operation_number", "?")
        started = blocker.get("operation_started")
        if started is True:
            stage_label = "started"
        elif started is False:
            stage_label = "not started"
        else:
            stage_label = "in progress"
        part_num = blocker.get("part_number")
        prefix = f"Part {part_num} — " if part_num and len(part_ids) > 1 else ""
        summary_parts.append(f"{prefix}Op {op_num} ({stage_label})")

    suffix = f" (+{len(blockers) - 5} more)" if len(blockers) > 5 else ""
    raise HTTPException(
        status_code=400,
        detail={
            "message": message,
            "blocking_operations": blockers,
            "summary": ", ".join(summary_parts) + suffix,
        },
    )


def _raise_completed_deactivation_blocked(
    entity_label: str, blockers: List[dict]
) -> None:
    """Raise a consistent 400 when deactivation is blocked because parts are completed."""
    summary_parts = []
    for blocker in blockers[:5]:
        part_num = blocker.get("part_number") or blocker.get("part_id")
        summary_parts.append(f"Part {part_num}")

    suffix = f" (+{len(blockers) - 5} more)" if len(blockers) > 5 else ""
    raise HTTPException(
        status_code=400,
        detail={
            "message": f"Cannot deactivate {entity_label} — part production is completed",
            "block_reason": "completed_part",
            "blocking_parts": blockers,
            "summary": ", ".join(summary_parts) + suffix,
        },
    )


# =========================================================
# SET ORDER STATUS
# =========================================================


# =========================================================
# PRIORITY HELPER FUNCTIONS (internal use)
# =========================================================

def _assign_order_priority(sale_order_id: int, product_id: int, parts: list, db: Session):
    """Assign global priorities to IN-House parts of an order on activation.
    Only creates missing rows — never overwrites existing.
    Appends after global max priority.
    """
    existing_priority_part_ids = {
        row.part_id for row in db.query(OrderPartPriority).filter(
            OrderPartPriority.order_id == sale_order_id
        ).all()
    }
    new_parts = sorted(
        [p for p in parts if p.id not in existing_priority_part_ids],
        key=lambda p: p.id
    )
    if not new_parts:
        return
    max_row = db.query(OrderPartPriority).filter(
        OrderPartPriority.priority > 0
    ).order_by(OrderPartPriority.priority.desc()).first()
    max_priority = max_row.priority if max_row else 0
    for i, p in enumerate(new_parts, start=1):
        db.add(OrderPartPriority(
            order_id=sale_order_id,
            product_id=product_id,
            part_id=p.id,
            priority=max_priority + i,
            status="active",
        ))


def _compact_order_part_priorities_by_part_order(db: Session) -> None:
    """
    Renumber all active OrderPartPriority rows to 1, 2, 3, ... in Part No order.
    Preserves cross-order sequence (current priority), then sorts by Part.part_number
    so UI order (002, 003, 004, 005) matches priority order.
    """
    active_rows = (
        db.query(OrderPartPriority)
        .join(Part, Part.id == OrderPartPriority.part_id)
        .filter(
            OrderPartPriority.status == "active",
            OrderPartPriority.priority > 0,
        )
        .order_by(OrderPartPriority.priority.asc(), Part.part_number.asc())
        .all()
    )
    for i, row in enumerate(active_rows, start=1):
        row.priority = i


def _resequence_active_order_part_priorities(db: Session) -> None:
    """
    Resequence all active OrderPartPriority rows to 1..N globally (no gaps).
    Use after deleting or deactivating a part so remaining parts get 1, 2, 3, ...
    """
    active_rows = (
        db.query(OrderPartPriority)
        .filter(
            OrderPartPriority.status == "active",
            OrderPartPriority.priority > 0,
        )
        .order_by(OrderPartPriority.priority.asc(), OrderPartPriority.id.asc())
        .all()
    )
    for i, row in enumerate(active_rows, start=1):
        row.priority = i


def _remove_order_priority(sale_order_id: int, db: Session):
    """
    Remove order priority and adjust priorities for remaining orders.
    Handles both scenarios:
    1. If first order is removed: shift all remaining orders down to start from priority 1
    2. If intermediate order is removed: shift higher priority orders down to fill the gap
    """
    # Get all priority records for this order, ordered by priority
    order_priorities = db.query(OrderPartPriority).filter(
        OrderPartPriority.order_id == sale_order_id
    ).order_by(OrderPartPriority.priority).all()
    
    if not order_priorities:
        return
    
    # Get the minimum and maximum priorities for this order
    min_priority = order_priorities[0].priority
    max_priority = order_priorities[-1].priority
    parts_count = len(order_priorities)
    
    # Delete all priority records for this order
    db.query(OrderPartPriority).filter(
        OrderPartPriority.order_id == sale_order_id
    ).delete(synchronize_session=False)
    
    # If this was the first order (min_priority == 1), shift ALL remaining orders down
    # Otherwise, shift only higher priority orders down
    if min_priority == 1:
        # First order removed: shift all remaining orders down by parts_count
        db.query(OrderPartPriority).update(
            {OrderPartPriority.priority: OrderPartPriority.priority - parts_count},
            synchronize_session=False
        )
    else:
        # Intermediate order removed: shift only higher priority orders down
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority > max_priority
        ).update(
            {OrderPartPriority.priority: OrderPartPriority.priority - parts_count},
            synchronize_session=False
        )
    
    db.commit()







# =========================================================
# ASSIGN ORDER PRIORITY ENDPOINT
# =========================================================
@router.post("/assign-order-priority/{sale_order_id}")
def assign_order_priority(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    """Assign global priorities to IN-House parts of an active order.
    Safe to call multiple times — only adds missing rows.
    """
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    if not order.product:
        raise HTTPException(400, "Order has no product")
    parts = [p for p in order.product.parts if p.type_id == 1]
    if not parts:
        raise HTTPException(400, "No IN-House parts found")
    _assign_order_priority(sale_order_id, order.product_id, parts, db)
    db.commit()
    return {"message": f"Priorities assigned for order {sale_order_id}"}


# =========================================================
# REMOVE ORDER PRIORITY ENDPOINT
# =========================================================
@router.delete("/remove-order-priority/{sale_order_id}")
def remove_order_priority(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    """Delete priority rows for an order and shift all higher priorities down."""
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    _remove_order_priority(sale_order_id, db)
    db.commit()
    return {"message": f"Priorities removed for order {sale_order_id}"}




# =========================================================
# SET ORDER STATUS
# =========================================================

@router.post("/set-order-status/{sale_order_id}")
def set_order_status(
    sale_order_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    if status not in ["active", "inactive"]:
        raise HTTPException(400, "Status must be active/inactive")

    # -----------------------------
    # Get order
    # -----------------------------
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(404, "Order not found")

    if not order.product:
        raise HTTPException(400, "Order has no product")

    parts = [p for p in order.product.parts if p.type_id == 1]

    if not parts:
        raise HTTPException(400, "No parts found for this order's product")

    if status == "inactive":
        part_ids = [part.id for part in parts]
        completed_blockers = _get_completed_part_deactivation_blockers(
            db, sale_order_id, part_ids
        )
        if completed_blockers:
            _raise_completed_deactivation_blocked(
                f"order {sale_order_id}",
                completed_blockers,
            )

        production_blockers = _get_order_production_blockers(db, part_ids)
        if production_blockers:
            _raise_deactivation_blocked(production_blockers)

    now = datetime.now(timezone.utc)

    # -----------------------------
    # Check raw material availability for each part
    # -----------------------------
    if status == "active":
        parts_with_raw_material = []
        parts_without_raw_material = []
        
        print(f"[DEBUG] Raw material check for Order {sale_order_id}: checking {len(parts)} parts")
        
        for part in parts:
            # Check if part has raw material linked in raw_material_usage table
            raw_material_usage_exists = db.query(RawMaterialUsage).filter(
                RawMaterialUsage.part_id == part.id
            ).first()
            
            if raw_material_usage_exists:
                parts_with_raw_material.append(part)
                print(f"[DEBUG] Part {part.part_name} (ID: {part.id}): RAW MATERIAL LINKED - will be activated")
            else:
                parts_without_raw_material.append(part)
                print(f"[DEBUG] Part {part.part_name} (ID: {part.id}): NO RAW MATERIAL LINKED - will be skipped")
        
        print(f"[DEBUG] Raw material summary for Order {sale_order_id}: {len(parts_with_raw_material)} parts with materials, {len(parts_without_raw_material)} parts without materials")
        
        # Keep original parts list for response, but only activate parts with raw materials
        all_inhouse_parts = parts
        parts = parts_with_raw_material  # Only these will be activated
    else:
        all_inhouse_parts = parts

    # -----------------------------
    # Check 2D drawing availability for ALL in-house parts
    # -----------------------------
    if status == "active":
        parts_with_2d_drawing = []
        parts_without_2d_drawing = []
        parts_drawing_status = {}  # Store drawing status for each part
        
        print(f"[DEBUG] 2D drawing check for Order {sale_order_id}: checking {len(all_inhouse_parts)} parts")
        
        # Check ALL in-house parts for 2D drawing status
        for part in all_inhouse_parts:
            has_2d, drawing_message = _check_part_has_2d_drawing(part.id, db)
            parts_drawing_status[part.id] = {
                "has_2d": has_2d,
                "message": drawing_message
            }
            
            if has_2d:
                parts_with_2d_drawing.append(part)
                print(f"[DEBUG] Part {part.part_name} (ID: {part.id}): 2D DRAWING AVAILABLE")
            else:
                parts_without_2d_drawing.append(part)
                print(f"[DEBUG] Part {part.part_name} (ID: {part.id}): NO 2D DRAWING - Reason: {drawing_message}")
        
        print(f"[DEBUG] 2D drawing summary for Order {sale_order_id}: {len(parts_with_2d_drawing)} parts with 2D drawings, {len(parts_without_2d_drawing)} parts without 2D drawings")
        
        # Only activate parts that have both raw material AND 2D drawing
        # Filter parts_with_raw_material to only those that also have 2D drawing
        parts = [p for p in parts_with_raw_material if p in parts_with_2d_drawing]
    else:
        parts_drawing_status = {}

    # -----------------------------
    # Loop through parts
    # -----------------------------
    for part in parts:

        record = db.query(PartScheduleStatus).filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.part_id == part.id
        ).first()

        # CREATE
        if not record:
            record = PartScheduleStatus(
                sale_order_id=sale_order_id,
                part_id=part.id,
                status=status,
                start_date=now if status == "active" else None,
                created_at=now,
                updated_at=now
            )
            db.add(record)

        # UPDATE
        else:
            record.status = status
            record.updated_at = now
            record.start_date = now if status == "active" else None


    # -----------------------------
    # OrderPartPriority: adjust on inactive, create on active
    # -----------------------------
    if status == "inactive":
        # When an order is deactivated, remove its priorities and
        # shift remaining orders' priorities to close the gap
        _remove_order_priority(sale_order_id, db)
        
        # CLEANUP: Remove operation status entries for deactivated order
        # that are no longer in planned_schedule_items
        operations_to_cleanup = db.execute(text("""
            SELECT DISTINCT os.operation_id
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE os.order_id = :order_id
            AND psi.operation_id IS NULL
        """), {"order_id": sale_order_id}).fetchall()
        
        if operations_to_cleanup:
            operation_ids_to_delete = [op[0] for op in operations_to_cleanup]
            deleted_count = db.query(OperationStatus).filter(
                OperationStatus.operation_id.in_(operation_ids_to_delete)
            ).delete(synchronize_session=False)
            
            print(f"[DEBUG] Cleaned up {deleted_count} operation status entries for deactivated order {sale_order_id}")


    # -----------------------------
    # Assign OrderPartPriority on activation
    # Only creates missing rows — never overwrites existing priorities
    # Default order: Part.id ASC (order of creation)
    # -----------------------------
    if status == "active":
        existing_priority_part_ids = {
            row.part_id for row in db.query(OrderPartPriority).filter(
                OrderPartPriority.order_id == sale_order_id
            ).all()
        }
        new_parts = sorted(
            [p for p in parts if p.id not in existing_priority_part_ids],
            key=lambda p: p.id
        )
        # Always use global max priority so new order appends after all existing orders
        max_row = db.query(OrderPartPriority).filter(
            OrderPartPriority.priority > 0
        ).order_by(OrderPartPriority.priority.desc()).first()
        max_priority = max_row.priority if max_row else 0
        for i, p in enumerate(new_parts, start=1):
            db.add(OrderPartPriority(
                order_id=sale_order_id,
                product_id=order.product_id,
                part_id=p.id,
                priority=max_priority + i,
                status="active",
            ))

    db.flush()
    
    
    active_count = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active"
    ).count()

    active_inhouse_count = db.query(PartScheduleStatus).join(
        Part, Part.id == PartScheduleStatus.part_id
    ).join(PartType, PartType.id == Part.type_id).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        PartType.id == 1
        # PartType.type_name == "IN-House"
    ).count()

    order_status = "active" if active_count > 0 else "inactive"

    summary = db.query(OrderScheduleStatus).filter(
        OrderScheduleStatus.order_id == sale_order_id
    ).first()

    if not summary:
        summary = OrderScheduleStatus(
            order_id=sale_order_id,
            product_id=order.product_id,
            active_parts_count=active_count,
            active_inhouse_parts=active_inhouse_count,
            status=order_status,
            activated_at=now if order_status == "active" else None,
            updated_at=now
        )
        db.add(summary)

    else:
        summary.active_parts_count = active_count
        summary.active_inhouse_parts = active_inhouse_count
        summary.status = order_status
        summary.updated_at = now
        # ❌ Before — always overwrites, loses original timestamp
        # summary.activated_at = now if status == "active" else None


        if order_status == "active":
            if not summary.activated_at:                      # Preserve earliest activation — only set once, never overwrite
                summary.activated_at = now
        else:
            summary.activated_at = None                       # All parts deactivated → clear activation timestamp     

        # clear when inactive
        if order_status == "inactive":
            summary.activated_at = None


    db.commit()

    # Prepare detailed response
    if status == "active":
        if len(parts) == 0:
            message = f"No parts of Order {sale_order_id} could be activated - parts missing required pre-requisites (raw material or 2D drawing)"
        elif len(parts_without_2d_drawing) == 0 and len(parts_without_raw_material) == 0:
            message = f"All in-house parts of Order {sale_order_id} set to active"
        else:
            message = f"Order {sale_order_id} partially activated - {len(parts)} of {len(all_inhouse_parts)} parts activated (require both raw material and 2D drawing)"
    else:
        message = f"In-house parts of Order {sale_order_id} set to {status}"
    
    response_data = {
        "message": message,
        "inhouse_parts_count": len(all_inhouse_parts),
        "activated_parts_count": len(parts) if status == "active" else 0,
        "skipped_parts_count": len(all_inhouse_parts) - len(parts) if status == "active" else 0,
        "activated_parts": [],
        "skipped_parts": [],
        "raw_material_summary": {},
        "drawing_summary": {}
    }
    
    # Add detailed information for active status
    if status == "active":
        # Add activated parts details (parts that passed both checks)
        for part in parts:
            response_data["activated_parts"].append({
                "part_id": part.id,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "status": "activated (raw materials and 2D drawing available)"
            })
        
        # Add skipped parts details (parts that failed either check)
        for part in all_inhouse_parts:
            if part not in parts:
                # Determine the reason for skipping
                has_rm = part in parts_with_raw_material
                has_2d = parts_drawing_status.get(part.id, {}).get("has_2d", False)
                drawing_msg = parts_drawing_status.get(part.id, {}).get("message", "Unknown")
                
                if not has_rm and not has_2d:
                    reason = "Missing both raw material and 2D drawing"
                elif not has_rm and has_2d:
                    reason = "Has 2D drawing but missing raw material. Link raw material first, then activate the part."
                elif has_rm and not has_2d:
                    reason = drawing_msg
                else:
                    reason = "Unknown reason"
                
                response_data["skipped_parts"].append({
                    "part_id": part.id,
                    "part_number": part.part_number,
                    "part_name": part.part_name,
                    "status": "not activated",
                    "reason": reason
                })
        
        # Add raw material summary
        response_data["raw_material_summary"] = {
            "total_inhouse_parts": len(all_inhouse_parts),
            "parts_with_raw_materials": len(parts_with_raw_material),
            "parts_without_raw_materials": len(parts_without_raw_material),
            "note": "Raw material check completed"
        }
        
        # Add drawing summary
        response_data["drawing_summary"] = {
            "total_inhouse_parts": len(all_inhouse_parts),
            "parts_with_2d_drawings": len(parts_with_2d_drawing),
            "parts_without_2d_drawings": len(parts_without_2d_drawing),
            "note": "2D drawing check completed. Parts require at least one 2D drawing (types: 2D, 2d, 2D Drawing, drawing) for activation"
        }
    
    return response_data


# =========================================================
# GET ACTIVE PARTS FOR A SALE ORDER
# =========================================================
@router.get("/active-parts/{sale_order_id}")
def get_active_parts_for_order(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    records = (
        db.query(PartScheduleStatus, Part)
        .join(Part, Part.id == PartScheduleStatus.part_id)
        .filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active"
        )
        .all()
    )

    result = []

    for schedule, part in records:
        result.append({
            "sale_order_id": sale_order_id,
            "part_id": part.id,
            "part_number": part.part_number,   # if exists
            "status": schedule.status,
            "start_date": schedule.start_date,
            "quantity": order.quantity
        })

    return {"active_parts": result}


# =========================================================
# ALL ORDERS → PART STATUS
# =========================================================
@router.get("/orders-parts-status")
def get_all_orders_parts_status(db: Session = Depends(get_db)):

    orders = db.query(Order).all()
    response = []

    for order in orders:

        product = order.product
        if not product:
            continue

        # get parts of this product
        parts = db.query(Part).filter(
            Part.product_id == product.id
        ).all()

        # get schedule records for this order
        schedule_records = db.query(PartScheduleStatus).filter(
            PartScheduleStatus.sale_order_id == order.id
        ).all()

        # create lookup dictionary
        schedule_map = {r.part_id: r for r in schedule_records}

        for part in parts:

            status_record = schedule_map.get(part.id)

            response.append({
                "sale_order_id": order.id,
                "sale_order_number": order.sale_order_number,
                "product_id": product.id,
                "product_name": product.product_name,
                "part_id": part.id,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "part_type": part.type.type_name if part.type else None,
                "status": status_record.status if status_record else "inactive",
                "start_date": status_record.start_date if status_record else None
            })

    return {"orders": response}


# =========================================================
# GET MAKE (IN-HOUSE) PARTS FOR ORDER
# =========================================================
@router.get("/make-parts/{sale_order_id}")
def get_make_parts_for_order(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.id == 1,
        # PartType.type_name == "IN-House"
    ).all()

    return {
        "sale_order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,  # optional display
        "product_id": order.product_id,
        "make_parts": [
            {
                "part_id": p.id,
                "part_name": p.part_name,
                "part_number": p.part_number
            }
            for p in parts
        ]
    }


# =========================================================
# GET BUY (OUTSOURCE) PARTS FOR ORDER
# =========================================================
@router.get("/buy-parts/{sale_order_id}")
def get_buy_parts_for_order(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.id == 2
        # PartType.type_name == "Out-Source"
    ).all()

    return {
        "sale_order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,
        "product_id": order.product_id,
        "buy_parts": [
            {
                "part_id": p.id,
                "part_name": p.part_name,
                "part_number": p.part_number
            }
            for p in parts
        ]
    }


# =========================================================
# ORDER PARTS METADATA FOR PROCESS PLAN
# =========================================================
@router.get("/order-parts-metadata/{sale_order_id}")
def get_order_parts_metadata(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    """
    Returns Process Plan metadata for a selected order:
      - total_inhouse_parts
      - total_outsource_parts
      - active_inhouse_parts
      - inactive_inhouse_parts
    """
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    total_inhouse_parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.id == 1
        # PartType.type_name == "IN-House"
    ).count()

    total_outsource_parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.id == 2
        # PartType.type_name == "Out-Source"
    ).count()

    active_inhouse_parts = db.query(PartScheduleStatus).join(
        Part, Part.id == PartScheduleStatus.part_id
    ).join(
        PartType, PartType.id == Part.type_id
    ).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        PartType.id == 1
        # PartType.type_name == "IN-House"
    ).count()

    inactive_inhouse_parts = max(total_inhouse_parts - active_inhouse_parts, 0)

    return {
        "sale_order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,
        "product_id": order.product_id,
        "total_inhouse_parts": total_inhouse_parts,
        "total_outsource_parts": total_outsource_parts,
        "active_inhouse_parts": active_inhouse_parts,
        "inactive_inhouse_parts": inactive_inhouse_parts
    }



# =========================================================
# UPDATE PART STATUS FOR ORDER
# =========================================================
@router.put(
    "/update-part-status/{sale_order_id}/{part_id}",
    response_model=UpdatePartStatusResponse
)
def update_part_status(
    sale_order_id: int,
    part_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    """
    Update status of a single part for a specific order
    Dynamic per-order per-part control
    """

    if status not in ["active", "inactive"]:
        raise HTTPException(400, "Status must be active/inactive")

    # ----------------------------
    # Check order exists
    # ----------------------------
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(404, "Order not found")

    # ----------------------------
    # Check part exists
    # ----------------------------
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.product_id == order.product_id   # part belongs to that product
    ).first()
    
    if not part:
        raise HTTPException(404, "Part not found for this order")
    
        
    # Get part type
    # ----------------------------
    part_type = db.query(PartType).filter(
        PartType.id == part.type_id
    ).first()
    
    part_type_name = part_type.type_name  # IN-House / Out-Source

    if status == "inactive":
        from production_log_helpers import revert_completed_parts_if_logs_cleared

        revert_completed_parts_if_logs_cleared(db, {part_id})

        if _part_is_schedule_completed(db, sale_order_id, part_id):
            logger.warning(
                "Part deactivation blocked",
                extra={
                    "event": "part_deactivation_blocked",
                    "order_id": sale_order_id,
                    "part_id": part_id,
                    "part_number": part.part_number,
                    "reason": "completed_part",
                },
            )
            _raise_completed_deactivation_blocked(
                f"part {part.part_number or part_id}",
                [{
                    "part_id": part_id,
                    "part_number": part.part_number,
                    "part_name": part.part_name,
                    "block_reason": (
                        "Part production is completed — deactivation is not allowed"
                    ),
                }],
            )

        production_blockers = _get_part_production_blockers(db, part_id)
        if production_blockers:
            logger.warning(
                "Part deactivation blocked",
                extra={
                    "event": "part_deactivation_blocked",
                    "order_id": sale_order_id,
                    "part_id": part_id,
                    "part_number": part.part_number,
                    "reason": "active_production_or_pending_review",
                    "blocking_operations": production_blockers,
                },
            )
            for entry in production_blockers:
                entry["part_number"] = part.part_number
                entry["part_name"] = part.part_name
            _raise_deactivation_blocked(production_blockers)

    # ----------------------------
    # Check pre-requisites for activation (raw material and 2D drawing)
    # ----------------------------
    raw_material_status = "No Raw Material Assigned"
    raw_material_available = False
    drawing_status = "No 2D Drawing"
    drawing_available = False
    drawing_message = ""
    
    print(f"[DEBUG] Pre-requisite check for Part {part.part_name} (ID: {part_id}) in Order {sale_order_id}")
    
    if status == "active":
        # ----------------------------
        # Block reactivation while production history still exists
        # A part that has already produced output (in-progress or completed)
        # cannot simply be flipped back to 'active' — that would silently
        # re-insert it into the live priority queue and scheduler while its
        # production_logs still reflect the earlier run. Only allow activation
        # when there are zero production_logs entries for this part's operations
        # (i.e. it truly never started, or an admin has explicitly cleared the
        # history first).
        # ----------------------------
        part_operation_ids = [
            row[0] for row in db.query(Operation.id)
            .filter(Operation.part_id == part_id).all()
        ]
        if part_operation_ids:
            existing_log_count = db.execute(
                text("""
                    SELECT COUNT(*)
                    FROM scheduling.production_logs
                    WHERE operation_id = ANY(:op_ids)
                """),
                {"op_ids": part_operation_ids}
            ).scalar() or 0

            if existing_log_count > 0:
                logger.warning(
                    "Part activation blocked",
                    extra={
                        "event": "part_activation_blocked",
                        "order_id": sale_order_id,
                        "part_id": part_id,
                        "part_number": part.part_number,
                        "reason": "production_history_exists",
                        "existing_log_count": existing_log_count,
                    },
                )
                return {
                    "message": (
                        "Cannot activate this part. It already has production history "
                        "in production_logs — clear/reset the logs before reactivating."
                    ),
                    "sale_order_id": sale_order_id,
                    "part_id": part_id,
                    "part_name": part.part_name,
                    "part_number": part.part_number,
                    "part_type": part_type_name,
                    "status": "Activation Blocked",
                    "order_status": None,
                    "will_be_scheduled": False,
                    "note": (
                        f"{existing_log_count} production_logs entries exist for this "
                        f"part's operations. Activation is only allowed when there are "
                        f"zero entries in production_logs for this part."
                    )
                }

        # Check raw material availability
        raw_material_usage_exists = db.query(RawMaterialUsage).filter(
            RawMaterialUsage.part_id == part_id
        ).first()
        
        print(f"[DEBUG] Raw material query result for Part {part_id}: {'FOUND' if raw_material_usage_exists else 'NOT FOUND'}")
        
        if raw_material_usage_exists:
            raw_material_status = "Raw Material Linked"
            raw_material_available = True
        else:
            raw_material_status = "Raw Material Not Linked"
        
        # Check 2D drawing availability
        has_2d, drawing_message = _check_part_has_2d_drawing(part_id, db)
        
        print(f"[DEBUG] 2D drawing query result for Part {part_id}: {'FOUND' if has_2d else 'NOT FOUND'} - {drawing_message}")
        
        if has_2d:
            drawing_status = "2D Drawing Available"
            drawing_available = True
        else:
            drawing_status = "2D Drawing Not Available"
        
        # Determine if activation should proceed
        if not raw_material_available or not drawing_available:
            # Build comprehensive error message
            missing_items = []
            if not raw_material_available:
                missing_items.append("raw material")
            if not drawing_available:
                missing_items.append("2D drawing")
            
            missing_str = " and ".join(missing_items)
            
            print(f"[DEBUG] Part {part.part_name} (ID: {part_id}) ACTIVATION BLOCKED: Missing {missing_str}")
            
            return {
                "message": f"Cannot activate this part. Missing {missing_str}.",
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "part_name": part.part_name,
                "part_number": part.part_number,
                "part_type": part_type_name,
                "status": "Activation Blocked",
                "order_status": None,
                "will_be_scheduled": False,
                "raw_material_status": raw_material_status,
                "drawing_status": drawing_status,
                "drawing_message": drawing_message,
                "note": f"Part requires both raw material and 2D drawing for activation. Current status: {raw_material_status}, {drawing_status}"
            }
        
        print(f"[DEBUG] Part {part.part_name} (ID: {part_id}) ACTIVATION ALLOWED: All pre-requisites met")

    # ----------------------------
    # Existing status record?
    # ----------------------------
    record = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.part_id == part_id
    ).first()

    now_utc = datetime.now(timezone.utc)

    # ----------------------------
    # IF RECORD EXISTS
    # ----------------------------
    if record:
        # already same status
        if record.status == status:
            if status == "active":
                activation_time = record.start_date.strftime("%Y-%m-%d %H:%M:%S %Z") if record.start_date else "Unknown"
                print(f"[DEBUG] Part {part.part_name} (ID: {part_id}) PART ALREADY ACTIVE, ACTIVATED AT {activation_time}: All pre-requisites met")
            return {
                "message": f"Part already {status}",
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "part_name": part.part_name,
                "part_number": part.part_number,
                "part_type": part_type_name,
                "status": status,
                "will_be_scheduled": part_type_name == "IN-House" and status == "active"
            }

        # update
        record.status = status
        record.updated_at = now_utc
        record.start_date = now_utc if status == "active" else None

        # if status == "active":
        #     record.start_date = now_utc
        # else:
        #     record.start_date = None

    else:
        # create new record
        record = PartScheduleStatus(
            sale_order_id=sale_order_id,
            part_id=part_id,
            status=status,
            created_at=now_utc,
            updated_at=now_utc,
            start_date=now_utc if status == "active" else None
        )
        db.add(record)

    db.flush()

    # ----------------------------
    # Assign OrderPartPriority if activating an IN-House part
    # EDGE CASE: Inactive order with many IN-House parts — user activates only
    # a few specific parts (not whole order). Each activated part gets a new
    # priority row; next priority = global max + 1, or 1 if no other active parts.
    # Only creates a row if one doesn't exist for this part+order.
    # ----------------------------
    if status == "active" and part_type_name == "IN-House":
        existing = db.query(OrderPartPriority).filter(
            OrderPartPriority.order_id == sale_order_id,
            OrderPartPriority.part_id == part_id
        ).first()
        if not existing:
            # Serialize priority assignment so bulk activation (multiple parts at once)
            # gets distinct priorities 1, 2, 3... instead of all getting the same number.
            _ADVISORY_LOCK_ORDER_PART_PRIORITY = 0x4F5050  # "OPP" in hex
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _ADVISORY_LOCK_ORDER_PART_PRIORITY})
            # Re-check after acquiring lock (another request may have added this part).
            existing = db.query(OrderPartPriority).filter(
                OrderPartPriority.order_id == sale_order_id,
                OrderPartPriority.part_id == part_id
            ).first()
            if not existing:
                max_row = db.query(OrderPartPriority).filter(
                    OrderPartPriority.priority > 0,
                    OrderPartPriority.status == "active"
                ).order_by(
                    OrderPartPriority.priority.desc()
                ).first()
                next_priority = (max_row.priority + 1) if max_row else 1
                db.add(OrderPartPriority(
                    order_id=sale_order_id,
                    product_id=order.product_id,
                    part_id=part_id,
                    priority=next_priority,
                    status="active",
                ))
                db.flush()
                # Renumber so priority order matches Part No order (002, 003, 004, 005 -> 1, 2, 3, 4)
                _compact_order_part_priorities_by_part_order(db)


    # ----------------------------
    # Sync status on OrderPartPriority row
    # If deactivating: set priority=0, shift all higher priorities down by 1
    # If activating:   status already set in the block above
    # ----------------------------
    priority_row = db.query(OrderPartPriority).filter(
        OrderPartPriority.order_id == sale_order_id,
        OrderPartPriority.part_id == part_id
    ).first()
    if priority_row:
        if status == "inactive":
            # Part-level deactivation: delete this row and resequence remaining (1..N, no gaps).
            _ADVISORY_LOCK_ORDER_PART_PRIORITY = 0x4F5050  # "OPP" in hex
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _ADVISORY_LOCK_ORDER_PART_PRIORITY})
            priority_row = db.query(OrderPartPriority).filter(
                OrderPartPriority.order_id == sale_order_id,
                OrderPartPriority.part_id == part_id
            ).first()
            if priority_row:
                db.delete(priority_row)
                db.flush()
                # Resequence remaining active parts globally to 1, 2, 3, ...
                _resequence_active_order_part_priorities(db)
        else:
            priority_row.status = "active"

    # ----------------------------
    # CLEANUP: Remove operation status entries for deactivated parts
    # ----------------------------
    if status == "inactive":
        # Remove operation status entries for operations of this part
        # that are no longer in planned_schedule_items
        operations_to_cleanup = db.execute(text("""
            SELECT DISTINCT os.operation_id
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE os.part_id = :part_id 
            AND os.order_id = :order_id
            AND psi.operation_id IS NULL
        """), {"part_id": part_id, "order_id": sale_order_id}).fetchall()
        
        if operations_to_cleanup:
            operation_ids_to_delete = [op[0] for op in operations_to_cleanup]
            deleted_count = db.query(OperationStatus).filter(
                OperationStatus.operation_id.in_(operation_ids_to_delete)
            ).delete(synchronize_session=False)
            
            print(f"[DEBUG] Cleaned up {deleted_count} operation status entries for deactivated part {part_id}")

    # ----------------------------
    # SYNC OrderScheduleStatus
    # ----------------------------
    active_count = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active"
    ).count()

    active_inhouse_count = db.query(PartScheduleStatus).join(
        Part, Part.id == PartScheduleStatus.part_id
    ).join(PartType, PartType.id == Part.type_id).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        PartType.id == 1
        # PartType.type_name == "IN-House"
    ).count()

    order_status = "active" if active_inhouse_count > 0 else "inactive"

    summary = db.query(OrderScheduleStatus).filter(
        OrderScheduleStatus.order_id == sale_order_id
    ).first()

    if not summary:
        summary = OrderScheduleStatus(
            order_id=sale_order_id,
            product_id=order.product_id,
            active_parts_count=active_count,
            active_inhouse_parts=active_inhouse_count,
            status=order_status,
            # activated_at = the part's own start_date (this request's timestamp)
            activated_at=record.start_date if order_status == "active" else None,
        )
        db.add(summary)
    else:
        summary.active_parts_count   = active_count
        summary.active_inhouse_parts = active_inhouse_count
        summary.status               = order_status

        if order_status == "active":
            # Preserve the EARLIEST activation time — never overwrite
            if not summary.activated_at:
                summary.activated_at = record.start_date
        else:
            # No more active IN-House parts → clear activation
            summary.activated_at = None

    db.commit()

    # ----------------------------
    # RESPONSE LOGIC
    # ----------------------------
    if part_type_name == "Out-Source":
        return {
            "message": "Part status updated",
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "part_name": part.part_name,
            "part_number": part.part_number,
            "part_type": part_type_name,
            "status": status,
            "will_be_scheduled": False,
            "note": "Out-source parts are not scheduled on machines"
        }

    # IN-HOUSE
    if status == "active":
        return {
            "message": "Part activated successfully",
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "part_name": part.part_name,
            "part_number": part.part_number,
            "part_type": part_type_name,
            "status": status,
            "will_be_scheduled": True,
            "raw_material_status": raw_material_status,
            "drawing_status": drawing_status,
            "note": "Part activated with both raw material and 2D drawing requirements met"
        }
    else:
        return {
            "message": "Part status updated",
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "part_name": part.part_name,
            "part_number": part.part_number,
            "part_type": part_type_name,
            "status": status,
            "will_be_scheduled": False
        }


# =========================================================
# SHIFT PART PRIORITIES (GLOBAL)
# =========================================================
@router.put("/part-priorities/swap")
def swap_part_priorities(swap: OrderPartPrioritySwap, db: Session = Depends(get_db)):
    """
    Shift-part swap (stable reorder) between two priority records.

    Frontend behaviour: when swapping A with B, move A into B's position and
    shift all priorities in between by 1 so the global sequence stays valid.

    Example:
      A at 6, B at 1  => A becomes 1; items 1..5 shift to 2..6 (B ends at 6)

  Requires priority_changed_by_id — must be an admin or manufacturing_coordinator.
    """
    changer = validate_priority_changed_by(db, swap.priority_changed_by_id)
    audit = priority_changed_by_audit(changer)

    record1 = (
        db.query(OrderPartPriority)
        .filter(OrderPartPriority.id == swap.id1)
        .with_for_update()
        .first()
    )
    record2 = (
        db.query(OrderPartPriority)
        .filter(OrderPartPriority.id == swap.id2)
        .with_for_update()
        .first()
    )

    if not record1 or not record2:
        logger.warning(
            "Priority swap blocked",
            extra={
                "event": "priority_swap_blocked",
                "priority_record_id_1": swap.id1,
                "priority_record_id_2": swap.id2,
                "reason": "priority_record_not_found",
                "changed_by_id": swap.priority_changed_by_id,
            },
        )
        raise HTTPException(status_code=404, detail="One or both priority records not found")

    # ── Check if parts are completed (block swap) ── #
    from DB.models.scheduling import Rescheduling
    from sqlalchemy import text as sa_text
    
    def is_part_completed(part_id: int, db: Session) -> bool:
        """
        A part is considered fully completed iff EVERY one of its operations has
        at least one production_log row with status='completed'.

        Previous logic was buggy: it queried for incomplete logs and treated
        "no incomplete logs" as completed. That mis-classified parts which were
        never started (zero logs) as completed.
        """
        from DB.models.oms import Operation

        # 1) Collect all operation IDs for this part
        op_ids = [
            row[0] for row in db.query(Operation.id)
            .filter(Operation.part_id == part_id).all()
        ]
        if not op_ids:
            # Part has no operations at all — nothing to complete
            return False

        # 2) Count distinct operations that have at least one completed log
        completed_count_row = db.execute(
            sa_text("""
                SELECT COUNT(DISTINCT operation_id)
                FROM scheduling.production_logs
                WHERE operation_id = ANY(:op_ids)
                  AND status = 'completed'
            """),
            {"op_ids": op_ids}
        ).fetchone()
        completed_count = completed_count_row[0] if completed_count_row else 0

        # 3) Part is completed only if EVERY operation has a completed log
        return completed_count == len(op_ids)
    
    # Update completed parts status in order_part_priorities table
    def update_completed_parts_status(db: Session):
        """
        Catch-up sync: for any part where all operations are completed but the
        priority row still shows 'active' (e.g. the completion hook in
        production_logs.py wasn't triggered), do the full retirement:
          1. status -> 'completed', priority -> 0 (out of the active queue)
          2. resequence remaining active rows to 1..N (no gaps)
          3. PartScheduleStatus -> 'inactive' for that part/order
        """
        from DB.models.oms import Part
        from DB.models.scheduling import PartScheduleStatus

        # Get all active priority records
        active_priorities = db.query(OrderPartPriority).filter(
            OrderPartPriority.status == "active"
        ).all()

        newly_completed_part_ids = []
        for priority_record in active_priorities:
            if is_part_completed(priority_record.part_id, db):
                priority_record.status = "completed"
                priority_record.priority = 0
                newly_completed_part_ids.append(
                    (priority_record.part_id, priority_record.order_id)
                )

        if newly_completed_part_ids:
            db.flush()
            # Resequence whatever is left in the active queue
            _resequence_active_order_part_priorities(db)

            # Flip PartScheduleStatus to 'completed' for every part just retired.
            # It only drops further to 'inactive' once its production_logs
            # history is cleared (see _revert_completed_parts_to_inactive_if_logs_cleared
            # in production_logs.py, run on log deletion).
            for part_id, order_id in newly_completed_part_ids:
                pps_record = db.query(PartScheduleStatus).filter(
                    PartScheduleStatus.sale_order_id == order_id,
                    PartScheduleStatus.part_id == part_id
                ).first()
                if pps_record and pps_record.status != "completed":
                    pps_record.status = "completed"
                    pps_record.updated_at = datetime.now(timezone.utc)
                    pps_record.start_date = None

        db.commit()
    
    # Update completed parts status
    update_completed_parts_status(db)
    
    # Check completion status for both parts
    part1_completed = is_part_completed(record1.part_id, db)
    part2_completed = is_part_completed(record2.part_id, db)
    
    if part1_completed and part2_completed:
        logger.warning(
            "Priority swap blocked",
            extra={
                "event": "priority_swap_blocked",
                "part_id_1": record1.part_id,
                "part_id_2": record2.part_id,
                "order_id_1": record1.order_id,
                "order_id_2": record2.order_id,
                "reason": "both_parts_completed",
                "changed_by_id": swap.priority_changed_by_id,
            },
        )
        raise HTTPException(
            status_code=400, 
            detail="Cannot swap - All operations for both parts are completed"
        )
    elif part1_completed:
        part1 = db.query(Part).filter(Part.id == record1.part_id).first()
        part_num = part1.part_number if part1 else str(record1.part_id)
        logger.warning(
            "Priority swap blocked",
            extra={
                "event": "priority_swap_blocked",
                "part_id": record1.part_id,
                "order_id": record1.order_id,
                "reason": "part_completed",
                "changed_by_id": swap.priority_changed_by_id,
            },
        )
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot swap - All operations for part {part_num} are completed"
        )
    elif part2_completed:
        part2 = db.query(Part).filter(Part.id == record2.part_id).first()
        part_num = part2.part_number if part2 else str(record2.part_id)
        logger.warning(
            "Priority swap blocked",
            extra={
                "event": "priority_swap_blocked",
                "part_id": record2.part_id,
                "order_id": record2.order_id,
                "reason": "part_completed",
                "changed_by_id": swap.priority_changed_by_id,
            },
        )
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot swap - All operations for part {part_num} are completed"
        )

    p1 = record1.priority
    p2 = record2.priority

    if p1 == p2:
        return {"message": "No change needed", **audit}

    lo = min(p1, p2)
    hi = max(p1, p2)

    # ── Check for in-progress operations (warning only, not blocking) ── #
    from DB.models.oms import Operation
    from DB.models.scheduling import ProductionLog
    warnings = []

    all_active_logs = db.query(ProductionLog).all()
    op_logs_by_id = {}
    for log in all_active_logs:
        op_logs_by_id.setdefault(log.operation_id, []).append(log)

    for op_id, logs in op_logs_by_id.items():
        logs_sorted = sorted(logs, key=lambda l: l.id)
        last_log = logs_sorted[-1] if logs_sorted else None
        
        # Check if operation is truly completed
        is_done = False
        if last_log:
            # Check if remaining quantity is 0 (completed)
            if (last_log.remaining_quantity_to_be_produced or 0) == 0:
                is_done = True
            # Check if status is "completed"
            elif last_log.status == "completed":
                is_done = True
        
        if is_done:
            continue

        # Check if operation is in progress
        # NOTE: when an operator submits a log and it's awaiting supervisor
        # approval, `status` stays "pending" (not "inprogress") — see
        # activate_job_card's own re-activation guard, which explicitly
        # checks operator_status='completed' AND status='pending' for this
        # exact state. Must include "pending" here too, or a submitted-but-
        # unapproved log (real, already-produced output) is invisible to
        # this warning check.
        is_inprogress = any(
            (l.operator_status == "inprogress" and l.to_time is None)
            or (
                l.operator_status == "completed"
                and l.status in _OPEN_PRODUCTION_LOG_STATUSES
            )
            for l in logs
        )

        if is_inprogress:
            op_obj = db.query(Operation).filter(Operation.id == op_id).first()
            if op_obj:
                part_obj = db.query(Part).filter(Part.id == op_obj.part_id).first()
                part_num = part_obj.part_number if part_obj else str(op_obj.part_id)
                
                # Add remaining quantity info to warning
                remaining_qty = last_log.remaining_quantity_to_be_produced if last_log else None
                message = f"Op {op_obj.operation_number} ({part_num}) is currently in production"
                if remaining_qty is not None:
                    message += f" (remaining quantity: {remaining_qty})"
                
                warnings.append({
                    "operation_id": op_id,
                    "operation_number": str(op_obj.operation_number),
                    "operation_name": op_obj.operation_name,
                    "part_number": part_num,
                    "warning_type": "in_progress",
                    "message": message
                })

    # ── Capture before-swap completion times ──────────────────────────── #
    from sqlalchemy import text as sa_text
    before_rows = db.execute(
        sa_text(
            "SELECT part_id, machine_id, end_time "
            "FROM scheduling.rescheduling_items "
            "WHERE status IN ('scheduled', 'rescheduled')"
        )
    ).fetchall()
    
    before_end: Dict[int, datetime] = {}
    for row in before_rows:
        pid, mid, et = row[0], row[1], row[2]
        existing = before_end.get(pid)
        if existing is None or et > existing:
            before_end[pid] = et

    # Lock the impacted range to avoid concurrent reorder races.
    db.query(OrderPartPriority).filter(
        OrderPartPriority.priority >= lo,
        OrderPartPriority.priority <= hi
    ).with_for_update().all()

    if p1 > p2:
        # Move record1 up into p2; shift [p2, p1-1] downwards by +1
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority >= p2,
            OrderPartPriority.priority < p1,
            OrderPartPriority.id != swap.id1  # don't touch record1 yet
        ).update(
            {OrderPartPriority.priority: OrderPartPriority.priority + 1},
            synchronize_session=False
        )
        record1.priority = p2
    else:
        # Move record1 down into p2; shift [p1+1, p2] upwards by -1
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority > p1,
            OrderPartPriority.priority <= p2,
            OrderPartPriority.id != swap.id1  # don't touch record1 yet
        ).update(
            {OrderPartPriority.priority: OrderPartPriority.priority - 1},
            synchronize_session=False
        )
        record1.priority = p2

    db.commit()

    # ── Run dynamic reschedule to apply priority changes ───────────────── #
    from algorithm import DynamicSchedulerEngine
    engine = DynamicSchedulerEngine(db)
    engine.dynamic_reschedule(dry_run=False)

    # ── Capture after-swap completion times ─────────────────────────────── #
    after_rows = db.execute(
        sa_text(
            "SELECT part_id, machine_id, end_time "
            "FROM scheduling.rescheduling_items "
            "WHERE status IN ('scheduled', 'rescheduled')"
        )
    ).fetchall()
    
    after_end: Dict[int, datetime] = {}
    for row in after_rows:
        pid, mid, et = row[0], row[1], row[2]
        existing = after_end.get(pid)
        if existing is None or et > existing:
            after_end[pid] = et

    # ── Calculate impact ───────────────────────────────────────────────── #
    # Load working minutes per day
    try:
        from DB.models.scheduling import ShiftHoursConfiguration, ShiftTimingConfiguration as STC
        from algorithm import DEFAULT_SHIFT_START, DEFAULT_SHIFT_END
        import datetime as _dt_mod
        ref_date = list(before_end.values())[0].date() if before_end else _dt_mod.date.today()
        shift_cfg = db.query(ShiftHoursConfiguration).filter(
            ShiftHoursConfiguration.date == ref_date
        ).first()
        if shift_cfg:
            timings = db.query(STC).filter(
                STC.shift_hours_configuration_id == shift_cfg.id
            ).all()
            total_shift_mins = sum(
                (datetime.combine(ref_date, t.shift_end) - datetime.combine(ref_date, t.shift_start)).total_seconds() / 60
                for t in timings if t.shift_start and t.shift_end
            )
            working_mins_per_day = total_shift_mins if total_shift_mins > 0 else 8.5 * 60
        else:
            s = datetime.combine(ref_date, DEFAULT_SHIFT_START)
            e = datetime.combine(ref_date, DEFAULT_SHIFT_END)
            working_mins_per_day = (e - s).total_seconds() / 60
    except Exception:
        working_mins_per_day = 8.5 * 60

    # ── Build gains / losses across ALL affected parts ─────────────────── #
    all_part_ids = list(set(list(before_end.keys()) + list(after_end.keys())))

    # Load part details for enriched response
    parts_map = {
        p.id: p for p in db.query(Part).filter(Part.id.in_(all_part_ids)).all()
    }

    # Calculate gains and losses
    gains = []
    losses = []
    all_part_ids = list(set(list(before_end.keys()) + list(after_end.keys())))
    
    for part_id in all_part_ids:
        old = before_end.get(part_id)
        new = after_end.get(part_id)
        
        if not old or not new:
            continue

        diff_mins = (new - old).total_seconds() / 60
        if abs(diff_mins) < 1:
            continue

        part_obj = parts_map.get(part_id)
        days_change = round(abs(diff_mins) / working_mins_per_day, 1)

        entry = {
            "part_id":           part_id,
            "part_number":       part_obj.part_number if part_obj else str(part_id),
            "part_name":         getattr(part_obj, "part_name", None) if part_obj else None,
            "completion_before": old.strftime("%d %b %Y %H:%M"),
            "completion_after":  new.strftime("%d %b %Y %H:%M"),
            "days_change":       days_change,
            "direction":         "earlier" if diff_mins < 0 else "delayed",
        }

        if diff_mins < 0:
            gains.append(entry)
        else:
            losses.append(entry)

    total_gain_days = sum(g["days_change"] for g in gains)
    total_loss_days = sum(l["days_change"] for l in losses)

    # ── Specific impact for the two parts being swapped ─────────────────── #
    # Part being moved (record1)
    def _build_swap_specific_impact(record, old_priority, new_priority):
        """Return per-part before/after impact dict using actual rescheduled times."""
        part_obj = db.query(Part).filter(Part.id == record.part_id).first()
        old_end  = before_end.get(record.part_id)
        new_end  = after_end.get(record.part_id)

        base = {
            "part_id":      record.part_id,
            "part_number":  part_obj.part_number if part_obj else str(record.part_id),
            "part_name":    getattr(part_obj, "part_name", None) if part_obj else None,
            "old_priority": old_priority,
            "new_priority": new_priority,
        }

        if old_end and new_end:
            diff_mins = (new_end - old_end).total_seconds() / 60
            diff_days = diff_mins / working_mins_per_day
            base.update({
                "old_completion": old_end.strftime("%d %b %Y %H:%M"),
                "new_completion": new_end.strftime("%d %b %Y %H:%M"),
                "days_change":    round(diff_days, 1),
                "direction":      "earlier" if diff_mins < 0 else "later" if diff_mins > 0 else "no change",
            })
        else:
            base.update({
                "old_completion": old_end.strftime("%d %b %Y %H:%M") if old_end else None,
                "new_completion": new_end.strftime("%d %b %Y %H:%M") if new_end else None,
                "days_change":    None,
                "direction":      "no data",
            })

        return base

    # Compute new priority for displaced part after the shift
    if p1 > p2:
        displaced_new_priority = p2 + 1  # record2 was at p2, shifted down
    else:
        displaced_new_priority = p2 - 1  # record2 was at p2, shifted up

    moved_part_impact    = _build_swap_specific_impact(record1, p1, p2)
    displaced_part_impact = _build_swap_specific_impact(record2, p2, displaced_new_priority)

    logger.info(
        "Priority swap committed",
        extra={
            "event": "priority_swap_committed",
            "part_id_moved": record1.part_id,
            "part_id_displaced": record2.part_id,
            "order_id_moved": record1.order_id,
            "order_id_displaced": record2.order_id,
            "old_priority_moved": p1,
            "new_priority_moved": p2,
            "changed_by_id": swap.priority_changed_by_id,
            "warnings_count": len(warnings),
            "parts_benefiting": len(gains),
            "parts_delayed": len(losses),
        },
    )

    return {
        "message": "Priorities shifted successfully",
        **audit,
        "warnings": warnings,
        "impact_analysis": {
            "parts_benefiting":   len(gains),
            "parts_delayed":      len(losses),
            "total_benefit_days": round(total_gain_days, 1),
            "total_delay_days":   round(total_loss_days, 1),
            "net_impact_days":    round(total_gain_days - total_loss_days, 1),
            "parts_affected_details": {
                "gains":  gains,
                "losses": losses,
            },
            "swap_specific_impact": {
                "part_being_moved":      moved_part_impact,
                "part_being_displaced":  displaced_part_impact,
            },
        },
    }




# =============================================================================
# Simulate Priority Swap — Dry Run Impact Analysis
# =============================================================================

def _op_schedule_times_changed(
    current_times: Dict,
    simulated_times: Dict,
    threshold_minutes: float = 1.0,
) -> bool:
    """True when start or end differs by more than threshold_minutes."""
    threshold_secs = threshold_minutes * 60

    def _to_dt(value):
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value))
        except (TypeError, ValueError):
            return None

    for field in ("start_time", "end_time"):
        cur_dt = _to_dt(current_times.get(field))
        sim_dt = _to_dt(simulated_times.get(field))
        if cur_dt is None and sim_dt is None:
            continue
        if cur_dt is None or sim_dt is None:
            return True
        if abs((sim_dt - cur_dt).total_seconds()) > threshold_secs:
            return True
    return False


@router.post("/part-priorities/simulate-swap")
def simulate_priority_swap(
    swap: SimulatePrioritySwapRequest,
    db: Session = Depends(get_db),
):
    """
    Dry-run a priority swap and return manufacturing-friendly impact analysis.

    Response Structure:
    - summary: Quick overview with recommendation (PROCEED/CAUTION/BLOCKED/NOT RECOMMENDED)
    - what_changes: Detailed list of parts affected and benefiting
    - critical_warnings: High-impact warnings (deadline misses, in-production parts)
    - blocked_operations: Operations that prevent the swap (if any)
    - detailed_analysis: Technical details for advanced users

    Key Manufacturing Insights Provided:
    1. Which parts will be delayed and by how many working days
    2. Which parts will complete earlier
    3. Whether any parts will miss delivery deadlines
    4. Whether any parts currently in production will be affected
    5. Net impact on overall schedule
    6. Which machines will be affected
    """
    try:
        from algorithm import DynamicSchedulerEngine
        from DB.models.oms import OrderPartPriority, Part, Order, Operation
        from DB.models.scheduling import Rescheduling, ProductionLog
        from sqlalchemy import func as sqlfunc

        # ── 1. Load both priority records ─────────────────────────────── #
        record1 = db.query(OrderPartPriority).filter(
            OrderPartPriority.id == swap.id1
        ).first()
        record2 = db.query(OrderPartPriority).filter(
            OrderPartPriority.id == swap.id2
        ).first()

        if not record1 or not record2:
            raise HTTPException(404, "One or both priority records not found")

        # ── Block simulation for parts that have already completed all operations ── #
        # Mirrors the guard on the real /part-priorities/swap endpoint — a completed
        # part is no longer in the live queue, so simulating a swap involving it is
        # meaningless (and would report a schedule impact that can never happen).
        def _sim_is_part_completed(part_id: int, db: Session) -> bool:
            op_ids = [
                row[0] for row in db.query(Operation.id)
                .filter(Operation.part_id == part_id).all()
            ]
            if not op_ids:
                return False
            completed_count = db.execute(
                text("""
                    SELECT COUNT(DISTINCT operation_id)
                    FROM scheduling.production_logs
                    WHERE operation_id = ANY(:op_ids)
                      AND status = 'completed'
                """),
                {"op_ids": op_ids}
            ).scalar()
            return (completed_count or 0) == len(op_ids)

        part1_done = record1.status == "completed" or _sim_is_part_completed(record1.part_id, db)
        part2_done = record2.status == "completed" or _sim_is_part_completed(record2.part_id, db)

        if part1_done or part2_done:
            done_part_ids = (
                [record1.part_id] if part1_done else []
            ) + ([record2.part_id] if part2_done else [])
            done_parts = db.query(Part).filter(Part.id.in_(done_part_ids)).all()
            done_numbers = ", ".join(p.part_number for p in done_parts) or str(done_part_ids)
            logger.warning(
                "Priority swap simulation blocked",
                extra={
                    "event": "priority_swap_blocked",
                    "part_id_1": record1.part_id,
                    "part_id_2": record2.part_id,
                    "reason": "part_completed",
                    "completed_part_ids": done_part_ids,
                },
            )
            raise HTTPException(
                400,
                f"Cannot simulate swap - all operations for part(s) {done_numbers} "
                f"are already completed"
            )

        if record1.priority == record2.priority:
            return {"message": "No change needed", "impacts": []}

        # ── 2. Build simulated priority map FIRST (to get part IDs in scope) ── #
        from sqlalchemy import text as sa_text_snap
        p1, p2 = record1.priority, record2.priority
        lo, hi = min(p1, p2), max(p1, p2)

        # ── BUG FIX 1: query priority range across ALL orders ─────────── #
        # Old code filtered by order_id == record1.order_id, so cross-order
        # swaps only moved one side and left record2's order untouched.
        # Priorities are global, so the shift must span all orders.
        all_rows_in_range = db.query(OrderPartPriority).filter(
            OrderPartPriority.priority >= lo,
            OrderPartPriority.priority <= hi,
        ).all()

        # Extract part IDs in scope for filtering machines
        part_ids_in_scope = {r.part_id for r in all_rows_in_range}

        # ── 3. Load current schedule (BEFORE swap) ──────────────────────── #
        current_raw = db.execute(
            sa_text_snap(
                "SELECT part_id, machine_id, end_time "
                "FROM scheduling.rescheduling_items "
                "WHERE status IN ('scheduled', 'rescheduled')"
            )
        ).fetchall()

        current_end: Dict[int, datetime] = {}
        current_part_machines: Dict[int, set] = {}  # Track machines per part
        for row in current_raw:
            pid, mid, et = row[0], row[1], row[2]
            existing = current_end.get(pid)
            if existing is None or et > existing:
                current_end[pid] = et
            # Track machines used by each part
            if mid:
                if pid not in current_part_machines:
                    current_part_machines[pid] = set()
                current_part_machines[pid].add(mid)

        # ── 4. Build simulated priority map ───────────────────────────── #

        simulated_priorities: Dict[int, int] = {
            r.part_id: r.priority for r in all_rows_in_range
        }

        # Apply shift logic — mirrors the actual swap endpoint exactly
        if p1 > p2:
            # record1 moves up; shift [p2, p1-1] down by +1
            for r in all_rows_in_range:
                if r.id == swap.id1:
                    simulated_priorities[r.part_id] = p2
                elif p2 <= r.priority < p1:
                    simulated_priorities[r.part_id] = r.priority + 1
        else:
            # record1 moves down; shift [p1+1, p2] up by -1
            for r in all_rows_in_range:
                if r.id == swap.id1:
                    simulated_priorities[r.part_id] = p2
                elif p1 < r.priority <= p2:
                    simulated_priorities[r.part_id] = r.priority - 1

        # ── 4. Run dynamic_reschedule with simulated priorities ────────── #
        engine = DynamicSchedulerEngine(db)

        # Helper: count true working minutes between two datetimes using the
        # same shift calendar (ShiftHoursConfiguration + ShiftTimingConfiguration)
        # that the scheduler uses. Skips non-working days and counts only the
        # configured shift window for each working day.
        def _working_minutes_between(start_dt: datetime, end_dt: datetime) -> float:
            if not start_dt or not end_dt or end_dt <= start_dt:
                return 0.0
            total_mins = 0.0
            day = start_dt.date()
            last_day = end_dt.date()
            safety = 3650  # ~10 years
            while day <= last_day and safety > 0:
                safety -= 1
                probe = datetime.combine(day, dtime(12, 0))
                if engine._is_working_day(probe):
                    shift_start_t, shift_end_t = engine._shift_window(probe)
                    day_start = datetime.combine(day, shift_start_t)
                    day_end = datetime.combine(day, shift_end_t)
                    seg_start = max(day_start, start_dt)
                    seg_end = min(day_end, end_dt)
                    if seg_end > seg_start:
                        total_mins += (seg_end - seg_start).total_seconds() / 60.0
                day = day + timedelta(days=1)
            return total_mins

        # Capture current operation times BEFORE simulation (before swap)
        # Operations can be split into segments, so aggregate MIN(start) and MAX(end)
        from sqlalchemy import text as sa_text
        current_op_times: Dict[int, Dict] = {}
        for part_id in part_ids_in_scope:
            part_ops = db.execute(
                sa_text(
                    """SELECT r.operation_id, MIN(r.start_time) as start_time, MAX(r.end_time) as end_time, r.machine_id
                       FROM scheduling.rescheduling_items r
                       WHERE r.part_id = :part_id AND r.status IN ('scheduled', 'rescheduled')
                       GROUP BY r.operation_id, r.machine_id"""
                ),
                {"part_id": part_id}
            ).fetchall()
            for op_id, start, end, machine_id in part_ops:
                current_op_times[op_id] = {
                    "start_time": start.isoformat() if start else None,
                    "end_time": end.isoformat() if end else None,
                    "machine_id": machine_id
                }

        try:
            # Write simulated priorities for ALL rows in range (all orders)
            for r in all_rows_in_range:
                new_p = simulated_priorities.get(r.part_id, r.priority)
                db.query(OrderPartPriority).filter(
                    OrderPartPriority.id == r.id
                ).update({"priority": new_p}, synchronize_session=False)

            db.expire_all()

            # dry_run=True: flushes to DB within transaction, does NOT commit
            engine.dynamic_reschedule(dry_run=True)

            from sqlalchemy import text as sa_text
            raw_rows = db.execute(
                sa_text(
                    "SELECT part_id, machine_id, end_time "
                    "FROM scheduling.rescheduling_items "
                    "WHERE status IN ('scheduled', 'rescheduled')"
                )
            ).fetchall()

            simulated_end: Dict[int, datetime] = {}
            simulated_part_machines: Dict[int, set] = {}  # Track machines per part
            for row in raw_rows:
                pid, mid, et = row[0], row[1], row[2]
                existing = simulated_end.get(pid)
                if existing is None or et > existing:
                    simulated_end[pid] = et
                # Track machines used by each part
                if mid:
                    if pid not in simulated_part_machines:
                        simulated_part_machines[pid] = set()
                    simulated_part_machines[pid].add(mid)

            # Capture simulated operation times BEFORE rollback
            # Operations can be split into segments, so aggregate MIN(start) and MAX(end)
            simulated_op_times: Dict[int, Dict] = {}
            for part_id in part_ids_in_scope:
                part_ops = db.execute(
                    sa_text(
                        """SELECT r.operation_id, MIN(r.start_time) as start_time, MAX(r.end_time) as end_time, r.machine_id
                           FROM scheduling.rescheduling_items r
                           WHERE r.part_id = :part_id AND r.status IN ('scheduled', 'rescheduled')
                           GROUP BY r.operation_id, r.machine_id"""
                    ),
                    {"part_id": part_id}
                ).fetchall()
                for op_id, start, end, machine_id in part_ops:
                    simulated_op_times[op_id] = {
                        "start_time": start.isoformat() if start else None,
                        "end_time": end.isoformat() if end else None,
                        "machine_id": machine_id
                    }

        finally:
            # ROLLBACK — all priority writes and rescheduling_items changes revert
            db.rollback()
            db.expire_all()

        # ── 5. Load part details ───────────────────────────────────────── #
        all_part_ids = list(set(list(current_end.keys()) + list(simulated_end.keys())))
        parts_map = {
            p.id: p for p in db.query(Part).filter(Part.id.in_(all_part_ids)).all()
        }

        # Build detailed machine impact — only machines/ops whose times actually change
        from sqlalchemy import text as sa_text
        machine_impact_details: Dict[int, Dict] = {}
        machines_affected: set = set()
        
        for part_id in part_ids_in_scope:
            part = parts_map.get(part_id)
            part_number = part.part_number if part else str(part_id)
            
            # Get operations for this part from current schedule
            part_ops = db.execute(
                sa_text(
                    """SELECT r.operation_id, o.operation_number, o.operation_name, r.machine_id
                       FROM scheduling.rescheduling_items r
                       JOIN oms.operations o ON r.operation_id = o.id
                       WHERE r.part_id = :part_id AND r.status IN ('scheduled', 'rescheduled')
                       GROUP BY r.operation_id, o.operation_number, o.operation_name, r.machine_id"""
                ),
                {"part_id": part_id}
            ).fetchall()
            
            for op_id, op_num, op_name, machine_id in part_ops:
                if machine_id:
                    if machine_id not in machine_impact_details:
                        machine_impact_details[machine_id] = {
                            "parts": [],
                            "operations": []
                        }

                    # Add schedule times (before and after)
                    current_times = current_op_times.get(op_id, {})
                    simulated_times = simulated_op_times.get(op_id, {})
                    
                    op_entry = {
                        "part_number": part_number,
                        "operation_number": str(op_num),
                        "operation_name": op_name,
                        "operation_id": op_id,
                        "current_start_time": current_times.get("start_time"),
                        "current_end_time": current_times.get("end_time"),
                        "simulated_start_time": simulated_times.get("start_time"),
                        "simulated_end_time": simulated_times.get("end_time"),
                    }
                    if not _op_schedule_times_changed(current_times, simulated_times):
                        continue
                    machine_impact_details[machine_id]["parts"].append(part_number)
                    machine_impact_details[machine_id]["operations"].append(op_entry)
                    machines_affected.add(machine_id)

        # Drop machines that ended up with no changed operations
        machine_impact_details = {
            mid: details
            for mid, details in machine_impact_details.items()
            if details.get("operations")
        }
        machines_affected = set(machine_impact_details.keys())

        # Resolve machine IDs → {id, name} so the frontend can display
        # "Mazak QT-200" instead of "Machine 25"
        if machines_affected:
            machine_objs = (
                db.query(Machine)
                .filter(Machine.id.in_(machines_affected))
                .all()
            )
            machine_id_to_name = {
                m.id: f"{m.make} {m.model}".strip() for m in machine_objs
            }

            machines_affected = [
                {
                    "id": mid,
                    "name": machine_id_to_name.get(mid) or f"Machine {mid}",
                    "parts_affected": list(set(machine_impact_details.get(mid, {}).get("parts", []))),
                    "operations": machine_impact_details.get(mid, {}).get("operations", []),
                    "reason": (
                        "Schedule changed on this machine due to priority reordering."
                    ),
                }
                for mid in sorted(machines_affected)
            ]
        else:
            machines_affected = []



















        # ── 6. In-progress check per part ────────────────────────────────#
        inprogress_part_ids: set = set()
        inprogress_detail_map: Dict[int, dict] = {}
        partially_completed_part_ids: set = set()

        from DB.models.configuration import Machine as MachineModel
        from DB.models.scheduling import PlannedScheduleItem
        from datetime import datetime as _dt

        all_op_ids_with_logs = [
            r[0] for r in db.query(ProductionLog.operation_id).distinct().all()
        ]

        truly_inprogress_op_ids: set = set()
        completed_op_ids: set = set()
        op_all_logs_map: Dict[int, list] = {}

        for op_id in all_op_ids_with_logs:
            all_logs = db.query(ProductionLog).filter(
                ProductionLog.operation_id == op_id
            ).order_by(ProductionLog.id.asc()).all()
            op_all_logs_map[op_id] = all_logs

            # Check the LATEST log first - if it's completed, operation is done
            if all_logs:
                latest_log = all_logs[-1]
                if latest_log.status == "completed":
                    completed_op_ids.add(op_id)
                    continue  # Operation is complete, skip

            # Otherwise, check if any log has remaining_quantity_to_be_produced == 0
            is_completed = any(
                l.status == "completed" and
                (l.remaining_quantity_to_be_produced or -1) == 0
                for l in all_logs
            )
            if is_completed:
                completed_op_ids.add(op_id)
                continue

            # Same fix as the real-swap warning check above: a submitted-but-
            # unapproved log sits at status="pending", not "inprogress".
            is_inprogress = any(
                (l.operator_status == "inprogress" and l.to_time is None)
                or
                (l.operator_status == "completed" and l.status in ("pending", "inprogress"))
                for l in all_logs
            )
            if is_inprogress:
                truly_inprogress_op_ids.add(op_id)

        if truly_inprogress_op_ids:
            inprogress_ops = db.query(Operation).filter(
                Operation.id.in_(truly_inprogress_op_ids)
            ).all()
            inprogress_part_ids = {op.part_id for op in inprogress_ops}

            for op in inprogress_ops:
                all_logs = op_all_logs_map.get(op.id, [])
                if not all_logs:
                    continue

                first_log = next(
                    (l for l in all_logs
                     if l.operator_status == "inprogress" and l.from_date and l.from_time),
                    all_logs[0]
                )
                actual_start = None
                if first_log.from_date and first_log.from_time:
                    actual_start = _dt.combine(
                        first_log.from_date, first_log.from_time
                    ).isoformat()

                completed_log = next(
                    (l for l in reversed(all_logs)
                     if l.status == "completed"
                     and (l.remaining_quantity_to_be_produced or 0) == 0),
                    None
                )
                end_log = completed_log or max(
                    (l for l in all_logs if l.to_date and l.to_time),
                    key=lambda l: l.id,
                    default=None
                )
                actual_end = None
                if end_log and end_log.to_date and end_log.to_time:
                    actual_end = _dt.combine(
                        end_log.to_date, end_log.to_time
                    ).isoformat()

                approved_qty = sum((l.approved_quantity or 0) for l in all_logs)

                ri = (
                    db.query(Rescheduling)
                    .filter(Rescheduling.operation_id == op.id)
                    .first()
                )
                psi = None
                if not ri:
                    psi = (
                        db.query(PlannedScheduleItem)
                        .filter(PlannedScheduleItem.operation_id == op.id)
                        .first()
                    )
                total_qty_val = (
                    ri.total_qty if ri
                    else (psi.total_quantity if psi else None)
                )
                machine_id_ref = (
                    ri.machine_id if ri
                    else (psi.machine_id if psi else None)
                )

                machine_name = None
                if machine_id_ref:
                    machine_obj = db.query(MachineModel).filter(
                        MachineModel.id == machine_id_ref
                    ).first()
                    if machine_obj:
                        machine_name = f"{machine_obj.make} {machine_obj.model}"

                inprogress_detail_map[op.part_id] = {
                    "operation_id":     op.id,
                    "operation_number": str(op.operation_number),
                    "operation_name":   op.operation_name,
                    "machine_name":     machine_name,
                    "approved_qty":     approved_qty,
                    "total_qty":        total_qty_val,
                    "remaining_qty":    (total_qty_val - approved_qty) if total_qty_val else None,
                    "actual_start":     actual_start,
                    "actual_end":       actual_end,
                }

        # Track parts with partially completed operations (some ops done, but not all)
        if completed_op_ids:
            completed_ops = db.query(Operation).filter(
                Operation.id.in_(completed_op_ids)
            ).all()
            completed_part_ids = {op.part_id for op in completed_ops}
            
            # For each part with completed ops, check if ALL ops are completed
            for part_id in completed_part_ids:
                all_part_ops = db.query(Operation.id).filter(
                    Operation.part_id == part_id
                ).all()
                all_part_op_ids = {op[0] for op in all_part_ops}
                completed_count = len(all_part_op_ids & completed_op_ids)
                
                # If some but not all operations are completed, it's partially completed
                if completed_count > 0 and completed_count < len(all_part_op_ids):
                    partially_completed_part_ids.add(part_id)

        # ── 7. Due dates for both orders ──────────────────────────────── #
        order1 = db.query(Order).filter(Order.id == record1.order_id).first()
        order2 = db.query(Order).filter(Order.id == record2.order_id).first()
        due_date1 = getattr(order1, "due_date", None) if order1 else None
        due_date2 = getattr(order2, "due_date", None) if order2 else None

        # ── BUG FIX 2: shift_config_id → shift_hours_configuration_id ── #
        # simulate-swap used STC.shift_config_id (wrong field name).
        # The correct FK column is shift_hours_configuration_id (matches swap endpoint).
        try:
            from DB.models.scheduling import ShiftHoursConfiguration, ShiftTimingConfiguration as STC
            from algorithm import DEFAULT_SHIFT_START, DEFAULT_SHIFT_END
            ref_date = list(current_end.values())[0].date() if current_end else __import__("datetime").date.today()
            shift_cfg = db.query(ShiftHoursConfiguration).filter(
                ShiftHoursConfiguration.date == ref_date
            ).first()
            if shift_cfg:
                timings = db.query(STC).filter(
                    STC.shift_hours_configuration_id == shift_cfg.id   # FIXED field name
                ).all()
                total_shift_mins = sum(
                    (datetime.combine(ref_date, t.shift_end) - datetime.combine(ref_date, t.shift_start)).total_seconds() / 60
                    for t in timings if t.shift_start and t.shift_end
                )
                working_mins_per_day = total_shift_mins if total_shift_mins > 0 else 8.5 * 60
            else:
                s = datetime.combine(ref_date, DEFAULT_SHIFT_START)
                e = datetime.combine(ref_date, DEFAULT_SHIFT_END)
                working_mins_per_day = (e - s).total_seconds() / 60
        except Exception:
            working_mins_per_day = 8.5 * 60

        # Use due dates for deadline checking
        due_dt1 = datetime.combine(due_date1, __import__("datetime").time(17, 0)) if due_date1 else None
        due_dt2 = datetime.combine(due_date2, __import__("datetime").time(17, 0)) if due_date2 else None

        # ── 8. Block / Caution check ──────────────────────────────────── #
        blocked = False
        block_reason = None
        blocked_parts: list = []
        caution_parts: list = []

        all_active_logs = db.query(ProductionLog).all()
        op_logs_by_id: Dict[int, list] = {}
        for log in all_active_logs:
            op_logs_by_id.setdefault(log.operation_id, []).append(log)

        for op_id, logs in op_logs_by_id.items():
            logs_sorted = sorted(logs, key=lambda l: l.id)
            last_log = logs_sorted[-1] if logs_sorted else None
            is_done = last_log and (last_log.remaining_quantity_to_be_produced or -1) == 0
            if is_done:
                continue

            is_blocked_op = any(
                l.operator_status == "inprogress" and l.to_time is None
                for l in logs
            )

            is_caution_op = False
            if last_log:
                is_caution_op = (
                    # Operator submitted produced output; supervisor hasn't
                    # reviewed it yet. The real status here is "pending" (set
                    # by activate_job_card / left at the DB default) — NOT
                    # "inprogress". Checking only "inprogress" let a fully
                    # submitted-but-unapproved log slip through undetected
                    # and get reported as safe to swap, which ignores real,
                    # already-produced operator output.
                    (last_log.operator_status == "completed" and
                     last_log.status in ("pending", "inprogress"))
                    or
                    (last_log.status == "inprogress" and
                     (last_log.remaining_quantity_to_be_produced or 0) > 0)
                )

            if is_blocked_op:
                op_obj = db.query(Operation).filter(Operation.id == op_id).first()
                if not op_obj:
                    continue
                part_obj = db.query(Part).filter(Part.id == op_obj.part_id).first()
                part_num = part_obj.part_number if part_obj else str(op_obj.part_id)
                
                # Find the specific log that's causing the block
                blocking_log = next((l for l in logs if l.operator_status == "inprogress" and l.to_time is None), None)
                if blocking_log:
                    block_reason = f"Job card activated. Operator working on production log (ID: {blocking_log.id}). from_time logged ({blocking_log.from_time}), to_time not yet logged. Work in progress."
                else:
                    block_reason = "Job card activated. Operator working. Check production logs for details."
                
                blocked = True
                blocked_parts.append({
                    "part_id":          op_obj.part_id,
                    "part_number":      part_num,
                    "operation_id":     op_id,
                    "operation_number": str(op_obj.operation_number),
                    "operation_name":   op_obj.operation_name,
                    "block_reason":     block_reason,
                    "severity":         "blocked",
                })

            elif is_caution_op:
                op_obj = db.query(Operation).filter(Operation.id == op_id).first()
                if not op_obj:
                    continue
                part_obj = db.query(Part).filter(Part.id == op_obj.part_id).first()
                part_num = part_obj.part_number if part_obj else str(op_obj.part_id)

                # Build specific reason based on production log state
                if last_log:
                    if last_log.operator_status == "completed" and last_log.status in ("pending", "inprogress"):
                        # Case: Operator submitted work, supervisor hasn't approved yet
                        approved_qty = last_log.approved_quantity or 0
                        remaining_qty = last_log.remaining_quantity_to_be_produced or 0
                        reason = f"Operator submitted production log (ID: {last_log.id}) with {approved_qty} units approved. {remaining_qty} units remaining. Awaiting supervisor approval."
                    elif last_log.status == "inprogress" and (last_log.remaining_quantity_to_be_produced or 0) > 0:
                        # Case: Partially approved by supervisor, some units remaining
                        remaining_qty = last_log.remaining_quantity_to_be_produced
                        reason = f"Production log (ID: {last_log.id}) partially approved by supervisor. {remaining_qty} units remaining to be produced."
                    else:
                        reason = f"Production log (ID: {last_log.id}) in incomplete state. Check production logs for operation {op_id}."
                else:
                    reason = "Production logs exist but in incomplete state"

                caution_parts.append({
                    "part_id":          op_obj.part_id,
                    "part_number":      part_num,
                    "operation_id":     op_id,
                    "operation_number": str(op_obj.operation_number),
                    "operation_name":   op_obj.operation_name,
                    "caution_reason":   reason,
                    "severity":         "caution",
                })

        if blocked:
            # ── SMARTER LOGIC: Check if blocked operations are actually affected ── #
            blocked_part_ids = {op["part_id"] for op in blocked_parts}
            blocked_parts_affected = []

            for part_id in blocked_part_ids:
                old_end = current_end.get(part_id)
                new_end = simulated_end.get(part_id)
                if old_end and new_end:
                    # Check if completion time changes
                    time_diff = abs((new_end - old_end).total_seconds() / 60)
                    if time_diff > 1:  # More than 1 minute change = affected
                        blocked_parts_affected.append(part_id)

            # If blocked operations won't be affected, downgrade to CAUTION
            if not blocked_parts_affected:
                blocked = False  # Downgrade from blocked
                # Convert blocked parts to caution parts with appropriate reason
                for blocked_op in blocked_parts:
                    caution_op = blocked_op.copy()
                    caution_op["caution_reason"] = "operation in production but swap will not affect schedule"
                    caution_op["severity"] = "caution"
                    del caution_op["block_reason"]
                    caution_parts.append(caution_op)
                block_reason = None
            else:
                block_reason = (
                    f"Swap blocked — {len(blocked_parts_affected)} operation(s) "
                    f"are currently in active production AND will be affected by the swap. "
                    f"Complete all active operations before swapping priorities."
                )

        # ── 9. Gains / losses across ALL parts ────────────────────────── #
        gains = []
        losses = []
        all_affected_part_ids = set(current_end.keys()).union(set(simulated_end.keys()))

        for part_id in all_affected_part_ids:
            old_end = current_end.get(part_id)
            new_end = simulated_end.get(part_id)
            if old_end is None or new_end is None:
                continue

            delay_minutes = (new_end - old_end).total_seconds() / 60
            if abs(delay_minutes) < 1:
                continue

            part        = parts_map.get(part_id)
            part_number = part.part_number if part else str(part_id)
            part_name   = getattr(part, "part_name", None) if part else None
            is_assembly = "ASS" in str(part_number).upper() if part_number else False

            # Use appropriate due date based on part's order
            part_order_id = part.product_id if part else None
            if part_order_id == record1.order_id:
                part_due_dt = due_dt1
            elif part_order_id == record2.order_id:
                part_due_dt = due_dt2
            else:
                part_due_dt = None

            if part_due_dt:
                # Working-minute overdue: count only shift hours from due date
                # to completion (skips weekends/non-working days, respects shifts).
                old_overdue_mins     = _working_minutes_between(part_due_dt, old_end) if old_end > part_due_dt else 0.0
                new_overdue_mins     = _working_minutes_between(part_due_dt, new_end) if new_end > part_due_dt else 0.0
                was_already_late     = old_overdue_mins > 0
                additional_late_mins = new_overdue_mins - old_overdue_mins
            else:
                old_overdue_mins = new_overdue_mins = additional_late_mins = 0.0
                was_already_late = False

            # days_change uses working-minute delta between the two completion times
            working_delay_mins = _working_minutes_between(old_end, new_end) if new_end > old_end else (
                -_working_minutes_between(new_end, old_end) if old_end > new_end else 0.0
            )
            days_change = round(abs(working_delay_mins) / working_mins_per_day, 1)
            ip_detail   = inprogress_detail_map.get(part_id)

            if part_id in inprogress_part_ids and ip_detail:
                if ip_detail.get("actual_end") is None:
                    state = f"Op {ip_detail['operation_number']} - {ip_detail['operation_name']} — operator working, not submitted yet"
                else:
                    state = f"Op {ip_detail['operation_number']} - {ip_detail['operation_name']} — submitted, awaiting supervisor"
            elif part_id in inprogress_part_ids:
                state = "In production"
            elif part_id in partially_completed_part_ids:
                state = "Operations partially completed"
            else:
                state = "Not started yet"

            entry = {
                "part_id":               part_id,
                "part_number":           part_number,
                "part_name":             part_name,
                "is_assembly":           is_assembly,
                "is_inprogress":         part_id in inprogress_part_ids,
                "state":                 state,
                "inprogress_operation":  ip_detail,
                "completion_before":     old_end.strftime("%d %b %Y %H:%M") if old_end else None,
                "completion_after":      new_end.strftime("%d %b %Y %H:%M") if new_end else None,
                "days_change":           days_change,
                "direction":             "earlier" if delay_minutes < 0 else "delayed",
                "already_overdue_days":  round(old_overdue_mins / working_mins_per_day, 1),
                "additional_delay_days": round(additional_late_mins / working_mins_per_day, 1),
                "newly_misses_deadline": (not was_already_late and new_overdue_mins > 0),
            }

            if delay_minutes < 0:
                gains.append(entry)
            else:
                losses.append(entry)

        losses.sort(key=lambda x: abs(x["days_change"]), reverse=True)

        # ── 10. Severity + net assessment ─────────────────────────────── #
        has_inprogress_impact = any(l["is_inprogress"] for l in losses)
        has_partially_completed = any(l["part_id"] in partially_completed_part_ids for l in losses)
        has_new_deadline_miss = any(l["newly_misses_deadline"] for l in losses)
        has_extra_lateness    = any(l["additional_delay_days"] > 1 for l in losses)

        if has_new_deadline_miss or has_inprogress_impact:
            severity = "high"
        elif has_extra_lateness or len(losses) > 3:
            severity = "medium"
        elif losses:
            severity = "low"
        else:
            severity = "none"

        total_gain_days = sum(g["days_change"] for g in gains)
        total_loss_days = sum(l["days_change"] for l in losses)
        moving_part        = parts_map.get(record1.part_id)
        moving_part_number = moving_part.part_number if moving_part else str(record1.part_id)

        if total_gain_days >= total_loss_days:
            net_assessment = (
                f"Swap benefits {moving_part_number} by {total_gain_days:.1f} working days "
                f"with no net loss to other parts."
            )
        else:
            inprog_note = " Some affected parts are currently in production." if has_inprogress_impact else ""
            net_assessment = (
                f"Swap benefits {moving_part_number} by {total_gain_days:.1f} working days "
                f"but delays {len(losses)} other part(s) by a combined {total_loss_days:.1f} working days. "
                f"Net impact is negative.{inprog_note}"
            )

        # ── 11. Recommendation ────────────────────────────────────────── #
        if blocked:
            recommendation = "BLOCKED - FORCE SWAP TO SEE IMPACT"
            blocked_op_list = ", ".join([
                f"Op {op['operation_number']} ({op['part_number']})"
                for op in blocked_parts
            ])
            recommendation_reason = (
                f"{block_reason} Blocked operations: {blocked_op_list}. "
                f"Simulation results below show what would happen if you force the swap."
            )
        elif caution_parts:
            # Check if all cautions are due to in-production operations that won't be affected
            production_safe_caution_count = sum(
                1 for op in caution_parts
                if "in production but swap will not affect" in op.get("caution_reason", "")
            )
            
            # If all cautions are safe (in-production but won't be affected) AND no other negative impact
            if production_safe_caution_count == len(caution_parts) and not has_new_deadline_miss and not has_inprogress_impact and total_loss_days <= total_gain_days + 1:
                recommendation = "PROCEED"
                caution_op_list = ", ".join([
                    f"Op {op['operation_number']} ({op['part_number']})"
                    for op in caution_parts
                ])
                recommendation_reason = (
                    f"{production_safe_caution_count} operation(s) are in production but the swap will not affect their schedule. "
                    f"Swap is safe to proceed with no negative impact."
                )
            else:
                recommendation = "CAUTION"
                caution_op_list = ", ".join([
                    f"Op {op['operation_number']} ({op['part_number']})"
                    for op in caution_parts
                ])
                if production_safe_caution_count > 0:
                    recommendation_reason = (
                        f"{production_safe_caution_count} operation(s) are in production but the swap will not affect their schedule. "
                        f"Other caution operations: {caution_op_list}. Swap may affect ongoing work."
                    )
                else:
                    # Build specific reason from the actual caution reasons
                    caution_details = "; ".join([
                        f"Op {op['operation_number']} ({op['part_number']}): {op['caution_reason']}"
                        for op in caution_parts
                    ])
                    recommendation_reason = (
                        f"{len(caution_parts)} operation(s) require attention: {caution_details}. "
                        f"Swap may affect ongoing work."
                    )
        elif has_new_deadline_miss or has_inprogress_impact:
            recommendation = "CAUTION"
            if has_new_deadline_miss:
                recommendation_reason = f"This swap will cause {len([l for l in losses if l['newly_misses_deadline']])} part(s) to miss their delivery deadline"
            else:
                recommendation_reason = f"This swap affects {len([l for l in losses if l['is_inprogress']])} part(s) currently in production"
        elif total_loss_days > total_gain_days + 1:
            recommendation = "NOT RECOMMENDED"
            recommendation_reason = f"Net impact is negative - delays other parts by {total_loss_days - total_gain_days:.1f} working days"
        else:
            recommendation = "PROCEED"
            recommendation_reason = f"Net impact is positive - benefits {moving_part_number} by {total_gain_days:.1f} working days with minimal impact on others"

        # ── 12. Critical warnings ─────────────────────────────────────── #
        critical_warnings = []
        if caution_parts:
            # Exclude cautions that are flagged as safe (in production but the
            # swap won't actually change their schedule) — those shouldn't
            # inflate the count or need calling out here.
            real_caution_ops = [
                op for op in caution_parts
                if "in production but swap will not affect" not in op.get("caution_reason", "")
            ]
            if real_caution_ops:
                caution_op_labels = ", ".join(
                    f"Op {op['operation_number']} - {op['operation_name']} ({op['part_number']})"
                    for op in real_caution_ops
                )
                critical_warnings.append(
                    f"{len(real_caution_ops)} operation(s) are partially completed or "
                    f"awaiting supervisor approval: {caution_op_labels}"
                )
        if has_inprogress_impact:
            inprogress_parts = [l for l in losses if l['is_inprogress']]
            inprogress_labels = []
            for l in inprogress_parts:
                ip_detail = inprogress_detail_map.get(l['part_id'])
                if ip_detail:
                    inprogress_labels.append(
                        f"{l['part_number']} (Op {ip_detail['operation_number']} - {ip_detail['operation_name']})"
                    )
                else:
                    inprogress_labels.append(l['part_number'])
            inprogress_part_numbers = ", ".join(inprogress_labels)
            critical_warnings.append(f"{len(inprogress_parts)} part(s) currently in production will be affected: {inprogress_part_numbers}")
        if has_partially_completed:
            partially_completed_parts = [l for l in losses if l['part_id'] in partially_completed_part_ids]
            partially_completed_part_numbers = ", ".join([l['part_number'] for l in partially_completed_parts])
            critical_warnings.append(f"{len(partially_completed_parts)} part(s) with partially completed operations will be affected: {partially_completed_part_numbers}")
        if has_new_deadline_miss:
            critical_warnings.append(f"{len([l for l in losses if l['newly_misses_deadline']])} part(s) will miss their delivery deadline")
        if has_extra_lateness:
            critical_warnings.append(f"{len([l for l in losses if l['additional_delay_days'] > 1])} part(s) will be delayed by more than 1 working day")

        simplified_losses = [{
            "part_number":       l["part_number"],
            "part_name":         l["part_name"],
            "current_completion": l["completion_before"],
            "new_completion":    l["completion_after"],
            "delay_days":        l["days_change"],
            "is_in_production":  l["is_inprogress"],
            "will_miss_deadline": l["newly_misses_deadline"],
            "production_state":  l["state"],
        } for l in losses]

        simplified_gains = [{
            "part_number":       g["part_number"],
            "part_name":         g["part_name"],
            "current_completion": g["completion_before"],
            "new_completion":    g["completion_after"],
            "improvement_days":  g["days_change"],
            "is_in_production":  g["is_inprogress"],
            "production_state":  g["state"],
        } for g in gains]

        # ── BUG FIX 3: swap_specific_impact — both parts, real data ──── #
        # Old code returned a static "not affected" block for record2 when
        # it belonged to a different order.  Both parts are now built from
        # actual before/after rescheduling times regardless of order.

        def _build_swap_specific(record, old_priority, new_priority):
            part_obj = parts_map.get(record.part_id)
            old_end  = current_end.get(record.part_id)
            new_end  = simulated_end.get(record.part_id)
            base = {
                "part_id":      record.part_id,
                "part_number":  part_obj.part_number if part_obj else str(record.part_id),
                "part_name":    getattr(part_obj, "part_name", None) if part_obj else None,
                "old_priority": old_priority,
                "new_priority": new_priority,
            }
            if old_end and new_end:
                # Working-day delta (shift-calendar aware), signed.
                if new_end > old_end:
                    working_delay_mins = _working_minutes_between(old_end, new_end)
                elif old_end > new_end:
                    working_delay_mins = -_working_minutes_between(new_end, old_end)
                else:
                    working_delay_mins = 0.0
                base.update({
                    "old_completion": old_end.strftime("%d %b %Y %H:%M"),
                    "new_completion": new_end.strftime("%d %b %Y %H:%M"),
                    "days_change":    round(working_delay_mins / working_mins_per_day, 1),
                    "direction":      "earlier" if working_delay_mins < 0 else "later" if working_delay_mins > 0 else "no change",
                })
            else:
                base.update({
                    "old_completion": old_end.strftime("%d %b %Y %H:%M") if old_end else None,
                    "new_completion": new_end.strftime("%d %b %Y %H:%M") if new_end else None,
                    "days_change":    None,
                    "direction":      "no data",
                })
            return base

        if p1 > p2:
            displaced_new_priority = p2 + 1
        else:
            displaced_new_priority = p2 - 1

        moved_part_impact     = _build_swap_specific(record1, p1, p2)
        displaced_part_impact = _build_swap_specific(record2, p2, displaced_new_priority)

        # ── 12.5. Due date impact analysis ─────────────────────────────── #
        def _analyze_due_date_impact(part_id, part_order_id, old_end, new_end):
            """Analyze due date impact for a specific part"""
            part = parts_map.get(part_id)
            if not part:
                return None

            # Get appropriate due date
            if part_order_id == record1.order_id:
                part_due_date = due_date1
                part_due_dt = due_dt1
            elif part_order_id == record2.order_id:
                part_due_date = due_date2
                part_due_dt = due_dt2
            else:
                return None

            if not part_due_date or not part_due_dt:
                return {
                    "part_id": part_id,
                    "part_number": part.part_number,
                    "order_id": part_order_id,
                    "due_date": "Not specified",
                    "current_status": "Cannot determine - no due date",
                    "after_swap_status": "Cannot determine - no due date",
                }

            # Calculate current status — overdue in WORKING days (shift-calendar aware)
             # Use calendar days — due dates are calendar dates; dividing by
            # working_mins_per_day inflated overdue by 1440÷510 ≈ 2.82×
            old_overdue_days = max(0, (old_end - part_due_dt).total_seconds() / 86400)
            new_overdue_days = max(0, (new_end - part_due_dt).total_seconds() / 86400)

            # Days before due date (also calendar days)
            old_days_before_due = max(0, (part_due_dt - old_end).total_seconds() / 86400)
            new_days_before_due = max(0, (part_due_dt - new_end).total_seconds() / 86400)

            current_status = "ON TRACK" if old_overdue_days == 0 else f"OVERDUE by {round(old_overdue_days, 1)} days"
            after_swap_status = "ON TRACK" if new_overdue_days == 0 else f"OVERDUE by {round(new_overdue_days, 1)} days"

            # Determine if swap helps or hurts
            if old_overdue_days > 0 and new_overdue_days < old_overdue_days:
                impact = "HELPS - Reduces overdue time"
            elif old_overdue_days == 0 and new_overdue_days > 0:
                impact = "HURTS - Causes new overdue"
            elif old_overdue_days > 0 and new_overdue_days > old_overdue_days:
                impact = "HURTS - Increases overdue time"
            elif old_days_before_due > new_days_before_due:
                impact = "HURTS - Reduces buffer before due date"
            elif old_days_before_due < new_days_before_due:
                impact = "HELPS - Increases buffer before due date"
            else:
                impact = "NO CHANGE"

            return {
                "part_id": part_id,
                "part_number": part.part_number,
                "order_id": part_order_id,
                "due_date": part_due_date.strftime("%d %b %Y"),
                "current_completion": old_end.strftime("%d %b %Y %H:%M"),
                "after_swap_completion": new_end.strftime("%d %b %Y %H:%M"),
                "current_status": current_status,
                "after_swap_status": after_swap_status,
                "current_days_before_due": round(old_days_before_due, 1) if old_overdue_days == 0 else None,
                "after_swap_days_before_due": round(new_days_before_due, 1) if new_overdue_days == 0 else None,
                "current_overdue_days": round(old_overdue_days, 1) if old_overdue_days > 0 else None,
                "after_swap_overdue_days": round(new_overdue_days, 1) if new_overdue_days > 0 else None,
                "swap_impact": impact,
            }

        # Analyze due date impact for both parts
        due_date_impacts = []
        for part_id, old_end in current_end.items():
            new_end = simulated_end.get(part_id)
            if old_end and new_end:
                part = parts_map.get(part_id)
                if part:
                    # Get the order_id from the priority record
                    priority_record = next((r for r in all_rows_in_range if r.part_id == part_id), None)
                    part_order_id = priority_record.order_id if priority_record else None
                    impact = _analyze_due_date_impact(part_id, part_order_id, old_end, new_end)
                    if impact:
                        due_date_impacts.append(impact)

        # ── 13. Validation data ───────────────────────────────────────── #
        validation_data = {
            "before_swap": {
                "priorities": {r.part_id: r.priority for r in all_rows_in_range},
                "part_completion_times": {
                    pid: et.strftime("%d %b %Y %H:%M") if et else None
                    for pid, et in current_end.items()
                },
            },
            "after_swap": {
                "priorities": simulated_priorities,
                "part_completion_times": {
                    pid: et.strftime("%d %b %Y %H:%M") if et else None
                    for pid, et in simulated_end.items()
                },
            },
            "calculation_parameters": {
                "working_minutes_per_day": round(working_mins_per_day, 1),
                "order_due_dates": {
                    f"order_{record1.order_id}": due_date1.strftime("%d %b %Y") if due_date1 else "Not specified",
                    f"order_{record2.order_id}": due_date2.strftime("%d %b %Y") if due_date2 else "Not specified",
                },
                "reference_date": ref_date.strftime("%d %b %Y") if ref_date else None,
                "reference_date_explanation": "Date of the first scheduled part's completion time, used to determine shift configuration",
            },
            "calculation_explanation": {
                "total_benefit_days":  f"Total working days gained: {total_gain_days:.1f} days (parts completing earlier)",
                "total_delay_days":    f"Total working days lost: {total_loss_days:.1f} days (parts completing later)",
                "net_impact_days":     f"Net impact: {total_gain_days:.1f} - {total_loss_days:.1f} = {total_gain_days - total_loss_days:.1f} days",
                "days_change_formula": "Days change = (new completion time - old completion time) / working minutes per day",
                "working_minutes_per_day": f"Factory operates {round(working_mins_per_day, 1)} minutes per working day",
                "simulation_scope":    f"Priority range {lo}–{hi} across ALL orders: {len(all_rows_in_range)} part(s) affected",
                "parts_in_scope":      [f"Part {r.part_id} (priority {r.priority}, order {r.order_id})" for r in all_rows_in_range],
            },
            "due_date_impact": due_date_impacts,
            "production_log_evidence": {
                "blocked_operations_with_logs": [],
                "caution_operations_with_logs": [],
            },
        }

        # Separate blocked and caution operations for evidence
        blocked_evidence_ops = blocked_parts if blocked else []
        caution_evidence_ops = caution_parts

        for op_evidence in blocked_evidence_ops + caution_evidence_ops:
            op_id = op_evidence["operation_id"]
            logs  = db.query(ProductionLog).filter(
                ProductionLog.operation_id == op_id
            ).order_by(ProductionLog.id.asc()).all()

            log_evidence = [{
                "log_id":            log.id,
                "operator_status":   log.operator_status,
                "status":            log.status,
                "from_date":         log.from_date.strftime("%d %b %Y") if log.from_date else None,
                "from_time":         str(log.from_time) if log.from_time else None,
                "to_date":           log.to_date.strftime("%d %b %Y") if log.to_date else None,
                "to_time":           str(log.to_time) if log.to_time else None,
                "approved_quantity": log.approved_quantity,
                "remaining_quantity": log.remaining_quantity_to_be_produced,
            } for log in logs]

            evidence_entry = {
                "operation_id":     op_id,
                "operation_number": op_evidence["operation_number"],
                "operation_name":   op_evidence["operation_name"],
                "part_number":      op_evidence["part_number"],
                "severity":         op_evidence["severity"],
                "production_logs":  log_evidence,
            }

            if op_evidence["severity"] == "blocked":
                evidence_entry["block_reason"] = op_evidence.get("block_reason", "operation in active production")
                validation_data["production_log_evidence"]["blocked_operations_with_logs"].append(evidence_entry)
            else:
                evidence_entry["caution_reason"] = op_evidence.get("caution_reason", "operation partially completed")
                validation_data["production_log_evidence"]["caution_operations_with_logs"].append(evidence_entry)

        logger.info(
            "Priority swap simulated",
            extra={
                "event": "priority_swap_simulated",
                "part_id_moved": record1.part_id,
                "part_id_displaced": record2.part_id,
                "order_id_moved": record1.order_id,
                "order_id_displaced": record2.order_id,
                "old_priority_moved": p1,
                "new_priority_moved": p2,
                "recommendation": recommendation,
                "blocked": blocked,
                "parts_delayed": len(losses),
                "parts_benefiting": len(gains),
            },
        )
        if blocked:
            logger.warning(
                "Priority swap simulation blocked",
                extra={
                    "event": "priority_swap_blocked",
                    "part_id_moved": record1.part_id,
                    "part_id_displaced": record2.part_id,
                    "reason": block_reason,
                    "blocked_operations_count": len(blocked_parts),
                },
            )

        return {
            "summary": {
                "recommendation": recommendation,
                "reason":         recommendation_reason,
                "key_impact":     f"Parts delayed: {len(losses)}, Days delayed: {total_loss_days:.1f}, Deadline misses: {len([l for l in losses if l['newly_misses_deadline']])}",
            },
            "what_changes": {
                "part_being_moved": {
                    "part_number":  moving_part_number,
                    "part_name":    getattr(moving_part, "part_name", None) if moving_part else None,
                    "from_priority": p1,
                    "to_priority":  p2,
                    "benefit":      f"Completes {total_gain_days:.1f} working days earlier" if total_gain_days > 0 else "No change in completion time",
                },
                "parts_affected":   simplified_losses,
                "parts_benefiting": simplified_gains,
                "swap_specific_impact": {
                    "part_being_moved":     moved_part_impact,
                    "part_being_displaced": displaced_part_impact,
                },
            },
            "critical_warnings":   critical_warnings,
            "blocked_operations":  blocked_evidence_ops,
            "caution_operations":  caution_evidence_ops,
            "detailed_analysis": {
                "machines_affected":  machines_affected,
                "total_benefit_days": round(total_gain_days, 1),
                "total_delay_days":   round(total_loss_days, 1),
                "net_impact_days":    round(total_gain_days - total_loss_days, 1),
                "severity":           severity,
            },
            "validation": validation_data,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Simulation failed: {str(e)}")



@router.get("/order-status/{sale_order_id}")
def get_order_status(sale_order_id: int, db: Session = Depends(get_db)):
    """
    Order is active if any part is active.
    Otherwise inactive.
    """
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    # check if ANY active part exists
    active_exists = db.query(
        exists().where(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active"
        )
    ).scalar()

    order_status = "active" if active_exists else "inactive"

    return {
        "order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,
        "order_status": order_status
    }

# @router.get("/order-summary/{sale_order_id}", response_model=OrderScheduleStatusResponse)
# def get_order_summary(sale_order_id: int, db: Session = Depends(get_db)):

#     summary = db.query(OrderScheduleStatus).filter(
#         OrderScheduleStatus.order_id == sale_order_id
#     ).first()

#     if not summary:
#         raise HTTPException(404, "Summary not found")

#     return summary

@router.get("/order-summary/{sale_order_id}")
def get_order_summary(sale_order_id: int, db: Session = Depends(get_db)):
    """
    Returns OrderScheduleStatus for the order.
    If no row exists yet (order never had any part activated),
    returns a computed default — never 404.
    """
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    summary = db.query(OrderScheduleStatus).filter(
        OrderScheduleStatus.order_id == sale_order_id
    ).first()

    if not summary:
        # Row not created yet — compute live from PartScheduleStatus
        active_count = db.query(PartScheduleStatus).filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active"
        ).count()
        active_inhouse = db.query(PartScheduleStatus).join(
            Part, Part.id == PartScheduleStatus.part_id
        ).join(PartType, PartType.id == Part.type_id).filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active",
            PartType.id == 1
            # PartType.type_name == "IN-House"
        ).count()
        return {
            "order_id":            sale_order_id,
            "product_id":          order.product_id,
            "active_parts_count":  active_count,
            "active_inhouse_parts": active_inhouse,
            "status":              "active" if active_inhouse > 0 else "inactive",
            "activated_at":        None,
            "updated_at":          None,
        }

    return {
        "order_id":             summary.order_id,
        "product_id":           summary.product_id,
        "active_parts_count":   summary.active_parts_count,
        "active_inhouse_parts": summary.active_inhouse_parts,
        "status":               summary.status,
        "activated_at":         summary.activated_at,
        "updated_at":           summary.updated_at,
    }


# =========================================================
# GET ORDERS BY PROJECT COORDINATOR
# =========================================================
@router.get("/orders-by-project-coordinator")
def get_orders_by_project_coordinator(
    project_coordinator_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get orders grouped by project coordinator.
    If project_coordinator_id is provided, returns only orders for that coordinator.
    """
    from DB.models.access_control import AccessUser
    from DB.models.configuration import Customer
    from DB.models.oms import Product
    
    query = db.query(Order).order_by(Order.id.asc())
    
    if project_coordinator_id is not None:
        query = query.filter(Order.project_coordinator_id == project_coordinator_id)
    
    orders = query.all()
    
    result = []
    for order in orders:
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        product = db.query(Product).filter(Product.id == order.product_id).first()
        project_coordinator = db.query(AccessUser).filter(AccessUser.id == order.project_coordinator_id).first() if order.project_coordinator_id else None
        
        result.append({
            "order_id": order.id,
            "sale_order_number": order.sale_order_number,
            "project_name": order.project_name,
            "order_date": order.order_date,
            "customer_id": order.customer_id,
            "customer_name": customer.company_name if customer else None,
            "product_id": order.product_id,
            "product_name": product.product_name if product else None,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "status": order.status,
            "project_coordinator_id": order.project_coordinator_id,
            "project_coordinator_name": project_coordinator.user_name if project_coordinator else None,
            "project_coordinator_email": project_coordinator.gmail if project_coordinator else None
        })
    
    return {"orders": result}


# =========================================================
# SCHEDULE GENERATION ENDPOINT
# =========================================================
@router.post("/generate-schedule")
def generate_schedule_endpoint(
    start_date: Optional[datetime] = None,
    end_date:   Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    """
    Runs the FIFO scheduling algorithm over all active IN-HOUSE orders.
    Clears any existing schedule and replaces it with a fresh one.

    Parts with no operations defined are NOT scheduled and are listed
    in parts_without_operations.
    """
    try:
        logger.info(
            "Schedule generation requested",
            extra={
                "event": "planned_schedule_triggered",
                "trigger_source": "generate_schedule_endpoint",
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
        )
        # ── Guard: block if ANY operation is currently inprogress ──────── #
        # if not force:
        #     inprogress = (
        #         db.query(OperationStatus)
        #         .filter(OperationStatus.status == "inprogress")
        #         .all()
        #     )
        #     if inprogress:
        #         # Build a helpful list of what's still active
        #         blocked_ops = [
        #             {
        #                 "operation_id": op.operation_id,
        #                 "order_id":     op.order_id,
        #                 "part_id":      op.part_id,
        #                 "started_at":   op.started_at.isoformat() if op.started_at else None,
        #             }
        #             for op in inprogress
        #         ]
        #         return {
        #             "success": False,
        #             "blocked": True,
        #             "message": (
        #                 f"Cannot generate schedule — {len(inprogress)} operation(s) "
        #                 f"are currently IN PROGRESS. Complete all ongoing operations "
        #                 f"before re-scheduling. Pass force=true to override (admin only)."
        #             ),
        #             "inprogress_operations": blocked_ops,
        #         }
        # ── End guard ───────────────────────────────────────────────────── #
        from algorithm import generate_machine_schedule

        result = generate_machine_schedule(db, start_date, end_date)

        if not result.get("success", False):
            logger.error(
                "Schedule generation failed",
                extra={
                    "event": "planned_schedule_failed",
                    "result_message": result.get("message"),
                    "start_date": start_date.isoformat() if start_date else None,
                    "end_date": end_date.isoformat() if end_date else None,
                },
            )
            return {
                "success":                   False,
                "message":                   result.get("message", "Scheduling failed"),
                "schedule_history_id":       result.get("schedule_history_id"),
                "operations_scheduled":      0,
                "parts_processed":           0,
                "orders_scheduled":          0,
                "skipped_orders":            result.get("skipped_orders", []),
                "skipped_parts":             result.get("skipped_parts", []),
                "parts_without_operations":  result.get("parts_without_operations", []),
            }

        # Get the schedule items with remaining_quantity and part_name
        schedule_items = []
        if result.get("schedule_history_id"):
            rows = (
                db.query(PlannedScheduleItem, Operation, Machine, WorkCenter, OrderPartPriority, Part)
                .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
                .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
                .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
                .join(Part,       Part.id       == PlannedScheduleItem.part_id)
                .outerjoin(
                    OrderPartPriority,
                    (OrderPartPriority.order_id == PlannedScheduleItem.sale_order_id) &
                    (OrderPartPriority.part_id == PlannedScheduleItem.part_id)
                )
                .filter(PlannedScheduleItem.schedule_history_id == result["schedule_history_id"])
                .order_by(PlannedScheduleItem.planned_start_time)
                .all()
            )
            
            schedule_items = [
                {
                    "schedule_id":        item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "part_name":          part.part_name,
                    "priority":           priority.priority if priority else None,
                    "order_part_priority_id": priority.id if priority else None,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "machine_id":         item.machine_id,
                    "machine_make":       machine.make if machine else None,
                    "machine_model":      machine.model if machine else None,
                    "machine_type":       machine.type if machine else None,
                    "work_center_id":     wc.id if wc else None,
                    "work_center_name":   wc.work_center_name if wc else None,
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status":             item.status,
                }
                for item, op, machine, wc, priority, part in rows
            ]

        logger.info(
            "Schedule generation completed",
            extra={
                "event": "planned_schedule_completed",
                "schedule_history_id": result.get("schedule_history_id"),
                "operations_scheduled": result.get("operations_scheduled"),
                "parts_processed": result.get("parts_processed"),
                "result_message": result.get("message"),
            },
        )

        unit_wise_result = None
        try:
            from unit_wise_scheduler import rebuild_unit_schedule, unit_wise_enabled

            if unit_wise_enabled():
                unit_wise_result = rebuild_unit_schedule(db, commit=True)
                logger.info(
                    "Unit-wise baseline built after generate-schedule",
                    extra={
                        "event": "unit_wise_rebuild_triggered",
                        "trigger_source": "generate_schedule",
                        "rows_inserted": unit_wise_result.get("rows_inserted"),
                        "schedule_version": unit_wise_result.get("schedule_version"),
                    },
                )
        except Exception:
            logger.exception(
                "Unit-wise rebuild after generate-schedule failed",
                extra={"event": "unit_wise_rebuild_failed"},
            )

        return {
            "success":                   True,
            "message":                   result["message"],
            "schedule_history_id":       result["schedule_history_id"],
            "operations_scheduled":      result["operations_scheduled"],
            "parts_processed":           result["parts_processed"],
            "orders_scheduled":          result["orders_scheduled"],
            "start_date":                result["start_date"],
            "end_date":                  result["end_date"],
            "skipped_orders":            result.get("skipped_orders", []),
            "skipped_parts":             result.get("skipped_parts", []),
            "parts_without_operations":  result.get("parts_without_operations", []),
            "schedule_items":            schedule_items,  # Added schedule items with remaining_quantity and part_name
            "unit_wise":                 unit_wise_result,
        }

    except Exception as e:
        logger.exception(
            "Schedule generation failed with exception",
            extra={
                "event": "planned_schedule_failed",
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
        )
        raise HTTPException(500, f"Scheduling failed: {str(e)}")

# =========================================================
# VIEW GENERATED SCHEDULE
# =========================================================

@router.get("/view-schedule")
def view_schedule(db: Session = Depends(get_db)):
    """
    Flat chronological list of all items in the latest schedule,
    enriched with operation name and machine details.
    """
    try:
        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )

        if not latest:
            return {
                "message":             "No schedule found. Please generate a schedule first.",
                "schedule_history_id": None,
                "schedule_items":      [],
                "total_operations":    0
            }

        rows = (
            db.query(PlannedScheduleItem, Operation, Machine, WorkCenter, OrderPartPriority, Part)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Part,       Part.id       == PlannedScheduleItem.part_id)
            .outerjoin(
                OrderPartPriority,
                (OrderPartPriority.order_id == PlannedScheduleItem.sale_order_id) &
                (OrderPartPriority.part_id == PlannedScheduleItem.part_id)
            )
            .filter(PlannedScheduleItem.schedule_history_id == latest.id)
            .order_by(PlannedScheduleItem.planned_start_time)
            .all()
        )

        result = [
            {
                "schedule_id":        item.id,
                "sale_order_id":      item.sale_order_id,
                "sale_order_number":  item.sale_order_number,
                "part_id":            item.part_id,
                "part_number":        item.part_number,
                "part_name":          part.part_name,
                "priority":           priority.priority if priority else None,
                "order_part_priority_id": priority.id if priority else None,
                "operation_id":       item.operation_id,
                "operation_number":   op.operation_number,
                "operation_name":     op.operation_name,
                "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                "machine_id":         item.machine_id,
                "machine_make":       machine.make if machine else None,
                "machine_model":      machine.model if machine else None,
                "machine_type":       machine.type if machine else None,
                "work_center_id":     wc.id if wc else None,
                "work_center_name":   wc.work_center_name if wc else None,
                "planned_start_time": item.planned_start_time,
                "planned_end_time":   item.planned_end_time,
                "duration_hours":     round(
                    (item.planned_end_time - item.planned_start_time)
                    .total_seconds() / 3600.0, 4
                ),
                "total_quantity":     item.total_quantity,
                "remaining_quantity": item.remaining_quantity,
                "status":             item.status,
            }
            for item, op, machine, wc, priority, part in rows
        ]

        return {
            "message":             f"Schedule found with {len(result)} operation blocks",
            "schedule_history_id": latest.id,
            "schedule_version":    latest.version,
            "generated_at":        latest.generated_at,
            "is_active":           latest.is_active,
            "total_operations":    len(result),
            "schedule_items":      result,
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to view schedule: {str(e)}")


# =========================================================
# VIEW SCHEDULE  (flat list – by history ID)
# =========================================================

@router.get("/view-schedule/{schedule_history_id}")
def view_schedule_by_id(schedule_history_id: int, db: Session = Depends(get_db)):
    """
    Flat chronological list for a specific schedule version,
    enriched with operation name and machine details.
    """
    try:
        history = (
            db.query(ScheduleHistory)
            .filter(ScheduleHistory.id == schedule_history_id)
            .first()
        )
        if not history:
            raise HTTPException(404, "Schedule history not found")

        rows = (
            db.query(PlannedScheduleItem, Operation, Machine, WorkCenter, OrderPartPriority, Part)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Part,       Part.id       == PlannedScheduleItem.part_id)
            .outerjoin(
                OrderPartPriority,
                (OrderPartPriority.order_id == PlannedScheduleItem.sale_order_id) &
                (OrderPartPriority.part_id == PlannedScheduleItem.part_id)
            )
            .filter(PlannedScheduleItem.schedule_history_id == schedule_history_id)
            .order_by(PlannedScheduleItem.planned_start_time)
            .all()
        )

        result = [
            {
                "schedule_id":        item.id,
                "sale_order_id":      item.sale_order_id,
                "sale_order_number":  item.sale_order_number,
                "part_id":            item.part_id,
                "part_number":        item.part_number,
                "part_name":          part.part_name,
                "priority":           priority.priority if priority else None,
                "order_part_priority_id": priority.id if priority else None,
                "operation_id":       item.operation_id,
                "operation_number":   op.operation_number,
                "operation_name":     op.operation_name,
                "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                "machine_id":         item.machine_id,
                "machine_make":       machine.make if machine else None,
                "machine_model":      machine.model if machine else None,
                "machine_type":       machine.type if machine else None,
                "work_center_id":     wc.id if wc else None,
                "work_center_name":   wc.work_center_name if wc else None,
                "planned_start_time": item.planned_start_time,
                "planned_end_time":   item.planned_end_time,
                "duration_hours":     round(
                    (item.planned_end_time - item.planned_start_time)
                    .total_seconds() / 3600.0, 4
                ),
                "total_quantity":     item.total_quantity,
                "remaining_quantity": item.remaining_quantity,
                "status":             item.status,
            }
            for item, op, machine, wc, priority, part in rows
        ]

        return {
            "message":             f"Schedule {schedule_history_id} — {len(result)} operation blocks",
            "schedule_history_id": history.id,
            "schedule_version":    history.version,
            "generated_at":        history.generated_at,
            "is_active":           history.is_active,
            "total_operations":    len(result),
            "schedule_items":      result,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to view schedule: {str(e)}")


# =========================================================
# PART OPERATION DETAILS FOR DROPDOWN (latest schedule)
# =========================================================

def _get_operation_actual_times(
    db: Session,
    operation_id: int,
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Derive actual start/end from production logs.
    actual_start_time: earliest from_date+from_time once the operator starts.
    actual_end_time: latest to_date+to_time only when a log's status is 'completed'
    (supervisor approved); null while awaiting supervisor review.
    """
    logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.operation_id == operation_id)
        .order_by(ProductionLog.created_at.asc())
        .all()
    )
    if not logs:
        return None, None

    actual_start = None
    actual_end = None
    for log in logs:
        if log.from_date and log.from_time:
            candidate = datetime.combine(log.from_date, log.from_time)
            if not actual_start or candidate < actual_start:
                actual_start = candidate
        if log.to_date and log.to_time and log.status == "completed":
            candidate = datetime.combine(log.to_date, log.to_time)
            if not actual_end or candidate > actual_end:
                actual_end = candidate

    return actual_start, actual_end


def _get_planned_times_for_part(
    db: Session,
    sale_order_id: int,
    part_id: int,
) -> Dict[int, Dict[str, Optional[datetime]]]:
    """Consolidated planned start/end per operation from the latest schedule history."""
    planned: Dict[int, Dict[str, Optional[datetime]]] = {}

    latest = (
        db.query(ScheduleHistory)
        .order_by(ScheduleHistory.generated_at.desc())
        .first()
    )
    if latest:
        rows = (
            db.query(PlannedScheduleItem)
            .filter(
                PlannedScheduleItem.schedule_history_id == latest.id,
                PlannedScheduleItem.sale_order_id == sale_order_id,
                PlannedScheduleItem.part_id == part_id,
            )
            .order_by(PlannedScheduleItem.planned_start_time.asc())
            .all()
        )
        for item in rows:
            if item.operation_id not in planned:
                planned[item.operation_id] = {
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time": item.planned_end_time,
                }
            else:
                entry = planned[item.operation_id]
                if item.planned_start_time < entry["planned_start_time"]:
                    entry["planned_start_time"] = item.planned_start_time
                if item.planned_end_time > entry["planned_end_time"]:
                    entry["planned_end_time"] = item.planned_end_time

    if not planned:
        reschedule_rows = (
            db.query(Rescheduling)
            .filter(
                Rescheduling.order_id == sale_order_id,
                Rescheduling.part_id == part_id,
                Rescheduling.status.in_(["scheduled", "rescheduled"]),
            )
            .order_by(Rescheduling.start_time.asc())
            .all()
        )
        for item in reschedule_rows:
            if item.operation_id not in planned:
                planned[item.operation_id] = {
                    "planned_start_time": item.start_time,
                    "planned_end_time": item.end_time,
                }
            else:
                entry = planned[item.operation_id]
                if item.start_time < entry["planned_start_time"]:
                    entry["planned_start_time"] = item.start_time
                if item.end_time > entry["planned_end_time"]:
                    entry["planned_end_time"] = item.end_time

    return planned


def _fetch_active_part_planned_rows(
    db: Session,
    sale_order_id: int,
    part_id: int,
    schedule_history_id: int,
) -> List[dict]:
    """
    Return schedule rows for an active part.
    Prefers planned_schedule_items from the latest history; falls back to the
    live rescheduling_items table when the part was scheduled dynamically.
    """
    rows = (
        db.query(PlannedScheduleItem, Operation, Machine)
        .join(Operation, Operation.id == PlannedScheduleItem.operation_id)
        .outerjoin(Machine, Machine.id == PlannedScheduleItem.machine_id)
        .filter(
            PlannedScheduleItem.schedule_history_id == schedule_history_id,
            PlannedScheduleItem.sale_order_id == sale_order_id,
            PlannedScheduleItem.part_id == part_id,
        )
        .order_by(PlannedScheduleItem.planned_start_time.asc(), PlannedScheduleItem.id.asc())
        .all()
    )

    if rows:
        return [
            {
                "operation_id": op.id,
                "operation": f"{op.operation_number} - {op.operation_name}",
                "machine": (
                    f"{machine.make} {machine.model}".strip()
                    if machine else None
                ),
                "planned_start_time": item.planned_start_time,
                "planned_end_time": item.planned_end_time,
            }
            for item, op, machine in rows
        ]

    reschedule_rows = (
        db.query(Rescheduling, Operation, Machine)
        .join(Operation, Operation.id == Rescheduling.operation_id)
        .outerjoin(Machine, Machine.id == Rescheduling.machine_id)
        .filter(
            Rescheduling.order_id == sale_order_id,
            Rescheduling.part_id == part_id,
            Rescheduling.status.in_(["scheduled", "rescheduled"]),
        )
        .order_by(Rescheduling.start_time.asc(), Rescheduling.id.asc())
        .all()
    )

    return [
        {
            "operation_id": op.id,
            "operation": f"{op.operation_number} - {op.operation_name}",
            "machine": (
                f"{machine.make} {machine.model}".strip()
                if machine else None
            ),
            "planned_start_time": item.start_time,
            "planned_end_time": item.end_time,
        }
        for item, op, machine in reschedule_rows
    ]


def _build_active_part_operations(
    db: Session,
    planned_rows: List[dict],
    consolidated: bool = False,
) -> List[dict]:
    """Attach actual times; optionally consolidate multi-day rows per operation."""
    if not consolidated:
        return [
            _build_active_part_operation_row(
                db,
                operation_id=row["operation_id"],
                operation_label=row["operation"],
                machine_name=row["machine"],
                planned_start_time=row["planned_start_time"],
                planned_end_time=row["planned_end_time"],
            )
            for row in planned_rows
        ]

    operation_groups: Dict[int, dict] = {}
    for row in planned_rows:
        op_id = row["operation_id"]
        if op_id not in operation_groups:
            operation_groups[op_id] = dict(row)
            continue

        group = operation_groups[op_id]
        if row["planned_start_time"] < group["planned_start_time"]:
            group["planned_start_time"] = row["planned_start_time"]
        if row["planned_end_time"] > group["planned_end_time"]:
            group["planned_end_time"] = row["planned_end_time"]

    return [
        _build_active_part_operation_row(
            db,
            operation_id=group["operation_id"],
            operation_label=group["operation"],
            machine_name=group["machine"],
            planned_start_time=group["planned_start_time"],
            planned_end_time=group["planned_end_time"],
        )
        for group in sorted(
            operation_groups.values(),
            key=lambda g: (g["planned_start_time"], g["operation_id"]),
        )
    ]


def _build_completed_part_operations(
    db: Session,
    sale_order_id: int,
    part_id: int,
) -> List[dict]:
    """
    Build operation rows for parts that have finished all operations and left
    the active schedule. Planned times come from schedule history; actual times
    from production logs.
    """
    operations = (
        db.query(Operation)
        .filter(Operation.part_id == part_id)
        .order_by(Operation.operation_number.asc(), Operation.id.asc())
        .all()
    )
    planned_times = _get_planned_times_for_part(db, sale_order_id, part_id)

    result = []
    for op in operations:
        op_status = db.query(OperationStatus).filter(
            OperationStatus.operation_id == op.id,
            OperationStatus.order_id == sale_order_id,
            OperationStatus.part_id == part_id,
        ).first()

        machine_name = None
        reschedule = (
            db.query(Rescheduling)
            .filter(
                Rescheduling.operation_id == op.id,
                Rescheduling.order_id == sale_order_id,
            )
            .order_by(Rescheduling.start_time.desc())
            .first()
        )

        log_with_machine = (
            db.query(ProductionLog)
            .filter(
                ProductionLog.operation_id == op.id,
                ProductionLog.machine_id.isnot(None),
            )
            .order_by(ProductionLog.created_at.desc())
            .first()
        )
        if log_with_machine and log_with_machine.machine:
            machine = log_with_machine.machine
            machine_name = f"{machine.make} {machine.model}".strip()
        elif reschedule and reschedule.machine_id:
            machine = db.query(Machine).filter(Machine.id == reschedule.machine_id).first()
            if machine:
                machine_name = f"{machine.make} {machine.model}".strip()

        planned = planned_times.get(op.id, {})
        planned_start = planned.get("planned_start_time")
        planned_end = planned.get("planned_end_time")
        if reschedule:
            if planned_start is None:
                planned_start = reschedule.start_time
            if planned_end is None:
                planned_end = reschedule.end_time

        actual_start, actual_end = _get_operation_actual_times(db, op.id)

        has_logs = db.query(ProductionLog).filter(
            ProductionLog.operation_id == op.id
        ).count() > 0

        operation_status_str = (
            op_status.status
            if op_status
            else ("completed" if has_logs else "pending")
        )

        result.append({
            "operation_id": op.id,
            "operation": f"{op.operation_number} - {op.operation_name}",
            "machine": machine_name,
            "planned_start_time": planned_start,
            "planned_end_time": planned_end,
            "actual_start_time": actual_start,
            "actual_end_time": actual_end,
            "operation_status": operation_status_str,
        })

    return result


def _build_active_part_operation_row(
    db: Session,
    operation_id: int,
    operation_label: str,
    machine_name: Optional[str],
    planned_start_time: Optional[datetime],
    planned_end_time: Optional[datetime],
    operation_status: Optional[str] = None,
) -> dict:
    actual_start, actual_end = _get_operation_actual_times(db, operation_id)
    row = {
        "operation_id": operation_id,
        "operation": operation_label,
        "machine": machine_name,
        "planned_start_time": planned_start_time,
        "planned_end_time": planned_end_time,
        "actual_start_time": actual_start,
        "actual_end_time": actual_end,
    }
    if operation_status is not None:
        row["operation_status"] = operation_status
    return row


@router.get("/part-operation-details/{sale_order_id}/{part_id}")
def get_part_operation_details(
    sale_order_id: int,
    part_id: int,
    db: Session = Depends(get_db)
):
    """
    Dropdown endpoint for In-House Parts UI.
    Returns operation, machine, planned start and planned end for one part.

    Active parts return one row per operation (multi-day blocks consolidated to
    earliest planned start and latest planned end). Falls back to live
    rescheduling_items when the part was scheduled dynamically.
    Completed parts return actual operation history with message "completed".
    Inactive / missing parts return `{ "message": "Part is deactivated", "operations": [] }`.
    """
    try:
        # Optional validation: order + part should exist for this order's product
        order = db.query(Order).filter(Order.id == sale_order_id).first()
        if not order:
            raise HTTPException(404, "Order not found")

        part = db.query(Part).filter(
            Part.id == part_id,
            Part.product_id == order.product_id
        ).first()
        if not part:
            raise HTTPException(404, "Part not found for this order")

        part_status = (
            db.query(PartScheduleStatus.status)
            .filter(
                PartScheduleStatus.sale_order_id == sale_order_id,
                PartScheduleStatus.part_id == part_id,
            )
            .first()
        )
        status_value = part_status[0] if part_status else None

        if status_value == "completed":
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "message": "completed",
                "operations": _build_completed_part_operations(db, sale_order_id, part_id),
            }

        if status_value != "active":
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "message": "Part is deactivated",
                "operations": []
            }

        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )
        if not latest:
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "schedule_history_id": None,
                "message": "No schedule found. Please generate a schedule first.",
                "operations": []
            }
        schedule_history_id = latest.id

        planned_rows = _fetch_active_part_planned_rows(
            db, sale_order_id, part_id, schedule_history_id
        )
        operations = _build_active_part_operations(db, planned_rows, consolidated=True)

        return {
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "schedule_history_id": schedule_history_id,
            "operations": operations
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch part operation details: {str(e)}")


@router.get("/part-operation-details-consolidated/{sale_order_id}/{part_id}")
def get_part_operation_details_consolidated(
    sale_order_id: int,
    part_id: int,
    db: Session = Depends(get_db)
):
    """
    Consolidated version of part-operation-details endpoint.
    If an operation spans multiple days, consolidates into a single entry
    with earliest start time and latest end time.
    """
    try:
        # Optional validation: order + part should exist for this order's product
        order = db.query(Order).filter(Order.id == sale_order_id).first()
        if not order:
            raise HTTPException(404, "Order not found")

        part = db.query(Part).filter(
            Part.id == part_id,
            Part.product_id == order.product_id
        ).first()
        if not part:
            raise HTTPException(404, "Part not found for this order")

        part_status = (
            db.query(PartScheduleStatus.status)
            .filter(
                PartScheduleStatus.sale_order_id == sale_order_id,
                PartScheduleStatus.part_id == part_id,
            )
            .first()
        )
        status_value = part_status[0] if part_status else None

        if status_value == "completed":
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "part_name": part.part_name,
                "message": "completed",
                "operations": _build_completed_part_operations(db, sale_order_id, part_id),
            }

        if status_value != "active":
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "part_name": part.part_name,
                "message": "Part is deactivated",
                "operations": []
            }

        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )
        if not latest:
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "part_name": part.part_name,
                "schedule_history_id": None,
                "message": "No schedule found. Please generate a schedule first.",
                "operations": []
            }
        schedule_history_id = latest.id

        planned_rows = _fetch_active_part_planned_rows(
            db, sale_order_id, part_id, schedule_history_id
        )
        consolidated_operations = _build_active_part_operations(
            db, planned_rows, consolidated=True
        )

        return {
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "part_name": part.part_name,
            "schedule_history_id": schedule_history_id,
            "operations": consolidated_operations
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch consolidated part operation details: {str(e)}")


# =========================================================
# GANTT CHART DATA  (latest active schedule)
# =========================================================

@router.get("/gantt-data")
def get_gantt_data(db: Session = Depends(get_db)):
    """
    Schedule items enriched with machine / work-center / operation details,
    grouped by machine. Intended for Gantt chart rendering.
    """
    try:
        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )

        if not latest:
            return {
                "message":             "No schedule found. Please generate a schedule first.",
                "schedule_history_id": None,
                "generated_at":        None,
                "gantt":               []
            }

        items = (
            db.query(PlannedScheduleItem, Machine, WorkCenter, Operation, Part)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .join(Part,       Part.id       == PlannedScheduleItem.part_id)
            .filter(PlannedScheduleItem.schedule_history_id == latest.id)
            .order_by(PlannedScheduleItem.machine_id, PlannedScheduleItem.planned_start_time)
            .all()
        )

        machines_map: Dict[int, dict] = {}

        # Out-source items have no machine — collect under a sentinel key
        OUT_SOURCE_KEY = "out_source"

        for item, machine, wc, op, part in items:
            if machine is None:
                # Out-Source operation — no machine allocated
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id":       None,
                        "machine_type":     "Out-Source",
                        "machine_make":     None,
                        "machine_model":    None,
                        "work_center_id":   None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "part_name":          part.part_name,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status":             item.status,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id":       machine.id,
                        "machine_type":     machine.type,
                        "machine_make":     machine.make,
                        "machine_model":    machine.model,
                        "work_center_id":   wc.id if wc else None,
                        "work_center_name": wc.work_center_name if wc else None,
                        "work_center_code": wc.code              if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "part_name":          part.part_name,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status":             item.status,
                })

        return {
            "message":             f"Gantt data for schedule {latest.id}",
            "schedule_history_id": latest.id,
            "schedule_version":    latest.version,
            "generated_at":        latest.generated_at,
            "is_active":           latest.is_active,
            "total_machines":      len(machines_map),
            "total_tasks":         sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt":               list(machines_map.values()),
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to build Gantt data: {str(e)}")


# =========================================================
# PLANNED GANTT DATA BY PROJECT COORDINATOR
# =========================================================
@router.get("/gantt-data/project-coordinator/{project_coordinator_id}")
def get_gantt_data_by_project_coordinator(
    project_coordinator_id: int,
    db: Session = Depends(get_db)
):
    """
    Planned schedule Gantt data filtered by project coordinator.
    Returns only orders assigned to the specified project coordinator.
    """
    try:
        # First, get all orders for this project coordinator
        orders = db.query(Order).filter(
            Order.project_coordinator_id == project_coordinator_id
        ).all()
        order_ids = [order.id for order in orders]
        
        if not order_ids:
            return {
                "message": "No orders found for this project coordinator",
                "schedule_history_id": None,
                "generated_at": None,
                "gantt": []
            }
        
        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )
        
        if not latest:
            unscheduled_order_ids = [order.id for order in orders]
            return {
                "message": "No schedule found. Please generate a schedule first.",
                "unscheduled_orders": [f"Order id {order_id} not scheduled for this project coordinator {project_coordinator_id}" for order_id in unscheduled_order_ids],
                "schedule_history_id": None,
                "generated_at": None,
                "gantt": []
            }
        
        items = (
            db.query(PlannedScheduleItem, Machine, WorkCenter, Operation, Part)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .join(Part,       Part.id       == PlannedScheduleItem.part_id)
            .filter(
                PlannedScheduleItem.schedule_history_id == latest.id,
                PlannedScheduleItem.sale_order_id.in_(order_ids)
            )
            .order_by(PlannedScheduleItem.machine_id, PlannedScheduleItem.planned_start_time)
            .all()
        )
        
        # Find which orders are not scheduled
        scheduled_order_ids = {item[0].sale_order_id for item in items}
        unscheduled_order_ids = [order_id for order_id in order_ids if order_id not in scheduled_order_ids]
        
        machines_map: Dict[int, dict] = {}
        OUT_SOURCE_KEY = "out_source"
        
        for item, machine, wc, op, part in items:
            if machine is None:
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id": None,
                        "machine_type": "Out-Source",
                        "machine_make": None,
                        "machine_model": None,
                        "work_center_id": None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.sale_order_id,
                    "sale_order_number": item.sale_order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": op.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time": item.planned_end_time,
                    "duration_hours": round(
                        (item.planned_end_time - item.planned_start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status": item.status,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id": machine.id,
                        "machine_type": machine.type,
                        "machine_make": machine.make,
                        "machine_model": machine.model,
                        "work_center_id": wc.id if wc else None,
                        "work_center_name": wc.work_center_name if wc else None,
                        "work_center_code": wc.code if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.sale_order_id,
                    "sale_order_number": item.sale_order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": op.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time": item.planned_end_time,
                    "duration_hours": round(
                        (item.planned_end_time - item.planned_start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status": item.status,
                })
        
        response_data = {
            "message": f"Planned Gantt data for project coordinator {project_coordinator_id}",
            "schedule_history_id": latest.id,
            "schedule_version": latest.version,
            "generated_at": latest.generated_at,
            "is_active": latest.is_active,
            "total_machines": len(machines_map),
            "total_tasks": sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt": list(machines_map.values()),
        }
        
        if unscheduled_order_ids:
            response_data["unscheduled_orders"] = [
                f"Order id {order_id} not scheduled for this project coordinator {project_coordinator_id}" 
                for order_id in unscheduled_order_ids
            ]
        
        return response_data
    except Exception as e:
        raise HTTPException(500, f"Failed to build planned Gantt data: {str(e)}")


# =========================================================
# DYNAMIC/RESCHEDULING GANTT DATA BY PROJECT COORDINATOR
# =========================================================
@router.get("/gantt-data-rescheduling/project-coordinator/{project_coordinator_id}")
def get_rescheduling_gantt_data_by_project_coordinator(
    project_coordinator_id: int,
    db: Session = Depends(get_db)
):
    """
    Dynamic/rescheduling Gantt data filtered by project coordinator.
    Returns only orders assigned to the specified project coordinator.
    """
    try:
        # First, get all orders for this project coordinator
        orders = db.query(Order).filter(
            Order.project_coordinator_id == project_coordinator_id
        ).all()
        order_ids = [order.id for order in orders]
        
        if not order_ids:
            return {
                "message": "No orders found for this project coordinator",
                "gantt": []
            }
        
        items = (
            db.query(Rescheduling, Machine, WorkCenter, Operation, Part)
            .outerjoin(Machine,    Machine.id    == Rescheduling.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Operation,  Operation.id  == Rescheduling.operation_id)
            .join(Part,       Part.id       == Rescheduling.part_id)
            .filter(Rescheduling.order_id.in_(order_ids))
            .order_by(Rescheduling.machine_id, Rescheduling.start_time)
            .all()
        )
        
        # Find which orders are not scheduled
        scheduled_order_ids = {item[0].order_id for item in items}
        unscheduled_order_ids = [order_id for order_id in order_ids if order_id not in scheduled_order_ids]
        
        machines_map: Dict[int, dict] = {}
        OUT_SOURCE_KEY = "out_source"
        
        for item, machine, wc, op, part in items:
            if machine is None:
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id": None,
                        "machine_type": "Out-Source",
                        "machine_make": None,
                        "machine_model": None,
                        "work_center_id": None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.order_id,
                    "sale_order_number": item.order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": item.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.start_time,
                    "planned_end_time": item.end_time,
                    "duration_hours": round(
                        (item.end_time - item.start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_qty,
                    "completed_quantity": item.completed_qty,
                    "remaining_quantity": item.remaining_qty,
                    "status": item.status,
                    "schedule_version": item.schedule_version,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id": machine.id,
                        "machine_type": machine.type,
                        "machine_make": machine.make,
                        "machine_model": machine.model,
                        "work_center_id": wc.id if wc else None,
                        "work_center_name": wc.work_center_name if wc else None,
                        "work_center_code": wc.code if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.order_id,
                    "sale_order_number": item.order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": item.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.start_time,
                    "planned_end_time": item.end_time,
                    "duration_hours": round(
                        (item.end_time - item.start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_qty,
                    "completed_quantity": item.completed_qty,
                    "remaining_quantity": item.remaining_qty,
                    "status": item.status,
                    "schedule_version": item.schedule_version,
                })
        
        response_data = {
            "message": f"Dynamic/rescheduling Gantt data for project coordinator {project_coordinator_id}",
            "total_machines": len(machines_map),
            "total_tasks": sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt": list(machines_map.values()),
        }
        
        if unscheduled_order_ids:
            response_data["unscheduled_orders"] = [
                f"Order id {order_id} not scheduled for this project coordinator {project_coordinator_id}" 
                for order_id in unscheduled_order_ids
            ]
        
        return response_data
    except Exception as e:
        raise HTTPException(500, f"Failed to build dynamic Gantt data: {str(e)}")


# =========================================================
# PLANNED GANTT DATA BY MANUFACTURING COORDINATOR
# =========================================================
@router.get("/gantt-data/manufacturing-coordinator/{manufacturing_coordinator_id}")
def get_gantt_data_by_manufacturing_coordinator(
    manufacturing_coordinator_id: int,
    db: Session = Depends(get_db)
):
    """
    Planned schedule Gantt data filtered by manufacturing coordinator.
    Returns only orders assigned to the specified manufacturing coordinator.
    """
    try:
        # First, get all orders for this manufacturing coordinator
        orders = db.query(Order).filter(
            Order.manufacturing_coordinator_id == manufacturing_coordinator_id
        ).all()
        order_ids = [order.id for order in orders]
        
        if not order_ids:
            return {
                "message": "No orders found for this manufacturing coordinator",
                "schedule_history_id": None,
                "generated_at": None,
                "gantt": []
            }
        
        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )
        
        if not latest:
            unscheduled_order_ids = [order.id for order in orders]
            return {
                "message": "No schedule found. Please generate a schedule first.",
                "unscheduled_orders": [f"Order id {order_id} not scheduled for this manufacturing coordinator {manufacturing_coordinator_id}" for order_id in unscheduled_order_ids],
                "schedule_history_id": None,
                "generated_at": None,
                "gantt": []
            }
        
        items = (
            db.query(PlannedScheduleItem, Machine, WorkCenter, Operation, Part)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .join(Part,       Part.id       == PlannedScheduleItem.part_id)
            .filter(
                PlannedScheduleItem.schedule_history_id == latest.id,
                PlannedScheduleItem.sale_order_id.in_(order_ids)
            )
            .order_by(PlannedScheduleItem.machine_id, PlannedScheduleItem.planned_start_time)
            .all()
        )
        
        # Find which orders are not scheduled
        scheduled_order_ids = {item[0].sale_order_id for item in items}
        unscheduled_order_ids = [order_id for order_id in order_ids if order_id not in scheduled_order_ids]
        
        machines_map: Dict[int, dict] = {}
        OUT_SOURCE_KEY = "out_source"
        
        for item, machine, wc, op, part in items:
            if machine is None:
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id": None,
                        "machine_type": "Out-Source",
                        "machine_make": None,
                        "machine_model": None,
                        "work_center_id": None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.sale_order_id,
                    "sale_order_number": item.sale_order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": op.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time": item.planned_end_time,
                    "duration_hours": round(
                        (item.planned_end_time - item.planned_start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status": item.status,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id": machine.id,
                        "machine_type": machine.type,
                        "machine_make": machine.make,
                        "machine_model": machine.model,
                        "work_center_id": wc.id if wc else None,
                        "work_center_name": wc.work_center_name if wc else None,
                        "work_center_code": wc.code if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.sale_order_id,
                    "sale_order_number": item.sale_order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": op.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time": item.planned_end_time,
                    "duration_hours": round(
                        (item.planned_end_time - item.planned_start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status": item.status,
                })
        
        response_data = {
            "message": f"Planned Gantt data for manufacturing coordinator {manufacturing_coordinator_id}",
            "schedule_history_id": latest.id,
            "schedule_version": latest.version,
            "generated_at": latest.generated_at,
            "is_active": latest.is_active,
            "total_machines": len(machines_map),
            "total_tasks": sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt": list(machines_map.values()),
        }
        
        if unscheduled_order_ids:
            response_data["unscheduled_orders"] = [
                f"Order id {order_id} not scheduled for this manufacturing coordinator {manufacturing_coordinator_id}" 
                for order_id in unscheduled_order_ids
            ]
        
        return response_data
    except Exception as e:
        raise HTTPException(500, f"Failed to build planned Gantt data: {str(e)}")


# =========================================================
# DYNAMIC/RESCHEDULING GANTT DATA BY MANUFACTURING COORDINATOR
# =========================================================
@router.get("/gantt-data-rescheduling/manufacturing-coordinator/{manufacturing_coordinator_id}")
def get_rescheduling_gantt_data_by_manufacturing_coordinator(
    manufacturing_coordinator_id: int,
    db: Session = Depends(get_db)
):
    """
    Dynamic/rescheduling Gantt data filtered by manufacturing coordinator.
    Returns only orders assigned to the specified manufacturing coordinator.
    """
    try:
        # First, get all orders for this manufacturing coordinator
        orders = db.query(Order).filter(
            Order.manufacturing_coordinator_id == manufacturing_coordinator_id
        ).all()
        order_ids = [order.id for order in orders]
        
        if not order_ids:
            return {
                "message": "No orders found for this manufacturing coordinator",
                "gantt": []
            }
        
        items = (
            db.query(Rescheduling, Machine, WorkCenter, Operation, Part)
            .outerjoin(Machine,    Machine.id    == Rescheduling.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Operation,  Operation.id  == Rescheduling.operation_id)
            .join(Part,       Part.id       == Rescheduling.part_id)
            .filter(Rescheduling.order_id.in_(order_ids))
            .order_by(Rescheduling.machine_id, Rescheduling.start_time)
            .all()
        )
        
        # Find which orders are not scheduled
        scheduled_order_ids = {item[0].order_id for item in items}
        unscheduled_order_ids = [order_id for order_id in order_ids if order_id not in scheduled_order_ids]
        
        machines_map: Dict[int, dict] = {}
        OUT_SOURCE_KEY = "out_source"
        
        for item, machine, wc, op, part in items:
            if machine is None:
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id": None,
                        "machine_type": "Out-Source",
                        "machine_make": None,
                        "machine_model": None,
                        "work_center_id": None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.order_id,
                    "sale_order_number": item.order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": item.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.start_time,
                    "planned_end_time": item.end_time,
                    "duration_hours": round(
                        (item.end_time - item.start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_qty,
                    "completed_quantity": item.completed_qty,
                    "remaining_quantity": item.remaining_qty,
                    "status": item.status,
                    "schedule_version": item.schedule_version,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id": machine.id,
                        "machine_type": machine.type,
                        "machine_make": machine.make,
                        "machine_model": machine.model,
                        "work_center_id": wc.id if wc else None,
                        "work_center_name": wc.work_center_name if wc else None,
                        "work_center_code": wc.code if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id": item.id,
                    "sale_order_id": item.order_id,
                    "sale_order_number": item.order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "part_name": part.part_name,
                    "operation_id": item.operation_id,
                    "operation_number": item.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.start_time,
                    "planned_end_time": item.end_time,
                    "duration_hours": round(
                        (item.end_time - item.start_time).total_seconds() / 3600.0, 4
                    ),
                    "total_quantity": item.total_qty,
                    "completed_quantity": item.completed_qty,
                    "remaining_quantity": item.remaining_qty,
                    "status": item.status,
                    "schedule_version": item.schedule_version,
                })
        
        response_data = {
            "message": f"Dynamic/rescheduling Gantt data for manufacturing coordinator {manufacturing_coordinator_id}",
            "total_machines": len(machines_map),
            "total_tasks": sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt": list(machines_map.values()),
        }
        
        if unscheduled_order_ids:
            response_data["unscheduled_orders"] = [
                f"Order id {order_id} not scheduled for this manufacturing coordinator {manufacturing_coordinator_id}" 
                for order_id in unscheduled_order_ids
            ]
        
        return response_data
    except Exception as e:
        raise HTTPException(500, f"Failed to build dynamic Gantt data: {str(e)}")


# =========================================================
# GANTT CHART DATA  (specific history version)
# =========================================================

@router.get("/gantt-data/{schedule_history_id}")
def get_gantt_data_by_id(schedule_history_id: int, db: Session = Depends(get_db)):
    """Gantt chart data for a specific schedule version."""
    try:
        history = (
            db.query(ScheduleHistory)
            .filter(ScheduleHistory.id == schedule_history_id)
            .first()
        )
        if not history:
            raise HTTPException(404, f"Schedule history {schedule_history_id} not found")

        items = (
            db.query(PlannedScheduleItem, Machine, WorkCenter, Operation, Part)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .outerjoin(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .join(Part,       Part.id       == PlannedScheduleItem.part_id)
            .filter(PlannedScheduleItem.schedule_history_id == schedule_history_id)
            .order_by(PlannedScheduleItem.machine_id, PlannedScheduleItem.planned_start_time)
            .all()
        )

        machines_map: Dict[int, dict] = {}
        OUT_SOURCE_KEY = "out_source"

        for item, machine, wc, op, part in items:
            if machine is None:
                # Out-Source operation: no machine allocated
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id":       None,
                        "machine_type":     "Out-Source",
                        "machine_make":     None,
                        "machine_model":    None,
                        "work_center_id":   None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "part_name":          part.part_name,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status":             item.status,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id":       machine.id,
                        "machine_type":     machine.type,
                        "machine_make":     machine.make,
                        "machine_model":    machine.model,
                        "work_center_id":   wc.id               if wc else None,
                        "work_center_name": wc.work_center_name  if wc else None,
                        "work_center_code": wc.code              if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "part_name":          part.part_name,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status":             item.status,
                })

        return {
            "message":             f"Gantt data for schedule {schedule_history_id}",
            "schedule_history_id": history.id,
            "schedule_version":    history.version,
            "generated_at":        history.generated_at,
            "is_active":           history.is_active,
            "total_machines":      len(machines_map),
            "total_tasks":         sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt":               list(machines_map.values()),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to build Gantt data: {str(e)}")


# =========================================================
# SCHEDULE HISTORY  (list all versions)
# =========================================================

@router.get("/schedule-history")
def get_schedule_history(db: Session = Depends(get_db)):
    """All schedule versions newest first, with operation block count per version."""
    try:
        from sqlalchemy import func

        # Single query: join ScheduleHistory with a count subquery
        count_sub = (
            db.query(
                PlannedScheduleItem.schedule_history_id,
                func.count(PlannedScheduleItem.id).label("block_count")
            )
            .group_by(PlannedScheduleItem.schedule_history_id)
            .subquery()
        )

        rows = (
            db.query(ScheduleHistory, count_sub.c.block_count)
            .outerjoin(count_sub, count_sub.c.schedule_history_id == ScheduleHistory.id)
            .order_by(ScheduleHistory.generated_at.desc())
            .all()
        )

        result = [
            {
                "schedule_history_id":    h.id,
                "version":                h.version,
                "is_active":              h.is_active,
                "generated_at":           h.generated_at,
                "total_operation_blocks": block_count or 0,
            }
            for h, block_count in rows
        ]

        return {
            "total_versions": len(result),
            "history":        result,
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to fetch schedule history: {str(e)}")


# =========================================================
# DELIVERY FEASIBILITY ANALYSIS
# =========================================================
@router.get("/delivery-feasibility-analysis")
def get_delivery_feasibility_analysis(
    db: Session = Depends(get_db)
):
    """
    Analyze delivery feasibility for all active parts.
    
    Compares baseline schedule (first planned) vs dynamic schedule (current)
    and calculates on-time/late delivery metrics based on actual production progress.
    
    Metrics provided:
    - Total parts, on-time parts, late parts
    - Quantity-based: units on-time vs late
    - Expected delivery dates
    - Days overdue / days before due
    - Baseline vs Dynamic comparison
    """
    try:
        from sqlalchemy import text as sa_text
        from datetime import datetime, timedelta
        from DB.models.oms import Order, Part, OrderPartPriority
        from DB.models.scheduling import ScheduleHistory, Rescheduling, ProductionLog
        
        # ── 1. Get baseline schedule (first planned schedule) ───────────────── #
        baseline_history = db.query(ScheduleHistory).order_by(ScheduleHistory.generated_at.asc()).first()

        baseline_part_completion: Dict[int, datetime] = {}
        if baseline_history:
            baseline_rows = db.execute(
                sa_text("""
                    SELECT part_id, MAX(planned_end_time) as completion_time
                    FROM scheduling.planned_schedule_items
                    WHERE schedule_history_id = :history_id
                    GROUP BY part_id
                """),
                {"history_id": baseline_history.id}
            ).fetchall()
            for row in baseline_rows:
                baseline_part_completion[row[0]] = row[1]
        
        # ── 2. Get current dynamic schedule (rescheduling_items) ─────────────── #
        current_rows = db.execute(
            sa_text("""
                SELECT part_id, MAX(end_time) as completion_time
                FROM scheduling.rescheduling_items
                WHERE status IN ('scheduled', 'rescheduled')
                GROUP BY part_id
            """)
        ).fetchall()
        current_part_completion: Dict[int, datetime] = {}
        for row in current_rows:
            current_part_completion[row[0]] = row[1]
        
        # ── 3. Get all active parts with due dates ──────────────────────────── #
        active_parts = db.query(OrderPartPriority, Part, Order).join(
            Part, OrderPartPriority.part_id == Part.id
        ).join(
            Order, OrderPartPriority.order_id == Order.id
        ).filter(
            OrderPartPriority.status == "active"
        ).all()
        
        # ── 4. Get production progress for each part ────────────────────────── #
        def get_part_production_progress(part_id: int, total_qty: int) -> dict:
            """Calculate production progress based on approved quantities."""
            approved_qty = db.execute(
                sa_text("""
                    SELECT COALESCE(SUM(approved_quantity), 0)
                    FROM scheduling.production_logs pl
                    JOIN oms.operations o ON pl.operation_id = o.id
                    WHERE o.part_id = :part_id AND pl.approved_quantity IS NOT NULL
                """),
                {"part_id": part_id}
            ).scalar() or 0

            # Cap approved quantity at total quantity to avoid data integrity issues
            approved_qty = min(approved_qty, total_qty)

            return {
                "total_quantity": total_qty,
                "approved_quantity": approved_qty,
                "remaining_quantity": max(0, total_qty - approved_qty),
                "completion_percentage": round((approved_qty / total_qty * 100) if total_qty > 0 else 0, 1)
            }
        
        # ── 5. Calculate working minutes per day (from shift calendar) ───────── #
        working_mins_per_day = 510.0  # Default: 8.5 hours * 60 minutes
        
        # ── 6. Build analysis for each part ──────────────────────────────────── #
        analysis_parts = []
        total_parts = 0
        on_time_parts = 0
        late_parts = 0
        total_quantity = 0
        on_time_quantity = 0
        late_quantity = 0
        
        for priority_record, part, order in active_parts:
            part_id = part.id
            due_date = order.due_date
            total_qty = part.qty or 0
            total_parts += 1
            total_quantity += total_qty
            
            # Get completion times
            baseline_completion = baseline_part_completion.get(part_id)
            current_completion = current_part_completion.get(part_id)

            # If part is not in current schedule (completed), use baseline as fallback
            if not current_completion and baseline_completion:
                current_completion = baseline_completion
            
            # Get production progress
            progress = get_part_production_progress(part_id, total_qty)
            
            # Determine if on-time or late based on current schedule
            is_on_time = False
            days_diff = None
            status = "unknown"
            
            if current_completion and due_date:
                if current_completion <= due_date:
                    is_on_time = True
                    status = "on_time"
                    days_diff = (due_date - current_completion).total_seconds() / 60 / working_mins_per_day
                else:
                    is_on_time = False
                    status = "late"
                    days_diff = (current_completion - due_date).total_seconds() / 60 / working_mins_per_day
            
            # Update counters
            if is_on_time:
                on_time_parts += 1
                on_time_quantity += progress["approved_quantity"]
            elif status == "late":
                late_parts += 1
                late_quantity += progress["approved_quantity"]
            
            # Calculate baseline vs current change
            baseline_vs_current = None
            if baseline_completion and current_completion:
                diff_mins = (current_completion - baseline_completion).total_seconds() / 60
                diff_days = diff_mins / working_mins_per_day
                baseline_vs_current = {
                    "baseline_completion": baseline_completion.strftime("%d %b %Y %H:%M"),
                    "current_completion": current_completion.strftime("%d %b %Y %H:%M"),
                    "days_change": round(diff_days, 1),
                    "direction": "earlier" if diff_mins < 0 else "later" if diff_mins > 0 else "no_change"
                }
            
            analysis_parts.append({
                "part_id": part_id,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "order_id": order.id,
                "order_number": order.sale_order_number,
                "due_date": due_date.strftime("%d %b %Y") if due_date else None,
                "expected_delivery": current_completion.strftime("%d %b %Y %H:%M") if current_completion else None,
                "baseline_expected_delivery": baseline_completion.strftime("%d %b %Y %H:%M") if baseline_completion else None,
                "status": status,
                "days_before_due": round(days_diff, 1) if status == "on_time" and days_diff else None,
                "days_overdue": round(days_diff, 1) if status == "late" and days_diff else None,
                "production_progress": progress,
                "baseline_vs_current": baseline_vs_current
            })
        
        # ── 7. Build summary ──────────────────────────────────────────────────── #
        summary = {
            "total_parts": total_parts,
            "on_time_parts": on_time_parts,
            "late_parts": late_parts,
            "on_time_percentage": round((on_time_parts / total_parts * 100) if total_parts > 0 else 0, 1),
            "total_quantity": total_quantity,
            "on_time_quantity": on_time_quantity,
            "late_quantity": late_quantity,
            "on_time_quantity_percentage": round((on_time_quantity / total_quantity * 100) if total_quantity > 0 else 0, 1),
            "baseline_schedule_date": baseline_history.generated_at.strftime("%d %b %Y %H:%M") if baseline_history else None
        }
        
        return {
            "summary": summary,
            "parts": analysis_parts
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch delivery feasibility analysis: {str(e)}")


# =========================================================
# GET MACHINE-WISE OPERATIONS
# =========================================================
@router.get("/machine-operations/{machine_id}")
def get_machine_operations(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch all planned schedule items (operations) for a specific machine.

    Each operation in the response includes:
      can_activate      : bool
      blocked_by        : list
      operation_status  : str
    """

    try:
        # Check if machine exists
        machine_obj = (
            db.query(Machine)
            .filter(Machine.id == machine_id)
            .first()
        )

        if not machine_obj:
            raise HTTPException(
                status_code=404,
                detail=f"Machine with ID {machine_id} not found"
            )

        rows = (
            db.query(
                Rescheduling,
                Operation,
                Machine,
                WorkCenter,
                OrderPartPriority,
                OperationStatus,
                Part
            )
            .join(Operation, Operation.id == Rescheduling.operation_id)
            .outerjoin(Part, Part.id == Rescheduling.part_id)
            .outerjoin(Machine, Machine.id == Rescheduling.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .outerjoin(
                OrderPartPriority,
                (OrderPartPriority.order_id == Rescheduling.order_id) &
                (OrderPartPriority.part_id == Rescheduling.part_id)
            )
            .outerjoin(
                OperationStatus,
                (OperationStatus.operation_id == Rescheduling.operation_id) &
                (OperationStatus.order_id == Rescheduling.order_id) &
                (OperationStatus.part_id == Rescheduling.part_id)
            )
            .filter(Rescheduling.machine_id == machine_id)
            .order_by(Rescheduling.start_time.asc())
            .all()
        )

        # Group operations
        operation_groups = {}

        for (
            reschedule,
            op,
            machine,
            wc,
            priority,
            operation_status,
            part
        ) in rows:

            op_id = reschedule.operation_id

            if op_id not in operation_groups:

                operation_groups[op_id] = {
                    "schedule_id": reschedule.id,

                    "sale_order_id": reschedule.order_id,
                    "sale_order_number": reschedule.order_number,

                    "part_id": reschedule.part_id,
                    "part_number": reschedule.part_number,
                    "part_name": part.part_name if part else None,

                    "priority": priority.priority if priority else None,
                    "order_part_priority_id": (
                        priority.id if priority else None
                    ),

                    "operation_id": reschedule.operation_id,
                    "operation_number": op.operation_number,
                    "operation_name": op.operation_name,

                    "operation_type": (
                        "Out-Source"
                        if op.part_type_id == 2
                        else "IN-House"
                    ),

                    "machine_id": reschedule.machine_id,
                    "machine_make": machine.make if machine else None,
                    "machine_model": machine.model if machine else None,
                    "machine_type": machine.type if machine else None,

                    "work_center_id": wc.id if wc else None,
                    "work_center_name": (
                        wc.work_center_name if wc else None
                    ),

                    "planned_start_time": reschedule.start_time,
                    "planned_end_time": reschedule.end_time,

                    "total_quantity": reschedule.total_qty,
                    "completed_quantity": reschedule.completed_qty,
                    "remaining_quantity": reschedule.remaining_qty,

                    "status": reschedule.status,

                    "operation_status": (
                        operation_status.status
                        if operation_status else "pending"
                    ),

                    "operation_started_at": (
                        operation_status.started_at
                        if operation_status else None
                    ),

                    "operation_completed_at": (
                        operation_status.completed_at
                        if operation_status else None
                    ),

                    # temp values for dependency logic
                    "_part_id_key": reschedule.part_id,
                    "_order_id_key": reschedule.order_id,
                    "_op_number": reschedule.operation_number,
                }

            else:

                group = operation_groups[op_id]

                # update earliest start
                if (
                    reschedule.start_time <
                    group["planned_start_time"]
                ):
                    group["planned_start_time"] = (
                        reschedule.start_time
                    )

                # update latest end
                if (
                    reschedule.end_time >
                    group["planned_end_time"]
                ):
                    group["planned_end_time"] = (
                        reschedule.end_time
                    )

                group["status"] = reschedule.status

        result = []

        for group in operation_groups.values():

            start_time = group["planned_start_time"]
            end_time = group["planned_end_time"]

            duration_hours = round(
                (end_time - start_time).total_seconds() / 3600.0,
                4
            )

            part_id = group.pop("_part_id_key")
            order_id = group.pop("_order_id_key")
            this_op_num = group.pop("_op_number")

            current_status = group["operation_status"]
            op_id = group["operation_id"]
            total_qty = group.get("total_quantity") or 0

            work_due = get_operation_work_due(db, op_id, total_qty)
            activation_block = get_job_card_activation_block_message(
                db,
                machine_id,
                start_time,
            )
            # Partial handoff: qty already released from prior op — allow start
            # before planned_start (material is ready). Breakdown still blocks.
            # Only applies to downstream ops with upstream_approved >= 1.
            if (
                activation_block
                and "scheduled start time" in activation_block.lower()
                and work_due.get("has_predecessor")
                and int(work_due.get("available_quantity") or 0) > 0
            ):
                activation_block = get_machine_breakdown_block_message(
                    db, machine_id, datetime.now()
                )

            production_block = get_operator_activation_block_reason(
                db, op_id, total_qty
            )
            if production_block:
                activation_block = production_block

            # Already started/completed — still block during breakdown / before schedule
            if current_status in ("inprogress", "completed"):
                group["available_quantity"] = work_due.get("available_quantity")
                group["upstream_approved"] = work_due.get("upstream_approved")
                group["upstream_operation_id"] = work_due.get("upstream_operation_id")
                group["upstream_operation_number"] = work_due.get(
                    "upstream_operation_number"
                )
                group["remaining_to_close"] = work_due.get("remaining_to_close")
                # Order progress (approved-based), not schedule-batch remaining.
                rem_close = int(work_due.get("remaining_to_close") or 0)
                group["remaining_quantity"] = rem_close
                group["completed_quantity"] = max(0, int(total_qty) - rem_close)

                if activation_block:
                    group["can_activate"] = False
                    group["blocked_by"] = []
                    group["block_reason"] = activation_block
                else:
                    group["can_activate"] = True
                    group["blocked_by"] = []
                    group["block_reason"] = None

            else:

                all_ops_for_part = (
                    db.query(
                        Rescheduling,
                        Operation,
                        OperationStatus
                    )
                    .join(
                        Operation,
                        Operation.id == Rescheduling.operation_id
                    )
                    .outerjoin(
                        OperationStatus,
                        (OperationStatus.operation_id ==
                         Rescheduling.operation_id) &
                        (OperationStatus.order_id ==
                         Rescheduling.order_id) &
                        (OperationStatus.part_id ==
                         Rescheduling.part_id)
                    )
                    .filter(
                        Rescheduling.part_id == part_id,
                        Rescheduling.order_id == order_id
                    )
                    .order_by(
                        Rescheduling.operation_number.asc()
                    )
                    .all()
                )

                blocking_ops = []
                seen_blocking_op_ids = set()

                for (
                    prev_reschedule,
                    prev_op,
                    prev_status
                ) in all_ops_for_part:

                    try:
                        prev_num = int(
                            prev_reschedule.operation_number
                        )
                        this_num = int(this_op_num)
                    except (ValueError, TypeError):
                        prev_num = (
                            prev_reschedule.operation_number
                        )
                        this_num = this_op_num

                    # Skip current and future ops
                    if prev_num >= this_num:
                        continue

                    if prev_reschedule.operation_id in seen_blocking_op_ids:
                        continue

                    # Non-schedulable WCs (e.g. heat treat) do not gate handoff
                    if not is_schedulable_operation(db, prev_op):
                        continue

                    # Partial flow: unlock when prior op has >= 1 approved unit
                    # (do not wait for full OperationStatus=completed).
                    prior_approved = total_approved_for_operation(
                        db, prev_reschedule.operation_id
                    )
                    prev_status_value = (
                        prev_status.status
                        if prev_status else "pending"
                    )
                    prior_ok = prior_approved >= 1 or prev_status_value == "completed"
                    if prior_ok:
                        continue

                    seen_blocking_op_ids.add(prev_reschedule.operation_id)
                    blocking_ops.append({
                        "operation_id":
                            prev_reschedule.operation_id,
                        "operation_number":
                            prev_reschedule.operation_number,
                        "operation_name":
                            prev_op.operation_name,
                        "status":
                            prev_status_value,
                        "approved_quantity":
                            prior_approved,
                        "machine_id":
                            prev_reschedule.machine_id,
                    })

                if blocking_ops:

                    group["can_activate"] = False
                    group["blocked_by"] = blocking_ops
                    group["block_reason"] = (
                        f"Cannot activate — "
                        f"{len(blocking_ops)} prior "
                        f"operation(s) need at least 1 approved unit first."
                    )

                elif activation_block:

                    group["can_activate"] = False
                    group["blocked_by"] = []
                    group["block_reason"] = activation_block

                elif (
                    work_due.get("has_predecessor")
                    and int(work_due.get("available_quantity") or 0) <= 0
                ):

                    group["can_activate"] = False
                    group["blocked_by"] = []
                    group["block_reason"] = (
                        f"No quantity released from prior operation "
                        f"{work_due.get('upstream_operation_number')} "
                        f"(approved there: {work_due.get('upstream_approved', 0)})."
                    )

                else:

                    group["can_activate"] = True
                    group["blocked_by"] = []
                    group["block_reason"] = None

                group["available_quantity"] = work_due.get("available_quantity")
                group["upstream_approved"] = work_due.get("upstream_approved")
                group["upstream_operation_id"] = work_due.get("upstream_operation_id")
                group["upstream_operation_number"] = work_due.get(
                    "upstream_operation_number"
                )
                group["remaining_to_close"] = work_due.get("remaining_to_close")
                # Order progress (approved-based), not schedule-batch remaining.
                rem_close = int(work_due.get("remaining_to_close") or 0)
                group["remaining_quantity"] = rem_close
                group["completed_quantity"] = max(0, int(total_qty) - rem_close)

            result.append({
                **group,
                "duration_hours": duration_hours,
            })

        return {
            "machine_id": machine_id,

            "machine_make": (
                machine_obj.make if machine_obj else None
            ),

            "machine_model": (
                machine_obj.model if machine_obj else None
            ),

            "machine_type": (
                machine_obj.type if machine_obj else None
            ),

            "work_center_id": (
                machine_obj.work_center_id
                if machine_obj else None
            ),

            "work_center_name": (
                machine_obj.work_center.work_center_name
                if machine_obj.work_center else None
            ),

            "total_operations": len(result),

            "operations": result,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch machine operations: {str(e)}"
        )


# =========================================================
# GET COMPLETED MACHINE-WISE JOB CARDS
# =========================================================
@router.get("/machine-operations/{machine_id}/completed")
def get_completed_machine_operations(
    machine_id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Fetch completed job cards for a specific machine.

    Completion is determined from production_logs only: for each operation on
    this machine, the latest log is checked — if status = 'completed' or
    remaining_quantity_to_be_produced = 0, the operation is treated as completed.

    Response shape matches /machine-operations/{machine_id}.
    """
    try:
        machine_obj = (
            db.query(Machine)
            .filter(Machine.id == machine_id)
            .first()
        )

        if not machine_obj:
            raise HTTPException(
                status_code=404,
                detail=f"Machine with ID {machine_id} not found"
            )

        completed_op_rows = db.execute(
            text("""
                WITH latest_logs AS (
                    SELECT DISTINCT ON (pl.operation_id)
                        pl.operation_id,
                        pl.id AS log_id,
                        pl.status,
                        pl.remaining_quantity_to_be_produced,
                        CASE
                            WHEN pl.to_date IS NOT NULL AND pl.to_time IS NOT NULL
                            THEN (pl.to_date + pl.to_time)
                            ELSE pl.created_at
                        END AS completed_at
                    FROM scheduling.production_logs pl
                    WHERE pl.machine_id = :machine_id
                    ORDER BY pl.operation_id, pl.created_at DESC, pl.id DESC
                )
                SELECT
                    operation_id,
                    log_id,
                    status,
                    remaining_quantity_to_be_produced,
                    completed_at
                FROM latest_logs
                WHERE status = 'completed'
                   OR remaining_quantity_to_be_produced = 0
                ORDER BY completed_at DESC NULLS LAST
            """),
            {"machine_id": machine_id}
        ).fetchall()

        total_completed = len(completed_op_rows)
        paginated_rows = completed_op_rows[skip: skip + limit]

        if not paginated_rows:
            return {
                "machine_id": machine_id,
                "machine_make": machine_obj.make,
                "machine_model": machine_obj.model,
                "machine_type": machine_obj.type,
                "work_center_id": machine_obj.work_center_id,
                "work_center_name": (
                    machine_obj.work_center.work_center_name
                    if machine_obj.work_center else None
                ),
                "total_operations": 0,
                "operations": [],
            }

        latest_history_id = (
            db.query(func.max(ScheduleHistory.id)).scalar()
        )

        result = []

        for (
            op_id,
            latest_log_id,
            _latest_status,
            latest_remaining_qty,
            completed_at,
        ) in paginated_rows:
            op = db.query(Operation).filter(Operation.id == op_id).first()
            if not op:
                continue

            part = db.query(Part).filter(Part.id == op.part_id).first()
            if not part:
                continue

            op_status = db.query(OperationStatus).filter(
                OperationStatus.operation_id == op_id
            ).first()

            order_id = op_status.order_id if op_status else None
            sale_order_number = None
            if order_id:
                order = db.query(Order).filter(Order.id == order_id).first()
                sale_order_number = order.sale_order_number if order else None

            if not order_id:
                priority_row = (
                    db.query(OrderPartPriority)
                    .filter(OrderPartPriority.part_id == part.id)
                    .order_by(OrderPartPriority.id.desc())
                    .first()
                )
                if priority_row:
                    order_id = priority_row.order_id
                    order = db.query(Order).filter(Order.id == order_id).first()
                    sale_order_number = order.sale_order_number if order else None

            priority = None
            if order_id:
                priority = (
                    db.query(OrderPartPriority)
                    .filter(
                        OrderPartPriority.order_id == order_id,
                        OrderPartPriority.part_id == part.id,
                    )
                    .first()
                )

            # Planned schedule spans all segments for this operation on the machine.
            # Start = earliest segment; end + quantities = latest row by id.
            schedule_id = latest_log_id
            planned_start = None
            planned_end = None
            total_qty = part.qty or 0
            completed_qty = 0
            remaining_qty = 0
            has_schedule_rows = False

            reschedule_rows = (
                db.query(Rescheduling)
                .filter(
                    Rescheduling.operation_id == op_id,
                    Rescheduling.machine_id == machine_id,
                )
                .order_by(Rescheduling.id.asc())
                .all()
            )

            if reschedule_rows:
                has_schedule_rows = True
                latest_reschedule = reschedule_rows[-1]
                schedule_id = latest_reschedule.id
                planned_start = min(row.start_time for row in reschedule_rows)
                planned_end = latest_reschedule.end_time
                total_qty = latest_reschedule.total_qty
                completed_qty = latest_reschedule.completed_qty
                remaining_qty = latest_reschedule.remaining_qty
            else:
                reschedule_rows = (
                    db.query(Rescheduling)
                    .filter(Rescheduling.operation_id == op_id)
                    .order_by(Rescheduling.id.asc())
                    .all()
                )
                if reschedule_rows:
                    has_schedule_rows = True
                    latest_reschedule = reschedule_rows[-1]
                    schedule_id = latest_reschedule.id
                    planned_start = min(row.start_time for row in reschedule_rows)
                    planned_end = latest_reschedule.end_time
                    total_qty = latest_reschedule.total_qty
                    completed_qty = latest_reschedule.completed_qty
                    remaining_qty = latest_reschedule.remaining_qty

            if not has_schedule_rows and latest_history_id:
                planned_rows = (
                    db.query(PlannedScheduleItem)
                    .filter(
                        PlannedScheduleItem.operation_id == op_id,
                        PlannedScheduleItem.machine_id == machine_id,
                        PlannedScheduleItem.schedule_history_id == latest_history_id,
                    )
                    .order_by(PlannedScheduleItem.id.asc())
                    .all()
                )
                if planned_rows:
                    has_schedule_rows = True
                    latest_planned = planned_rows[-1]
                    schedule_id = latest_planned.id
                    planned_start = min(
                        row.planned_start_time for row in planned_rows
                    )
                    planned_end = latest_planned.planned_end_time
                    total_qty = latest_planned.total_quantity
                    remaining_qty = latest_planned.remaining_quantity
                    completed_qty = max(0, total_qty - remaining_qty)
                else:
                    planned_rows = (
                        db.query(PlannedScheduleItem)
                        .filter(
                            PlannedScheduleItem.operation_id == op_id,
                            PlannedScheduleItem.schedule_history_id == latest_history_id,
                        )
                        .order_by(PlannedScheduleItem.id.asc())
                        .all()
                    )
                    if planned_rows:
                        has_schedule_rows = True
                        latest_planned = planned_rows[-1]
                        schedule_id = latest_planned.id
                        planned_start = min(
                            row.planned_start_time for row in planned_rows
                        )
                        planned_end = latest_planned.planned_end_time
                        total_qty = latest_planned.total_quantity
                        remaining_qty = latest_planned.remaining_quantity
                        completed_qty = max(0, total_qty - remaining_qty)

            logs = (
                db.query(ProductionLog)
                .filter(
                    ProductionLog.operation_id == op_id,
                    ProductionLog.machine_id == machine_id,
                )
                .order_by(ProductionLog.created_at.asc())
                .all()
            )

            actual_start = None
            actual_end = None
            for log in logs:
                if log.from_date and log.from_time:
                    candidate = datetime.combine(log.from_date, log.from_time)
                    if not actual_start or candidate < actual_start:
                        actual_start = candidate
                if log.to_date and log.to_time:
                    candidate = datetime.combine(log.to_date, log.to_time)
                    if not actual_end or candidate > actual_end:
                        actual_end = candidate

            if not planned_start:
                planned_start = actual_start
            if not planned_end:
                planned_end = actual_end

            if not has_schedule_rows:
                approved_total = db.execute(
                    text("""
                        SELECT COALESCE(SUM(approved_quantity), 0)
                        FROM scheduling.production_logs
                        WHERE operation_id = :op_id
                    """),
                    {"op_id": op_id}
                ).scalar() or 0
                total_qty = part.qty or 0
                completed_qty = approved_total
                remaining_qty = (
                    latest_remaining_qty
                    if latest_remaining_qty is not None
                    else max(0, total_qty - completed_qty)
                )

            operation_started_at = (
                op_status.started_at if op_status else actual_start
            )
            operation_completed_at = (
                op_status.completed_at if op_status and op_status.completed_at
                else completed_at
            )

            duration_hours = None
            if operation_started_at and operation_completed_at:
                duration_hours = round(
                    (operation_completed_at - operation_started_at).total_seconds() / 3600.0,
                    4
                )

            wc = machine_obj.work_center

            result.append({
                "schedule_id": schedule_id,
                "sale_order_id": order_id,
                "sale_order_number": sale_order_number,
                "part_id": part.id,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "priority": priority.priority if priority else None,
                "order_part_priority_id": priority.id if priority else None,
                "operation_id": op_id,
                "operation_number": op.operation_number,
                "operation_name": op.operation_name,
                "operation_type": (
                    "Out-Source" if op.part_type_id == 2 else "IN-House"
                ),
                "machine_id": machine_id,
                "machine_make": machine_obj.make,
                "machine_model": machine_obj.model,
                "machine_type": machine_obj.type,
                "work_center_id": wc.id if wc else None,
                "work_center_name": wc.work_center_name if wc else None,
                "planned_start_time": planned_start,
                "planned_end_time": planned_end,
                "total_quantity": total_qty,
                "completed_quantity": completed_qty,
                "remaining_quantity": remaining_qty,
                "status": "completed",
                "operation_status": "completed",
                "operation_started_at": operation_started_at,
                "operation_completed_at": operation_completed_at,
                "can_activate": False,
                "blocked_by": [],
                "block_reason": "Operation already completed",
                "duration_hours": duration_hours,
            })

        return {
            "machine_id": machine_id,
            "machine_make": machine_obj.make,
            "machine_model": machine_obj.model,
            "machine_type": machine_obj.type,
            "work_center_id": machine_obj.work_center_id,
            "work_center_name": (
                machine_obj.work_center.work_center_name
                if machine_obj.work_center else None
            ),
            "total_operations": total_completed,
            "operations": result,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch completed machine operations: {str(e)}"
        )


# =========================================================
# OPERATION STATUS MANAGEMENT
# =========================================================

@router.get("/operation-status/", response_model=List[OperationStatusWithDetails])
def get_all_operation_status(
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all operation status records, optionally filtered by status.
    """
    try:
        query = (
            db.query(OperationStatus, Operation, Part, Order)
            .join(Operation, OperationStatus.operation_id == Operation.id)
            .join(Part, OperationStatus.part_id == Part.id)
            .join(Order, OperationStatus.order_id == Order.id)
        )
        
        if status:
            query = query.filter(OperationStatus.status == status.lower())
            
        results = query.all()
        
        response = []
        for op_status, operation, part, order in results:
            response.append({
                "id": op_status.id,
                "order_id": op_status.order_id,
                "part_id": op_status.part_id,
                "operation_id": op_status.operation_id,
                "status": op_status.status,
                "started_at": op_status.started_at,
                "completed_at": op_status.completed_at,
                "created_at": op_status.created_at,
                "updated_at": op_status.updated_at,
                "operation": {
                    "id": operation.id,
                    "operation_number": operation.operation_number,
                    "operation_name": operation.operation_name
                },
                "part": {
                    "id": part.id,
                    "part_number": part.part_number,
                    "part_name": part.part_name
                },
                "order": {
                    "id": order.id,
                    "sale_order_number": order.sale_order_number
                }
            })
            
        return response
        
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch operation status: {str(e)}")


@router.get("/operation-status/{operation_id}", response_model=OperationStatusWithDetails)
def get_operation_status(
    operation_id: int,
    db: Session = Depends(get_db)
):
    """
    Get operation status for a specific operation ID.
    """
    try:
        result = (
            db.query(OperationStatus, Operation, Part, Order)
            .join(Operation, OperationStatus.operation_id == Operation.id)
            .join(Part, OperationStatus.part_id == Part.id)
            .join(Order, OperationStatus.order_id == Order.id)
            .filter(OperationStatus.operation_id == operation_id)
            .first()
        )
        
        if not result:
            raise HTTPException(404, f"Operation status for operation ID {operation_id} not found")
            
        op_status, operation, part, order = result
        
        return {
            "id": op_status.id,
            "order_id": op_status.order_id,
            "part_id": op_status.part_id,
            "operation_id": op_status.operation_id,
            "status": op_status.status,
            "started_at": op_status.started_at,
            "completed_at": op_status.completed_at,
            "created_at": op_status.created_at,
            "updated_at": op_status.updated_at,
            "operation": {
                "id": operation.id,
                "operation_number": operation.operation_number,
                "operation_name": operation.operation_name
            },
            "part": {
                "id": part.id,
                "part_number": part.part_number,
                "part_name": part.part_name
            },
            "order": {
                "id": order.id,
                "sale_order_number": order.sale_order_number
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch operation status: {str(e)}")


@router.put("/operation-status/{operation_id}", response_model=OperationStatusResponse)
def update_operation_status(
    operation_id: int,
    data: OperationStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Update operation status (pending -> inprogress -> completed).
    
    When status changes to 'inprogress', sets started_at timestamp.
    When status changes to 'completed', sets completed_at timestamp.
    """
    try:
        # Validate status values
        valid_statuses = ["pending", "inprogress", "completed"]
        new_status = data.status.lower()
        
        if new_status not in valid_statuses:
            raise HTTPException(
                400,
                f"Invalid status '{data.status}'. Valid values: {', '.join(valid_statuses)}"
            )
        
        # Get existing operation status
        op_status = db.query(OperationStatus).filter(
            OperationStatus.operation_id == operation_id
        ).first()
        
        if not op_status:
            raise HTTPException(404, f"Operation status for operation ID {operation_id} not found")
        
        old_status = op_status.status
        
        # Update status and timestamps based on transition
        op_status.status = new_status
        
        if new_status == "inprogress" and old_status != "inprogress":
            op_status.started_at = datetime.now()
        elif new_status == "completed" and old_status != "completed":
            op_status.completed_at = datetime.now()
        
        op_status.updated_at = datetime.now()
        
        db.commit()
        db.refresh(op_status)
        
        return {
            "id": op_status.id,
            "order_id": op_status.order_id,
            "part_id": op_status.part_id,
            "operation_id": op_status.operation_id,
            "status": op_status.status,
            "started_at": op_status.started_at,
            "completed_at": op_status.completed_at,
            "created_at": op_status.created_at,
            "updated_at": op_status.updated_at
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to update operation status: {str(e)}")


@router.post("/machine/{machine_id}/initialize-status")
def initialize_machine_status(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """
    Initialize machine status with default 'off' status.
    This should be called when setting up a new machine or resetting status.
    """
    try:
        current_time = datetime.now()
        
        # Check if machine exists
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if not machine:
            raise HTTPException(404, f"Machine with ID {machine_id} not found")
        
        # Check if machine_live_status entry exists
        check_existing_sql = """
        SELECT id FROM production_monitoring.machine_live_status 
        WHERE machine_id = :machine_id
        """
        
        existing_result = db.execute(text(check_existing_sql), {"machine_id": machine_id}).fetchone()
        
        if existing_result:
            # Update existing record to 'off' status
            update_sql = """
            UPDATE production_monitoring.machine_live_status 
            SET status = 'off',
                last_updated = :current_time,
                current_order_id = NULL,
                current_part_id = NULL,
                current_operation_id = NULL
            WHERE machine_id = :machine_id
            """
            db.execute(text(update_sql), {
                "machine_id": machine_id,
                "current_time": current_time
            })
        else:
            # Insert new record with 'off' status
            insert_sql = """
            INSERT INTO production_monitoring.machine_live_status 
            (machine_id, status, last_updated, current_order_id, current_part_id, current_operation_id)
            VALUES (:machine_id, 'off', :current_time, NULL, NULL, NULL)
            """
            db.execute(text(insert_sql), {
                "machine_id": machine_id,
                "current_time": current_time
            })
        
        db.commit()
        
        return {"message": f"Machine {machine_id} status initialized to 'off'"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to initialize machine status: {str(e)}")


@router.post("/operation-status/{operation_id}/activate")
def activate_job_card(
    operation_id: int,
    operator_id: int,
    db: Session = Depends(get_db)
):
    """
    Activate a job card - creates production log with operator_status 'inprogress'
    and automatic from_date/from_time. Uses only Rescheduling table.
    
    Args:
        operation_id: ID of the operation to activate
        operator_id: ID of the operator activating the job card
    """
    try:
        # Verify operator exists
        from DB.models import AccessUser
        from DB.models.scheduling import ProductionLog
        from DB.models.access_control import OperatorLeave
        from datetime import date
        operator = db.query(AccessUser).filter(AccessUser.id == operator_id).first()
        if not operator:
            raise HTTPException(404, f"Operator with ID {operator_id} not found")
        
        # Check if operator has acknowledged leave on current date
        today = date.today()
        operator_leave = db.query(OperatorLeave).filter(
            OperatorLeave.operator_id == operator_id,
            OperatorLeave.status == 'acknowledged',
            OperatorLeave.from_date <= today,
            OperatorLeave.to_date >= today
        ).first()
        
        if operator_leave:
            logger.warning(
                "Job card activation blocked — operator on leave",
                extra={
                    "event": "operator_leave_activation_block",
                    "operator_id": operator_id,
                    "operation_id": operation_id,
                    "leave_from_date": operator_leave.from_date.isoformat(),
                    "leave_to_date": operator_leave.to_date.isoformat(),
                },
            )
            raise HTTPException(
                400,
                f"Cannot activate job card. Operator has acknowledged leave from {operator_leave.from_date} to {operator_leave.to_date}. Reason: {operator_leave.reason if operator_leave.reason else 'Not specified'}"
            )
        
        # Get rescheduling item for this operation
        rescheduling_item = db.query(Rescheduling).filter(
            Rescheduling.operation_id == operation_id,
            Rescheduling.status.in_(['scheduled', 'rescheduled'])
        ).order_by(Rescheduling.start_time.desc()).first()
        
        if not rescheduling_item:
            raise HTTPException(404, f"No rescheduling record found for operation ID {operation_id}")
        
        if not rescheduling_item.machine_id:
            raise HTTPException(404, f"No machine assigned to operation ID {operation_id}")
        
        machine_id = rescheduling_item.machine_id
        
        # Check operation sequence dependency using Rescheduling
        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        total_quantity = 0
        if operation:
            part_for_qty = db.query(Part).filter(Part.id == operation.part_id).first()
            total_quantity = (part_for_qty.qty or 0) if part_for_qty else 0
            production_block = get_operator_activation_block_reason(
                db, operation_id, total_quantity
            )
            if production_block:
                event = (
                    "outsource_operation_pending_block"
                    if "out-source" in production_block.lower()
                    else "job_card_activation_blocked"
                )
                handoff_snapshot = get_operation_work_due(db, operation_id, total_quantity)
                logger.warning(
                    "Job card activation blocked",
                    extra={
                        "event": event,
                        "operator_id": operator_id,
                        "operation_id": operation_id,
                        "operation_number": getattr(operation, "operation_number", None),
                        "available_quantity": handoff_snapshot.get("available_quantity"),
                        "upstream_operation_number": handoff_snapshot.get(
                            "upstream_operation_number"
                        ),
                        "upstream_approved": handoff_snapshot.get("upstream_approved"),
                        "reason": production_block,
                    },
                )
                raise HTTPException(400, production_block)

        breakdown_block = get_machine_breakdown_block_message(
            db, machine_id, datetime.now()
        )
        if breakdown_block:
            logger.warning(
                "Job card activation blocked",
                extra={
                    "event": "job_card_activation_blocked",
                    "operator_id": operator_id,
                    "operation_id": operation_id,
                    "machine_id": machine_id,
                    "reason": breakdown_block,
                },
            )
            raise HTTPException(400, breakdown_block)

        # Create or update production log
        current_time = datetime.now()
        current_date = current_time.date()
        current_time_only = current_time.time()
        
        # Check if there's an existing production log with operator_status 'inprogress'
        existing_log = db.query(ProductionLog).filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.operator_status == "inprogress"
        ).first()
        
        if not existing_log:
            # Create new production log
            new_log = ProductionLog(
                operation_id=operation_id,
                operator_id=operator_id,
                machine_id=machine_id,
                from_date=current_date,
                from_time=current_time_only,
                operator_status="inprogress"
            )
            db.add(new_log)
        
        # Link active job to machine_live_status when a row already exists for this machine.
        # Do not change status/last_updated and do not insert a new row.
        try:
            update_sql = """
            UPDATE production_monitoring.machine_live_status
            SET current_order_id = :order_id,
                current_part_id = :part_id,
                current_operation_id = :operation_id
            WHERE machine_id = :machine_id
            """
            db.execute(
                text(update_sql),
                {
                    "machine_id": machine_id,
                    "order_id": rescheduling_item.order_id,
                    "part_id": rescheduling_item.part_id,
                    "operation_id": operation_id,
                },
            )
        except Exception as e:
            logger.exception(
                "Could not update machine_live_status",
                extra={
                    "event": "machine_live_status_update_failed",
                    "machine_id": machine_id,
                    "operation_id": operation_id,
                    "order_id": rescheduling_item.order_id,
                    "part_id": rescheduling_item.part_id,
                },
            )
        
        db.commit()
        handoff = get_operation_work_due(db, operation_id, total_quantity)
        logger.info(
            "Job card activated",
            extra={
                "event": "job_card_activation_completed",
                "operator_id": operator_id,
                "operation_id": operation_id,
                "operation_number": rescheduling_item.operation_number,
                "machine_id": machine_id,
                "order_id": rescheduling_item.order_id,
                "part_id": rescheduling_item.part_id,
                "available_quantity": handoff.get("available_quantity"),
                "upstream_operation_number": handoff.get("upstream_operation_number"),
                "upstream_approved": handoff.get("upstream_approved"),
                "remaining_to_close": handoff.get("remaining_to_close"),
                "result_message": (
                    f"Op {rescheduling_item.operation_number} activated with "
                    f"{handoff.get('available_quantity')} unit(s) released "
                    f"from upstream "
                    f"(Op {handoff.get('upstream_operation_number')} "
                    f"approved={handoff.get('upstream_approved')})."
                    if handoff.get("has_predecessor")
                    else (
                        f"Op {rescheduling_item.operation_number} activated "
                        f"(first schedulable op; available="
                        f"{handoff.get('available_quantity')})."
                    )
                ),
            },
        )
        
        return {
            "message": "Job card activated successfully",
            "order_id": rescheduling_item.order_id,
            "order_number": rescheduling_item.order_number,
            "part_id": rescheduling_item.part_id,
            "part_number": rescheduling_item.part_number,
            "operation_id": operation_id,
            "operation_number": rescheduling_item.operation_number,
            "machine_id": machine_id,
            "operator_id": operator_id,
            "status": "inprogress"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to activate job card: {str(e)}")


@router.post("/operation-status/{operation_id}/complete", response_model=OperationStatusResponse)
def complete_job_card(
    operation_id: int,
    db: Session = Depends(get_db)
):
    """
    Complete a job card - changes status to 'completed'
    and sets the completed_at timestamp.
    Also triggers dynamic rescheduling to cascade subsequent operations.
    """
    try:
        op_status = db.query(OperationStatus).filter(
            OperationStatus.operation_id == operation_id
        ).first()
        
        if not op_status:
            raise HTTPException(404, f"Operation status for operation ID {operation_id} not found")
        
        if op_status.status == "completed":
            raise HTTPException(
                400,
                f"Job card is already completed"
            )
        
        # Update status and completion time
        op_status.status = "completed"
        op_status.completed_at = datetime.now()
        op_status.updated_at = datetime.now()
        
        # Ensure started_at is set if it wasn't already
        if not op_status.started_at:
            op_status.started_at = op_status.completed_at
        
        db.commit()
        db.refresh(op_status)
        
        # Trigger GLOBAL dynamic rescheduling to maintain chronological order across ALL parts
        print(f"[DEBUG] Operation {operation_id} completed - triggering GLOBAL dynamic reschedule for ALL parts")
        try:
            reschedule_result = dynamic_reschedule(
                db=db, 
                triggered_by_part_id=None,  # None = reschedule ALL active parts globally
                triggered_by_op_id=operation_id
            )
            print(f"[DEBUG] Global dynamic reschedule result: {reschedule_result}")
            
            # Show what the rescheduling items look like for this part after reschedule
            reschedule_items = db.query(Rescheduling).filter(
                Rescheduling.part_id == op_status.part_id,
                Rescheduling.status.in_(['scheduled', 'rescheduled'])
            ).order_by(Rescheduling.start_time).all()
            
            print(f"[DEBUG] Rescheduling items for part {op_status.part_id} after completion:")
            for item in reschedule_items:
                print(f"  Op {item.operation_id} ({item.operation_number}): {item.start_time} -> {item.end_time}")
                
        except Exception as reschedule_error:
            print(f"[ERROR] Dynamic reschedule failed after completing operation {operation_id}: {reschedule_error}")
            # Don't fail the completion if reschedule fails, but log it
        
        return {
            "id": op_status.id,
            "order_id": op_status.order_id,
            "part_id": op_status.part_id,
            "operation_id": op_status.operation_id,
            "status": op_status.status,
            "started_at": op_status.started_at,
            "completed_at": op_status.completed_at,
            "created_at": op_status.created_at,
            "updated_at": op_status.updated_at
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to complete job card: {str(e)}")


# =========================================================
# OPERATION STATUS CLEANUP AND MAINTENANCE
# =========================================================

@router.get("/operation-status/cleanup/report")
def get_operation_status_integrity_report(
    db: Session = Depends(get_db)
):
    """
    Get data integrity report for operation status vs planned schedule items.
    """
    try:
        from utils.operation_status_cleanup import get_data_integrity_report
        
        report = get_data_integrity_report(db)
        
        if not report["success"]:
            raise HTTPException(500, f"Failed to generate integrity report: {report.get('error', 'Unknown error')}")
        
        return report
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get integrity report: {str(e)}")


@router.post("/operation-status/cleanup/orphaned")
def cleanup_orphaned_operation_status(
    db: Session = Depends(get_db)
):
    """
    Clean up orphaned operation status entries (status without planned schedule items).
    """
    try:
        from utils.operation_status_cleanup import cleanup_orphaned_operation_status
        
        result = cleanup_orphaned_operation_status(db)
        
        if not result["success"]:
            raise HTTPException(500, f"Cleanup failed: {result.get('error', 'Unknown error')}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to cleanup orphaned entries: {str(e)}")


@router.post("/operation-status/cleanup/inactive-orders")
def cleanup_inactive_orders_status(
    db: Session = Depends(get_db)
):
    """
    Clean up operation status entries for orders that have no active parts.
    """
    try:
        from utils.operation_status_cleanup import cleanup_for_inactive_orders
        
        result = cleanup_for_inactive_orders(db)
        
        if not result["success"]:
            raise HTTPException(500, f"Cleanup failed: {result.get('error', 'Unknown error')}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to cleanup inactive orders: {str(e)}")


@router.post("/operation-status/cleanup/all")
def cleanup_all_operation_status(
    db: Session = Depends(get_db)
):
    """
    Perform comprehensive cleanup of operation status entries.
    This includes orphaned entries and inactive orders cleanup.
    """
    try:
        from utils.operation_status_cleanup import (
            cleanup_orphaned_operation_status, 
            cleanup_for_inactive_orders,
            get_data_integrity_report
        )
        
        # Get initial state
        initial_report = get_data_integrity_report(db)
        
        # Clean up orphaned entries
        orphaned_result = cleanup_orphaned_operation_status(db)
        
        # Clean up inactive orders
        inactive_result = cleanup_for_inactive_orders(db)
        
        # Get final state
        final_report = get_data_integrity_report(db)
        
        return {
            "success": True,
            "initial_state": initial_report,
            "orphaned_cleanup": orphaned_result,
            "inactive_cleanup": inactive_result,
            "final_state": final_report,
            "message": "Comprehensive cleanup completed",
            "timestamp": datetime.now()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to perform comprehensive cleanup: {str(e)}")


# =============================================================================
# Out-Source Operation Status — CRUD
# =============================================================================
OUT_SOURCE_TYPE_ID = 2                              # oms.part_types.id for Out-Source
VALID_OS_STATUSES  = {"pending", "in_transit", "delivered"}


def _log_outsource_status_event(
    *,
    event: str,
    order_id: int,
    part_id: int,
    operation_id: int,
    status: str,
    sent_date=None,
    delivered_date=None,
    previous_status: Optional[str] = None,
) -> None:
    logger.info(
        "Out-source operation status changed",
        extra={
            "event": event,
            "order_id": order_id,
            "part_id": part_id,
            "operation_id": operation_id,
            "status": status,
            "previous_status": previous_status,
            "sent_date": sent_date.isoformat() if sent_date else None,
            "delivered_date": delivered_date.isoformat() if delivered_date else None,
        },
    )


def _serialize_os_row(
    operation: Operation,
    part: Part,
    order: Order,
    status_row: Optional[OutSourceOperationStatus],
) -> Dict:
    """Build the per-row dict for the list / single-detail responses."""
    return {
        "operation_id":      operation.id,
        "operation_number":  operation.operation_number,
        "operation_name":    operation.operation_name,
        "from_date":         operation.from_date,
        "to_date":           operation.to_date,
        "part_id":           part.id,
        "part_number":       part.part_number,
        "part_name":         getattr(part, "part_name", None),
        "order_id":          order.id,
        "sale_order_number": order.sale_order_number,
        "status_id":         status_row.id            if status_row else None,
        "status":            status_row.status        if status_row else None,
        "sent_date":         status_row.sent_date     if status_row else None,
        "delivered_date":    status_row.delivered_date if status_row else None,
        "created_at":        status_row.created_at    if status_row else None,
        "updated_at":        status_row.updated_at    if status_row else None,
    }


@router.get(
    "/out-source-operations",
    response_model=List[OutSourceOperationWithDetails],
)
def list_out_source_operations(
    order_id: Optional[int] = None,
    part_id:  Optional[int] = None,
    status:   Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """
    List Out-Source operations across orders, joined with their status row (if any).

    Filters:
        order_id     – restrict to a single order
        part_id      – restrict to a single part
        status       – pending | in_transit | delivered | none (no status row)
        active_only  – if True (default), only parts with active PartScheduleStatus
    """
    try:
        q = (
            db.query(Operation, Part, Order, OutSourceOperationStatus, PartScheduleStatus)
            .join(Part, Part.id == Operation.part_id)
            .join(PartScheduleStatus, PartScheduleStatus.part_id == Part.id)
            .join(Order, Order.id == PartScheduleStatus.sale_order_id)
            .outerjoin(
                OutSourceOperationStatus,
                and_(
                    OutSourceOperationStatus.operation_id == Operation.id,
                    OutSourceOperationStatus.part_id      == Part.id,
                    OutSourceOperationStatus.order_id     == Order.id,
                ),
            )
            .filter(Operation.part_type_id == OUT_SOURCE_TYPE_ID)
        )

        if active_only:
            q = q.filter(PartScheduleStatus.status == "active")
        if order_id is not None:
            q = q.filter(Order.id == order_id)
        if part_id is not None:
            q = q.filter(Part.id == part_id)
        if status is not None:
            s = status.lower()
            if s == "none":
                q = q.filter(OutSourceOperationStatus.id.is_(None))
            else:
                if s not in VALID_OS_STATUSES:
                    raise HTTPException(
                        400,
                        f"Invalid status '{status}'. Valid: {', '.join(VALID_OS_STATUSES)} or 'none'.",
                    )
                q = q.filter(OutSourceOperationStatus.status == s)

        results = q.order_by(Order.id, Part.id, Operation.id).all()

        return [
            _serialize_os_row(op, part, order, st)
            for op, part, order, st, _pss in results
        ]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to list out-source operations: {str(e)}")


@router.get(
    "/out-source-operations/{order_id}/{operation_id}",
    response_model=OutSourceOperationWithDetails,
)
def get_out_source_operation(
    order_id: int,
    operation_id: int,
    db: Session = Depends(get_db),
):
    """Get a single out-source operation + status detail for (order, operation)."""
    try:
        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        if not operation:
            raise HTTPException(404, f"Operation {operation_id} not found")
        if operation.part_type_id != OUT_SOURCE_TYPE_ID:
            raise HTTPException(400, f"Operation {operation_id} is not an Out-Source operation")

        part  = db.query(Part).filter(Part.id == operation.part_id).first()
        order = db.query(Order).filter(Order.id == order_id).first()
        if not part:
            raise HTTPException(404, f"Part {operation.part_id} not found")
        if not order:
            raise HTTPException(404, f"Order {order_id} not found")

        status_row = (
            db.query(OutSourceOperationStatus)
            .filter(
                OutSourceOperationStatus.operation_id == operation_id,
                OutSourceOperationStatus.part_id      == part.id,
                OutSourceOperationStatus.order_id     == order_id,
            )
            .first()
        )

        return _serialize_os_row(operation, part, order, status_row)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch out-source operation: {str(e)}")


@router.post(
    "/out-source-operations/{order_id}/{operation_id}/status",
    response_model=OutSourceOperationStatusResponse,
)
def upsert_out_source_status(
    order_id: int,
    operation_id: int,
    payload: OutSourceOperationStatusCreate,
    db: Session = Depends(get_db),
):
    """
    Create (or upsert) the status row for (order, operation).
    Idempotent — if a row already exists for this triple it is updated in place.

    When `status='delivered'` and `delivered_date` is not supplied, it defaults to now().
    On delivered → triggers dynamic_reschedule for the part.
    """
    try:
        new_status = payload.status.lower()
        if new_status not in VALID_OS_STATUSES:
            raise HTTPException(
                400,
                f"Invalid status '{payload.status}'. Valid: {', '.join(VALID_OS_STATUSES)}",
            )

        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        if not operation:
            raise HTTPException(404, f"Operation {operation_id} not found")
        if operation.part_type_id != OUT_SOURCE_TYPE_ID:
            raise HTTPException(400, f"Operation {operation_id} is not an Out-Source operation")

        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(404, f"Order {order_id} not found")

        part_id = operation.part_id

        # Default delivered_date when marking delivered
        sent_date      = payload.sent_date or (datetime.now() if new_status in ("in_transit", "delivered") else None)
        delivered_date = payload.delivered_date or (datetime.now() if new_status == "delivered" else None)

        # if new_status == "delivered" and delivered_date is None:
        #     delivered_date = datetime.now(timezone.utc)
        # if new_status in ("in_transit", "delivered") and sent_date is None:
        #     # If we're already past 'pending' and sent_date wasn't supplied, default to now
        #     sent_date = datetime.now(timezone.utc)

        if new_status == "delivered" and sent_date and delivered_date and delivered_date < sent_date:
            raise HTTPException(400, "delivered_date cannot be earlier than sent_date")

        # Upsert
        row = (
            db.query(OutSourceOperationStatus)
            .filter(
                OutSourceOperationStatus.operation_id == operation_id,
                OutSourceOperationStatus.part_id      == part_id,
                OutSourceOperationStatus.order_id     == order_id,
            )
            .first()
        )

        if row is None:
            row = OutSourceOperationStatus(
                part_id        = part_id,
                order_id       = order_id,
                operation_id   = operation_id,
                sent_date      = sent_date,
                delivered_date = delivered_date,
                status         = new_status,
            )
            db.add(row)
            previous_status = None
        else:
            previous_status = row.status
            row.sent_date      = sent_date      if sent_date      is not None else row.sent_date
            row.delivered_date = delivered_date if delivered_date is not None else row.delivered_date
            row.status         = new_status

        db.commit()
        db.refresh(row)

        if new_status == "in_transit" and previous_status != "in_transit":
            _log_outsource_status_event(
                event="outsource_operation_sent",
                order_id=order_id,
                part_id=part_id,
                operation_id=operation_id,
                status=new_status,
                sent_date=row.sent_date,
                delivered_date=row.delivered_date,
                previous_status=previous_status,
            )
        if new_status == "delivered" and previous_status != "delivered":
            _log_outsource_status_event(
                event="outsource_operation_returned",
                order_id=order_id,
                part_id=part_id,
                operation_id=operation_id,
                status=new_status,
                sent_date=row.sent_date,
                delivered_date=row.delivered_date,
                previous_status=previous_status,
            )

        # Side-effect: on delivered, trigger a dynamic reschedule so downstream
        # ops snap to the actual delivered_date (respecting shift boundaries).
        if new_status == "delivered":
            try:
                from algorithm import dynamic_reschedule
                resched_result = dynamic_reschedule(
                    db,
                    triggered_by_part_id=part_id,
                    triggered_by_op_id=operation_id,
                )
                logger.info(
                    "Dynamic reschedule after out-source delivery",
                    extra={
                        "event": "dynamic_reschedule_completed",
                        "trigger_source": "outsource_delivered",
                        "order_id": order_id,
                        "part_id": part_id,
                        "operation_id": operation_id,
                        "result_message": resched_result.get("message"),
                    },
                )
            except Exception as resched_err:
                logger.exception(
                    "Auto-reschedule failed after out-source delivery",
                    extra={
                        "event": "dynamic_reschedule_failed",
                        "trigger_source": "outsource_delivered",
                        "order_id": order_id,
                        "part_id": part_id,
                        "operation_id": operation_id,
                    },
                )

        return row

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to upsert out-source status: {str(e)}")


@router.patch(
    "/out-source-operations/{order_id}/{operation_id}/status",
    response_model=OutSourceOperationStatusResponse,
)
def update_out_source_status(
    order_id: int,
    operation_id: int,
    payload: OutSourceOperationStatusUpdate,
    db: Session = Depends(get_db),
):
    """
    Partial update for the status row. Any subset of {sent_date, delivered_date, status} may be sent.

    If `status` transitions to 'delivered':
        - If `delivered_date` is not supplied, defaults to now().
        - Triggers dynamic_reschedule for the part.
    """
    try:
        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        if not operation:
            raise HTTPException(404, f"Operation {operation_id} not found")
        if operation.part_type_id != OUT_SOURCE_TYPE_ID:
            raise HTTPException(400, f"Operation {operation_id} is not an Out-Source operation")

        row = (
            db.query(OutSourceOperationStatus)
            .filter(
                OutSourceOperationStatus.operation_id == operation_id,
                OutSourceOperationStatus.part_id      == operation.part_id,
                OutSourceOperationStatus.order_id     == order_id,
            )
            .first()
        )
        if not row:
            raise HTTPException(
                404,
                f"No status row exists for order={order_id}, operation={operation_id}. "
                f"Use POST to create one.",
            )

        previous_status = row.status

        if payload.status is not None:
            s = payload.status.lower()
            if s not in VALID_OS_STATUSES:
                raise HTTPException(400, f"Invalid status '{payload.status}'.")
            row.status = s
            if s in ("in_transit", "delivered") and row.sent_date is None:
                row.sent_date = payload.sent_date or datetime.now()
            if s == "delivered":
                row.delivered_date = payload.delivered_date or datetime.now()

        # if payload.sent_date is not None:
        #     row.sent_date = payload.sent_date
        # if payload.delivered_date is not None:
        #     row.delivered_date = payload.delivered_date
        # if payload.status is not None:
        #     s = payload.status.lower()
        #     if s not in VALID_OS_STATUSES:
        #         raise HTTPException(
        #             400,
        #             f"Invalid status '{payload.status}'. Valid: {', '.join(VALID_OS_STATUSES)}",
        #         )
        #     row.status = s
        #     if s == "delivered" and row.delivered_date is None:
        #         row.delivered_date = datetime.now(timezone.utc)

        # Final sanity
        if row.sent_date and row.delivered_date and row.delivered_date < row.sent_date:
            raise HTTPException(400, "delivered_date cannot be earlier than sent_date")

        db.commit()
        db.refresh(row)

        if row.status == "in_transit" and previous_status != "in_transit":
            _log_outsource_status_event(
                event="outsource_operation_sent",
                order_id=order_id,
                part_id=operation.part_id,
                operation_id=operation_id,
                status=row.status,
                sent_date=row.sent_date,
                delivered_date=row.delivered_date,
                previous_status=previous_status,
            )
        if row.status == "delivered" and previous_status != "delivered":
            _log_outsource_status_event(
                event="outsource_operation_returned",
                order_id=order_id,
                part_id=operation.part_id,
                operation_id=operation_id,
                status=row.status,
                sent_date=row.sent_date,
                delivered_date=row.delivered_date,
                previous_status=previous_status,
            )

        # Side-effect on delivered transition
        if row.status == "delivered" and previous_status != "delivered":
            try:
                from algorithm import dynamic_reschedule
                resched_result = dynamic_reschedule(
                    db,
                    triggered_by_part_id=operation.part_id,
                    triggered_by_op_id=operation_id,
                )
                logger.info(
                    "Dynamic reschedule after out-source delivery",
                    extra={
                        "event": "dynamic_reschedule_completed",
                        "trigger_source": "outsource_delivered",
                        "order_id": order_id,
                        "part_id": operation.part_id,
                        "operation_id": operation_id,
                        "result_message": resched_result.get("message"),
                    },
                )
            except Exception as resched_err:
                logger.exception(
                    "Auto-reschedule failed after out-source delivery",
                    extra={
                        "event": "dynamic_reschedule_failed",
                        "trigger_source": "outsource_delivered",
                        "order_id": order_id,
                        "part_id": operation.part_id,
                        "operation_id": operation_id,
                    },
                )

        return row

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to update out-source status: {str(e)}")


@router.delete("/out-source-operations/{order_id}/{operation_id}/status")
def delete_out_source_status(
    order_id: int,
    operation_id: int,
    db: Session = Depends(get_db),
):
    """Delete the status row for (order, operation). Reverts the op to 'no status'."""
    try:
        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        if not operation:
            raise HTTPException(404, f"Operation {operation_id} not found")

        row = (
            db.query(OutSourceOperationStatus)
            .filter(
                OutSourceOperationStatus.operation_id == operation_id,
                OutSourceOperationStatus.part_id      == operation.part_id,
                OutSourceOperationStatus.order_id     == order_id,
            )
            .first()
        )
        if not row:
            raise HTTPException(
                404,
                f"No status row to delete for order={order_id}, operation={operation_id}",
            )

        db.delete(row)
        db.commit()

        return {
            "message": "Out-source operation status deleted.",
            "order_id": order_id,
            "operation_id": operation_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to delete out-source status: {str(e)}")


@router.get("/inprogress-operations/{machine_id}")
def get_inprogress_operations_by_machine(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all operations that are currently in progress for a specific machine.
    
    Args:
        machine_id: ID of the machine to get in-progress operations for
        
    Returns:
        List of operations with order_id, part_id, operation_id, and status
    """
    try:
        # Check if machine exists
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if not machine:
            raise HTTPException(404, f"Machine with ID {machine_id} not found")

        # Query operations with status 'inprogress' for the specific machine
        inprogress_operations = (
            db.query(OperationStatus, Operation, Part, Machine)
            .join(Operation, Operation.id == OperationStatus.operation_id)
            .join(Part, Part.id == Operation.part_id)
            .join(Machine, Machine.id == Operation.machine_id)
            .filter(
                OperationStatus.status == 'inprogress',
                Operation.machine_id == machine_id
            )
            .all()
        )

        # Build response
        operations_list = []
        for op_status, operation, part, machine in inprogress_operations:
            operation_data = {
                "order_id": op_status.order_id,
                "part_id": operation.part_id,
                "operation_id": operation.id,
                "status": op_status.status,
                "started_at": op_status.started_at,
                "operation_number": operation.operation_number,
                "operation_name": operation.operation_name,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "machine_id": machine.id,
                "machine_name": f"{machine.make} {machine.model}" if machine.make and machine.model else machine.make or "Unknown"
            }
            operations_list.append(operation_data)

        return {
            "machine_id": machine_id,
            "machine_name": f"{machine.make} {machine.model}" if machine.make and machine.model else machine.make or "Unknown",
            "total_inprogress_operations": len(operations_list),
            "operations": operations_list
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get in-progress operations: {str(e)}")


from algorithm import dynamic_reschedule

@router.get("/view-rescheduling/{part_id}")
def view_part_rescheduling_items(part_id: int, db: Session = Depends(get_db)):
    """
    View rescheduling items for a specific part in chronological order.
    Use this to verify that cascading is working correctly after operation completion.
    Only returns the latest schedule_version for each operation to eliminate duplicates.
    """
    try:
        # Subquery to get the latest schedule_version for each operation_id for this part
        latest_versions = (
            db.query(
                Rescheduling.operation_id,
                func.max(Rescheduling.schedule_version).label('max_version')
            )
            .filter(
                Rescheduling.part_id == part_id,
                Rescheduling.status.in_(['scheduled', 'rescheduled'])
            )
            .group_by(Rescheduling.operation_id)
            .subquery()
        )
        
        # Query rescheduling items for this specific part with chronological ordering, only latest versions
        reschedule_items = (
            db.query(Rescheduling, Part)
            .join(Part, Part.id == Rescheduling.part_id)
            .join(
                latest_versions,
                (Rescheduling.operation_id == latest_versions.c.operation_id) &
                (Rescheduling.schedule_version == latest_versions.c.max_version)
            )
            .filter(
                Rescheduling.part_id == part_id,
                Rescheduling.status.in_(['scheduled', 'rescheduled'])
            )
            .order_by(Rescheduling.start_time)
            .all()
        )
        
        result = [
            {
                "id":                 item.id,
                "operation_id":       item.operation_id,
                "operation_number":   item.operation_number,
                "part_id":            item.part_id,
                "part_number":        item.part_number,
                "part_name":          part.part_name,
                "start_time":         item.start_time,
                "end_time":           item.end_time,
                "duration_hours":     round((item.end_time - item.start_time).total_seconds() / 3600, 2),
                "total_quantity":     item.total_qty,
                "completed_quantity": item.completed_qty,
                "remaining_quantity": item.remaining_qty,
                "status":             item.status,
                "schedule_version":   item.schedule_version,
            }
            for item, part in reschedule_items
        ]

        return {
            "message":          f"Rescheduling items for part {part_id} ({len(result)} operations)",
            "part_id":          part_id,
            "total_operations": len(result),
            "chronological_order": result,  # This is the KEY - ordered by start_time
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to view rescheduling items for part {part_id}: {str(e)}")


@router.get("/view-rescheduling")
def view_rescheduling_items(db: Session = Depends(get_db)):
    """
    View rescheduling items (live updated schedule) in correct chronological order.
    This fixes the issue where operations appear out of sequence when ordered by ID.
    Only returns the latest schedule_version for each operation to eliminate duplicates.
    """
    try:
        # Subquery to get the latest schedule_version for each operation_id
        latest_versions = (
            db.query(
                Rescheduling.operation_id,
                func.max(Rescheduling.schedule_version).label('max_version')
            )
            .filter(Rescheduling.status.in_(['scheduled', 'rescheduled']))
            .group_by(Rescheduling.operation_id)
            .subquery()
        )
        
        # Query rescheduling items with correct chronological ordering, only latest versions
        rows = (
            db.query(Rescheduling, Operation, Machine, WorkCenter, OrderPartPriority, Part)
            .join(Operation,  Operation.id  == Rescheduling.operation_id)
            .outerjoin(Machine,    Machine.id    == Rescheduling.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Part,       Part.id       == Rescheduling.part_id)
            .outerjoin(
                OrderPartPriority,
                (OrderPartPriority.order_id == Rescheduling.order_id) &
                (OrderPartPriority.part_id == Rescheduling.part_id)
            )
            .join(
                latest_versions,
                (Rescheduling.operation_id == latest_versions.c.operation_id) &
                (Rescheduling.schedule_version == latest_versions.c.max_version)
            )
            .filter(Rescheduling.status.in_(['scheduled', 'rescheduled']))
            .order_by(Rescheduling.start_time)  # KEY FIX: Order by start_time, not ID
            .all()
        )

        # Group rescheduling items by machine for Gantt chart display
        machines_map: Dict[int, dict] = {}
        OUT_SOURCE_KEY = "out_source"

        for reschedule, op, machine, wc, priority, part in rows:
            if machine is None:
                # Out-Source operation — no machine allocated
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id":       None,
                        "machine_type":     "Out-Source",
                        "machine_make":     None,
                        "machine_model":    None,
                        "work_center_id":   None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id":   reschedule.id,
                    "sale_order_id":      reschedule.order_id,
                    "sale_order_number":  reschedule.order_number,
                    "part_id":            reschedule.part_id,
                    "part_number":        reschedule.part_number,
                    "part_name":          part.part_name,
                    "operation_id":       reschedule.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": reschedule.start_time,
                    "planned_end_time":   reschedule.end_time,
                    "duration_hours":     round(
                        (reschedule.end_time - reschedule.start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     reschedule.total_qty,
                    "remaining_quantity": reschedule.remaining_qty,
                    "status":             reschedule.status,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id":       machine.id,
                        "machine_type":     machine.type,
                        "machine_make":     machine.make,
                        "machine_model":    machine.model,
                        "work_center_id":   wc.id if wc else None,
                        "work_center_name": wc.work_center_name if wc else None,
                        "work_center_code": wc.code              if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id":   reschedule.id,
                    "sale_order_id":      reschedule.order_id,
                    "sale_order_number":  reschedule.order_number,
                    "part_id":            reschedule.part_id,
                    "part_number":        reschedule.part_number,
                    "part_name":          part.part_name,
                    "operation_id":       reschedule.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": reschedule.start_time,
                    "planned_end_time":   reschedule.end_time,
                    "duration_hours":     round(
                        (reschedule.end_time - reschedule.start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     reschedule.total_qty,
                    "remaining_quantity": reschedule.remaining_qty,
                    "status":             reschedule.status,
                })

        return {
            "message":             f"Live rescheduling data for Gantt chart ({len(machines_map)} machines)",
            "schedule_history_id": None,  # Rescheduling doesn't have schedule_history_id
            "schedule_version":    None,  # Rescheduling doesn't have version
            "generated_at":        None,  # Rescheduling is live data
            "is_active":           True,  # Rescheduling is always active
            "total_machines":      len(machines_map),
            "total_tasks":         sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt":               list(machines_map.values()),
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to view rescheduling items: {str(e)}")


@router.post("/dynamic-reschedule")
def run_dynamic_reschedule(
    part_id: Optional[int] = None,   # pass from frontend after log submission
    op_id:   Optional[int] = None,
    db: Session = Depends(get_db)
):
    result = dynamic_reschedule(db, triggered_by_part_id=part_id, triggered_by_op_id=op_id)
    return result
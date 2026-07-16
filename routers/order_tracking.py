"""Order-level production tracking with full production-log detail."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from DB.database import get_db
from DB.models import AccessUser, ProductionLog
from DB.models.configuration import Customer, Machine
from DB.models.oms import Operation, Order, Part, PartType
from DB.models.scheduling import OperationStatus, PartScheduleStatus, Rescheduling
from production_log_helpers import (
    get_operation_work_due,
    production_log_response_dict,
    total_approved_for_operation,
    work_due_dict,
)

router = APIRouter(prefix="/order-tracking", tags=["Order Tracking"])

IN_HOUSE_TYPE_ID = 1


def _format_machine_name(
    make: Optional[str], model: Optional[str]
) -> Optional[str]:
    """Build display name without repeating make when model already includes it."""
    make = (make or "").strip()
    model = (model or "").strip()
    if not make and not model:
        return None
    if not model:
        return make or None
    if not make:
        return model
    make_l, model_l = make.lower(), model.lower()
    if make_l == model_l:
        return model
    if model_l.startswith(make_l):
        return model
    if make_l.endswith(model_l) or model_l in make_l:
        return make
    return f"{make} {model}"


def _serialize_tracking_log(db: Session, log: ProductionLog) -> Dict[str, Any]:
    """Production log row for order-tracking (includes rework + acknowledgement fields)."""
    operator = (
        db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
        if log.operator_id
        else None
    )
    reviewer = (
        db.query(AccessUser).filter(AccessUser.id == log.user_id).first()
        if log.user_id
        else None
    )
    payload = production_log_response_dict(log)
    produced = int(log.produced_quantity or 0)
    rework_submit = int(log.operator_rework_quantity or 0)
    payload["total_presented"] = produced + rework_submit
    payload["operator_name"] = operator.user_name if operator else None
    payload["reviewer_name"] = reviewer.user_name if reviewer else None
    return payload


def _resolve_machine(db: Session, operation: Operation) -> Dict[str, Any]:
    machine_id = operation.machine_id
    if not machine_id:
        row = (
            db.query(Rescheduling)
            .filter(
                Rescheduling.operation_id == operation.id,
                Rescheduling.status.in_(["scheduled", "rescheduled", "completed"]),
            )
            .order_by(Rescheduling.start_time.desc())
            .first()
        )
        if row and row.machine_id:
            machine_id = row.machine_id

    if not machine_id:
        log_with_machine = (
            db.query(ProductionLog)
            .filter(
                ProductionLog.operation_id == operation.id,
                ProductionLog.machine_id.isnot(None),
            )
            .order_by(ProductionLog.id.desc())
            .first()
        )
        if log_with_machine:
            machine_id = log_with_machine.machine_id

    if not machine_id:
        return {
            "machine_id": None,
            "machine_make": None,
            "machine_model": None,
            "machine_name": None,
        }

    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        return {
            "machine_id": machine_id,
            "machine_make": None,
            "machine_model": None,
            "machine_name": None,
        }

    make = machine.make or ""
    model = machine.model or ""
    return {
        "machine_id": machine_id,
        "machine_make": machine.make,
        "machine_model": machine.model,
        "machine_name": _format_machine_name(make, model),
    }


def _operation_timestamps(
    db: Session, operation_id: int, logs: List[ProductionLog]
) -> Dict[str, Optional[datetime]]:
    """Earliest log start and latest log end — not job-card created_at."""
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None
    latest_end_log: Optional[ProductionLog] = None

    for log in logs:
        if log.from_date and log.from_time:
            candidate = datetime.combine(log.from_date, log.from_time)
            if not started_at or candidate < started_at:
                started_at = candidate

        if log.to_date and log.to_time:
            candidate = datetime.combine(log.to_date, log.to_time)
            if not completed_at or candidate > completed_at:
                completed_at = candidate
                latest_end_log = log

    if latest_end_log:
        operator_id = latest_end_log.operator_id

    op_status = (
        db.query(OperationStatus)
        .filter(OperationStatus.operation_id == operation_id)
        .first()
    )
    if op_status:
        if op_status.started_at and (not started_at or op_status.started_at < started_at):
            started_at = op_status.started_at
        if not completed_at and op_status.completed_at:
            completed_at = op_status.completed_at
        if not operator_id and op_status.operator_id:
            operator_id = op_status.operator_id

    if operator_id:
        user = db.query(AccessUser).filter(AccessUser.id == operator_id).first()
        operator_name = user.user_name if user else None

    return {
        "started_at": started_at,
        "completed_at": completed_at,
        "operator_id": operator_id,
        "operator_name": operator_name,
    }


def _operation_display_status(
    total_approved: int, required_quantity: int, has_logs: bool
) -> str:
    if required_quantity > 0 and total_approved >= required_quantity:
        return "Completed"
    if has_logs:
        return "In Progress"
    return "Pending"


def _build_operation_tracking(
    db: Session, operation: Operation, required_quantity: int
) -> Dict[str, Any]:
    logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.operation_id == operation.id)
        .order_by(ProductionLog.id.desc())
        .all()
    )
    total_approved = total_approved_for_operation(db, operation.id)
    work = get_operation_work_due(db, operation.id, required_quantity)
    timestamps = _operation_timestamps(db, operation.id, logs)
    is_completed = total_approved >= required_quantity if required_quantity > 0 else False
    completion_pct = (
        round((total_approved / required_quantity) * 100, 1)
        if required_quantity > 0
        else 0.0
    )

    status = _operation_display_status(
        total_approved, required_quantity, bool(logs)
    )
    if is_completed:
        status = "Completed"

    return {
        "operation_id": operation.id,
        "operation_number": str(operation.operation_number),
        "operation_name": operation.operation_name,
        "status": status,
        "started_at": timestamps["started_at"],
        "completed_at": timestamps["completed_at"] if is_completed else None,
        "operator_id": timestamps["operator_id"],
        "operator_name": timestamps["operator_name"],
        "required_quantity": required_quantity,
        "total_approved": total_approved,
        "completion_percentage": completion_pct,
        "is_completed": is_completed,
        **work_due_dict(work),
        "production_logs": [_serialize_tracking_log(db, log) for log in logs],
        **_resolve_machine(db, operation),
    }


def _part_display_status(
    operations: List[Dict[str, Any]], schedule_status: Optional[str]
) -> str:
    if schedule_status == "completed":
        return "Completed"
    if not operations:
        return "Not Started"
    completed = sum(1 for op in operations if op["is_completed"])
    if completed == len(operations) and len(operations) > 0:
        return "Completed"
    if completed > 0 or any(op["production_logs"] for op in operations):
        return "In Progress"
    return "Not Started"


def _build_part_tracking(
    db: Session, order_id: int, part: Part, part_type: PartType
) -> Dict[str, Any]:
    required_quantity = part.qty or 0
    operations = (
        db.query(Operation)
        .filter(Operation.part_id == part.id)
        .order_by(Operation.operation_number.asc(), Operation.id.asc())
        .all()
    )
    op_payloads = [
        _build_operation_tracking(db, op, required_quantity) for op in operations
    ]

    schedule_row = (
        db.query(PartScheduleStatus)
        .filter(
            PartScheduleStatus.sale_order_id == order_id,
            PartScheduleStatus.part_id == part.id,
        )
        .first()
    )
    schedule_status = schedule_row.status if schedule_row else None

    completed_ops = sum(1 for op in op_payloads if op["is_completed"])
    total_ops = len(op_payloads)
    pending_ops = max(0, total_ops - completed_ops)
    part_completion = (
        round((completed_ops / total_ops) * 100, 1) if total_ops > 0 else 0.0
    )

    return {
        "part_id": part.id,
        "part_name": part.part_name,
        "part_number": part.part_number,
        "part_type_name": part_type.type_name if part_type else None,
        "schedule_status": schedule_status,
        "status": _part_display_status(op_payloads, schedule_status),
        "required_quantity": required_quantity,
        "total_operations": total_ops,
        "completed_operations": completed_ops,
        "pending_operations": pending_ops,
        "completion_percentage": part_completion,
        "operations": op_payloads,
    }


@router.get("/{order_id}")
def get_order_tracking(order_id: int, db: Session = Depends(get_db)):
    """
    Full order production tracking: parts, operations, and production logs
    with rework / approval ledger fields aligned to production_logs API.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    product = order.product
    if not product:
        raise HTTPException(status_code=400, detail="Order has no product")

    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()

    parts = (
        db.query(Part, PartType)
        .join(PartType, PartType.id == Part.type_id)
        .filter(
            Part.product_id == product.id,
            Part.type_id == IN_HOUSE_TYPE_ID,
        )
        .order_by(Part.part_number.asc(), Part.id.asc())
        .all()
    )

    part_rows = [_build_part_tracking(db, order_id, part, pt) for part, pt in parts]

    completed_parts = sum(1 for p in part_rows if p["status"] == "Completed")
    pending_parts = len(part_rows) - completed_parts
    order_completion = (
        round((completed_parts / len(part_rows)) * 100, 1) if part_rows else 0.0
    )

    if completed_parts == len(part_rows) and part_rows:
        order_status = "Completed"
    elif completed_parts > 0 or any(
        p["status"] == "In Progress" for p in part_rows
    ):
        order_status = "In Progress"
    else:
        order_status = "Not Started"

    return {
        "order_id": order.id,
        "sale_order_number": order.sale_order_number,
        "customer_name": customer.company_name if customer else None,
        "product_name": product.product_name,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order_status,
        "total_parts": len(part_rows),
        "completed_parts": completed_parts,
        "pending_parts": pending_parts,
        "completion_percentage": order_completion,
        "parts": part_rows,
    }

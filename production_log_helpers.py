"""Helpers for production log review (supervisor or manufacturing coordinator)."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Query, Session

from DB.models import AccessUser, ProductionLog

REVIEWER_ROLES = ("supervisor", "manufacturing_coordinator")


def validate_production_log_reviewer(db: Session, user_id: Optional[int]) -> AccessUser:
    """Only supervisor or manufacturing_coordinator may review/approve logs."""
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id is required. Must be a supervisor or manufacturing_coordinator.",
        )

    user = db.query(AccessUser).filter(AccessUser.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    if user.role not in REVIEWER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only supervisor or manufacturing_coordinator can review production logs",
        )

    return user


def _reviewer_role_label(role: Optional[str]) -> str:
    if role == "manufacturing_coordinator":
        return "Manufacturing Coordinator"
    if role == "supervisor":
        return "Supervisor"
    return role or "user"


def assert_exclusive_reviewer(
    db: Session, db_log: ProductionLog, user_id: int
) -> None:
    """
    A log may be reviewed by only one user (supervisor OR manufacturing_coordinator).
    Once user_id is set, no other user may take over the review.
    """
    if db_log.user_id is None or db_log.user_id == user_id:
        return

    existing = (
        db.query(AccessUser).filter(AccessUser.id == db_log.user_id).first()
    )
    if existing:
        name = existing.user_name or f"user {existing.id}"
        role_label = _reviewer_role_label(existing.role)
        detail = (
            f"This production log was already reviewed by {role_label} {name}. "
            f"Only one of supervisor or manufacturing_coordinator may approve each log."
        )
    else:
        detail = (
            "This production log was already reviewed by another user. "
            "Only one of supervisor or manufacturing_coordinator may approve each log."
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=detail,
    )


def total_approved_for_operation(db: Session, operation_id: int) -> int:
    """SUM(approved_quantity) across all production logs for an operation."""
    return (
        db.execute(
            text(
                """
                SELECT COALESCE(SUM(approved_quantity), 0)
                FROM scheduling.production_logs
                WHERE operation_id = :op_id AND approved_quantity IS NOT NULL
                """
            ),
            {"op_id": operation_id},
        ).scalar()
        or 0
    )


def remaining_to_close(total_quantity: int, total_approved: int) -> int:
    """Units still required before the operation is fully approved."""
    return max(0, int(total_quantity) - int(total_approved))


def _operation_number_int(operation_number: Any) -> Optional[int]:
    try:
        return int(operation_number)
    except (TypeError, ValueError):
        return None


def is_schedulable_operation(db: Session, operation) -> bool:
    """
    True when the operation belongs to a schedulable work center.
    Non-schedulable WCs (e.g. heat treatment) do not gate shop-floor handoff.
    """
    from DB.models.configuration import WorkCenter

    if operation.workcenter_id is None:
        return False
    wc = (
        db.query(WorkCenter)
        .filter(
            WorkCenter.id == operation.workcenter_id,
            WorkCenter.is_schedulable == True,  # noqa: E712
            WorkCenter.work_center_name != "Default",
        )
        .first()
    )
    return wc is not None


def get_immediate_predecessor_operation(db: Session, operation_id: int):
    """
    Immediate prior *schedulable* operation on the same part (by operation_number).
    Returns None for the first schedulable op or when the operation is missing.
    """
    from DB.models.oms import Operation

    operation = db.query(Operation).filter(Operation.id == operation_id).first()
    if not operation:
        return None

    this_num = _operation_number_int(operation.operation_number)
    if this_num is None:
        return None

    candidates = (
        db.query(Operation)
        .filter(Operation.part_id == operation.part_id)
        .order_by(Operation.operation_number.asc())
        .all()
    )
    predecessor = None
    for prev in candidates:
        prev_num = _operation_number_int(prev.operation_number)
        if prev_num is None or prev_num >= this_num:
            continue
        if not is_schedulable_operation(db, prev):
            continue
        if predecessor is None or prev_num > _operation_number_int(
            predecessor.operation_number
        ):
            predecessor = prev
    return predecessor


def part_has_production_log_history(db: Session, part_id: int) -> bool:
    """True when any operation on the part still has production_logs rows."""
    from DB.models.oms import Operation

    op_ids = [
        row[0]
        for row in db.query(Operation.id).filter(Operation.part_id == part_id).all()
    ]
    if not op_ids:
        return False
    return (
        db.query(ProductionLog)
        .filter(ProductionLog.operation_id.in_(op_ids))
        .count()
        > 0
    )


def revert_completed_parts_if_logs_cleared(db: Session, part_ids: set) -> None:
    """
    When all production_logs for a part are gone, drop stale 'completed'
    markers so the part can be deactivated or reactivated cleanly.

    PartScheduleStatus lifecycle: active -> completed -> inactive
    """
    if not part_ids:
        return

    from DB.models.scheduling import PartScheduleStatus
    from DB.models.oms import Operation, OrderPartPriority

    changed = False
    for part_id in part_ids:
        op_ids = [
            row[0]
            for row in db.query(Operation.id).filter(Operation.part_id == part_id).all()
        ]
        remaining_logs = (
            db.query(ProductionLog)
            .filter(ProductionLog.operation_id.in_(op_ids))
            .count()
            if op_ids
            else 0
        )
        if remaining_logs > 0:
            continue

        for priority_record in (
            db.query(OrderPartPriority)
            .filter(
                OrderPartPriority.part_id == part_id,
                OrderPartPriority.status == "completed",
            )
            .all()
        ):
            priority_record.status = "inactive"
            priority_record.priority = 0
            changed = True

        for pps_record in (
            db.query(PartScheduleStatus)
            .filter(
                PartScheduleStatus.part_id == part_id,
                PartScheduleStatus.status == "completed",
            )
            .all()
        ):
            pps_record.status = "inactive"
            pps_record.updated_at = datetime.now(timezone.utc)
            changed = True

    if changed:
        db.commit()


def get_latest_reviewed_log(
    db: Session, operation_id: int
) -> Optional[ProductionLog]:
    """Most recent log reviewed by supervisor or manufacturing coordinator."""
    return (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.user_id.isnot(None),
        )
        .order_by(ProductionLog.id.desc())
        .first()
    )


def compute_work_due_breakdown(
    total_quantity: int, total_approved: int, latest_reviewed: Optional[ProductionLog]
) -> Dict[str, int]:
    """
    Derive operator / scheduler work buckets from the quantity ledger.

    remaining_to_close = order_qty - approved (single source of truth)
    rework_due / reject_due = from latest reviewer decision (capped to remaining)
    Any balance (never-yet-produced) is implicit: remaining - rework_due - reject_due
    """
    rem = remaining_to_close(total_quantity, total_approved)
    rework_due = 0
    reject_due = 0
    if latest_reviewed and rem > 0:
        rework_due = latest_reviewed.rework_quantity or 0
        reject_due = latest_reviewed.rejected_quantity or 0

    rework_due = min(rework_due, rem)
    reject_due = min(reject_due, rem - rework_due)
    fresh_needed = max(0, rem - rework_due - reject_due)

    return {
        "remaining_to_close": rem,
        "rework_due": rework_due,
        "reject_due": reject_due,
        "fresh_needed": fresh_needed,
    }


def work_limits_from_breakdown(breakdown: Dict[str, int]) -> Dict[str, int]:
    """
    Derive operator submit caps from a work-due breakdown.

    produced_quantity caps at reject replacement + never-manufactured units.
    rework_submit_quantity caps at same-part rework from the latest review.
    """
    remaining = int(breakdown["remaining_to_close"])
    rework_due = int(breakdown["rework_due"])
    reject_due = int(breakdown["reject_due"])
    fresh_needed = int(
        breakdown.get(
            "fresh_needed",
            max(0, remaining - rework_due - reject_due),
        )
    )
    follow_up = rework_due > 0 or reject_due > 0
    max_produced = reject_due + fresh_needed if follow_up else remaining
    return {
        "remaining_to_close": remaining,
        "rework_due": rework_due,
        "reject_due": reject_due,
        "fresh_needed": fresh_needed,
        "max_produced_quantity": max(0, max_produced),
        "max_rework_submit_quantity": max(0, rework_due),
    }


def _pending_operator_quantities(
    db: Session, operation_id: int, exclude_log_id: Optional[int] = None
) -> Dict[str, int]:
    """Units already submitted by operator and awaiting reviewer action."""
    query = db.query(ProductionLog).filter(
        ProductionLog.operation_id == operation_id,
        ProductionLog.operator_status == "completed",
        ProductionLog.user_id.is_(None),
    )
    if exclude_log_id is not None:
        query = query.filter(ProductionLog.id != exclude_log_id)

    pending_produced = 0
    pending_rework = 0
    for log in query.all():
        pending_produced += int(log.produced_quantity or 0)
        pending_rework += int(log.operator_rework_quantity or 0)

    return {
        "pending_produced": pending_produced,
        "pending_rework": pending_rework,
    }


def get_operation_handoff(
    db: Session,
    operation_id: int,
    total_quantity: int,
    exclude_log_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Quantity handoff from the immediate predecessor into this operation.

    available_quantity =
      for first schedulable op: remaining_to_close (part qty − self approved)
      otherwise: max(0, min(
          remaining_to_close,
          upstream_approved − self_approved − pending_on_this_op
      ))

    Unlock rule for the next job card: upstream_approved >= 1.
    """
    self_approved = total_approved_for_operation(db, operation_id)
    rem = remaining_to_close(total_quantity, self_approved)
    pending = _pending_operator_quantities(db, operation_id, exclude_log_id)
    # Only new manufacture awaiting review consumes upstream release.
    # Pending same-part rework does not need additional upstream qty.
    pending_produced = int(pending["pending_produced"])

    predecessor = get_immediate_predecessor_operation(db, operation_id)
    if predecessor is None:
        return {
            "upstream_operation_id": None,
            "upstream_operation_number": None,
            "upstream_approved": None,
            "self_approved": self_approved,
            "pending_on_operation": pending_produced,
            "available_quantity": rem,
            "has_predecessor": False,
            "predecessor_unlocked": True,
        }

    upstream_approved = total_approved_for_operation(db, predecessor.id)
    released = max(0, upstream_approved - self_approved - pending_produced)
    available = min(rem, released)

    return {
        "upstream_operation_id": predecessor.id,
        "upstream_operation_number": str(predecessor.operation_number),
        "upstream_approved": upstream_approved,
        "self_approved": self_approved,
        "pending_on_operation": pending_produced,
        "available_quantity": available,
        "has_predecessor": True,
        "predecessor_unlocked": upstream_approved >= 1,
    }


def prior_operation_blocks_activation(
    db: Session, operation_id: int
) -> Optional[str]:
    """
    Block activate when the immediate schedulable predecessor has not released
    any approved quantity yet (or out-source not delivered), or when the predecessor
    has unreviewed production logs awaiting reviewer action.
    """
    predecessor = get_immediate_predecessor_operation(db, operation_id)
    if predecessor is None:
        return None

    # Out-source predecessor: must be delivered.
    if getattr(predecessor, "part_type_id", None) == 2:
        from DB.models.oms import OutSourceOperationStatus, Operation

        op = db.query(Operation).filter(Operation.id == operation_id).first()
        os_row = None
        if op:
            os_row = (
                db.query(OutSourceOperationStatus)
                .filter(
                    OutSourceOperationStatus.operation_id == predecessor.id,
                    OutSourceOperationStatus.part_id == op.part_id,
                )
                .first()
            )
        if not os_row or os_row.status != "delivered":
            return (
                f"Cannot activate — prior out-source operation "
                f"{predecessor.operation_number} ({predecessor.operation_name}) "
                f"has not been delivered yet."
            )
        return None

    # Check if predecessor has unreviewed production logs
    if operation_has_unreviewed_production_log(db, predecessor.id):
        return (
            f"Cannot activate — prior operation {predecessor.operation_number} "
            f"({predecessor.operation_name}) has production logs awaiting review "
            f"by a supervisor or manufacturing_coordinator. Please wait until the reviewer "
            f"has reviewed and updated the production log."
        )

    upstream_approved = total_approved_for_operation(db, predecessor.id)
    if upstream_approved < 1:
        return (
            f"Cannot activate — prior operation {predecessor.operation_number} "
            f"({predecessor.operation_name}) has no approved quantity yet. "
            f"At least 1 unit must be approved on the previous operation."
        )
    return None


def adjust_work_due_for_pending_submissions(
    breakdown: Dict[str, int], pending_produced: int, pending_rework: int
) -> Dict[str, int]:
    """
    Reduce open rework/reject/fresh buckets when follow-up quantities are
    already on logs awaiting review (prevents double-counting in job-card UI).
    """
    if pending_produced <= 0 and pending_rework <= 0:
        return dict(breakdown)

    remaining = int(breakdown["remaining_to_close"])
    rework_due = max(0, int(breakdown["rework_due"]) - int(pending_rework))
    reject_due = max(0, int(breakdown["reject_due"]) - int(pending_produced))
    pending_after_reject = max(0, int(pending_produced) - int(breakdown["reject_due"]))
    fresh_needed = max(
        0,
        int(
            breakdown.get(
                "fresh_needed",
                max(0, remaining - int(breakdown["rework_due"]) - int(breakdown["reject_due"])),
            )
        )
        - pending_after_reject,
    )

    adjusted = {
        "remaining_to_close": remaining,
        "rework_due": rework_due,
        "reject_due": reject_due,
        "fresh_needed": fresh_needed,
    }
    if "total_approved" in breakdown:
        adjusted["total_approved"] = breakdown["total_approved"]
    return adjusted


def infer_submission_type(work: Dict[str, int]) -> str:
    """Deprecated — kept for tests; use separate produced vs rework_submit fields."""
    rework_due = work["rework_due"]
    reject_due = work["reject_due"]
    if rework_due > 0 and reject_due > 0:
        return "follow_up"
    if rework_due > 0:
        return "rework"
    if reject_due > 0:
        return "replacement"
    return "production"


def total_presented_on_log(produced_quantity: int, operator_rework_quantity: int) -> int:
    """Units the operator sent for review on one log."""
    return int(produced_quantity or 0) + int(operator_rework_quantity or 0)


def operation_has_unreviewed_production_log(db: Session, operation_id: int) -> bool:
    """
    True when operator submitted a log (or one is still in progress) and a
    reviewer (supervisor / manufacturing_coordinator) has not updated log status yet.
    """
    count = (
        db.execute(
            text(
                """
                SELECT COUNT(*) FROM scheduling.production_logs
                WHERE operation_id = :op_id AND (
                    operator_status = 'inprogress'
                    OR (operator_status = 'completed' AND status = 'pending')
                )
                """
            ),
            {"op_id": operation_id},
        ).scalar()
        or 0
    )
    return count > 0


def machine_has_unreviewed_production_log(db: Session, machine_id: int) -> bool:
    """
    True when any operation on the machine has a production log awaiting reviewer action.
    Used to block all job cards on a machine when any one has unreviewed logs.
    """
    count = (
        db.execute(
            text(
                """
                SELECT COUNT(*) FROM scheduling.production_logs
                WHERE machine_id = :machine_id AND (
                    operator_status = 'inprogress'
                    OR (operator_status = 'completed' AND status = 'pending')
                )
                """
            ),
            {"machine_id": machine_id},
        ).scalar()
        or 0
    )
    return count > 0


def pending_reviewer_log_block_message(
    action: str = "activate job card or submit production log",
) -> str:
    """Shared operator-facing message when a log awaits reviewer action."""
    return (
        f"Cannot {action} because log status is yet to be updated by a reviewer "
        f"(supervisor or manufacturing_coordinator). Please wait until the reviewer "
        f"has reviewed and updated the production log."
    )


def get_machine_pending_reviewer_log_block_reason(
    db: Session, machine_id: int, action: str = "activate job card"
) -> Optional[str]:
    """Block reason when any operation on the machine has an unreviewed production log, else None."""
    if machine_has_unreviewed_production_log(db, machine_id):
        return (
            f"Cannot {action}. Previous job card log status is yet to be updated by reviewer "
            f"(supervisor or manufacturing_coordinator). Please wait until the reviewer "
            f"has reviewed and updated the production log."
        )
    return None


def get_pending_reviewer_log_block_reason(
    db: Session, operation_id: int, action: str = "activate job card or submit production log"
) -> Optional[str]:
    """Block reason when an unreviewed production log exists, else None."""
    if operation_has_unreviewed_production_log(db, operation_id):
        return pending_reviewer_log_block_message(action)
    return None


def validate_operator_submit(
    work: Dict[str, int],
    produced_quantity: int,
    rework_submit_quantity: int,
) -> None:
    """
    Operator submit rules (all scenarios):

      produced_quantity        → new manufacture only (first run, reject replacement,
                                 or units never manufactured yet)
      rework_submit_quantity   → same parts reworked (NOT new order production)

    Valid examples after review (remaining=5, rework=3, reject=2):
      produced=2 + rework=3 | produced=2 only | rework=3 only | produced=1 + rework=2
    """
    limits = work_limits_from_breakdown(work)
    produced = int(produced_quantity or 0)
    rework = int(rework_submit_quantity or 0)
    remaining = limits["remaining_to_close"]
    rework_due = limits["rework_due"]
    reject_due = limits["reject_due"]
    fresh_needed = limits["fresh_needed"]
    max_produced = limits["max_produced_quantity"]
    max_rework = limits["max_rework_submit_quantity"]

    if produced + rework <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Submit at least one unit: produced_quantity (new manufacture) and/or "
                "rework_submit_quantity (same parts reworked)."
            ),
        )

    if rework > 0 and max_rework == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "rework_submit_quantity is only allowed when reviewer marked rework "
                "on a prior log."
            ),
        )

    if rework > max_rework:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Rework submit allows at most {max_rework} unit(s) — "
                f"these are the same parts to fix, not new production. Got {rework}."
            ),
        )

    if produced > max_produced:
        if max_rework > 0 and max_produced == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"All {remaining} remaining unit(s) require rework on the same parts. "
                    f"Use rework_submit_quantity (up to {max_rework}), not produced_quantity."
                ),
            )
        if max_rework > 0:
            parts = []
            if reject_due:
                parts.append(f"{reject_due} reject replacement")
            if fresh_needed:
                parts.append(f"{fresh_needed} not yet manufactured")
            allowance = ", ".join(parts) if parts else "0 new manufacture"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Produced quantity allows at most {max_produced} new unit(s) ({allowance}). "
                    f"{max_rework} unit(s) must use rework_submit_quantity. Got {produced}."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Produced quantity allows at most {max_produced} new unit(s) "
                f"({reject_due} reject replacement"
                f"{f', {fresh_needed} not yet manufactured' if fresh_needed else ''}"
                f"{', first run' if not reject_due and not fresh_needed and remaining == max_produced else ''}"
                f"). Got {produced}."
            ),
        )

    if produced + rework > remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot present {produced + rework} unit(s) for review. "
                f"Only {remaining} unit(s) remain to close this operation "
                f"(order progress is approved quantity only)."
            ),
        )

    # Partial-flow handoff: new manufacture cannot exceed qty released by prior op.
    available = work.get("available_quantity")
    if available is not None and produced > int(available):
        upstream_op = work.get("upstream_operation_number")
        upstream_approved = work.get("upstream_approved")
        detail = (
            f"Produced quantity allows at most {int(available)} unit(s) released "
            f"from the previous operation"
        )
        if upstream_op is not None and upstream_approved is not None:
            detail += (
                f" (Op {upstream_op} approved={upstream_approved}). "
                f"Got {produced}."
            )
        else:
            detail += f". Got {produced}."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )


def get_operation_work_due(
    db: Session,
    operation_id: int,
    total_quantity: int,
    exclude_log_id: Optional[int] = None,
    adjust_for_pending: bool = True,
) -> Dict[str, int]:
    """Full work-due snapshot for an operation (job card + scheduler)."""
    approved = total_approved_for_operation(db, operation_id)
    latest = get_latest_reviewed_log(db, operation_id)
    breakdown = compute_work_due_breakdown(total_quantity, approved, latest)
    breakdown["total_approved"] = approved

    if adjust_for_pending:
        pending = _pending_operator_quantities(db, operation_id, exclude_log_id)
        breakdown = adjust_work_due_for_pending_submissions(
            breakdown,
            pending["pending_produced"],
            pending["pending_rework"],
        )

    limits = work_limits_from_breakdown(breakdown)
    handoff = get_operation_handoff(
        db, operation_id, total_quantity, exclude_log_id=exclude_log_id
    )
    available = int(handoff["available_quantity"])
    limits["available_quantity"] = available
    limits["upstream_operation_id"] = handoff["upstream_operation_id"]
    limits["upstream_operation_number"] = handoff["upstream_operation_number"]
    limits["upstream_approved"] = handoff["upstream_approved"]
    limits["has_predecessor"] = handoff["has_predecessor"]
    limits["predecessor_unlocked"] = handoff["predecessor_unlocked"]
    # New manufacture cannot exceed released upstream qty.
    limits["max_produced_quantity"] = min(
        int(limits["max_produced_quantity"]), available
    )
    return limits


def work_due_dict(breakdown: Dict[str, Any]) -> Dict[str, Any]:
    """Stable keys for API responses (accepts get_operation_work_due output)."""
    if "max_produced_quantity" in breakdown:
        limits = breakdown
    else:
        limits = work_limits_from_breakdown(breakdown)
    payload: Dict[str, Any] = {
        "remaining_to_close": limits["remaining_to_close"],
        "rework_due": limits["rework_due"],
        "reject_due": limits["reject_due"],
        "fresh_needed": limits["fresh_needed"],
        "max_produced_quantity": limits["max_produced_quantity"],
        "max_rework_submit_quantity": limits["max_rework_submit_quantity"],
    }
    for key in (
        "available_quantity",
        "upstream_operation_id",
        "upstream_operation_number",
        "upstream_approved",
    ):
        if key in limits:
            payload[key] = limits[key]
    return payload


def get_operator_activation_block_reason(
    db: Session, operation_id: int, total_quantity: int
) -> Optional[str]:
    """
    Return a human-readable reason when the operator cannot start a new run,
    or None when activation is allowed from a production-log perspective.

    Blocks only while a log awaits reviewer action or production is fully approved.
    Operator acknowledgement of reviewer feedback is optional and does not gate activation.
    """
    prior_block = prior_operation_blocks_activation(db, operation_id)
    if prior_block:
        return prior_block

    pending_review = get_pending_reviewer_log_block_reason(
        db, operation_id, action="activate job card"
    )
    if pending_review:
        return pending_review

    work = get_operation_work_due(db, operation_id, total_quantity)
    if work["remaining_to_close"] <= 0:
        return (
            "Cannot activate job card. Operation production is fully approved — "
            "no remaining quantity to produce."
        )

    if work.get("has_predecessor") and int(work.get("available_quantity") or 0) <= 0:
        upstream_op = work.get("upstream_operation_number") or "?"
        upstream_approved = work.get("upstream_approved") or 0
        return (
            f"Cannot activate job card. No quantity is currently released from "
            f"prior operation {upstream_op} "
            f"(approved there: {upstream_approved}). "
            f"Wait for more approvals on the previous operation."
        )

    return None


def production_log_response_dict(
    db_log: ProductionLog,
    work_due: Optional[Dict[str, int]] = None,
) -> dict:
    locked = db_log.user_id is not None
    payload = {
        "id": db_log.id,
        "operation_id": db_log.operation_id,
        "operator_id": db_log.operator_id,
        "user_id": db_log.user_id,
        "machine_id": db_log.machine_id,
        "notes": db_log.notes,
        "remarks": db_log.remarks,
        "from_date": db_log.from_date,
        "from_time": db_log.from_time,
        "to_date": db_log.to_date,
        "to_time": db_log.to_time,
        "status": db_log.status,
        "operator_status": db_log.operator_status,
        "produced_quantity": db_log.produced_quantity,
        "operator_rework_quantity": db_log.operator_rework_quantity,
        "approved_quantity": db_log.approved_quantity,
        "rework_quantity": db_log.rework_quantity,
        "rejected_quantity": db_log.rejected_quantity,
        "remaining_quantity_to_be_produced": db_log.remaining_quantity_to_be_produced,
        "created_at": db_log.created_at,
        "acknowledged": db_log.acknowledged,
        "acknowledged_at": db_log.acknowledged_at,
        "operator_acknowledged": db_log.operator_acknowledged,
        "operator_acknowledged_at": db_log.operator_acknowledged_at,
        # True once any valid reviewer approved — status update must stay disabled
        "review_locked": locked,
        "can_review": not locked,
    }
    if work_due is not None:
        payload.update(work_due_dict(work_due))
    return payload


def production_log_response_for_operation(
    db: Session,
    db_log: ProductionLog,
    total_quantity: Optional[int] = None,
) -> dict:
    """Build API payload including live work-due breakdown for the operation."""
    if total_quantity is None:
        from DB.models.oms import Operation, Part

        operation = (
            db.query(Operation).filter(Operation.id == db_log.operation_id).first()
        )
        part = (
            db.query(Part).filter(Part.id == operation.part_id).first()
            if operation
            else None
        )
        total_quantity = (part.qty or 0) if part else 0

    work = get_operation_work_due(db, db_log.operation_id, total_quantity)
    return production_log_response_dict(db_log, work_due=work)


def build_cross_review_alert_message(
    *,
    reviewer_name: str,
    reviewer_role: str,
    operator_name: str,
    part_number: Optional[str] = None,
    operation_number: Optional[str] = None,
) -> str:
    role_label = _reviewer_role_label(reviewer_role)
    op_bits = []
    if part_number:
        op_bits.append(f"part {part_number}")
    if operation_number:
        op_bits.append(f"op {operation_number}")
    detail = f" ({', '.join(op_bits)})" if op_bits else ""
    return (
        f"{role_label} {reviewer_name} approved a production log "
        f"sent by operator {operator_name}{detail}."
    )


def reviewer_user_dict(user: AccessUser) -> dict:
    return {
        "id": user.id,
        "user_name": user.user_name,
        "gmail": user.gmail,
        "role": user.role,
    }


def get_order_ids_for_manufacturing_coordinator(
    db: Session, manufacturing_coordinator_id: int
) -> List[int]:
    """Sale order IDs where this user is the assigned manufacturing coordinator."""
    from DB.models.oms import Order

    rows = (
        db.query(Order.id)
        .filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)
        .all()
    )
    return [row[0] for row in rows]


def get_operation_ids_for_orders(db: Session, order_ids: List[int]) -> List[int]:
    """Operation IDs linked to parts on the given sale orders."""
    if not order_ids:
        return []

    from DB.models.oms import Operation, OrderPartPriority
    from DB.models.scheduling import PartScheduleStatus

    via_priority = (
        db.query(Operation.id)
        .join(OrderPartPriority, OrderPartPriority.part_id == Operation.part_id)
        .filter(OrderPartPriority.order_id.in_(order_ids))
    )
    via_schedule = (
        db.query(Operation.id)
        .join(PartScheduleStatus, PartScheduleStatus.part_id == Operation.part_id)
        .filter(PartScheduleStatus.sale_order_id.in_(order_ids))
    )
    rows = via_priority.union(via_schedule).all()
    return [row[0] for row in rows]


def apply_manufacturing_coordinator_scope(
    query: Query, db: Session, manufacturing_coordinator_id: int
) -> Query:
    """
    Restrict a production_logs query to orders assigned to this MC.
    One order has one manufacturing coordinator; MCs must not see other orders' logs.
    """
    user = db.query(AccessUser).filter(AccessUser.id == manufacturing_coordinator_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {manufacturing_coordinator_id} not found",
        )
    if user.role != "manufacturing_coordinator":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="manufacturing_coordinator_id must be a manufacturing_coordinator user",
        )

    order_ids = get_order_ids_for_manufacturing_coordinator(db, manufacturing_coordinator_id)
    if not order_ids:
        return query.filter(ProductionLog.id == -1)

    operation_ids = get_operation_ids_for_orders(db, order_ids)
    if not operation_ids:
        return query.filter(ProductionLog.id == -1)

    return query.filter(ProductionLog.operation_id.in_(operation_ids))


def resolve_order_for_operation_part(db: Session, operation, order_ids: Optional[List[int]] = None):
    """
    Resolve the sale order for an operation's part.
    Prefer order_part_priorities / part_schedule_status over product.orders[0].
    """
    from DB.models.oms import Order, OrderPartPriority
    from DB.models.scheduling import PartScheduleStatus

    if not operation or not getattr(operation, "part_id", None):
        return None

    part_id = operation.part_id
    base_opp = db.query(OrderPartPriority).filter(OrderPartPriority.part_id == part_id)
    if order_ids:
        base_opp = base_opp.filter(OrderPartPriority.order_id.in_(order_ids))
    opp = base_opp.order_by(OrderPartPriority.order_id.desc()).first()
    if opp:
        return db.query(Order).filter(Order.id == opp.order_id).first()

    base_pss = db.query(PartScheduleStatus).filter(PartScheduleStatus.part_id == part_id)
    if order_ids:
        base_pss = base_pss.filter(PartScheduleStatus.sale_order_id.in_(order_ids))
    pss = base_pss.order_by(PartScheduleStatus.sale_order_id.desc()).first()
    if pss:
        return db.query(Order).filter(Order.id == pss.sale_order_id).first()

    if getattr(operation, "part", None) and operation.part.product:
        orders = operation.part.product.orders or []
        if order_ids:
            orders = [o for o in orders if o.id in order_ids]
        return orders[0] if orders else None
    return None

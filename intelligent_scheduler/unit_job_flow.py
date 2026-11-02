"""
Unit-wise job card flow on top of production_logs.

The card (machine + operation + unit range) comes from unit_schedule_items.
Quantities, review, and handoff are stored only on production_logs.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from DB.models.configuration import Machine
from DB.models.scheduling import (
    PartOperationQtyMachineAllocation,
    ProductionLog,
    UnitScheduleItem,
)
from intelligent_scheduler.unit_band import (
    approved_unit_indexes,
    group_schedule_bands,
    released_in_range,
)
from production_log_helpers import (
    adjust_work_due_for_pending_submissions,
    assert_exclusive_reviewer,
    close_fully_approved_operation_logs,
    compute_work_due_breakdown,
    get_immediate_predecessor_operation,
    mark_part_completed_if_all_operations_approved,
    total_approved_for_operation,
    total_presented_on_log,
    validate_operator_submit,
    validate_production_log_reviewer,
    work_limits_from_breakdown,
)
from time_utils import now_ist


def _http(status_code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


def predecessor_bands(
    db: Session, part_id: int, order_id: int, operation_id: int
) -> List[dict]:
    """
    Full unit bands for handoff.

    Manual allocations keep units 1–2 after a rebuild drops finished units
    from unit_schedule_items. Without allocations, use the current schedule.
    """
    allocations = (
        db.query(PartOperationQtyMachineAllocation)
        .filter(
            PartOperationQtyMachineAllocation.part_id == part_id,
            PartOperationQtyMachineAllocation.order_id == order_id,
            PartOperationQtyMachineAllocation.operation_id == operation_id,
        )
        .all()
    )
    if allocations:
        return [
            {
                "machine_id": row.machine_id,
                "unit_from": row.unit_from,
                "unit_to": row.unit_to,
            }
            for row in allocations
        ]
    return group_schedule_bands(
        latest_schedule_rows(db, part_id, order_id, operation_id)
    )


def latest_schedule_rows(
    db: Session, part_id: int, order_id: int, operation_id: Optional[int] = None
) -> List[UnitScheduleItem]:
    version = (
        db.query(func.max(UnitScheduleItem.schedule_version))
        .filter(
            UnitScheduleItem.part_id == part_id,
            UnitScheduleItem.order_id == order_id,
        )
        .scalar()
    )
    if version is None:
        return []
    query = db.query(UnitScheduleItem).filter(
        UnitScheduleItem.part_id == part_id,
        UnitScheduleItem.order_id == order_id,
        UnitScheduleItem.schedule_version == version,
    )
    if operation_id is not None:
        query = query.filter(UnitScheduleItem.operation_id == operation_id)
    return query.all()


def machine_log_totals(
    db: Session, operation_id: int, machine_id: int, exclude_log_id: Optional[int] = None
) -> Dict[str, int]:
    query = db.query(ProductionLog).filter(
        ProductionLog.operation_id == operation_id,
        ProductionLog.machine_id == machine_id,
    )
    if exclude_log_id is not None:
        query = query.filter(ProductionLog.id != exclude_log_id)
    approved = produced_pending = rework_pending = 0
    for log in query.all():
        approved += int(log.approved_quantity or 0)
        if log.user_id is None and log.operator_status == "completed":
            produced_pending += int(log.produced_quantity or 0)
            rework_pending += int(log.operator_rework_quantity or 0)
    return {
        "approved": approved,
        "pending_produced": produced_pending,
        "pending_rework": rework_pending,
    }


def latest_reviewed_on_machine(
    db: Session, operation_id: int, machine_id: int
) -> Optional[ProductionLog]:
    return (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.machine_id == machine_id,
            ProductionLog.user_id.isnot(None),
        )
        .order_by(ProductionLog.id.desc())
        .first()
    )


def _units_covered_by_count(approved: int) -> set:
    """Batch approvals have no unit identity — they fill units 1..N."""
    qty = max(0, int(approved or 0))
    return set(range(1, qty + 1))


def upstream_release_for_card(db: Session, card: Dict[str, Any]) -> Dict[str, Any]:
    """How many units in this card's range the previous operation has approved."""
    predecessor = get_immediate_predecessor_operation(db, int(card["operation_id"]))
    card_qty = int(card["quantity"])
    if predecessor is None:
        return {
            "has_predecessor": False,
            "upstream_operation_id": None,
            "upstream_operation_number": None,
            "upstream_approved": None,
            "released_for_card": card_qty,
        }

    total_approved = int(total_approved_for_operation(db, predecessor.id) or 0)
    bands = predecessor_bands(
        db, int(card["part_id"]), int(card["order_id"]), predecessor.id
    )
    approved_by_machine = {
        int(band["machine_id"]): machine_log_totals(db, predecessor.id, int(band["machine_id"]))[
            "approved"
        ]
        for band in bands
        if band.get("machine_id") is not None
    }
    # Rebuild drops fully approved ops from unit_schedule_items. Batch logs
    # also sit on a machine that is not in those leftover bands. Either way
    # the prior op's approved qty still releases units 1..N.
    if not bands or sum(approved_by_machine.values()) < 1:
        covered = _units_covered_by_count(total_approved)
    else:
        covered = approved_unit_indexes(bands, approved_by_machine)
    released = released_in_range(covered, int(card["unit_from"]), int(card["unit_to"]))
    return {
        "has_predecessor": True,
        "upstream_operation_id": predecessor.id,
        "upstream_operation_number": str(predecessor.operation_number),
        "upstream_approved": total_approved,
        "released_for_card": released,
    }


def _log_matches_card(log, card: Dict[str, Any]) -> Optional[bool]:
    from scheduling_modes import unit_range_from_log

    unit_range = unit_range_from_log(log)
    if unit_range is None:
        return None
    return (
        int(unit_range[0]) == int(card["unit_from"])
        and int(unit_range[1]) == int(card["unit_to"])
    )


def _logs_for_machine_operation(
    db: Session, operation_id: int, machine_id: int, exclude_log_id: Optional[int] = None
) -> List[ProductionLog]:
    query = db.query(ProductionLog).filter(
        ProductionLog.operation_id == int(operation_id),
        ProductionLog.machine_id == int(machine_id),
    )
    if exclude_log_id is not None:
        query = query.filter(ProductionLog.id != exclude_log_id)
    return query.all()


def approved_inside_card(
    db: Session, card: Dict[str, Any], exclude_log_id: Optional[int] = None
) -> int:
    """Approved units that fall inside this card. Earlier units on the same machine do not count."""
    logs = _logs_for_machine_operation(
        db, int(card["operation_id"]), int(card["machine_id"]), exclude_log_id
    )
    tagged = [log for log in logs if _log_matches_card(log, card) is not None]
    if tagged:
        return sum(
            int(log.approved_quantity or 0)
            for log in tagged
            if _log_matches_card(log, card)
        )
    bands = predecessor_bands(
        db, int(card["part_id"]), int(card["order_id"]), int(card["operation_id"])
    )
    approved = machine_log_totals(
        db, int(card["operation_id"]), int(card["machine_id"]), exclude_log_id
    )["approved"]
    covered = approved_unit_indexes(bands, {int(card["machine_id"]): approved})
    return released_in_range(covered, int(card["unit_from"]), int(card["unit_to"]))


def work_due_for_card(
    db: Session,
    card: Dict[str, Any],
    *,
    exclude_log_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Operator limits for this machine band, including the upstream unit handoff."""
    operation_id = int(card["operation_id"])
    machine_id = int(card["machine_id"])
    card_qty = int(card["quantity"])
    logs = _logs_for_machine_operation(db, operation_id, machine_id, exclude_log_id)
    tagged = [log for log in logs if _log_matches_card(log, card) is not None]
    if tagged:
        card_logs = [log for log in tagged if _log_matches_card(log, card)]
        totals = {"approved": 0, "pending_produced": 0, "pending_rework": 0}
        for log in card_logs:
            totals["approved"] += int(log.approved_quantity or 0)
            if log.user_id is None and log.operator_status == "completed":
                totals["pending_produced"] += int(log.produced_quantity or 0)
                totals["pending_rework"] += int(log.operator_rework_quantity or 0)
        approved_here = totals["approved"]
        latest = next(
            (
                log
                for log in sorted(
                    card_logs, key=lambda row: int(getattr(row, "id", 0) or 0), reverse=True
                )
                if log.user_id is not None
            ),
            None,
        )
    else:
        totals = machine_log_totals(db, operation_id, machine_id, exclude_log_id)
        approved_here = approved_inside_card(db, card, exclude_log_id)
        latest = latest_reviewed_on_machine(db, operation_id, machine_id)
    breakdown = compute_work_due_breakdown(card_qty, approved_here, latest)
    breakdown = adjust_work_due_for_pending_submissions(
        breakdown, totals["pending_produced"], totals["pending_rework"]
    )
    limits = work_limits_from_breakdown(breakdown)
    upstream = upstream_release_for_card(db, card)
    released = int(upstream["released_for_card"])
    available = max(
        0,
        min(
            int(limits["remaining_to_close"]),
            released - approved_here - totals["pending_produced"],
        ),
    )
    limits["max_produced_quantity"] = min(int(limits["max_produced_quantity"]), available)
    limits.update(upstream)
    limits["available_quantity"] = available
    limits["card_quantity"] = card_qty
    limits["approved_on_card"] = approved_here
    limits["assignment_mode"] = card.get("assignment_mode")
    return limits


def activation_block_for_card(db: Session, card: Dict[str, Any]) -> Optional[str]:
    due = work_due_for_card(db, card)
    if int(due["approved_on_card"]) >= int(due["card_quantity"]):
        return (
            f"This job card is already complete "
            f"({due['card_quantity']} unit(s) already approved on this card)."
        )
    if due["has_predecessor"] and int(due["released_for_card"]) < 1:
        return (
            f"Cannot activate units {card['unit_from']}-{card['unit_to']}. "
            f"Prior operation {due['upstream_operation_number']} has not approved "
            f"any of those units yet."
        )
    if not card.get("can_activate"):
        return card.get("blocked_reason") or "Job card cannot be activated"
    if due["has_predecessor"] and int(due["available_quantity"]) < 1 and int(due["rework_due"]) < 1:
        return (
            f"Cannot activate units {card['unit_from']}-{card['unit_to']}. "
            f"Only {due['released_for_card']} unit(s) are released from operation "
            f"{due['upstream_operation_number']}, and this card has already used them."
        )
    return None


def log_payload(log: ProductionLog, card: Dict[str, Any], due: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": log.id,
        "order_id": card["order_id"],
        "order_number": card["order_number"],
        "part_id": card["part_id"],
        "part_number": card["part_number"],
        "operation_id": log.operation_id,
        "operation_number": card.get("operation_number"),
        "machine_id": log.machine_id,
        "operator_id": log.operator_id,
        "assignment_mode": card.get("assignment_mode"),
        "unit_from": card["unit_from"],
        "unit_to": card["unit_to"],
        "card_quantity": card["quantity"],
        "produced_quantity": log.produced_quantity,
        "operator_rework_quantity": log.operator_rework_quantity,
        "approved_quantity": log.approved_quantity,
        "rework_quantity": log.rework_quantity,
        "rejected_quantity": log.rejected_quantity,
        "status": log.status,
        "operator_status": log.operator_status,
        "remaining_to_close": due.get("remaining_to_close"),
        "available_quantity": due.get("available_quantity"),
        "max_produced_quantity": due.get("max_produced_quantity"),
        "max_rework_submit_quantity": due.get("max_rework_submit_quantity"),
        "released_for_card": due.get("released_for_card"),
        "upstream_operation_id": due.get("upstream_operation_id"),
        "upstream_operation_number": due.get("upstream_operation_number"),
        "upstream_approved": due.get("upstream_approved"),
        "notes": log.notes,
        "remarks": log.remarks,
    }


def find_card(db: Session, machine_id: int, operation_id: int, unit_from: int, unit_to: int) -> Dict[str, Any]:
    from intelligent_scheduler.job_cards import list_machine_job_cards

    listed = list_machine_job_cards(db, machine_id)
    if not listed.get("machine_found"):
        raise _http(404, f"Machine with ID {machine_id} not found")
    card = next(
        (
            job
            for job in listed.get("jobs") or []
            if int(job["operation_id"]) == int(operation_id)
            and int(job["unit_from"]) == int(unit_from)
            and int(job["unit_to"]) == int(unit_to)
        ),
        None,
    )
    if card is None:
        bands = [
            f"{job['unit_from']}-{job['unit_to']}"
            for job in listed.get("jobs") or []
            if int(job["operation_id"]) == int(operation_id)
        ]
        if bands:
            detail = (
                f"unit_from and unit_to must match a full job card. "
                f"Machine {machine_id} operation {operation_id} has units {', '.join(bands)}."
            )
        else:
            detail = f"No job card on machine {machine_id} for operation {operation_id}."
        raise _http(400, detail)
    return card


def card_for_log(db: Session, log: ProductionLog) -> Dict[str, Any]:
    if log.machine_id is None:
        raise _http(400, f"Production log {log.id} has no machine, so it is not a unit-wise card")
    from scheduling_modes import unit_range_from_log

    unit_range = unit_range_from_log(log)
    if unit_range is not None:
        return find_card(
            db,
            int(log.machine_id),
            int(log.operation_id),
            unit_range[0],
            unit_range[1],
        )

    from intelligent_scheduler.job_cards import list_machine_job_cards

    listed = list_machine_job_cards(db, int(log.machine_id))
    matches = [
        job
        for job in listed.get("jobs") or []
        if int(job["operation_id"]) == int(log.operation_id)
    ]
    if not matches:
        raise _http(
            404,
            f"Production log {log.id} is not on a current unit-wise job card "
            f"for machine {log.machine_id}",
        )
    if len(matches) > 1:
        raise _http(
            400,
            f"Machine {log.machine_id} has more than one current card for operation {log.operation_id}",
        )
    return matches[0]


def status_summary_for_card(
    db: Session, machine_id: int, operation_id: int, unit_from: int, unit_to: int
) -> Dict[str, Any]:
    card = find_card(db, machine_id, operation_id, unit_from, unit_to)
    due = work_due_for_card(db, card)
    active = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.machine_id == machine_id,
            ProductionLog.operator_status == "inprogress",
        )
        .order_by(ProductionLog.id.desc())
        .first()
    )
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    return {
        "machine_id": machine_id,
        "machine": f"{machine.make} {machine.model}".strip() if machine else None,
        "operation_id": operation_id,
        "operation_number": card.get("operation_number"),
        "operation_name": card.get("operation_name"),
        "order_id": card["order_id"],
        "part_id": card["part_id"],
        "assignment_mode": card.get("assignment_mode"),
        "unit_from": unit_from,
        "unit_to": unit_to,
        "card_quantity": card["quantity"],
        "approved_on_card": due["approved_on_card"],
        "remaining_to_close": due["remaining_to_close"],
        "available_quantity": due["available_quantity"],
        "max_produced_quantity": due["max_produced_quantity"],
        "max_rework_submit_quantity": due["max_rework_submit_quantity"],
        "rework_due": due["rework_due"],
        "reject_due": due["reject_due"],
        "released_for_card": due["released_for_card"],
        "has_predecessor": due["has_predecessor"],
        "upstream_operation_id": due["upstream_operation_id"],
        "upstream_operation_number": due["upstream_operation_number"],
        "upstream_approved": due["upstream_approved"],
        "active_log_id": active.id if active else None,
        "can_activate": (block := activation_block_for_card(db, card)) is None,
        "blocked_reason": block,
    }


def submit_unit_job(
    db: Session,
    machine_id: int,
    *,
    operation_id: int,
    unit_from: int,
    unit_to: int,
    produced_quantity: int,
    rework_submit_quantity: int,
    notes: Optional[str],
) -> Dict[str, Any]:
    card = find_card(db, machine_id, operation_id, unit_from, unit_to)
    log = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.machine_id == machine_id,
            ProductionLog.operator_status == "inprogress",
        )
        .order_by(ProductionLog.id.desc())
        .first()
    )
    if log is None:
        raise _http(
            404,
            f"No in-progress job on machine {machine_id} for operation {operation_id}. "
            "Activate the job card first.",
        )
    due = work_due_for_card(db, card, exclude_log_id=log.id)
    validate_operator_submit(due, produced_quantity, rework_submit_quantity)
    if produced_quantity > int(due["available_quantity"]):
        if due["has_predecessor"]:
            raise _http(
                400,
                f"Cannot submit {produced_quantity} produced unit(s) for units "
                f"{unit_from}-{unit_to}. Only {due['available_quantity']} are released "
                f"from operation {due['upstream_operation_number']}.",
            )
        raise _http(
            400,
            f"Cannot submit {produced_quantity} produced unit(s). "
            f"This card has {due['available_quantity']} unit(s) still open.",
        )

    now = now_ist()
    log.produced_quantity = produced_quantity
    log.operator_rework_quantity = rework_submit_quantity
    log.unit_from = int(unit_from)
    log.unit_to = int(unit_to)
    log.notes = (notes or "").strip() or None
    log.to_date = now.date()
    log.to_time = now.time()
    log.operator_status = "completed"
    log.status = "inprogress"
    log.remaining_quantity_to_be_produced = due["remaining_to_close"]
    db.commit()
    db.refresh(log)
    return log_payload(log, card, due)


def shift_remaining_rows_after_machine_free(
    rows: Sequence[Any], free_at: datetime
) -> int:
    """
    Remaining units on the same machine cannot start before it actually freed.

    Keeps each row's machine and duration. Does not reassign. Rows already
    planned after free_at stay put unless they would overlap a prior remaining
    row on this machine.
    """
    shifted = 0
    cursor = free_at
    for row in rows:
        start = getattr(row, "start_time", None)
        end = getattr(row, "end_time", None)
        if start is None or end is None:
            continue
        duration = end - start
        new_start = start if start >= cursor else cursor
        new_end = new_start + duration
        if new_start != start or new_end != end:
            row.start_time = new_start
            row.end_time = new_end
            shifted += 1
        cursor = new_end
    return shifted


def _remaining_same_machine_rows(
    db: Session,
    *,
    part_id: int,
    order_id: int,
    operation_id: int,
    machine_id: int,
    version: int,
) -> List[UnitScheduleItem]:
    return (
        db.query(UnitScheduleItem)
        .filter(
            UnitScheduleItem.part_id == int(part_id),
            UnitScheduleItem.order_id == int(order_id),
            UnitScheduleItem.operation_id == int(operation_id),
            UnitScheduleItem.machine_id == int(machine_id),
            UnitScheduleItem.schedule_version == int(version),
        )
        .order_by(UnitScheduleItem.start_time.asc(), UnitScheduleItem.unit_index.asc())
        .all()
    )


def should_drop_reviewed_band(remaining: int) -> bool:
    """Rework/reject still need the job card. Drop only a fully approved band."""
    return int(remaining or 0) <= 0


def _rebuild_after_unit_review(
    db: Session,
    *,
    part_id: int,
    order_id: int,
    operation_id: Optional[int] = None,
    unit_from: Optional[int] = None,
    unit_to: Optional[int] = None,
    machine_id: Optional[int] = None,
    free_at: Optional[datetime] = None,
    drop: bool = True,
    assignment_mode: Optional[str] = None,
) -> Dict[str, Any]:
    """
    After review: optionally drop a fully approved band, then push remaining
    same-machine rows to start at the log's actual end. Does not call greedy.
    Rework keeps the card (drop=False) and only updates its planned times.
    """
    _ = assignment_mode
    if operation_id is None or unit_from is None or unit_to is None:
        return {"queued": False, "dropped": 0}
    version = (
        db.query(func.max(UnitScheduleItem.schedule_version))
        .filter(
            UnitScheduleItem.part_id == int(part_id),
            UnitScheduleItem.order_id == int(order_id),
        )
        .scalar()
    )
    if version is None:
        return {"queued": False, "dropped": 0, "schedule_version": None}
    deleted = 0
    if drop:
        deleted = (
            db.query(UnitScheduleItem)
            .filter(
                UnitScheduleItem.part_id == int(part_id),
                UnitScheduleItem.order_id == int(order_id),
                UnitScheduleItem.operation_id == int(operation_id),
                UnitScheduleItem.schedule_version == int(version),
                UnitScheduleItem.unit_index >= int(unit_from),
                UnitScheduleItem.unit_index <= int(unit_to),
            )
            .delete(synchronize_session=False)
        )
    shifted = 0
    if machine_id is not None and free_at is not None:
        remaining = _remaining_same_machine_rows(
            db,
            part_id=int(part_id),
            order_id=int(order_id),
            operation_id=int(operation_id),
            machine_id=int(machine_id),
            version=int(version),
        )
        shifted = shift_remaining_rows_after_machine_free(remaining, free_at)
    db.commit()
    return {
        "queued": False,
        "dropped": int(deleted or 0),
        "shifted": int(shifted),
        "schedule_version": int(version),
    }


def review_unit_job(
    db: Session,
    log_id: int,
    *,
    user_id: int,
    status: str,
    approved_quantity: Optional[int],
    rework_quantity: Optional[int],
    rejected_quantity: Optional[int],
    remarks: Optional[str],
) -> Dict[str, Any]:
    log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    if log is None:
        raise _http(404, f"Production log {log_id} not found")
    if log.operator_status != "completed":
        raise _http(400, "Operator has not submitted this log yet")
    if log.status == "completed" and status != "completed":
        raise _http(400, "A completed review cannot be changed")

    if status not in ("pending", "inprogress", "completed", "rework", "rejected"):
        raise _http(
            400,
            "status must be pending, inprogress, or completed. "
            "The log is saved as completed when remaining_quantity_to_be_produced is 0.",
        )

    reviewer = validate_production_log_reviewer(db, user_id)
    assert_exclusive_reviewer(db, log, reviewer.id)
    card = card_for_log(db, log)

    approved = int(approved_quantity or 0)
    rework = int(rework_quantity or 0)
    rejected = int(rejected_quantity or 0)
    presented = total_presented_on_log(log.produced_quantity or 0, log.operator_rework_quantity or 0)
    if status == "completed":
        if approved != presented:
            raise _http(
                400,
                f"For completed, approved quantity ({approved}) must equal "
                f"presented quantity ({presented}).",
            )
    elif status != "pending" and approved + rework + rejected != presented:
        raise _http(
            400,
            f"Approved ({approved}) + rework ({rework}) + rejected ({rejected}) "
            f"must equal presented quantity ({presented}).",
        )

    due = work_due_for_card(db, card, exclude_log_id=log.id)
    if due["has_predecessor"] and approved > int(due["available_quantity"]):
        raise _http(
            400,
            f"Cannot approve {approved} unit(s) for units {card['unit_from']}-{card['unit_to']}. "
            f"Only {due['available_quantity']} are released from operation "
            f"{due['upstream_operation_number']}.",
        )
    if approved > int(card["quantity"]):
        raise _http(400, f"Cannot approve more than the card quantity ({card['quantity']}).")

    log.user_id = reviewer.id
    log.approved_quantity = approved
    log.rework_quantity = rework
    log.rejected_quantity = rejected
    if remarks is not None:
        log.remarks = remarks
    approved_on_card = int(due["approved_on_card"]) + approved
    remaining = max(0, int(card["quantity"]) - approved_on_card)
    log.remaining_quantity_to_be_produced = remaining
    log.status = "completed" if remaining == 0 else "inprogress"
    close_fully_approved_operation_logs(db, int(log.operation_id))
    log.operator_acknowledged = False
    log.operator_acknowledged_at = None
    db.commit()
    db.refresh(log)
    payload = log_payload(log, card, work_due_for_card(db, card))
    from intelligent_scheduler.job_cards import _combine_log_datetime

    free_at = _combine_log_datetime(log.to_date, log.to_time)
    drop_band = should_drop_reviewed_band(remaining)
    # Approve: drop the band. Rework/reject: keep it. Always move remaining
    # same-machine rows to this log's actual end — do not leave stale times.
    if free_at is not None:
        payload["reschedule"] = _rebuild_after_unit_review(
            db,
            part_id=int(card["part_id"]),
            order_id=int(card["order_id"]),
            operation_id=int(card["operation_id"]),
            unit_from=int(card["unit_from"]),
            unit_to=int(card["unit_to"]),
            machine_id=int(card["machine_id"]) if card.get("machine_id") is not None else None,
            free_at=free_at,
            drop=drop_band,
        )
    payload["part_completed"] = mark_part_completed_if_all_operations_approved(
        db, int(card["part_id"])
    )
    return payload


def acknowledge_unit_job(
    db: Session,
    log_id: int,
    *,
    operator_id: Optional[int],
    user_id: Optional[int],
) -> Dict[str, Any]:
    if operator_id is None and user_id is None:
        raise _http(400, "Provide operator_id or user_id")
    log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    if log is None:
        raise _http(404, f"Production log {log_id} not found")
    card = card_for_log(db, log)
    if operator_id is not None:
        if log.operator_id != operator_id:
            raise _http(403, "Only the operator who created this log can acknowledge it")
        if log.user_id is None:
            raise _http(400, "Operator can acknowledge a log only after it has been reviewed")
        log.operator_acknowledged = True
        log.operator_acknowledged_at = now_ist()
    else:
        validate_production_log_reviewer(db, user_id)
        if log.user_id and log.user_id != user_id:
            raise _http(403, "Only the reviewer who approved this log can acknowledge it")
        log.acknowledged = True
        log.acknowledged_at = now_ist()
    db.commit()
    db.refresh(log)
    return log_payload(log, card, work_due_for_card(db, card))

"""
Activate one unit-wise job card.

Writes a production log on the card's machine. Does not call the production
operation-status activate route and does not read rescheduling machine_id.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from DB.models.access_control import AccessUser, OperatorLeave
from DB.models.scheduling import ProductionLog
from intelligent_scheduler.job_cards import list_machine_job_cards
from intelligent_scheduler.unit_job_flow import activation_block_for_card, work_due_for_card
from machine_breakdown_helpers import get_machine_breakdown_block_message
from scheduling_modes import require_activate_engine
from time_utils import now_ist


def start_quantity_for_card(
    requested: Optional[int],
    card_quantity: int,
    already_approved: int = 0,
) -> int:
    """
    Units allowed to start on this card.

    Omit requested to start whatever is still open on the band.
    A request above that open quantity is rejected.
    """
    remaining = int(card_quantity) - int(already_approved or 0)
    if remaining <= 0:
        raise HTTPException(
            400,
            f"This job card is already complete ({card_quantity} unit(s) approved on this machine).",
        )
    qty = remaining if requested is None else int(requested)
    if qty < 1:
        raise HTTPException(400, "quantity must be at least 1")
    if qty > remaining:
        raise HTTPException(
            400,
            f"Cannot start more than {remaining} unit(s) on this job card "
            f"(card quantity is {card_quantity}).",
        )
    return qty


def activate_unit_job_card(
    db: Session,
    machine_id: int,
    *,
    operator_id: int,
    operation_id: int,
    unit_from: int,
    unit_to: int,
) -> Dict[str, Any]:
    require_activate_engine(
        db, "unit_wise", operation_id=operation_id, machine_id=machine_id
    )

    operator = db.query(AccessUser).filter(AccessUser.id == operator_id).first()
    if not operator:
        raise HTTPException(404, f"Operator with ID {operator_id} not found")

    today = date.today()
    operator_leave = (
        db.query(OperatorLeave)
        .filter(
            OperatorLeave.operator_id == operator_id,
            OperatorLeave.status == "acknowledged",
            OperatorLeave.from_date <= today,
            OperatorLeave.to_date >= today,
        )
        .first()
    )
    if operator_leave:
        raise HTTPException(
            400,
            "Cannot activate job card. Operator has acknowledged leave from "
            f"{operator_leave.from_date} to {operator_leave.to_date}. "
            f"Reason: {operator_leave.reason or 'Not specified'}",
        )

    listed = list_machine_job_cards(db, machine_id)
    if not listed.get("machine_found"):
        raise HTTPException(404, f"Machine with ID {machine_id} not found")

    card = next(
        (
            job
            for job in listed.get("jobs") or []
            if int(job["operation_id"]) == int(operation_id)
            and int(job["unit_from"]) == int(unit_from)
            and int(job["unit_to"]) == int(unit_to)
            and int(job["machine_id"]) == int(machine_id)
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
        raise HTTPException(400, detail)
    block = activation_block_for_card(db, card)
    if block:
        raise HTTPException(400, block)
    due = work_due_for_card(db, card)

    existing = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.operator_status == "inprogress",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            400,
            "Operation already has an in-progress job card"
            + (
                f" on machine {existing.machine_id}"
                if existing.machine_id is not None
                else ""
            )
            + ". Finish that card before starting another.",
        )

    awaiting_review = (
        db.query(ProductionLog.id)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.machine_id == machine_id,
            ProductionLog.operator_status == "completed",
            ProductionLog.user_id.is_(None),
        )
        .first()
    )
    if awaiting_review:
        raise HTTPException(
            400,
            "Cannot activate job card because log status is yet to be updated by a reviewer "
            "(supervisor or manufacturing_coordinator). Please wait until the reviewer "
            "has reviewed and updated the production log.",
        )

    breakdown_block = get_machine_breakdown_block_message(db, machine_id, now_ist())
    if breakdown_block:
        raise HTTPException(400, breakdown_block)

    current_time = now_ist()
    db.add(
        ProductionLog(
            operation_id=operation_id,
            operator_id=operator_id,
            machine_id=machine_id,
            from_date=current_time.date(),
            from_time=current_time.time(),
            operator_status="inprogress",
            status="inprogress",
            remaining_quantity_to_be_produced=due["remaining_to_close"],
            unit_from=int(unit_from),
            unit_to=int(unit_to),
            notes=None,
        )
    )

    db.execute(
        text(
            """
            UPDATE production_monitoring.machine_live_status
            SET current_order_id = :order_id,
                current_part_id = :part_id,
                current_operation_id = :operation_id
            WHERE machine_id = :machine_id
            """
        ),
        {
            "machine_id": machine_id,
            "order_id": card["order_id"],
            "part_id": card["part_id"],
            "operation_id": operation_id,
        },
    )
    db.commit()

    return {
        "message": "Job card activated successfully",
        "order_id": card["order_id"],
        "order_number": card["order_number"],
        "part_id": card["part_id"],
        "part_number": card["part_number"],
        "operation_id": operation_id,
        "operation_number": card["operation_number"],
        "machine_id": machine_id,
        "operator_id": operator_id,
        "unit_from": unit_from,
        "unit_to": unit_to,
        "card_quantity": card["quantity"],
        "assignment_mode": card.get("assignment_mode"),
        "available_quantity": due.get("available_quantity"),
        "status": "inprogress",
    }

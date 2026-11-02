"""
Operator job list and activation from unit_schedule_items.

Activation writes a production log on the job-card machine.
It does not use the production operation-status activate route.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from DB.database import get_db
from intelligent_scheduler.job_activate import activate_unit_job_card
from intelligent_scheduler.job_cards import list_machine_job_cards
from intelligent_scheduler.schemas import (
    UnitJobAcknowledgeRequest,
    UnitJobActivateRequest,
    UnitJobReviewRequest,
    UnitJobSubmitRequest,
)
from intelligent_scheduler.unit_job_flow import (
    acknowledge_unit_job,
    review_unit_job,
    status_summary_for_card,
    submit_unit_job,
)
from scheduling_modes import require_submit_engine, require_unit_wise_scheduling

router = APIRouter(prefix="/scheduling/unit-wise", tags=["intelligent-scheduler"])
logger = logging.getLogger(__name__)


@router.get("/machine-jobs/{machine_id}")
def get_machine_job_cards(machine_id: int, db: Session = Depends(get_db)):
    """
    Job cards for one machine from the latest unit-wise plan.

    One card per contiguous unit band (not one card per unit).
    """
    require_unit_wise_scheduling(db)
    try:
        result = list_machine_job_cards(db, machine_id)
    except Exception as e:
        logger.exception("GET machine-jobs failed")
        raise HTTPException(500, f"Failed to load machine jobs: {e}") from e
    if not result.get("machine_found"):
        raise HTTPException(404, f"Machine with ID {machine_id} not found")
    result.pop("machine_found", None)
    return result


@router.post("/machine-jobs/{machine_id}/activate")
def activate_machine_job_card(
    machine_id: int,
    body: UnitJobActivateRequest,
    db: Session = Depends(get_db),
):
    """
    Activate the unit-wise job card on this machine.

    Does not take a quantity. The operator sends quantity when submitting the log.
    """
    require_unit_wise_scheduling(db)
    try:
        return activate_unit_job_card(
            db,
            machine_id,
            operator_id=body.operator_id,
            operation_id=body.operation_id,
            unit_from=body.unit_from,
            unit_to=body.unit_to,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("POST machine-jobs activate failed")
        raise HTTPException(500, f"Failed to activate job card: {e}") from e


def _run(db: Session, action, label: str):
    try:
        return action()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("%s failed", label)
        raise HTTPException(500, f"{label}: {e}") from e


@router.get("/machine-jobs/{machine_id}/status-summary")
def get_machine_job_status_summary(
    machine_id: int,
    operation_id: int = Query(...),
    unit_from: int = Query(...),
    unit_to: int = Query(...),
    db: Session = Depends(get_db),
):
    """How many units this card can still produce, including upstream handoff."""
    require_unit_wise_scheduling(db)
    return _run(
        db,
        lambda: status_summary_for_card(db, machine_id, operation_id, unit_from, unit_to),
        "GET machine-job status-summary",
    )


@router.post("/machine-jobs/{machine_id}/submit")
def submit_machine_job(
    machine_id: int,
    body: UnitJobSubmitRequest,
    db: Session = Depends(get_db),
):
    """Submit the in-progress log. Quantity cannot exceed this card or the upstream release."""
    require_unit_wise_scheduling(db)
    require_submit_engine(db, "unit_wise", operation_id=body.operation_id)
    return _run(
        db,
        lambda: submit_unit_job(
            db,
            machine_id,
            operation_id=body.operation_id,
            unit_from=body.unit_from,
            unit_to=body.unit_to,
            produced_quantity=body.produced_quantity,
            rework_submit_quantity=body.rework_submit_quantity,
            notes=body.notes,
        ),
        "POST machine-job submit",
    )


@router.put("/production-logs/{log_id}/status")
def review_machine_job_log(
    log_id: int,
    body: UnitJobReviewRequest,
    db: Session = Depends(get_db),
):
    """Approve, rework, or reject. Only supervisor or manufacturing_coordinator."""
    return _run(
        db,
        lambda: review_unit_job(
            db,
            log_id,
            user_id=body.user_id,
            status=body.status,
            approved_quantity=body.approved_quantity,
            rework_quantity=body.rework_quantity,
            rejected_quantity=body.rejected_quantity,
            remarks=body.remarks,
        ),
        "PUT unit-wise production-log status",
    )


@router.put("/production-logs/{log_id}/acknowledge")
def acknowledge_machine_job_log(
    log_id: int,
    body: UnitJobAcknowledgeRequest,
    db: Session = Depends(get_db),
):
    """Operator acknowledges a review, or the reviewer acknowledges the submission."""
    return _run(
        db,
        lambda: acknowledge_unit_job(
            db,
            log_id,
            operator_id=body.operator_id,
            user_id=body.user_id,
        ),
        "PUT unit-wise production-log acknowledge",
    )

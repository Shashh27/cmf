"""
Preventive Maintenance (PM) business logic and schedule calculations.
"""
from datetime import date, datetime, timezone
from typing import List, Optional, Tuple

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from DB.models.configuration import (
    PMChecklist,
    PMChecklistItem,
    PMMachineAssignment,
    PMAssignmentItem,
    PMSchedule,
    PMCheckpointSubmission,
    Machine,
)
from DB.schemas.configuration import (
    PMChecklistItemCreate,
    PMChecklistItemUpdate,
)


def validate_checklist_item_frequency(item: PMChecklistItemCreate | PMChecklistItemUpdate, *, partial: bool = False) -> None:
    """Validate frequency fields based on frequency_type."""
    data = item.model_dump(exclude_unset=partial)
    frequency_type = data.get("frequency_type")

    if frequency_type is None and partial:
        return

    if frequency_type in ("Time Based", "Condition Based"):
        interval_value = data.get("interval_value")
        interval_unit = data.get("interval_unit")
        if interval_value is None or interval_unit is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{frequency_type} checkpoints require interval_value and interval_unit",
            )
        if interval_value <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="interval_value must be greater than 0",
            )
    elif frequency_type == "Usage Based":
        trigger_hours = data.get("trigger_hours")
        if trigger_hours is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usage Based checkpoints require trigger_hours",
            )
        if trigger_hours <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="trigger_hours must be greater than 0",
            )


def calculate_next_due_date(
    from_date: date,
    frequency_type: str,
    interval_value: Optional[int] = None,
    interval_unit: Optional[str] = None,
) -> date:
    """
    Calculate next due date from a base date and checkpoint frequency.
    Usage Based: uses interval if present; otherwise returns from_date (runtime TBD).
    """
    if frequency_type == "Usage Based" and (interval_value is None or interval_unit is None):
        return from_date

    if interval_value is None or interval_unit is None:
        raise ValueError("interval_value and interval_unit are required for date calculation")

    if interval_unit == "Day":
        return from_date + relativedelta(days=interval_value)
    if interval_unit == "Week":
        return from_date + relativedelta(weeks=interval_value)
    if interval_unit == "Month":
        return from_date + relativedelta(months=interval_value)
    if interval_unit == "Year":
        return from_date + relativedelta(years=interval_value)

    raise ValueError(f"Unsupported interval_unit: {interval_unit}")


def create_initial_schedule(
    db: Session,
    assignment_item: PMAssignmentItem,
    start_date: Optional[date] = None,
) -> PMSchedule:
    """
    Create the schedule row when a checklist is assigned to a machine.
    Assignment is not a completed PM activity: last_completed_date stays NULL and
    next_due_date is the effective start date (assignment day) so the operator
    sees the first checkpoint as due immediately.
    """
    effective_start = start_date or date.today()

    schedule = PMSchedule(
        assignment_item_id=assignment_item.id,
        last_completed_date=None,
        next_due_date=effective_start,
    )
    db.add(schedule)
    db.flush()
    return schedule


def update_schedule_on_approval(
    db: Session,
    schedule: PMSchedule,
    checklist_item: PMChecklistItem,
    completion_date: Optional[date] = None,
) -> PMSchedule:
    """
    Automatically update schedule when supervisor approves a submission.
    Sets last_completed_date = approval day and recalculates next_due_date from frequency.
    Never creates a new schedule row.
    """
    completed = completion_date or date.today()
    schedule.last_completed_date = completed
    schedule.next_due_date = calculate_next_due_date(
        completed,
        checklist_item.frequency_type,
        checklist_item.interval_value,
        checklist_item.interval_unit,
    )
    db.flush()
    return schedule


def review_submission(
    db: Session,
    submission: PMCheckpointSubmission,
    supervisor_id: int,
    decision: str,
    supervisor_comments: Optional[str] = None,
) -> PMCheckpointSubmission:
    """Approve or reject a submitted checkpoint. Schedule updates only on approval."""
    if submission.status != "Submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot review submission with status '{submission.status}'",
        )

    submission.status = decision
    submission.supervisor_id = supervisor_id
    submission.supervisor_comments = supervisor_comments
    submission.reviewed_at = datetime.now(timezone.utc)

    if decision == "Approved":
        assignment_item = submission.assignment_item
        checklist_item = assignment_item.checklist_item if assignment_item else None
        if not checklist_item or not submission.schedule:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot approve submission without schedule/checkpoint data",
            )
        completion_date = submission.reviewed_at.date() if submission.reviewed_at else date.today()
        update_schedule_on_approval(
            db,
            submission.schedule,
            checklist_item,
            completion_date=completion_date,
        )

    db.flush()
    return submission


def has_pending_submission(db: Session, assignment_item_id: int) -> bool:
    return (
        db.query(PMCheckpointSubmission)
        .filter(
            PMCheckpointSubmission.assignment_item_id == assignment_item_id,
            PMCheckpointSubmission.status == "Submitted",
        )
        .first()
        is not None
    )


def get_latest_submission(db: Session, assignment_item_id: int) -> Optional[PMCheckpointSubmission]:
    return (
        db.query(PMCheckpointSubmission)
        .filter(PMCheckpointSubmission.assignment_item_id == assignment_item_id)
        .order_by(PMCheckpointSubmission.submitted_at.desc(), PMCheckpointSubmission.id.desc())
        .first()
    )


def get_submission_cycle_flags(
    db: Session,
    assignment_item_id: int,
) -> Tuple[Optional[str], bool, bool, Optional[int], Optional[str]]:
    """Latest status, pending review, needs resubmit, latest submission id, rejection comments."""
    pending = has_pending_submission(db, assignment_item_id)
    latest = get_latest_submission(db, assignment_item_id)
    latest_status = latest.status if latest else None
    needs_resubmit = (
        not pending
        and latest is not None
        and latest.status == "Rejected"
    )
    rejection_comments = latest.supervisor_comments if needs_resubmit else None
    latest_submission_id = latest.id if latest else None
    return latest_status, pending, needs_resubmit, latest_submission_id, rejection_comments


def build_operator_checkpoint_fields(
    db: Session,
    assignment_item: PMAssignmentItem,
    checklist_item: PMChecklistItem,
    schedule: PMSchedule,
    today: Optional[date] = None,
) -> dict:
    today = today or date.today()
    latest_status, pending, needs_resubmit, latest_submission_id, rejection_comments = (
        get_submission_cycle_flags(db, assignment_item.id)
    )
    due_by_schedule = is_checkpoint_due(checklist_item, schedule, today)
    return {
        "assignment_item_id": assignment_item.id,
        "schedule_id": schedule.id,
        "checklist_item_id": checklist_item.id,
        "sequence_number": checklist_item.sequence_number,
        "item_text": checklist_item.item_text,
        "item_type": checklist_item.item_type,
        "expected_value": checklist_item.expected_value,
        "frequency_type": checklist_item.frequency_type,
        "interval_value": checklist_item.interval_value,
        "interval_unit": checklist_item.interval_unit,
        "trigger_hours": checklist_item.trigger_hours,
        "remarks": checklist_item.remarks,
        "is_required": assignment_item.is_required,
        "last_completed_date": schedule.last_completed_date,
        "next_due_date": schedule.next_due_date,
        "is_due": due_by_schedule or needs_resubmit,
        "has_pending_submission": pending,
        "latest_submission_status": latest_status,
        "needs_resubmit": needs_resubmit,
        "latest_submission_id": latest_submission_id,
        "rejection_comments": rejection_comments,
    }


def is_checkpoint_due(
    checklist_item: PMChecklistItem,
    schedule: PMSchedule,
    today: Optional[date] = None,
) -> bool:
    """
    Condition Based: always due (shown daily, optional via is_required).
    Time Based / Usage Based: due when next_due_date <= today (never completed yet
    if last_completed_date is NULL — first due is on next_due_date).
    """
    today = today or date.today()
    if checklist_item.frequency_type == "Condition Based":
        return True
    return schedule.next_due_date <= today


def get_due_checkpoints_for_machine(db: Session, machine_id: int) -> List[dict]:
    """Fetch checkpoints due today or earlier for operator screen."""
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")

    today = date.today()
    assignments = (
        db.query(PMMachineAssignment)
        .options(
            joinedload(PMMachineAssignment.checklist),
            joinedload(PMMachineAssignment.assignment_items)
            .joinedload(PMAssignmentItem.checklist_item),
            joinedload(PMMachineAssignment.assignment_items)
            .joinedload(PMAssignmentItem.schedule),
        )
        .filter(PMMachineAssignment.machine_id == machine_id)
        .all()
    )

    due_items: List[dict] = []
    for assignment in assignments:
        for assignment_item in assignment.assignment_items:
            checklist_item = assignment_item.checklist_item
            schedule = assignment_item.schedule
            if not checklist_item or not schedule:
                continue

            latest_status, pending, needs_resubmit, latest_submission_id, rejection_comments = (
                get_submission_cycle_flags(db, assignment_item.id)
            )
            if pending:
                continue
            if not is_checkpoint_due(checklist_item, schedule, today) and not needs_resubmit:
                continue

            due_items.append(
                {
                    "schedule_id": schedule.id,
                    "assignment_item_id": assignment_item.id,
                    "assignment_id": assignment.id,
                    "machine_id": machine_id,
                    "checklist_id": assignment.checklist_id,
                    "checklist_name": assignment.checklist.name if assignment.checklist else "",
                    "item_text": checklist_item.item_text,
                    "sequence_number": checklist_item.sequence_number,
                    "item_type": checklist_item.item_type,
                    "expected_value": checklist_item.expected_value,
                    "frequency_type": checklist_item.frequency_type,
                    "is_required": assignment_item.is_required,
                    "last_completed_date": schedule.last_completed_date,
                    "next_due_date": schedule.next_due_date,
                    "has_pending_submission": False,
                    "latest_submission_status": latest_status,
                    "needs_resubmit": needs_resubmit,
                    "latest_submission_id": latest_submission_id,
                    "rejection_comments": rejection_comments,
                }
            )

    due_items.sort(key=lambda x: (x["checklist_id"], x["sequence_number"]))
    return due_items


def delete_assignment_item(db: Session, assignment_id: int, assignment_item_id: int) -> None:
    """Remove a single checkpoint from a machine assignment. Deletes parent assignment if last item."""
    assignment = db.query(PMMachineAssignment).filter(PMMachineAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    assignment_item = (
        db.query(PMAssignmentItem)
        .filter(
            PMAssignmentItem.id == assignment_item_id,
            PMAssignmentItem.assignment_id == assignment_id,
        )
        .first()
    )
    if not assignment_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned checkpoint not found")

    has_submissions = (
        db.query(PMCheckpointSubmission)
        .filter(PMCheckpointSubmission.assignment_item_id == assignment_item_id)
        .first()
        is not None
    )
    if has_submissions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove checkpoint after operator has submitted a response",
        )

    remaining_count = (
        db.query(PMAssignmentItem)
        .filter(
            PMAssignmentItem.assignment_id == assignment_id,
            PMAssignmentItem.id != assignment_item_id,
        )
        .count()
    )

    db.delete(assignment_item)
    if remaining_count == 0:
        db.delete(assignment)
    db.commit()


def get_operator_assignments_for_machine(db: Session, machine_id: int) -> List[dict]:
    """
    Flat operator view: one object per assignment with ordered checkpoints.
    Each checkpoint merges definition + is_required + schedule + due status.
    """
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")

    today = date.today()
    assignments = (
        db.query(PMMachineAssignment)
        .options(
            joinedload(PMMachineAssignment.checklist),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.checklist_item),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.schedule),
        )
        .filter(PMMachineAssignment.machine_id == machine_id)
        .order_by(PMMachineAssignment.assigned_at.desc())
        .all()
    )

    result: List[dict] = []
    for assignment in assignments:
        checkpoints: List[dict] = []
        sorted_items = sorted(
            assignment.assignment_items,
            key=lambda ai: ai.checklist_item.sequence_number if ai.checklist_item else 0,
        )
        for ai in sorted_items:
            ci = ai.checklist_item
            schedule = ai.schedule
            if not ci or not schedule:
                continue
            checkpoints.append(build_operator_checkpoint_fields(db, ai, ci, schedule, today))

        result.append(
            {
                "assignment_id": assignment.id,
                "machine_id": assignment.machine_id,
                "checklist_id": assignment.checklist_id,
                "checklist_name": assignment.checklist.name if assignment.checklist else "",
                "checklist_description": assignment.checklist.description if assignment.checklist else None,
                "assigned_at": assignment.assigned_at,
                "checkpoints": checkpoints,
            }
        )

    return result


def validate_response_value(item_type: str, response_value: str) -> None:
    if item_type == "Boolean":
        if response_value.lower() not in ("true", "false", "yes", "no", "1", "0"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Boolean checkpoints require true/false response",
            )
    elif item_type == "Numeric":
        try:
            float(response_value)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Numeric checkpoints require a numeric response",
            )


def get_machine_label(machine: Optional[Machine]) -> Optional[str]:
    if not machine:
        return None
    if machine.make and machine.model:
        return f"({machine.make}){machine.model}"
    return machine.make or machine.type or f"Machine {machine.id}"


def enrich_submission(submission: PMCheckpointSubmission) -> dict:
    assignment_item = submission.assignment_item
    checklist_item = assignment_item.checklist_item if assignment_item else None
    assignment = assignment_item.assignment if assignment_item else None
    machine = assignment.machine if assignment else None
    checklist = assignment.checklist if assignment else None

    return {
        "id": submission.id,
        "schedule_id": submission.schedule_id,
        "assignment_item_id": submission.assignment_item_id,
        "operator_id": submission.operator_id,
        "response_value": submission.response_value,
        "operator_comments": submission.operator_comments,
        "submitted_at": submission.submitted_at,
        "status": submission.status,
        "supervisor_id": submission.supervisor_id,
        "reviewed_at": submission.reviewed_at,
        "supervisor_comments": submission.supervisor_comments,
        "supervisor_acknowledged": submission.supervisor_acknowledged,
        "supervisor_acknowledged_at": submission.supervisor_acknowledged_at,
        "operator_acknowledged": submission.operator_acknowledged,
        "operator_acknowledged_at": submission.operator_acknowledged_at,
        "created_at": submission.created_at,
        "checklist_item": checklist_item,
        "checklist_id": assignment.checklist_id if assignment else None,
        "checklist_name": checklist.name if checklist else None,
        "machine_id": assignment.machine_id if assignment else None,
        "machine_label": get_machine_label(machine),
    }

"""
Preventive Maintenance (PM) business logic and schedule calculations.
"""
from datetime import date, datetime, time, timezone
from typing import List, Optional, Tuple

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy import func
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
    """No-op: frequency lives on assignment items, not checkpoint master."""
    return


def validate_assignment_frequency(
    frequency_type: Optional[str],
    interval_value: Optional[int] = None,
    interval_unit: Optional[str] = None,
    trigger_hours: Optional[float] = None,
) -> None:
    """Frequency is mandatory when assigning a checkpoint to a machine."""
    if not frequency_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Frequency is required when assigning a checkpoint to a machine",
        )
    if frequency_type not in ("Time Based", "Usage Based", "Condition Based"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid frequency_type",
        )
    if frequency_type == "Time Based":
        if interval_value is None or interval_unit is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Time Based requires interval_value and interval_unit",
            )
        if interval_value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="interval_value must be greater than 0")
    elif frequency_type == "Condition Based":
        if (interval_value is None) ^ (interval_unit is None):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Condition Based must provide both interval_value and interval_unit, or neither",
            )
        if interval_value is not None and interval_value <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="interval_value must be greater than 0")
    elif frequency_type == "Usage Based":
        if trigger_hours is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usage Based requires trigger_hours",
            )
        if trigger_hours <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="trigger_hours must be greater than 0")


def resolve_frequency(assignment_item: PMAssignmentItem, checklist_item: Optional[PMChecklistItem] = None) -> dict:
    """Frequency always comes from the assignment item (per machine)."""
    return {
        "frequency_type": assignment_item.frequency_type or "Time Based",
        "interval_value": assignment_item.interval_value,
        "interval_unit": assignment_item.interval_unit,
        "trigger_hours": assignment_item.trigger_hours,
    }


def calculate_next_due_date(
    from_date: date,
    frequency_type: str,
    interval_value: Optional[int] = None,
    interval_unit: Optional[str] = None,
) -> date:
    """
    Calculate next due date from a base date and checkpoint frequency.
    Usage Based / Condition Based without interval: returns from_date.
    """
    if frequency_type in ("Usage Based", "Condition Based") and (interval_value is None or interval_unit is None):
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


def update_schedule_on_completion(
    db: Session,
    schedule: PMSchedule,
    assignment_item: PMAssignmentItem,
    completion_date: Optional[date] = None,
) -> PMSchedule:
    """
    Automatically update schedule when operator completes a submission.
    Sets last_completed_date = submission day and recalculates next_due_date from
    assignment-item frequency (falls back to checklist item for legacy rows).
    """
    completed = completion_date or date.today()
    schedule.last_completed_date = completed
    freq = resolve_frequency(assignment_item)
    schedule.next_due_date = calculate_next_due_date(
        completed,
        freq["frequency_type"],
        freq["interval_value"],
        freq["interval_unit"],
    )
    db.flush()
    return schedule


def is_condition_on_demand(assignment_item: PMAssignmentItem, checklist_item: Optional[PMChecklistItem] = None) -> bool:
    """Condition-based checkpoint with no interval — submit anytime from the full assignment view."""
    freq = resolve_frequency(assignment_item, checklist_item)
    return (
        freq["frequency_type"] == "Condition Based"
        and (freq["interval_value"] is None or freq["interval_unit"] is None)
    )


def get_latest_submission(db: Session, assignment_item_id: int) -> Optional[PMCheckpointSubmission]:
    return (
        db.query(PMCheckpointSubmission)
        .filter(PMCheckpointSubmission.assignment_item_id == assignment_item_id)
        .order_by(PMCheckpointSubmission.submitted_at.desc(), PMCheckpointSubmission.id.desc())
        .first()
    )


def get_latest_submission_info(
    db: Session,
    assignment_item_id: int,
) -> Tuple[Optional[int], Optional[datetime]]:
    latest = get_latest_submission(db, assignment_item_id)
    if not latest:
        return None, None
    return latest.id, latest.submitted_at


def build_operator_checkpoint_fields(
    db: Session,
    assignment_item: PMAssignmentItem,
    checklist_item: PMChecklistItem,
    schedule: PMSchedule,
    today: Optional[date] = None,
) -> dict:
    today = today or date.today()
    latest_submission_id, last_submitted_at = get_latest_submission_info(db, assignment_item.id)
    due_by_schedule = is_checkpoint_due(assignment_item, schedule, today)
    on_demand = is_condition_on_demand(assignment_item, checklist_item)
    freq = resolve_frequency(assignment_item, checklist_item)
    return {
        "assignment_item_id": assignment_item.id,
        "schedule_id": schedule.id,
        "checklist_item_id": checklist_item.id,
        "sequence_number": checklist_item.sequence_number,
        "item_code": getattr(checklist_item, "item_code", None) or f"CP-{checklist_item.id}",
        "item_text": checklist_item.item_text,
        "item_type": checklist_item.item_type,
        "expected_value": checklist_item.expected_value,
        "frequency_type": freq["frequency_type"],
        "interval_value": freq["interval_value"],
        "interval_unit": freq["interval_unit"],
        "trigger_hours": freq["trigger_hours"],
        "remarks": checklist_item.remarks,
        "is_required": assignment_item.is_required,
        "is_compulsory": bool(getattr(assignment_item, "is_compulsory", False)),
        "last_completed_date": schedule.last_completed_date,
        "next_due_date": schedule.next_due_date,
        "is_due": due_by_schedule or on_demand,
        "latest_submission_id": latest_submission_id,
        "last_submitted_at": last_submitted_at,
    }


def is_checkpoint_due(
    assignment_item: PMAssignmentItem,
    schedule: PMSchedule,
    today: Optional[date] = None,
) -> bool:
    """
    Condition Based without interval: not shown in due list, but available from the
    full assignment view at any time. Condition Based with interval behaves like a
    date-based checkpoint in the due list.
    """
    today = today or date.today()
    freq = resolve_frequency(assignment_item)
    if freq["frequency_type"] == "Condition Based":
        if freq["interval_value"] is None or freq["interval_unit"] is None:
            return False
    return schedule.next_due_date <= today


def get_due_checkpoints_for_machine(db: Session, machine_id: int) -> List[dict]:
    """Fetch checkpoints due today or earlier for operator screen."""
    from services.pm_machine_availability import fetch_machine_availability, is_machine_id_down_on

    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")

    today = date.today()
    availability = fetch_machine_availability(db)
    if is_machine_id_down_on(availability, machine_id, today, today):
        return []
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
            if not assignment_item.is_required:
                continue
            checklist_item = assignment_item.checklist_item
            schedule = assignment_item.schedule
            if not checklist_item or not schedule:
                continue

            latest_submission_id, last_submitted_at = get_latest_submission_info(db, assignment_item.id)
            if not is_checkpoint_due(assignment_item, schedule, today):
                continue

            freq = resolve_frequency(assignment_item, checklist_item)
            due_items.append(
                {
                    "schedule_id": schedule.id,
                    "assignment_item_id": assignment_item.id,
                    "assignment_id": assignment.id,
                    "machine_id": machine_id,
                    "checklist_id": assignment.checklist_id,
                    "checklist_name": assignment.checklist.name if assignment.checklist else "",
                    "item_code": getattr(checklist_item, "item_code", None) or f"CP-{checklist_item.id}",
                    "item_text": checklist_item.item_text,
                    "sequence_number": checklist_item.sequence_number,
                    "item_type": checklist_item.item_type,
                    "expected_value": checklist_item.expected_value,
                    "frequency_type": freq["frequency_type"],
                    "interval_value": freq["interval_value"],
                    "interval_unit": freq["interval_unit"],
                    "trigger_hours": freq["trigger_hours"],
                    "is_required": assignment_item.is_required,
                    "is_compulsory": bool(getattr(assignment_item, "is_compulsory", False)),
                    "last_completed_date": schedule.last_completed_date,
                    "next_due_date": schedule.next_due_date,
                    "latest_submission_id": latest_submission_id,
                    "last_submitted_at": last_submitted_at,
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
    from services.pm_machine_availability import fetch_machine_availability, is_machine_id_down_on
    down_today = is_machine_id_down_on(fetch_machine_availability(db), machine_id, today, today)

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
            if not ai.is_required:
                continue
            ci = ai.checklist_item
            schedule = ai.schedule
            if not ci or not schedule:
                continue
            fields = build_operator_checkpoint_fields(db, ai, ci, schedule, today)
            # Breakdown window: not due to fill. After available_to they become due again.
            if down_today:
                fields["is_due"] = False
            checkpoints.append(fields)

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


def apply_submission_date_filters(
    query,
    *,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
):
    """Filter submissions by date range (preferred) or month/year."""
    today = date.today()
    if end_date is not None and end_date > today:
        end_date = today
    if start_date is not None:
        query = query.filter(func.date(PMCheckpointSubmission.submitted_at) >= start_date)
    if end_date is not None:
        query = query.filter(func.date(PMCheckpointSubmission.submitted_at) <= end_date)
    if start_date is None and end_date is None:
        if month is not None:
            query = query.filter(func.extract("month", PMCheckpointSubmission.submitted_at) == month)
        if year is not None:
            query = query.filter(func.extract("year", PMCheckpointSubmission.submitted_at) == year)
    return query


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
    freq = resolve_frequency(assignment_item, checklist_item) if assignment_item else {}

    return {
        "id": submission.id,
        "schedule_id": submission.schedule_id,
        "assignment_item_id": submission.assignment_item_id,
        "operator_id": submission.operator_id,
        "operator_name": submission.operator.user_name if submission.operator else None,
        "response_value": submission.response_value,
        "operator_comments": submission.operator_comments,
        "submitted_at": submission.submitted_at,
        "checklist_item": checklist_item,
        "checklist_id": assignment.checklist_id if assignment else None,
        "checklist_name": checklist.name if checklist else None,
        "machine_id": assignment.machine_id if assignment else None,
        "machine_label": get_machine_label(machine),
        "frequency_type": freq.get("frequency_type"),
        "interval_value": freq.get("interval_value"),
        "interval_unit": freq.get("interval_unit"),
        "trigger_hours": freq.get("trigger_hours"),
        "is_compulsory": assignment_item.is_compulsory if assignment_item else None,
    }

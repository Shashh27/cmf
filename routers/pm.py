from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from DB.database import get_db
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
    PMChecklist as PMChecklistSchema,
    PMChecklistCreate,
    PMChecklistUpdate,
    PMChecklistWithItems,
    PMChecklistItem as PMChecklistItemSchema,
    PMChecklistItemCreate,
    PMChecklistItemUpdate,
    PMMachineAssignment as PMMachineAssignmentSchema,
    PMMachineAssignmentCreate,
    PMMachineAssignmentWithDetails,
    PMOperatorAssignmentView,
    PMAssignmentItemWithDetails,
    PMSchedule as PMScheduleSchema,
    PMScheduleWithDetails,
    DueCheckpointResponse,
    PMOperatorSubmitRequest,
    PMCheckpointSubmission as PMCheckpointSubmissionSchema,
    PMCheckpointSubmissionWithDetails,
)
from services.pm_machine_availability import fetch_machine_availability
from services.pm_service import (
    validate_checklist_item_frequency,
    validate_assignment_frequency,
    create_initial_schedule,
    update_schedule_on_completion,
    get_due_checkpoints_for_machine,
    get_operator_assignments_for_machine,
    delete_assignment_item,
    validate_response_value,
    enrich_submission,
    apply_submission_date_filters,
)

router = APIRouter(prefix="/pm", tags=["Preventive Maintenance"])

SUBMISSION_DETAIL_LOAD = (
    joinedload(PMCheckpointSubmission.operator),
    joinedload(PMCheckpointSubmission.assignment_item).options(
        joinedload(PMAssignmentItem.checklist_item),
        joinedload(PMAssignmentItem.assignment).options(
            joinedload(PMMachineAssignment.machine),
            joinedload(PMMachineAssignment.checklist),
        ),
    ),
)


def _ensure_unique_item_code(db: Session, checklist_id: int, item_code: str, exclude_id: Optional[int] = None) -> None:
    q = db.query(PMChecklistItem).filter(
        PMChecklistItem.checklist_id == checklist_id,
        func.lower(PMChecklistItem.item_code) == item_code.lower(),
    )
    if exclude_id is not None:
        q = q.filter(PMChecklistItem.id != exclude_id)
    if q.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Checkpoint code '{item_code}' already exists in this checklist",
        )


# =======================
# Checklist APIs
# =======================

@router.post("/checklists", response_model=PMChecklistWithItems, status_code=status.HTTP_201_CREATED)
def create_checklist(payload: PMChecklistCreate, db: Session = Depends(get_db)):
    """Create a PM checklist with checkpoints. Checkpoints are mandatory."""
    for item in payload.items:
        validate_checklist_item_frequency(item)

    # Duplicate codes inside the same create payload
    codes = [i.item_code.upper() for i in payload.items]
    if len(codes) != len(set(codes)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate checkpoint codes in request")

    db_checklist = PMChecklist(
        name=payload.name,
        description=payload.description,
        created_by=payload.created_by,
    )
    db.add(db_checklist)
    db.flush()

    for item in payload.items:
        db_item = PMChecklistItem(
            checklist_id=db_checklist.id,
            **item.model_dump(),
        )
        db.add(db_item)

    db.commit()
    db.refresh(db_checklist)
    return db_checklist


@router.get("/checklists", response_model=List[PMChecklistWithItems])
def get_all_checklists(db: Session = Depends(get_db)):
    """All checklists with checkpoints in one response (avoids N+1 detail fetches)."""
    return (
        db.query(PMChecklist)
        .options(joinedload(PMChecklist.items))
        .order_by(PMChecklist.id.desc())
        .all()
    )


@router.get("/checklists/{checklist_id}", response_model=PMChecklistWithItems)
def get_checklist_by_id(checklist_id: int, db: Session = Depends(get_db)):
    checklist = (
        db.query(PMChecklist)
        .options(joinedload(PMChecklist.items))
        .filter(PMChecklist.id == checklist_id)
        .first()
    )
    if not checklist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")
    return checklist


@router.put("/checklists/{checklist_id}", response_model=PMChecklistSchema)
def update_checklist(checklist_id: int, payload: PMChecklistUpdate, db: Session = Depends(get_db)):
    checklist = db.query(PMChecklist).filter(PMChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(checklist, key, value)

    db.commit()
    db.refresh(checklist)
    return checklist


@router.delete("/checklists/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist(checklist_id: int, db: Session = Depends(get_db)):
    checklist = db.query(PMChecklist).filter(PMChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")

    assigned = (
        db.query(PMMachineAssignment)
        .filter(PMMachineAssignment.checklist_id == checklist_id)
        .first()
    )
    if assigned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete checklist that has machine assignments",
        )

    db.delete(checklist)
    db.commit()
    return None


# =======================
# Checklist Item APIs
# =======================

@router.post(
    "/checklists/{checklist_id}/items",
    response_model=PMChecklistItemSchema,
    status_code=status.HTTP_201_CREATED,
)
def add_checkpoint(checklist_id: int, payload: PMChecklistItemCreate, db: Session = Depends(get_db)):
    checklist = db.query(PMChecklist).filter(PMChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")

    validate_checklist_item_frequency(payload)
    _ensure_unique_item_code(db, checklist_id, payload.item_code)

    db_item = PMChecklistItem(checklist_id=checklist_id, **payload.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.get("/checklists/{checklist_id}/items", response_model=List[PMChecklistItemSchema])
def get_checkpoints_by_checklist(checklist_id: int, db: Session = Depends(get_db)):
    checklist = db.query(PMChecklist).filter(PMChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")

    return (
        db.query(PMChecklistItem)
        .filter(PMChecklistItem.checklist_id == checklist_id)
        .order_by(PMChecklistItem.sequence_number.asc())
        .all()
    )


@router.put("/checklist-items/{item_id}", response_model=PMChecklistItemSchema)
def update_checkpoint(item_id: int, payload: PMChecklistItemUpdate, db: Session = Depends(get_db)):
    db_item = db.query(PMChecklistItem).filter(PMChecklistItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "item_code" in update_data and update_data["item_code"] is not None:
        _ensure_unique_item_code(db, db_item.checklist_id, update_data["item_code"], exclude_id=item_id)
    for key, value in update_data.items():
        setattr(db_item, key, value)

    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/checklist-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkpoint(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(PMChecklistItem).filter(PMChecklistItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkpoint not found")

    in_use = (
        db.query(PMAssignmentItem)
        .filter(PMAssignmentItem.checklist_item_id == item_id)
        .first()
    )
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete checkpoint that is assigned to a machine",
        )

    db.delete(db_item)
    db.commit()
    return None


# =======================
# Machine Assignment APIs
# =======================

@router.post(
    "/assignments",
    response_model=PMMachineAssignmentWithDetails,
    status_code=status.HTTP_201_CREATED,
)
def assign_checklist_to_machine(payload: PMMachineAssignmentCreate, db: Session = Depends(get_db)):
    """
    Assign a checklist to a machine.
    Only checkpoints marked is_required=true are stored.
    Frequency is mandatory per selected checkpoint (per-machine).
    is_compulsory=true → miss by end of shift notifies Admin/MC.
    """
    machine = db.query(Machine).filter(Machine.id == payload.machine_id).first()
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")

    checklist = (
        db.query(PMChecklist)
        .options(joinedload(PMChecklist.items))
        .filter(PMChecklist.id == payload.checklist_id)
        .first()
    )
    if not checklist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist not found")
    if not checklist.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Checklist has no checkpoints",
        )

    existing = (
        db.query(PMMachineAssignment)
        .filter(
            PMMachineAssignment.machine_id == payload.machine_id,
            PMMachineAssignment.checklist_id == payload.checklist_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This checklist is already assigned to the machine. Reassignment is not supported.",
        )

    checklist_item_ids = {item.id for item in checklist.items}
    payload_item_ids = {item.checklist_item_id for item in payload.items}
    invalid_ids = payload_item_ids - checklist_item_ids
    if invalid_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more checkpoints do not belong to this checklist",
        )

    items_to_assign = [item for item in payload.items if item.is_required]
    if not items_to_assign:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one required checkpoint must be assigned to the machine",
        )

    for config in items_to_assign:
        validate_assignment_frequency(
            config.frequency_type,
            config.interval_value,
            config.interval_unit,
            config.trigger_hours,
        )

    assignment = PMMachineAssignment(
        machine_id=payload.machine_id,
        checklist_id=payload.checklist_id,
        assigned_by=payload.assigned_by,
    )
    db.add(assignment)
    db.flush()

    for config in items_to_assign:
        assignment_item = PMAssignmentItem(
            assignment_id=assignment.id,
            checklist_item_id=config.checklist_item_id,
            is_required=True,
            is_compulsory=bool(config.is_compulsory),
            frequency_type=config.frequency_type,
            interval_value=config.interval_value,
            interval_unit=config.interval_unit,
            trigger_hours=config.trigger_hours,
        )
        db.add(assignment_item)
        db.flush()
        start_date = assignment.assigned_at.date() if assignment.assigned_at else date.today()
        create_initial_schedule(db, assignment_item, start_date=start_date)

    db.commit()

    return (
        db.query(PMMachineAssignment)
        .options(
            joinedload(PMMachineAssignment.checklist),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.checklist_item),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.schedule),
        )
        .filter(PMMachineAssignment.id == assignment.id)
        .first()
    )


@router.get("/assignments", response_model=List[PMMachineAssignmentWithDetails])
def get_all_assignments(
    machine_id: Optional[int] = None,
    checklist_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """All assignments with checklist + items + schedules in one response (avoids N+1)."""
    query = (
        db.query(PMMachineAssignment)
        .options(
            joinedload(PMMachineAssignment.checklist),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.checklist_item),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.schedule),
        )
    )
    if machine_id is not None:
        query = query.filter(PMMachineAssignment.machine_id == machine_id)
    if checklist_id is not None:
        query = query.filter(PMMachineAssignment.checklist_id == checklist_id)
    return query.order_by(PMMachineAssignment.assigned_at.desc()).all()


@router.get("/assignments/{assignment_id}", response_model=PMMachineAssignmentWithDetails)
def get_assignment_by_id(assignment_id: int, db: Session = Depends(get_db)):
    assignment = (
        db.query(PMMachineAssignment)
        .options(
            joinedload(PMMachineAssignment.checklist),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.checklist_item),
            joinedload(PMMachineAssignment.assignment_items).joinedload(PMAssignmentItem.schedule),
        )
        .filter(PMMachineAssignment.id == assignment_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment


@router.get("/operator/assignments", response_model=List[PMOperatorAssignmentView])
def get_operator_assignments(
    machine_id: int,
    db: Session = Depends(get_db),
):
    """
    Operator view: flat list of assignments for a machine.
    Each assignment has checklist info once and an ordered checkpoints array
    (definition + is_required + schedule + is_due in one row per checkpoint).
    """
    return get_operator_assignments_for_machine(db, machine_id)


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)):
    assignment = db.query(PMMachineAssignment).filter(PMMachineAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    db.delete(assignment)
    db.commit()
    return None


@router.delete(
    "/assignments/{assignment_id}/items/{assignment_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_assigned_checkpoint(
    assignment_id: int,
    assignment_item_id: int,
    db: Session = Depends(get_db),
):
    """Remove one checkpoint from a machine assignment (not the whole checklist assignment)."""
    delete_assignment_item(db, assignment_id, assignment_item_id)
    return None


# =======================
# Schedule APIs
# =======================

@router.get("/machine-availability")
def get_pm_machine_availability(db: Session = Depends(get_db)):
    """Current ON/OFF windows from scheduling.machine_status for PM calendars."""
    return list(fetch_machine_availability(db).values())


@router.get("/schedules/machine/{machine_id}/due", response_model=List[DueCheckpointResponse])
def get_todays_due_checkpoints(machine_id: int, db: Session = Depends(get_db)):
    """Fetch due checkpoints for operator login screen. Empty while machine is OFF."""
    return get_due_checkpoints_for_machine(db, machine_id)


@router.get("/schedules/{schedule_id}", response_model=PMScheduleWithDetails)
def get_schedule_details(schedule_id: int, db: Session = Depends(get_db)):
    schedule = (
        db.query(PMSchedule)
        .options(
            joinedload(PMSchedule.assignment_item).joinedload(PMAssignmentItem.checklist_item),
        )
        .filter(PMSchedule.id == schedule_id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return schedule


# =======================
# Operator APIs
# =======================

@router.post("/operator/submissions", response_model=List[PMCheckpointSubmissionSchema], status_code=status.HTTP_201_CREATED)
def submit_pm_responses(payload: PMOperatorSubmitRequest, db: Session = Depends(get_db)):
    """Submit PM checkpoint responses. Each row is a completion record for supervisor/history views."""
    created: List[PMCheckpointSubmission] = []

    for item in payload.submissions:
        schedule = (
            db.query(PMSchedule)
            .options(joinedload(PMSchedule.assignment_item).joinedload(PMAssignmentItem.checklist_item))
            .filter(PMSchedule.id == item.schedule_id)
            .first()
        )
        if not schedule:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Schedule {item.schedule_id} not found")

        assignment_item = schedule.assignment_item
        if not assignment_item or assignment_item.id != item.assignment_item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="assignment_item_id does not match schedule",
            )

        checklist_item = assignment_item.checklist_item
        if not checklist_item:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checkpoint not found")

        validate_response_value(checklist_item.item_type, item.response_value)

        submission = PMCheckpointSubmission(
            schedule_id=schedule.id,
            assignment_item_id=assignment_item.id,
            operator_id=payload.operator_id,
            response_value=item.response_value,
            operator_comments=item.operator_comments,
        )
        db.add(submission)
        completion_date = date.today()
        update_schedule_on_completion(
            db,
            schedule,
            assignment_item,
            completion_date=completion_date,
        )
        created.append(submission)

    db.commit()
    for sub in created:
        db.refresh(sub)
    return created


@router.get("/submissions", response_model=List[PMCheckpointSubmissionWithDetails])
def get_all_submissions(
    machine_id: Optional[int] = None,
    operator_id: Optional[int] = None,
    checklist_id: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Admin view: all operator PM completion records with optional filters."""
    query = (
        db.query(PMCheckpointSubmission)
        .options(*SUBMISSION_DETAIL_LOAD)
    )
    if operator_id is not None:
        query = query.filter(PMCheckpointSubmission.operator_id == operator_id)
    query = apply_submission_date_filters(
        query, start_date=start_date, end_date=end_date, month=month, year=year,
    )

    submissions = query.order_by(PMCheckpointSubmission.submitted_at.desc()).all()

    if machine_id is not None or checklist_id is not None:
        submissions = [
            s for s in submissions
            if s.assignment_item
            and s.assignment_item.assignment
            and (machine_id is None or s.assignment_item.assignment.machine_id == machine_id)
            and (checklist_id is None or s.assignment_item.assignment.checklist_id == checklist_id)
        ]

    return [enrich_submission(s) for s in submissions]


@router.get("/machines/{machine_id}/submissions", response_model=List[PMCheckpointSubmissionWithDetails])
def get_submissions_by_machine(
    machine_id: int,
    operator_id: Optional[int] = None,
    checklist_id: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """All checkpoint submissions for a specific machine."""
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")

    query = (
        db.query(PMCheckpointSubmission)
        .join(PMAssignmentItem, PMCheckpointSubmission.assignment_item_id == PMAssignmentItem.id)
        .join(PMMachineAssignment, PMAssignmentItem.assignment_id == PMMachineAssignment.id)
        .filter(PMMachineAssignment.machine_id == machine_id)
        .options(*SUBMISSION_DETAIL_LOAD)
    )
    if operator_id is not None:
        query = query.filter(PMCheckpointSubmission.operator_id == operator_id)
    query = apply_submission_date_filters(
        query, start_date=start_date, end_date=end_date, month=month, year=year,
    )

    submissions = query.order_by(PMCheckpointSubmission.submitted_at.desc()).all()
    if checklist_id is not None:
        submissions = [
            s for s in submissions
            if s.assignment_item
            and s.assignment_item.assignment
            and s.assignment_item.assignment.checklist_id == checklist_id
        ]
    return [enrich_submission(s) for s in submissions]


@router.get("/operator/submissions", response_model=List[PMCheckpointSubmissionWithDetails])
def get_operator_submission_history(
    operator_id: int,
    machine_id: Optional[int] = None,
    checklist_id: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(PMCheckpointSubmission)
        .options(*SUBMISSION_DETAIL_LOAD)
        .filter(PMCheckpointSubmission.operator_id == operator_id)
    )
    query = apply_submission_date_filters(
        query, start_date=start_date, end_date=end_date, month=month, year=year,
    )

    submissions = query.order_by(PMCheckpointSubmission.submitted_at.desc()).all()
    if machine_id is not None or checklist_id is not None:
        submissions = [
            s for s in submissions
            if s.assignment_item
            and s.assignment_item.assignment
            and (machine_id is None or s.assignment_item.assignment.machine_id == machine_id)
            and (checklist_id is None or s.assignment_item.assignment.checklist_id == checklist_id)
        ]
    return [enrich_submission(s) for s in submissions]


# =======================
# Supervisor APIs
# =======================

@router.get("/supervisor/submissions", response_model=List[PMCheckpointSubmissionWithDetails])
def get_supervisor_submissions(
    machine_id: Optional[int] = None,
    operator_id: Optional[int] = None,
    checklist_id: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """Supervisor dashboard: view operator PM completion records with optional filters."""
    query = (
        db.query(PMCheckpointSubmission)
        .options(*SUBMISSION_DETAIL_LOAD)
    )
    if operator_id is not None:
        query = query.filter(PMCheckpointSubmission.operator_id == operator_id)
    query = apply_submission_date_filters(
        query, start_date=start_date, end_date=end_date, month=month, year=year,
    )
    submissions = query.order_by(PMCheckpointSubmission.submitted_at.asc()).all()

    if machine_id is not None or checklist_id is not None:
        submissions = [
            s for s in submissions
            if s.assignment_item
            and s.assignment_item.assignment
            and (machine_id is None or s.assignment_item.assignment.machine_id == machine_id)
            and (checklist_id is None or s.assignment_item.assignment.checklist_id == checklist_id)
        ]

    return [enrich_submission(s) for s in submissions]

# =======================
# Missed compulsory notifications (Admin / MC / Supervisor — PM module)
# =======================

class PMMissedAckAllBody(BaseModel):
    ids: Optional[List[int]] = Field(default=None, description="If set, only these pending ids are acknowledged")


@router.get("/missed-notifications")
def list_pm_missed_notifications(
    pending_only: bool = True,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    from DB.models.notifications import PMMissedNotification
    from DB.models.access_control import AccessUser

    q = db.query(PMMissedNotification).order_by(PMMissedNotification.created_at.desc())
    if pending_only:
        q = q.filter(PMMissedNotification.is_ack.is_(False))
    rows = q.limit(min(limit, 500)).all()

    # Resolve numeric ack_by (user id) → display name
    id_keys = set()
    for r in rows:
        if r.is_ack and r.ack_by and str(r.ack_by).isdigit():
            id_keys.add(int(r.ack_by))
    name_map = {}
    if id_keys:
        for u in db.query(AccessUser).filter(AccessUser.id.in_(id_keys)).all():
            name_map[str(u.id)] = u.user_name or f"User {u.id}"

    def ack_label(ack_by: Optional[str]) -> Optional[str]:
        if not ack_by:
            return None
        if str(ack_by).isdigit() and str(ack_by) in name_map:
            return name_map[str(ack_by)]
        return ack_by

    return [
        {
            "id": r.id,
            "assignment_item_id": r.assignment_item_id,
            "machine_id": r.machine_id,
            "checklist_id": r.checklist_id,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "item_text": r.item_text,
            "machine_label": r.machine_label,
            "checklist_name": r.checklist_name,
            "message": r.message,
            "is_ack": r.is_ack,
            "ack_by": r.ack_by,
            "ack_by_name": ack_label(r.ack_by) if r.is_ack else None,
            "ack_at": r.ack_at.isoformat() if r.ack_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/missed-notifications/ack-all")
def ack_all_pm_missed_notifications(
    ack_by: Optional[str] = None,
    body: PMMissedAckAllBody = Body(default=PMMissedAckAllBody()),
    db: Session = Depends(get_db),
):
    """Acknowledge all pending missed notifications, or a given list of ids."""
    from DB.models.notifications import PMMissedNotification
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    q = db.query(PMMissedNotification).filter(PMMissedNotification.is_ack.is_(False))
    if body.ids is not None:
        if not body.ids:
            return {"ok": True, "count": 0}
        q = q.filter(PMMissedNotification.id.in_(body.ids))
    rows = q.all()
    for row in rows:
        row.is_ack = True
        row.ack_by = ack_by or "user"
        row.ack_at = now
    db.commit()
    return {"ok": True, "count": len(rows)}


@router.post("/missed-notifications/{notification_id}/ack")
def ack_pm_missed_notification(
    notification_id: int,
    ack_by: Optional[str] = None,
    db: Session = Depends(get_db),
):
    from DB.models.notifications import PMMissedNotification
    from datetime import datetime, timezone

    row = db.query(PMMissedNotification).filter(PMMissedNotification.id == notification_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    row.is_ack = True
    row.ack_by = ack_by or "user"
    row.ack_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}

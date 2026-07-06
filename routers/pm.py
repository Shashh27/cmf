from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
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
    PMSupervisorReviewRequest,
    PMAcknowledgementRequest,
)
from services.pm_service import (
    validate_checklist_item_frequency,
    create_initial_schedule,
    review_submission,
    get_due_checkpoints_for_machine,
    get_operator_assignments_for_machine,
    delete_assignment_item,
    validate_response_value,
    enrich_submission,
    has_pending_submission,
)

router = APIRouter(prefix="/pm", tags=["Preventive Maintenance"])

SUBMISSION_DETAIL_LOAD = (
    joinedload(PMCheckpointSubmission.assignment_item).options(
        joinedload(PMAssignmentItem.checklist_item),
        joinedload(PMAssignmentItem.assignment).options(
            joinedload(PMMachineAssignment.machine),
            joinedload(PMMachineAssignment.checklist),
        ),
    ),
)


# =======================
# Checklist APIs
# =======================

@router.post("/checklists", response_model=PMChecklistWithItems, status_code=status.HTTP_201_CREATED)
def create_checklist(payload: PMChecklistCreate, db: Session = Depends(get_db)):
    """Create a PM checklist with checkpoints. Checkpoints are mandatory."""
    for item in payload.items:
        validate_checklist_item_frequency(item)

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


@router.get("/checklists", response_model=List[PMChecklistSchema])
def get_all_checklists(db: Session = Depends(get_db)):
    return db.query(PMChecklist).order_by(PMChecklist.id.desc()).all()


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
    if update_data:
        merged = PMChecklistItemCreate(
            item_text=update_data.get("item_text", db_item.item_text),
            sequence_number=update_data.get("sequence_number", db_item.sequence_number),
            item_type=update_data.get("item_type", db_item.item_type),
            expected_value=update_data.get("expected_value", db_item.expected_value),
            frequency_type=update_data.get("frequency_type", db_item.frequency_type),
            interval_value=update_data.get("interval_value", db_item.interval_value),
            interval_unit=update_data.get("interval_unit", db_item.interval_unit),
            trigger_hours=update_data.get("trigger_hours", db_item.trigger_hours),
            remarks=update_data.get("remarks", db_item.remarks),
        )
        validate_checklist_item_frequency(merged)

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
    Assign a checklist to a machine (one-time, no reassignment).
    Only checkpoints marked is_required=true are added to pm_assignment_items;
    optional (is_required=false) checkpoints are skipped and not assigned.
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
            detail="At least one checkpoint must be assigned to the machine",
        )

    assignment = PMMachineAssignment(
        machine_id=payload.machine_id,
        checklist_id=payload.checklist_id,
        assigned_by=payload.assigned_by,
    )
    db.add(assignment)
    db.flush()

    for config in items_to_assign:
        checklist_item_id = config.checklist_item_id
        assignment_item = PMAssignmentItem(
            assignment_id=assignment.id,
            checklist_item_id=checklist_item_id,
            is_required=True,
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


@router.get("/assignments", response_model=List[PMMachineAssignmentSchema])
def get_all_assignments(
    machine_id: Optional[int] = None,
    checklist_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(PMMachineAssignment)
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

@router.get("/schedules/machine/{machine_id}/due", response_model=List[DueCheckpointResponse])
def get_todays_due_checkpoints(machine_id: int, db: Session = Depends(get_db)):
    """Fetch due checkpoints for operator login screen."""
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
    """Submit PM checkpoint responses. Always creates new execution history rows."""
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

        if has_pending_submission(db, assignment_item.id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Checkpoint {assignment_item.id} already has a pending submission",
            )

        submission = PMCheckpointSubmission(
            schedule_id=schedule.id,
            assignment_item_id=assignment_item.id,
            operator_id=payload.operator_id,
            response_value=item.response_value,
            operator_comments=item.operator_comments,
            status="Submitted",
        )
        db.add(submission)
        created.append(submission)

    db.commit()
    for sub in created:
        db.refresh(sub)
    return created


@router.get("/submissions", response_model=List[PMCheckpointSubmissionWithDetails])
def get_all_submissions(
    machine_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Admin view: all checkpoint submission history."""
    query = (
        db.query(PMCheckpointSubmission)
        .options(*SUBMISSION_DETAIL_LOAD)
    )
    if status_filter:
        query = query.filter(PMCheckpointSubmission.status == status_filter)

    submissions = query.order_by(PMCheckpointSubmission.submitted_at.desc()).all()

    if machine_id is not None:
        submissions = [
            s for s in submissions
            if s.assignment_item
            and s.assignment_item.assignment
            and s.assignment_item.assignment.machine_id == machine_id
        ]

    return [enrich_submission(s) for s in submissions]


@router.get("/machines/{machine_id}/submissions", response_model=List[PMCheckpointSubmissionWithDetails])
def get_submissions_by_machine(
    machine_id: int,
    status_filter: Optional[str] = None,
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
    if status_filter:
        query = query.filter(PMCheckpointSubmission.status == status_filter)

    submissions = query.order_by(PMCheckpointSubmission.submitted_at.desc()).all()
    return [enrich_submission(s) for s in submissions]


@router.get("/operator/submissions", response_model=List[PMCheckpointSubmissionWithDetails])
def get_operator_submission_history(
    operator_id: int,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(PMCheckpointSubmission)
        .options(*SUBMISSION_DETAIL_LOAD)
        .filter(PMCheckpointSubmission.operator_id == operator_id)
    )
    if status_filter:
        query = query.filter(PMCheckpointSubmission.status == status_filter)

    submissions = query.order_by(PMCheckpointSubmission.submitted_at.desc()).all()
    return [enrich_submission(s) for s in submissions]


# =======================
# Supervisor APIs
# =======================

@router.get("/supervisor/submissions/pending", response_model=List[PMCheckpointSubmissionWithDetails])
def get_pending_submissions(
    machine_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(PMCheckpointSubmission)
        .options(*SUBMISSION_DETAIL_LOAD)
        .filter(PMCheckpointSubmission.status == "Submitted")
    )
    submissions = query.order_by(PMCheckpointSubmission.submitted_at.asc()).all()

    if machine_id is not None:
        submissions = [
            s for s in submissions
            if s.assignment_item
            and s.assignment_item.assignment
            and s.assignment_item.assignment.machine_id == machine_id
        ]

    return [enrich_submission(s) for s in submissions]


@router.post("/supervisor/submissions/{submission_id}/review", response_model=PMCheckpointSubmissionSchema)
def review_checkpoint_submission(
    submission_id: int,
    payload: PMSupervisorReviewRequest,
    db: Session = Depends(get_db),
):
    """Supervisor approves or rejects a submitted checkpoint in one call."""
    submission = (
        db.query(PMCheckpointSubmission)
        .options(
            joinedload(PMCheckpointSubmission.schedule),
            joinedload(PMCheckpointSubmission.assignment_item).joinedload(PMAssignmentItem.checklist_item),
        )
        .filter(PMCheckpointSubmission.id == submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    review_submission(
        db,
        submission,
        supervisor_id=payload.supervisor_id,
        decision=payload.decision,
        supervisor_comments=payload.supervisor_comments,
    )

    db.commit()
    db.refresh(submission)
    return submission


# =======================
# Acknowledgement APIs
# =======================

@router.post("/acknowledgements/supervisor/{submission_id}", response_model=PMCheckpointSubmissionSchema)
def supervisor_acknowledge_submission(
    submission_id: int,
    payload: PMAcknowledgementRequest,
    db: Session = Depends(get_db),
):
    submission = db.query(PMCheckpointSubmission).filter(PMCheckpointSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if submission.status not in ("Approved", "Rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supervisor acknowledgement is only allowed after review",
        )
    if submission.supervisor_id and submission.supervisor_id != payload.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the reviewing supervisor can acknowledge",
        )

    submission.supervisor_acknowledged = True
    submission.supervisor_acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission


@router.post("/acknowledgements/operator/{submission_id}", response_model=PMCheckpointSubmissionSchema)
def operator_acknowledge_review(
    submission_id: int,
    payload: PMAcknowledgementRequest,
    db: Session = Depends(get_db),
):
    submission = db.query(PMCheckpointSubmission).filter(PMCheckpointSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if submission.status != "Rejected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operator acknowledgement applies to rejected submissions",
        )
    if submission.operator_id != payload.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the submitting operator can acknowledge",
        )

    submission.operator_acknowledged = True
    submission.operator_acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission

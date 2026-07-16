from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from DB import AccessUser as AccessUserModel, Machine
from DB.database import get_db
from DB.models.notifications import MachineOperatorAssignmentNotification
from DB.schemas.notifications_pydantic import (
    MachineOperatorAssignmentNotificationResponse,
    NotificationReadUpdate,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _machine_label(machine: Optional[Machine]) -> Optional[str]:
    if not machine:
        return None
    parts = [machine.make or "", machine.model or ""]
    label = " ".join(p for p in parts if p).strip()
    return label or f"Machine #{machine.id}"


def _to_response(
    notification: MachineOperatorAssignmentNotification,
    db: Session,
) -> MachineOperatorAssignmentNotificationResponse:
    machine = db.query(Machine).filter(Machine.id == notification.machine_id).first()
    assigned_by = (
        db.query(AccessUserModel).filter(AccessUserModel.id == notification.assigned_by_id).first()
        if notification.assigned_by_id
        else None
    )
    return MachineOperatorAssignmentNotificationResponse(
        id=notification.id,
        operator_id=notification.operator_id,
        machine_id=notification.machine_id,
        assignment_id=notification.assignment_id,
        shift_date=notification.shift_date,
        action=notification.action,
        message=notification.message,
        assigned_by_id=notification.assigned_by_id,
        assigned_by_name=assigned_by.user_name if assigned_by else None,
        machine_label=_machine_label(machine),
        is_read=notification.is_read,
        created_at=notification.created_at,
    )


@router.get(
    "/operator/{operator_id}",
    response_model=List[MachineOperatorAssignmentNotificationResponse],
)
def get_operator_notifications(
    operator_id: int,
    unread_only: bool = Query(False, description="Return only unread notifications"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List in-app notifications for an operator (e.g. machine assignment alerts)."""
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == operator_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")

    query = (
        db.query(MachineOperatorAssignmentNotification)
        .filter(MachineOperatorAssignmentNotification.operator_id == operator_id)
        .order_by(MachineOperatorAssignmentNotification.created_at.desc())
    )
    if unread_only:
        query = query.filter(MachineOperatorAssignmentNotification.is_read.is_(False))

    notifications = query.limit(limit).all()
    return [_to_response(n, db) for n in notifications]


@router.get("/operator/{operator_id}/unread-count")
def get_operator_unread_count(operator_id: int, db: Session = Depends(get_db)):
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == operator_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")

    count = (
        db.query(MachineOperatorAssignmentNotification)
        .filter(
            MachineOperatorAssignmentNotification.operator_id == operator_id,
            MachineOperatorAssignmentNotification.is_read.is_(False),
        )
        .count()
    )
    return {"operator_id": operator_id, "unread_count": count}


@router.patch(
    "/{notification_id}/read",
    response_model=MachineOperatorAssignmentNotificationResponse,
)
def mark_notification_read(
    notification_id: int,
    payload: NotificationReadUpdate,
    db: Session = Depends(get_db),
):
    notification = (
        db.query(MachineOperatorAssignmentNotification)
        .filter(MachineOperatorAssignmentNotification.id == notification_id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = payload.is_read
    db.commit()
    db.refresh(notification)
    return _to_response(notification, db)

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import MachineNotification as MachineNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.configuration import Machine
from sqlalchemy import text
from DB.schemas.notifications import (
    MachineNotification as MachineNotificationSchema,
    MachineNotificationCreate as MachineNotificationCreateSchema,
    MachineNotificationWithDetails,
)

router = APIRouter(prefix="/machine-notifications", tags=["notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


@router.get("/", response_model=List[MachineNotificationWithDetails])
def list_machine_notifications(db: Session = Depends(get_db)):
    notifications = db.query(MachineNotificationModel).order_by(MachineNotificationModel.id.desc()).all()
    breakdown_ids = [n.machine_breakdown_id for n in notifications]
    breakdown_map = {}
    machine_ids = set()
    operator_ids = set()
    if breakdown_ids:
        rows = db.execute(
            text("""
                SELECT id, machine_id, machine_status, issue_category, issues_reason, created_at, operator_id
                FROM maintenance.machine_breakdowns
                WHERE id = ANY(:ids)
            """),
            {"ids": breakdown_ids},
        ).fetchall()
        for r in rows:
            breakdown_map[int(r[0])] = {
                "machine_id": r[1],
                "machine_status": r[2],
                "issue_category": r[3],
                "issues_reason": r[4],
                "created_at": r[5],
                "operator_id": r[6],
            }
            if r[1] is not None:
                machine_ids.add(int(r[1]))
            if r[6] is not None:
                operator_ids.add(int(r[6]))
    machines = []
    if machine_ids:
        machines = db.query(Machine).filter(Machine.id.in_(list(machine_ids))).all()
    machine_map = {m.id: m for m in machines}
    operators = []
    if operator_ids:
        operators = db.query(AccessUserModel).filter(AccessUserModel.id.in_(list(operator_ids))).all()
    operator_map = {u.id: u for u in operators}
    response: List[MachineNotificationWithDetails] = []
    for n in notifications:
        bd = breakdown_map.get(n.machine_breakdown_id, {})
        m = machine_map.get(bd.get("machine_id"))
        op = operator_map.get(bd.get("operator_id"))
        response.append(MachineNotificationWithDetails(
            id=n.id,
            machine_breakdown_id=n.machine_breakdown_id,
            is_ack=n.is_ack,
            ack_by=n.ack_by,
            ack_at=n.ack_at,
            created_at=n.created_at,
            updated_at=n.updated_at,
            machine_name=getattr(m, "make", None) if m else None,
            machine_status=bd.get("machine_status"),
            issue_category=bd.get("issue_category"),
            issues_reason=bd.get("issues_reason"),
            created_by=getattr(op, "user_name", None) if op else None,
        ))
    return response


@router.get("/pending", response_model=List[MachineNotificationSchema])
def list_pending_machine_notifications(db: Session = Depends(get_db)):
    return db.query(MachineNotificationModel).filter(MachineNotificationModel.is_ack == False).order_by(MachineNotificationModel.id.desc()).all()  # noqa: E712


@router.post("/", response_model=MachineNotificationSchema, status_code=status.HTTP_201_CREATED)
def create_machine_notification(payload: MachineNotificationCreateSchema, db: Session = Depends(get_db)):
    notif = MachineNotificationModel(machine_breakdown_id=payload.machine_breakdown_id, is_ack=False)
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.put("/{notification_id}/ack", response_model=MachineNotificationSchema)
def acknowledge_machine_notification(notification_id: int, db: Session = Depends(get_db)):
    notif = db.query(MachineNotificationModel).filter(MachineNotificationModel.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notif.is_ack:
        notif.is_ack = True
        notif.ack_by = get_admin_username(db)
        notif.ack_at = datetime.now(IST)
        db.add(notif)
        db.commit()
        db.refresh(notif)
    return notif

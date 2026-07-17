from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import MachineNotification as MachineNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.configuration import Machine
from sqlalchemy import text
from sqlalchemy.sql import bindparam
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
def list_machine_notifications(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    admin_id: Optional[int] = None,
    pc_id: Optional[int] = None,
    mc_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(MachineNotificationModel)
    if start_date:
        q = q.filter(MachineNotificationModel.created_at >= start_date)
    if end_date:
        q = q.filter(MachineNotificationModel.created_at <= end_date)
    notifications = q.order_by(MachineNotificationModel.id.desc()).all()
    breakdown_ids = [n.machine_breakdown_id for n in notifications]
    breakdown_map = {}
    machine_ids = set()
    operator_ids = set()
    if breakdown_ids:
        stmt = text("""
            SELECT id, machine_id, machine_status, issue_category, issue_reason, reported_by
            FROM maintenance.machine_breakdown
            WHERE id IN :ids
        """).bindparams(bindparam("ids", expanding=True))
        rows = db.execute(stmt, {"ids": breakdown_ids}).fetchall()
        for r in rows:
            breakdown_map[int(r[0])] = {
                "machine_id": r[1],
                "machine_status": r[2],
                "issue_category": r[3],
                "issues_reason": r[4],
                "reported_by": r[5],
            }
            if r[1] is not None:
                machine_ids.add(int(r[1]))
            if r[5] is not None:
                operator_ids.add(int(r[5]))
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
        op = operator_map.get(bd.get("reported_by"))
        # Filter based on role IDs - for machine breakdowns, filter by reported_by
        # Skip if breakdown not found and role filtering is requested
        if (mc_id or pc_id or admin_id) and not bd:
            continue
        if mc_id and bd.get("reported_by") != mc_id:
            continue
        if pc_id and bd.get("reported_by") != pc_id:
            continue
        if admin_id and bd.get("reported_by") != admin_id:
            continue
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
def list_pending_machine_notifications(
    admin_id: Optional[int] = None,
    pc_id: Optional[int] = None,
    mc_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(MachineNotificationModel).filter(MachineNotificationModel.is_ack == False)  # noqa: E712
    notifications = q.order_by(MachineNotificationModel.id.desc()).all()
    breakdown_ids = [n.machine_breakdown_id for n in notifications]
    if not breakdown_ids:
        return []
    stmt = text("""
        SELECT id, reported_by
        FROM maintenance.machine_breakdown
        WHERE id IN :ids
    """).bindparams(bindparam("ids", expanding=True))
    rows = db.execute(stmt, {"ids": breakdown_ids}).fetchall()
    breakdown_map = {int(r[0]): r[1] for r in rows}
    result = []
    for n in notifications:
        reported_by = breakdown_map.get(n.machine_breakdown_id)
        # Filter based on role IDs - skip if breakdown not found and role filtering is requested
        if (mc_id or pc_id or admin_id) and reported_by is None:
            continue
        if mc_id and reported_by != mc_id:
            continue
        if pc_id and reported_by != pc_id:
            continue
        if admin_id and reported_by != admin_id:
            continue
        result.append(n)
    return result




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

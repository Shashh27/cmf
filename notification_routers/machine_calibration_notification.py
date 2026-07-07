from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import MachineCalibrationNotification as MachineCalibrationNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.configuration import Machine, workcenter
from DB.schemas.notifications import (
    MachineCalibrationNotification as MachineCalibrationNotificationSchema,
    MachineCalibrationNotificationWithDetails,
)

router = APIRouter(prefix="/machine-calibration-notifications", tags=["notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


def _generate_due_calibration_notifications(db: Session):
    try:
        rows = db.execute(text("""
            SELECT id, calibration_due_date
            FROM configuration.machines
            WHERE calibration_due_date IS NOT NULL
              AND calibration_due_date::date >= CURRENT_DATE
              AND calibration_due_date::date <= (CURRENT_DATE + INTERVAL '10 days')
        """)).fetchall()
        for r in rows:
            machine_id = int(r[0])
            exists = db.query(MachineCalibrationNotificationModel)\
                .filter(MachineCalibrationNotificationModel.machine_id == machine_id).first()
            if exists:
                continue
            notif = MachineCalibrationNotificationModel(machine_id=machine_id, is_ack=False)
            db.add(notif)
        db.commit()
    except Exception:
        db.rollback()


@router.get("/", response_model=List[MachineCalibrationNotificationWithDetails])
def list_machine_calibration_notifications(
    mc_id: int | None = None,
    pc_id: int | None = None,
    admin_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    db: Session = Depends(get_db),
):
    # Note: Notifications are now generated automatically by the scheduler
    # This endpoint only retrieves existing notifications
    q = db.query(MachineCalibrationNotificationModel)
    if start_date:
        q = q.filter(MachineCalibrationNotificationModel.created_at >= start_date)
    if end_date:
        q = q.filter(MachineCalibrationNotificationModel.created_at <= end_date)
    notifications = q.order_by(MachineCalibrationNotificationModel.id.desc()).all()
    machine_ids = [n.machine_id for n in notifications]
    machines = db.query(Machine).filter(Machine.id.in_(machine_ids)).all() if machine_ids else []
    machine_map = {m.id: m for m in machines}
    work_center_ids = {m.work_center_id for m in machines if m.work_center_id is not None}
    work_centers = db.query(workcenter).filter(workcenter.id.in_(list(work_center_ids))).all() if work_center_ids else []
    wc_map = {wc.id: wc for wc in work_centers}
    response: List[MachineCalibrationNotificationWithDetails] = []
    for n in notifications:
        m = machine_map.get(n.machine_id)
        wc = wc_map.get(getattr(m, "work_center_id", None)) if m else None
        # Filter based on role IDs - for machine calibration, filter by machine's user_id
        machine_user_id = getattr(m, "user_id", None) if m else None
        if mc_id and machine_user_id != mc_id:
            continue
        if pc_id and machine_user_id != pc_id:
            continue
        if admin_id and machine_user_id != admin_id:
            continue
        response.append(MachineCalibrationNotificationWithDetails(
            id=n.id,
            machine_id=n.machine_id,
            is_ack=n.is_ack,
            ack_by=n.ack_by,
            ack_at=n.ack_at,
            created_at=n.created_at,
            updated_at=n.updated_at,
            machine_name=getattr(m, "make", None) if m else None,
            type=getattr(m, "type", None) if m else None,
            work_center_name=getattr(wc, "work_center_name", None) if wc else None,
            model=getattr(m, "model", None) if m else None,
            calibration_date=getattr(m, "calibration_date", None) if m else None,
            calibration_due_date=getattr(m, "calibration_due_date", None) if m else None,
            calibration_frequency=getattr(m, "calibration_frequency", None) if m else None,
            created_by=None,
        ))
    return response


@router.get("/pending", response_model=List[MachineCalibrationNotificationSchema])
def list_pending_machine_calibration_notifications(
    mc_id: int | None = None,
    pc_id: int | None = None,
    admin_id: int | None = None,
    db: Session = Depends(get_db)
):
    q = db.query(MachineCalibrationNotificationModel).filter(MachineCalibrationNotificationModel.is_ack == False)  # noqa: E712
    notifications = q.order_by(MachineCalibrationNotificationModel.id.desc()).all()
    machine_ids = [n.machine_id for n in notifications]
    if not machine_ids:
        return []
    machines = db.query(Machine).filter(Machine.id.in_(machine_ids)).all()
    machine_map = {m.id: m for m in machines}
    result = []
    for n in notifications:
        m = machine_map.get(n.machine_id)
        machine_user_id = getattr(m, "user_id", None) if m else None
        # Filter based on role IDs
        if mc_id and machine_user_id != mc_id:
            continue
        if pc_id and machine_user_id != pc_id:
            continue
        if admin_id and machine_user_id != admin_id:
            continue
        result.append(n)
    return result


@router.post("/generate", response_model=dict)
def generate_calibration_notifications_manually(db: Session = Depends(get_db)):
    """
    Manually trigger calibration notification generation.
    Useful for testing or immediate notification creation.
    """
    try:
        _generate_due_calibration_notifications(db)
        return {"message": "Calibration notifications generated successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating notifications: {str(e)}"
        )




@router.put("/{notification_id}/ack", response_model=MachineCalibrationNotificationSchema)
def acknowledge_machine_calibration_notification(notification_id: int, db: Session = Depends(get_db)):
    notif = db.query(MachineCalibrationNotificationModel).filter(MachineCalibrationNotificationModel.id == notification_id).first()
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

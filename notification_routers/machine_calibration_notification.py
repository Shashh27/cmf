from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import MachineCalibrationNotification as MachineCalibrationNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.configuration import Machine, WorkCenter
from DB.schemas.notifications import (
    MachineCalibrationNotification as MachineCalibrationNotificationSchema,
    MachineCalibrationNotificationCreate as MachineCalibrationNotificationCreateSchema,
    MachineCalibrationNotificationWithDetails,
)

router = APIRouter(prefix="/machine-calibration-notifications", tags=["notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


@router.get("/", response_model=List[MachineCalibrationNotificationWithDetails])
def list_machine_calibration_notifications(db: Session = Depends(get_db)):
    notifications = db.query(MachineCalibrationNotificationModel).order_by(MachineCalibrationNotificationModel.id.desc()).all()
    machine_ids = [n.machine_id for n in notifications]
    machines = db.query(Machine).filter(Machine.id.in_(machine_ids)).all() if machine_ids else []
    machine_map = {m.id: m for m in machines}
    work_center_ids = {m.work_center_id for m in machines if m.work_center_id is not None}
    work_centers = db.query(WorkCenter).filter(WorkCenter.id.in_(list(work_center_ids))).all() if work_center_ids else []
    wc_map = {wc.id: wc for wc in work_centers}
    response: List[MachineCalibrationNotificationWithDetails] = []
    for n in notifications:
        m = machine_map.get(n.machine_id)
        wc = wc_map.get(getattr(m, "work_center_id", None)) if m else None
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
            created_by=None,
        ))
    return response


@router.get("/pending", response_model=List[MachineCalibrationNotificationSchema])
def list_pending_machine_calibration_notifications(db: Session = Depends(get_db)):
    return db.query(MachineCalibrationNotificationModel).filter(MachineCalibrationNotificationModel.is_ack == False).order_by(MachineCalibrationNotificationModel.id.desc()).all()  # noqa: E712


@router.post("/", response_model=MachineCalibrationNotificationSchema, status_code=status.HTTP_201_CREATED)
def create_machine_calibration_notification(payload: MachineCalibrationNotificationCreateSchema, db: Session = Depends(get_db)):
    notif = MachineCalibrationNotificationModel(machine_id=payload.machine_id, is_ack=False)
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/generate", response_model=List[MachineCalibrationNotificationSchema])
def generate_due_calibration_notifications(db: Session = Depends(get_db)):
    """
    Create notifications for machines whose calibration_due_date is within the next 10 days
    and for which a notification does not already exist (unacknowledged).
    """
    now_ist = datetime.now(IST)
    # Fetch machines due within 10 days using raw SQL to avoid cross-model dependencies
    # Assumes configuration.machines has id, calibration_due_date (timestamp)
    rows = db.execute(text("""
        SELECT id, calibration_due_date
        FROM configuration.machines
        WHERE calibration_due_date IS NOT NULL
          AND calibration_due_date::date - INTERVAL '10 days' <= CURRENT_DATE
    """)).fetchall()

    created = []
    for r in rows:
        machine_id = int(r[0])
        # Check if an unacknowledged notification already exists
        exists = db.query(MachineCalibrationNotificationModel)\
            .filter(MachineCalibrationNotificationModel.machine_id == machine_id,
                    MachineCalibrationNotificationModel.is_ack == False).first()  # noqa: E712
        if exists:
            continue
        notif = MachineCalibrationNotificationModel(machine_id=machine_id, is_ack=False)
        db.add(notif)
        db.flush()
        created.append(notif)
    db.commit()
    for n in created:
        db.refresh(n)
    return created


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

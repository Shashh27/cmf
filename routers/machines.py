from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.configuration import Machine as MachineModel, WorkCenter as WorkCenterModel
from DB.schemas.configuration import (
    Machine,
    MachineCreate,
    MachineUpdate,
    MachineWithWorkCenter,
    MachinePublic,
    MachineWithWorkCenterPublic,
)
from DB.models.notifications import MachineCalibrationNotification as MachineCalibrationNotificationModel

router = APIRouter(
    prefix="/machines",
    tags=["machines"]
)


@router.post("/", response_model=MachinePublic, status_code=status.HTTP_201_CREATED)
def create_machine(machine: MachineCreate, db: Session = Depends(get_db)):
    """Create a new machine"""
    # Check if work center exists
    work_center = db.query(WorkCenterModel).filter(WorkCenterModel.id == machine.work_center_id).first()
    if not work_center:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Work center with id {machine.work_center_id} not found"
        )

    db_machine = MachineModel(**machine.model_dump())
    db.add(db_machine)
    db.commit()
    db.refresh(db_machine)

    # Create calibration notification immediately if due within 10 days
    try:
        if db_machine.calibration_due_date:
            IST = timezone(timedelta(hours=5, minutes=30))
            now_ist = datetime.now(IST)
            # Assume calibration_due_date stored as naive or aware; handle both
            due = db_machine.calibration_due_date
            if hasattr(due, "tzinfo") and due.tzinfo is not None:
                due_dt = due.astimezone(IST)
            else:
                due_dt = due.replace(tzinfo=IST)
            if (due_dt - now_ist).days <= 10:
                exists = db.query(MachineCalibrationNotificationModel)\
                    .filter(MachineCalibrationNotificationModel.machine_id == db_machine.id,
                            MachineCalibrationNotificationModel.is_ack == False).first()  # noqa: E712
                if not exists:
                    notif = MachineCalibrationNotificationModel(machine_id=db_machine.id, is_ack=False)
                    db.add(notif)
                    db.commit()
    except Exception:
        db.rollback()
        # Non-blocking: machine creation should not fail if notification fails
    return db_machine


@router.get("/", response_model=List[MachinePublic])
def get_machines(db: Session = Depends(get_db)):
    """Get all machines"""
    return db.query(MachineModel).order_by(MachineModel.id.asc()).all()


@router.get("/with-work-center", response_model=List[MachineWithWorkCenterPublic])
def get_machines_with_work_center(db: Session = Depends(get_db)):
    """Get all machines with their work center information"""
    return db.query(MachineModel).join(WorkCenterModel).order_by(MachineModel.id.asc()).all()


@router.get("/verify", response_model=MachinePublic)
def verify_machine(machine_id: int, password: str, db: Session = Depends(get_db)):
    """Verify machine ID and password and return machine details if valid"""
    machine = db.query(MachineModel).filter(
        MachineModel.id == machine_id,
        MachineModel.password == password
    ).first()
    
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid machine ID or password"
        )
    return machine


@router.get("/{machine_id}", response_model=MachinePublic)
def get_machine(machine_id: int, db: Session = Depends(get_db)):
    """Get a specific machine by ID"""
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    return machine


@router.get("/{machine_id}/with-work-center", response_model=MachineWithWorkCenterPublic)
def get_machine_with_work_center(machine_id: int, db: Session = Depends(get_db)):
    """Get a specific machine with its work center information"""
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    return machine


@router.put("/{machine_id}", response_model=MachinePublic)
def update_machine(machine_id: int, machine: MachineUpdate, db: Session = Depends(get_db)):
    """Update a machine"""
    db_machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not db_machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    update_data = machine.model_dump(exclude_unset=True)
    
    # Check if work_center_id is being updated and if the new work center exists
    if 'work_center_id' in update_data:
        work_center = db.query(WorkCenterModel).filter(WorkCenterModel.id == update_data['work_center_id']).first()
        if not work_center:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Work center with id {update_data['work_center_id']} not found"
            )

    for field, value in update_data.items():
        setattr(db_machine, field, value)

    db.commit()
    db.refresh(db_machine)
    return db_machine


@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_machine(machine_id: int, db: Session = Depends(get_db)):
    """Delete a machine"""
    db_machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not db_machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    # Delete related machine_status records to avoid foreign key violation
    # Note: machine_status table exists in DB but not in models
    try:
        with db.begin_nested():
            db.execute(text("DELETE FROM scheduling.machine_status WHERE machine_id = :id"), {"id": machine_id})
    except Exception:
        # Fallback to unqualified table name for environments where scheduling is in search_path
        try:
            with db.begin_nested():
                db.execute(text("DELETE FROM machine_status WHERE machine_id = :id"), {"id": machine_id})
        except Exception as e2:
            print(f"Warning: Could not delete from machine_status: {e2}")

    # Set machine_id to NULL in operations table if referenced
    try:
        with db.begin_nested():
             db.execute(text("UPDATE oms.operations SET machine_id = NULL WHERE machine_id = :id"), {"id": machine_id})
    except Exception as e3:
        print(f"Warning: Could not update operations: {e3}")

    db.delete(db_machine)
    db.commit()
    return None


@router.get("/work-center/{work_center_id}", response_model=List[Machine])
def get_machines_by_work_center(work_center_id: int, db: Session = Depends(get_db)):
    """Get all machines for a specific work center"""
    # Check if work center exists
    work_center = db.query(WorkCenterModel).filter(WorkCenterModel.id == work_center_id).first()
    if not work_center:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work center with id {work_center_id} not found"
        )
    
    machines = db.query(MachineModel).filter(MachineModel.work_center_id == work_center_id).all()
    return machines

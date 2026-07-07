from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

from DB.database import get_db
from DB.models.configuration import Machine as MachineModel, workcenter as workcenterModel
from DB.schemas.configuration import (
    Machine,
    MachineCreate,
    MachineUpdate,
    MachineWithworkcenter,
    MachinePublic,
    MachinePublicWithStatus,
    MachineWithworkcenterPublic,
)
from DB.models.notifications import MachineCalibrationNotification as MachineCalibrationNotificationModel

router = APIRouter(
    prefix="/machines",
    tags=["machines"]
)


def calculate_due_date(calibration_date: datetime, frequency: str) -> Optional[datetime]:
    """
    Calculate calibration due date based on calibration date and frequency.
    Frequency format: 'X days', 'X months', or 'X years'
    """
    if not calibration_date or not frequency:
        return None

    try:
        # Parse frequency string (e.g., '6 months', '1 year', '2 years', '30 days')
        parts = frequency.lower().split()
        if len(parts) != 2:
            return None

        value = int(parts[0])
        unit = parts[1]

        if 'day' in unit:
            return calibration_date + relativedelta(days=value)
        elif 'month' in unit:
            return calibration_date + relativedelta(months=value)
        elif 'year' in unit:
            return calibration_date + relativedelta(years=value)
        else:
            return None
    except (ValueError, IndexError):
        return None


@router.post("/", response_model=MachinePublic, status_code=status.HTTP_201_CREATED)
def create_machine(machine: MachineCreate, db: Session = Depends(get_db)):
    """Create a new machine"""
    # Check if work center exists
    work_center = db.query(workcenterModel).filter(workcenterModel.id == machine.work_center_id).first()
    if not work_center:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Work center with id {machine.work_center_id} not found"
        )

    # Auto-calculate calibration_due_date if calibration_date and frequency are provided
    machine_data = machine.model_dump()
    if machine_data.get('calibration_date') and machine_data.get('calibration_frequency'):
        calculated_due_date = calculate_due_date(
            machine_data['calibration_date'],
            machine_data['calibration_frequency']
        )
        if calculated_due_date:
            machine_data['calibration_due_date'] = calculated_due_date

    db_machine = MachineModel(**machine_data)
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


@router.get("/", response_model=List[MachinePublicWithStatus])
def get_machines(db: Session = Depends(get_db)):
    """Get all machines with live status and work center name"""
    query = text("""
        SELECT
            m.id, m.work_center_id, m.type, m.make, m.model,
            m.year_of_installation, m.cnc_controller, m.cnc_controller_service,
            m.remarks, m.mhr, m.calibration_date, m.calibration_due_date,
            m.calibration_frequency,
            UPPER(mls.status) AS machine_state,
            wc.work_center_name AS work_center_name
        FROM configuration.machines m
        LEFT JOIN production_monitoring.machine_live_status mls ON mls.machine_id = m.id
        LEFT JOIN configuration.work_centers wc ON wc.id = m.work_center_id
        ORDER BY m.id ASC
    """)
    rows = db.execute(query).mappings().all()
    return [MachinePublicWithStatus(**dict(row)) for row in rows]


@router.get("/with-workcenter", response_model=List[MachineWithworkcenterPublic])
def get_machines_with_work_center(db: Session = Depends(get_db)):
    """Get all machines with their work center information"""
    return db.query(MachineModel).join(workcenterModel).order_by(MachineModel.id.asc()).all()


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


@router.get("/{machine_id}/with-workcenter", response_model=MachineWithworkcenterPublic)
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
        work_center = db.query(workcenterModel).filter(workcenterModel.id == update_data['work_center_id']).first()
        if not work_center:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Work center with id {update_data['work_center_id']} not found"
            )

    # Auto-calculate calibration_due_date if calibration_date or frequency is updated
    recalculate_due = False
    calibration_date = update_data.get('calibration_date') or db_machine.calibration_date
    frequency = update_data.get('calibration_frequency') or db_machine.calibration_frequency
    
    if 'calibration_date' in update_data or 'calibration_frequency' in update_data:
        if calibration_date and frequency:
            calculated_due_date = calculate_due_date(calibration_date, frequency)
            if calculated_due_date:
                update_data['calibration_due_date'] = calculated_due_date
                recalculate_due = True

    for field, value in update_data.items():
        setattr(db_machine, field, value)

    db.commit()
    db.refresh(db_machine)
    return db_machine


@router.put("/{machine_id}/calibration", response_model=MachinePublic)
def update_machine_calibration(
    machine_id: int,
    calibration_date: datetime,
    calibration_frequency: str,
    db: Session = Depends(get_db)
):
    """
    Update machine calibration date and automatically calculate next due date.
    This is used after calibration is performed to set the next due date.
    """
    db_machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not db_machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    # Update calibration date and frequency
    db_machine.calibration_date = calibration_date
    db_machine.calibration_frequency = calibration_frequency
    
    # Auto-calculate next due date
    calculated_due_date = calculate_due_date(calibration_date, calibration_frequency)
    if calculated_due_date:
        db_machine.calibration_due_date = calculated_due_date
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid frequency format. Use format like '6 months', '1 year', '2 years'"
        )

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

    try:
        db.delete(db_machine)
        db.commit()
    except IntegrityError:
        db.rollback()
        # Use available fields from the Machine model (type/model) in the message.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f'Cannot delete machine ID {db_machine.id} (type: {db_machine.type or "-"}, model: {db_machine.model or "-"}). '
                "It is still referenced by other records (for example planned schedule items). "
                "Remove or update those references first, then try again."
            ),
        )
    return None


@router.get("/workcenter/{work_center_id}", response_model=List[Machine])
def get_machines_by_work_center(work_center_id: int, db: Session = Depends(get_db)):
    """Get all machines for a specific work center"""
    # Check if work center exists
    work_center = db.query(workcenterModel).filter(workcenterModel.id == work_center_id).first()
    if not work_center:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work center with id {work_center_id} not found"
        )
    
    machines = db.query(MachineModel).filter(MachineModel.work_center_id == work_center_id).all()
    return machines

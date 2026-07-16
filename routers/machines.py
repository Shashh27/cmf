from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from typing import List

from DB.database import get_db
from DB.models.configuration import Machine as MachineModel, WorkCenter as WorkCenterModel
from DB.models.scheduling import MachineStatus, Status
from DB.schemas.configuration import Machine, MachineCreate, MachineUpdate, MachineWithWorkCenter

router = APIRouter(
    prefix="/machines",
    tags=["machines"]
)


def _clear_machine_references(db: Session, machine_id: int) -> None:
    """
    Remove or detach all rows that reference this machine so it can be deleted.
    Safe when the machine is unused / not part of the live schedule.
    """
    cleanup_statements = [
        ("DELETE FROM scheduling.machine_status WHERE machine_id = :id", {}),
        ("DELETE FROM scheduling.machine_downtimes WHERE machine_id = :id", {}),
        ("DELETE FROM scheduling.machine_operator_shift_assignment WHERE machine_id = :id", {}),
        ("DELETE FROM scheduling.machine_schedule WHERE machine_id = :id", {}),
        ("DELETE FROM scheduling.planned_schedule_items WHERE machine_id = :id", {}),
        ("DELETE FROM scheduling.rescheduling_items WHERE machine_id = :id", {}),
        ("UPDATE scheduling.production_logs SET machine_id = NULL WHERE machine_id = :id", {}),
        ("UPDATE oms.operations SET machine_id = NULL WHERE machine_id = :id", {}),
        (
            "DELETE FROM notifications.machine_calibration_notification "
            "WHERE machine_id = :id",
            {},
        ),
    ]

    params = {"id": machine_id}
    for sql, extra in cleanup_statements:
        try:
            with db.begin_nested():
                db.execute(text(sql), {**params, **extra})
        except Exception as exc:
            print(f"Warning: machine {machine_id} cleanup step failed ({sql[:60]}...): {exc}")


def _machine_reference_counts(db: Session, machine_id: int) -> dict:
    """Return row counts per table still referencing the machine (for error detail)."""
    tables = [
        ("scheduling.planned_schedule_items", "machine_id"),
        ("scheduling.rescheduling_items", "machine_id"),
        ("scheduling.production_logs", "machine_id"),
        ("scheduling.machine_schedule", "machine_id"),
        ("scheduling.machine_downtimes", "machine_id"),
        ("scheduling.machine_operator_shift_assignment", "machine_id"),
        ("scheduling.machine_status", "machine_id"),
        ("oms.operations", "machine_id"),
        ("notifications.machine_calibration_notification", "machine_id"),
    ]
    counts = {}
    for table, column in tables:
        try:
            count = db.execute(
                text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :id"),
                {"id": machine_id},
            ).scalar() or 0
            if count:
                counts[table] = count
        except Exception:
            pass
    return counts


@router.post("/", response_model=Machine, status_code=status.HTTP_201_CREATED)
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

    # Find the "ON" status
    on_status = db.query(Status).filter(Status.name == "ON").first()
    if not on_status:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ON status not found in the database"
        )

    # Create initial machine status entry
    machine_status = MachineStatus(
        machine_id=db_machine.id,
        status_id=on_status.id,
        description="initial status",
        available_from=None,
        available_to=None
    )
    db.add(machine_status)
    db.commit()

    return db_machine


@router.get("/", response_model=List[Machine])
def get_machines(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all machines with pagination"""
    machines = db.query(MachineModel).offset(skip).limit(limit).all()
    return machines


@router.get("/with-work-center", response_model=List[MachineWithWorkCenter])
def get_machines_with_work_center(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all machines with their work center information"""
    machines = db.query(MachineModel).join(WorkCenterModel).offset(skip).limit(limit).all()
    return machines


@router.get("/{machine_id}", response_model=Machine)
def get_machine(machine_id: int, db: Session = Depends(get_db)):
    """Get a specific machine by ID"""
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    return machine


@router.get("/{machine_id}/with-work-center", response_model=MachineWithWorkCenter)
def get_machine_with_work_center(machine_id: int, db: Session = Depends(get_db)):
    """Get a specific machine with its work center information"""
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    return machine


@router.put("/{machine_id}", response_model=Machine)
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
    """Delete a machine and detach it from schedule / production references."""
    db_machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not db_machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    _clear_machine_references(db, machine_id)

    try:
        db.delete(db_machine)
        db.commit()
    except IntegrityError:
        db.rollback()
        refs = _machine_reference_counts(db, machine_id)
        ref_detail = (
            ", ".join(f"{table}: {count}" for table, count in refs.items())
            if refs
            else "unknown table"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete machine ID {db_machine.id} "
                f"(type: {db_machine.type or '-'}, model: {db_machine.model or '-'}). "
                f"It is still referenced by other records ({ref_detail}). "
                "Remove or update those references first, then try again."
            ),
        )
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
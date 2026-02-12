from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.configuration import Machine as MachineModel, WorkCenter as WorkCenterModel
from DB.schemas.configuration import Machine, MachineCreate, MachineUpdate, MachineWithWorkCenter

router = APIRouter(
    prefix="/machines",
    tags=["machines"]
)


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


@router.get("/verify", response_model=Machine)
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
    """Delete a machine"""
    db_machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not db_machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

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

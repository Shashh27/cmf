from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models import ProcessPlan as ProcessPlanModel
from DB.schemas import ProcessPlan, ProcessPlanCreate, ProcessPlanUpdate

router = APIRouter(
    prefix="/process-plans",
    tags=["process-plans"]
)


@router.post("/", response_model=ProcessPlan, status_code=status.HTTP_201_CREATED)
def create_process_plan(process_plan: ProcessPlanCreate, db: Session = Depends(get_db)):
    """Create a new process plan"""
    db_process_plan = ProcessPlanModel(**process_plan.model_dump())
    db.add(db_process_plan)
    db.commit()
    db.refresh(db_process_plan)
    return db_process_plan


@router.get("/", response_model=List[ProcessPlan])
def get_process_plans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all process plans with pagination"""
    process_plans = db.query(ProcessPlanModel).offset(skip).limit(limit).all()
    return process_plans


@router.get("/{process_plan_id}", response_model=ProcessPlan)
def get_process_plan(process_plan_id: int, db: Session = Depends(get_db)):
    """Get a specific process plan by ID"""
    process_plan = db.query(ProcessPlanModel).filter(ProcessPlanModel.id == process_plan_id).first()
    if not process_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Process plan with id {process_plan_id} not found"
        )
    return process_plan


@router.get("/operation/{operation_id}", response_model=ProcessPlan)
def get_process_plan_by_operation(operation_id: int, db: Session = Depends(get_db)):
    """Get process plan for a specific operation"""
    process_plan = db.query(ProcessPlanModel).filter(ProcessPlanModel.operation_id == operation_id).first()
    if not process_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Process plan for operation id {operation_id} not found"
        )
    return process_plan


@router.put("/{process_plan_id}", response_model=ProcessPlan)
def update_process_plan(process_plan_id: int, process_plan: ProcessPlanUpdate, db: Session = Depends(get_db)):
    """Update a process plan"""
    db_process_plan = db.query(ProcessPlanModel).filter(ProcessPlanModel.id == process_plan_id).first()
    if not db_process_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Process plan with id {process_plan_id} not found"
        )

    update_data = process_plan.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_process_plan, field, value)

    db.commit()
    db.refresh(db_process_plan)
    return db_process_plan


@router.delete("/{process_plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_process_plan(process_plan_id: int, db: Session = Depends(get_db)):
    """Delete a process plan"""
    db_process_plan = db.query(ProcessPlanModel).filter(ProcessPlanModel.id == process_plan_id).first()
    if not db_process_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Process plan with id {process_plan_id} not found"
        )

    db.delete(db_process_plan)
    db.commit()
    return None
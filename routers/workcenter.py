from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models import WorkCenter as WorkCenterModel
from DB.schemas import WorkCenter, WorkCenterCreate, WorkCenterUpdate

router = APIRouter(
    prefix="/workcenters",
    tags=["workcenters"]
)


@router.post("/", response_model=WorkCenter, status_code=status.HTTP_201_CREATED)
def create_work_center(work_center: WorkCenterCreate, db: Session = Depends(get_db)):
    """Create a new work center"""
    # Check if work center with same code already exists
    db_work_center = db.query(WorkCenterModel).filter(WorkCenterModel.code == work_center.code).first()
    if db_work_center:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Work center with code {work_center.code} already exists"
        )

    db_work_center = WorkCenterModel(**work_center.model_dump())
    db.add(db_work_center)
    db.commit()
    db.refresh(db_work_center)
    return db_work_center


@router.get("/", response_model=List[WorkCenter])
def get_work_centers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all work centers with pagination"""
    work_centers = db.query(WorkCenterModel).offset(skip).limit(limit).all()
    return work_centers


@router.get("/{work_center_id}", response_model=WorkCenter)
def get_work_center(work_center_id: int, db: Session = Depends(get_db)):
    """Get a specific work center by ID"""
    work_center = db.query(WorkCenterModel).filter(WorkCenterModel.id == work_center_id).first()
    if not work_center:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work center with id {work_center_id} not found"
        )
    return work_center


@router.put("/{work_center_id}", response_model=WorkCenter)
def update_work_center(work_center_id: int, work_center: WorkCenterUpdate, db: Session = Depends(get_db)):
    """Update a work center"""
    db_work_center = db.query(WorkCenterModel).filter(WorkCenterModel.id == work_center_id).first()
    if not db_work_center:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work center with id {work_center_id} not found"
        )

    update_data = work_center.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_work_center, field, value)

    db.commit()
    db.refresh(db_work_center)
    return db_work_center


@router.delete("/{work_center_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_center(work_center_id: int, db: Session = Depends(get_db)):
    """Delete a work center"""
    db_work_center = db.query(WorkCenterModel).filter(WorkCenterModel.id == work_center_id).first()
    if not db_work_center:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work center with id {work_center_id} not found"
        )

    db.delete(db_work_center)
    db.commit()
    return None

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models import Operation as OperationModel
from DB.schemas import Operation, OperationCreate, OperationUpdate

router = APIRouter(
    prefix="/operations",
    tags=["operations"]
)


@router.post("/", response_model=Operation, status_code=status.HTTP_201_CREATED)
def create_operation(operation: OperationCreate, db: Session = Depends(get_db)):
    """Create a new operation"""
    db_operation = OperationModel(**operation.model_dump())
    db.add(db_operation)
    db.commit()
    db.refresh(db_operation)
    return db_operation


@router.get("/", response_model=List[Operation])
def get_operations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all operations with pagination"""
    operations = db.query(OperationModel).offset(skip).limit(limit).all()
    return operations


@router.get("/{operation_id}", response_model=Operation)
def get_operation(operation_id: int, db: Session = Depends(get_db)):
    """Get a specific operation by ID"""
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    return operation


@router.get("/part/{part_id}", response_model=List[Operation])
def get_operations_by_part(part_id: int, db: Session = Depends(get_db)):
    """Get all operations for a specific part"""
    operations = db.query(OperationModel).filter(OperationModel.part_id == part_id).all()
    return operations


@router.put("/{operation_id}", response_model=Operation)
def update_operation(operation_id: int, operation: OperationUpdate, db: Session = Depends(get_db)):
    """Update an operation"""
    db_operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not db_operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )

    update_data = operation.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_operation, field, value)

    db.commit()
    db.refresh(db_operation)
    return db_operation


@router.delete("/{operation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation(operation_id: int, db: Session = Depends(get_db)):
    """Delete an operation"""
    db_operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not db_operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )

    db.delete(db_operation)
    db.commit()
    return None
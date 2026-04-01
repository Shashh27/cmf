from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from DB.database import get_db
from DB.models import ProductionLog, Operation, AccessUser
from DB.schemas import (
    ProductionLogCreate,
    ProductionLogUpdate,
    ProductionLogResponse,
    ProductionLogWithDetails,
    ProductionLogStatusUpdate,
    ProductionLogStatus
)

router = APIRouter(
    prefix="/production-logs",
    tags=["production-logs"]
)

# CRUD endpoints

@router.post("/", response_model=ProductionLogResponse, status_code=status.HTTP_201_CREATED)
def create_production_log(log: ProductionLogCreate, db: Session = Depends(get_db)):
    # Verify operation exists
    operation = db.query(Operation).filter(Operation.id == log.operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {log.operation_id} not found"
        )
    
    # Verify operator exists
    operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operator with id {log.operator_id} not found"
        )
    
    db_log = ProductionLog(**log.model_dump())
    db_log.supervisor_id = None  # Force supervisor_id to null on creation
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

@router.get("/", response_model=List[ProductionLogWithDetails])
def get_all_production_logs(
    status: Optional[ProductionLogStatus] = None,
    operator_id: Optional[int] = None,
    operation_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(ProductionLog)
    
    if status:
        query = query.filter(ProductionLog.status == status)
    if operator_id:
        query = query.filter(ProductionLog.operator_id == operator_id)
    if operation_id:
        query = query.filter(ProductionLog.operation_id == operation_id)
    
    logs = query.all()
    
    # Build detailed responses with related entities
    detailed_logs = []
    for log in logs:
        operation = db.query(Operation).filter(Operation.id == log.operation_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
        supervisor = db.query(AccessUser).filter(AccessUser.id == log.supervisor_id).first() if log.supervisor_id else None
        
        response = ProductionLogWithDetails(
            id=log.id,
            operation_id=log.operation_id,
            operator_id=log.operator_id,
            supervisor_id=log.supervisor_id,
            notes=log.notes,
            from_date=log.from_date,
            from_time=log.from_time,
            to_date=log.to_date,
            to_time=log.to_time,
            status=log.status,
            created_at=log.created_at
        )
        if operation:
            response.operation = {
                "id": operation.id,
                "operation_number": operation.operation_number,
                "operation_name": operation.operation_name,
                "machine_id": operation.machine_id
            }
        if operator:
            response.operator = {
                "id": operator.id,
                "user_name": operator.user_name,
                "gmail": operator.gmail,
                "role": operator.role
            }
        if supervisor:
            response.supervisor = {
                "id": supervisor.id,
                "user_name": supervisor.user_name,
                "gmail": supervisor.gmail,
                "role": supervisor.role
            }
        detailed_logs.append(response)
    
    return detailed_logs

@router.get("/{log_id}", response_model=ProductionLogWithDetails)
def get_production_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Production log with id {log_id} not found"
        )
    
    # Get related data
    operation = db.query(Operation).filter(Operation.id == log.operation_id).first()
    operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
    supervisor = db.query(AccessUser).filter(AccessUser.id == log.supervisor_id).first() if log.supervisor_id else None
    
    # Build response manually to avoid ORM mapping issues
    response = ProductionLogWithDetails(
        id=log.id,
        operation_id=log.operation_id,
        operator_id=log.operator_id,
        supervisor_id=log.supervisor_id,
        notes=log.notes,
        from_date=log.from_date,
        from_time=log.from_time,
        to_date=log.to_date,
        to_time=log.to_time,
        status=log.status,
        created_at=log.created_at
    )
    if operation:
        response.operation = {
            "id": operation.id,
            "operation_number": operation.operation_number,
            "operation_name": operation.operation_name
        }
    if operator:
        response.operator = {
            "id": operator.id,
            "user_name": operator.user_name,
            "gmail": operator.gmail,
            "role": operator.role
        }
    if supervisor:
        response.supervisor = {
            "id": supervisor.id,
            "user_name": supervisor.user_name,
            "gmail": supervisor.gmail,
            "role": supervisor.role
        }
    
    return response

@router.put("/{log_id}", response_model=ProductionLogResponse)
def update_production_log(
    log_id: int,
    log_update: ProductionLogUpdate,
    db: Session = Depends(get_db)
):
    db_log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Production log with id {log_id} not found"
        )
    
    update_data = log_update.model_dump(exclude_unset=True)
    
    # Verify foreign keys if they are being updated
    if "operation_id" in update_data:
        operation = db.query(Operation).filter(Operation.id == update_data["operation_id"]).first()
        if not operation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Operation with id {update_data['operation_id']} not found"
            )
    
    if "operator_id" in update_data:
        operator = db.query(AccessUser).filter(AccessUser.id == update_data["operator_id"]).first()
        if not operator:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Operator with id {update_data['operator_id']} not found"
            )
    
    if "supervisor_id" in update_data:
        supervisor = db.query(AccessUser).filter(AccessUser.id == update_data["supervisor_id"]).first()
        if not supervisor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Supervisor with id {update_data['supervisor_id']} not found"
            )
    
    for field, value in update_data.items():
        setattr(db_log, field, value)
    
    db.commit()
    db.refresh(db_log)
    return db_log

@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_production_log(log_id: int, db: Session = Depends(get_db)):
    db_log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Production log with id {log_id} not found"
        )
    
    db.delete(db_log)
    db.commit()
    return None

@router.put("/{log_id}/status", response_model=ProductionLogResponse)
def update_production_log_status(
    log_id: int,
    status_update: ProductionLogStatusUpdate,
    db: Session = Depends(get_db)
):
    db_log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Production log with id {log_id} not found"
        )
    
    # Verify supervisor exists if provided
    if status_update.supervisor_id:
        supervisor = db.query(AccessUser).filter(AccessUser.id == status_update.supervisor_id).first()
        if not supervisor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Supervisor with id {status_update.supervisor_id} not found"
            )
        db_log.supervisor_id = status_update.supervisor_id
    
    db_log.status = status_update.status
    db.commit()
    db.refresh(db_log)
    return db_log

@router.get("/operator/{operator_id}", response_model=List[ProductionLogResponse])
def get_production_logs_by_operator(
    operator_id: int,
    skip: int = 0,
    status: Optional[ProductionLogStatus] = None,
    db: Session = Depends(get_db)
):
    # Verify operator exists
    operator = db.query(AccessUser).filter(AccessUser.id == operator_id).first()
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operator with id {operator_id} not found"
        )
    
    query = db.query(ProductionLog).filter(ProductionLog.operator_id == operator_id)
    
    if status:
        query = query.filter(ProductionLog.status == status)
    
    logs = query.offset(skip).all()
    return logs

@router.get("/operation/{operation_id}", response_model=List[ProductionLogResponse])
def get_production_logs_by_operation(
    operation_id: int,
    skip: int = 0,
    status: Optional[ProductionLogStatus] = None,
    db: Session = Depends(get_db)
):
    # Verify operation exists
    operation = db.query(Operation).filter(Operation.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    
    query = db.query(ProductionLog).filter(ProductionLog.operation_id == operation_id)
    
    if status:
        query = query.filter(ProductionLog.status == status)
    
    logs = query.offset(skip).all()
    return logs
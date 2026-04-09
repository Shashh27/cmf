from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from DB.database import get_db
from DB.models import ProductionLog, AccessUser, Operation
from DB.models.configuration import Machine
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
    from sqlalchemy import text
    from DB.models.oms import Operation, Part

    # Verify operation exists and get total_quantity from parts.qty via operation
    operation = db.query(Operation).filter(Operation.id == log.operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {log.operation_id} not found"
        )

    # Get total_quantity from parts.qty via the operation's part relationship
    part = db.query(Part).filter(Part.id == operation.part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part associated with operation {log.operation_id} not found"
        )

    total_quantity = part.qty or 0

    # Verify operator exists
    operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operator with id {log.operator_id} not found"
        )

    # Calculate total approved quantity
    total_approved = db.execute(text("""
        SELECT COALESCE(SUM(approved_quantity), 0)
        FROM scheduling.production_logs
        WHERE operation_id = :op_id AND approved_quantity IS NOT NULL
    """), {"op_id": log.operation_id}).scalar()

    # Calculate total produced quantity (including pending logs)
    total_produced = db.execute(text("""
        SELECT COALESCE(SUM(produced_quantity), 0)
        FROM scheduling.production_logs
        WHERE operation_id = :op_id
    """), {"op_id": log.operation_id}).scalar()

    # Validate that produced_quantity is greater than 0
    if log.produced_quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Produced quantity must be greater than 0. Provided: {log.produced_quantity}"
        )

    # Check if production is already complete
    if total_approved >= total_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Production already completed. Total approved: {total_approved}, Total quantity: {total_quantity}. No more production allowed."
        )

    # Check if total produced would exceed total_quantity
    if total_produced + log.produced_quantity > total_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot produce {log.produced_quantity} items. Current total produced: {total_produced}, Total allowed: {total_quantity}. You can only produce up to {total_quantity - total_produced} more items."
        )

    # Simple validation: operator can only produce up to remaining approved quantity
    remaining_quantity = total_quantity - total_approved
    
    if log.produced_quantity > remaining_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot produce {log.produced_quantity} items. Only {remaining_quantity} items remaining to reach total quantity of {total_quantity}. Total approved: {total_approved}."
        )

    db_log = ProductionLog(**log.model_dump())
    db_log.supervisor_id = None  # Force supervisor_id to null on creation
    db.add(db_log)
    db.commit()
    db.refresh(db_log)

    # Calculate rework_quantity for response
    if db_log.produced_quantity and db_log.approved_quantity:
        db_log.rework_quantity = db_log.produced_quantity - db_log.approved_quantity
    elif db_log.produced_quantity and not db_log.approved_quantity:
        db_log.rework_quantity = db_log.produced_quantity
    else:
        db_log.rework_quantity = 0

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
        # Get operation details directly from the operation_id
        operation = db.query(Operation).filter(Operation.id == log.operation_id).first()

        operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
        supervisor = db.query(AccessUser).filter(AccessUser.id == log.supervisor_id).first() if log.supervisor_id else None

        # Calculate rework_quantity
        rework_quantity = 0
        if log.produced_quantity and log.approved_quantity:
            rework_quantity = log.produced_quantity - log.approved_quantity
        elif log.produced_quantity and not log.approved_quantity:
            rework_quantity = log.produced_quantity

        response = ProductionLogWithDetails(
            id=log.id,
            operation_id=log.operation_id,
            operator_id=log.operator_id,
            supervisor_id=log.supervisor_id,
            notes=log.notes,
            remarks=log.remarks,
            from_date=log.from_date,
            from_time=log.from_time,
            to_date=log.to_date,
            to_time=log.to_time,
            status=log.status,
            produced_quantity=log.produced_quantity,
            approved_quantity=log.approved_quantity,
            created_at=log.created_at,
            rework_quantity=rework_quantity
        )

        # Add operation details
        if operation:
            operation_data = {
                "id": operation.id,
                "operation_number": operation.operation_number,
                "operation_name": operation.operation_name
            }

            # Get raw materials through the part relationship
            if operation.part:
                raw_materials = []
                # Check if part has a raw material stock assigned
                if operation.part.raw_material_stock and operation.part.raw_material_stock.material:
                    raw_materials.append({
                        "id": operation.part.raw_material_stock.material.id,
                        "name": operation.part.raw_material_stock.material.material_name,
                        "quantity": operation.part.raw_material_stock.quantity,
                        "unit": "kg"  # Default unit since RawMaterial doesn't have unit field
                    })
                # Also check legacy raw_material relationship
                elif operation.part.raw_material:
                    raw_materials.append({
                        "id": operation.part.raw_material.id,
                        "name": operation.part.raw_material.material_name,
                        "quantity": 1,  # Legacy field doesn't track quantity
                        "unit": "kg"  # Default unit
                    })
                operation_data["raw_materials"] = raw_materials

            response.operation = operation_data

            # Get machine details using the machine model
            if operation.machine_id:
                machine = db.query(Machine).filter(Machine.id == operation.machine_id).first()
                if machine:
                    response.machine = {
                        "id": machine.id,
                        "make": machine.make,
                        "model": machine.model
                    }

        # Add operator details
        if operator:
            response.operator = {
                "id": operator.id,
                "user_name": operator.user_name,
                "gmail": operator.gmail,
                "role": operator.role
            }

        # Add supervisor details
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

    # Get operation details directly from the operation_id
    operation = db.query(Operation).filter(Operation.id == log.operation_id).first()

    operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
    supervisor = db.query(AccessUser).filter(AccessUser.id == log.supervisor_id).first() if log.supervisor_id else None

    # Calculate rework_quantity
    rework_quantity = 0
    if log.produced_quantity and log.approved_quantity:
        rework_quantity = log.produced_quantity - log.approved_quantity
    elif log.produced_quantity and not log.approved_quantity:
        rework_quantity = log.produced_quantity

    # Build response manually to avoid ORM mapping issues
    response = ProductionLogWithDetails(
        id=log.id,
        operation_id=log.operation_id,
        operator_id=log.operator_id,
        supervisor_id=log.supervisor_id,
        notes=log.notes,
        remarks=log.remarks,
        from_date=log.from_date,
        from_time=log.from_time,
        to_date=log.to_date,
        to_time=log.to_time,
        status=log.status,
        produced_quantity=log.produced_quantity,
        approved_quantity=log.approved_quantity,
        created_at=log.created_at,
        rework_quantity=rework_quantity
    )

    # Add operation details
    if operation:
        operation_data = {
            "id": operation.id,
            "operation_number": operation.operation_number,
            "operation_name": operation.operation_name
        }

        # Get raw materials through the part relationship
        if operation.part:
            raw_materials = []
            # Check if part has a raw material stock assigned
            if operation.part.raw_material_stock and operation.part.raw_material_stock.material:
                raw_materials.append({
                    "id": operation.part.raw_material_stock.material.id,
                    "name": operation.part.raw_material_stock.material.material_name,
                    "quantity": operation.part.raw_material_stock.quantity,
                    "unit": "kg"  # Default unit since RawMaterial doesn't have unit field
                })
            # Also check legacy raw_material relationship
            elif operation.part.raw_material:
                raw_materials.append({
                    "id": operation.part.raw_material.id,
                    "name": operation.part.raw_material.material_name,
                    "quantity": 1,  # Legacy field doesn't track quantity
                    "unit": "kg"  # Default unit
                })
            operation_data["raw_materials"] = raw_materials

        response.operation = operation_data

        # Get machine details using the machine model
        if operation.machine_id:
            machine = db.query(Machine).filter(Machine.id == operation.machine_id).first()
            if machine:
                response.machine = {
                    "id": machine.id,
                    "make": machine.make,
                    "model": machine.model
                }

    # Add operator details
    if operator:
        response.operator = {
            "id": operator.id,
            "user_name": operator.user_name,
            "gmail": operator.gmail,
            "role": operator.role
        }

    # Add supervisor details
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
    
    # Prevent changing status from completed to any other status
    if db_log.status == "completed" and status_update.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot change status from 'completed' to '{status_update.status}'. Once a production log is marked as completed, its status cannot be changed."
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
    
    # Update remarks if provided
    if status_update.remarks is not None:
        db_log.remarks = status_update.remarks
    
    # Handle approved_quantity validation and automatic status determination
    if status_update.status == "completed":
        # If status is completed, user should not provide approved_quantity
        if status_update.approved_quantity is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Approved quantity should not be provided when status is set to 'completed'. It will be automatically set to equal the produced quantity."
            )
        # Automatically set approved_quantity = produced_quantity
        db_log.approved_quantity = db_log.produced_quantity
        db_log.status = "completed"
    elif status_update.status == "rework":
        # If status is rework, approved_quantity must be provided and less than produced_quantity
        if status_update.approved_quantity is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Approved quantity must be provided when status is set to rework"
            )
        
        # Validate that approved_quantity is never greater than produced_quantity
        if status_update.approved_quantity > db_log.produced_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Approved quantity ({status_update.approved_quantity}) cannot be greater than produced quantity ({db_log.produced_quantity})"
            )
        
        # For rework, approved_quantity must be less than produced_quantity
        if status_update.approved_quantity >= db_log.produced_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"For rework status, approved quantity ({status_update.approved_quantity}) must be less than produced quantity ({db_log.produced_quantity})"
            )
        
        db_log.approved_quantity = status_update.approved_quantity
        db_log.status = "rework"
    else:
        # For other statuses (like pending), handle approved_quantity if provided
        if status_update.approved_quantity is not None:
            # Validate that approved_quantity is never greater than produced_quantity
            if status_update.approved_quantity > db_log.produced_quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Approved quantity ({status_update.approved_quantity}) cannot be greater than produced quantity ({db_log.produced_quantity})"
                )
            db_log.approved_quantity = status_update.approved_quantity
        
        db_log.status = status_update.status
    
    db.commit()
    db.refresh(db_log)

    # Calculate rework_quantity for response
    if db_log.produced_quantity and db_log.approved_quantity:
        db_log.rework_quantity = db_log.produced_quantity - db_log.approved_quantity
    elif db_log.produced_quantity and not db_log.approved_quantity:
        db_log.rework_quantity = db_log.produced_quantity
    else:
        db_log.rework_quantity = 0

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
    
    # Calculate rework_quantity for each log
    for log in logs:
        if log.produced_quantity and log.approved_quantity:
            log.rework_quantity = log.produced_quantity - log.approved_quantity
        elif log.produced_quantity and not log.approved_quantity:
            log.rework_quantity = log.produced_quantity
        else:
            log.rework_quantity = 0
    
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

    # Calculate rework_quantity for each log
    for log in logs:
        if log.produced_quantity and log.approved_quantity:
            log.rework_quantity = log.produced_quantity - log.approved_quantity
        elif log.produced_quantity and not log.approved_quantity:
            log.rework_quantity = log.produced_quantity
        else:
            log.rework_quantity = 0

    return logs
 
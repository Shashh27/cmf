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
    # Verify planned schedule item exists
    # Note: Since PlannedScheduleItem model is not defined in this microservice,
    # we'll use raw SQL to verify its existence
    from sqlalchemy import text
    
    result = db.execute(text("SELECT id FROM scheduling.planned_schedule_items WHERE id = :item_id"), {"item_id": log.planned_schedule_items_id})
    if not result.fetchone():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Planned schedule item with id {log.planned_schedule_items_id} not found"
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
    planned_schedule_items_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(ProductionLog)
    
    if status:
        query = query.filter(ProductionLog.status == status)
    if operator_id:
        query = query.filter(ProductionLog.operator_id == operator_id)
    if planned_schedule_items_id:
        query = query.filter(ProductionLog.planned_schedule_items_id == planned_schedule_items_id)
    
    logs = query.all()
    
    # Build detailed responses with related entities
    detailed_logs = []
    for log in logs:
        # Get planned schedule item details
        from sqlalchemy import text
        item_result = db.execute(text("""
            SELECT id, status, operation_id, machine_id 
            FROM scheduling.planned_schedule_items 
            WHERE id = :item_id
        """), {"item_id": log.planned_schedule_items_id}).first()
        
        operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
        supervisor = db.query(AccessUser).filter(AccessUser.id == log.supervisor_id).first() if log.supervisor_id else None
        
        response = ProductionLogWithDetails(
            id=log.id,
            planned_schedule_items_id=log.planned_schedule_items_id,
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
        
        # Add planned schedule item details
        if item_result:
            response.planned_schedule_item = {
                "id": item_result[0],
                "status": item_result[1]
            }
            
            # Get operation details using the operation model
            if item_result[2]:  # operation_id exists
                operation = db.query(Operation).filter(Operation.id == item_result[2]).first()
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
            if item_result[3]:  # machine_id exists
                machine = db.query(Machine).filter(Machine.id == item_result[3]).first()
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
    
    # Get planned schedule item details
    from sqlalchemy import text
    item_result = db.execute(text("""
        SELECT id, status, operation_id, machine_id 
        FROM scheduling.planned_schedule_items 
        WHERE id = :item_id
    """), {"item_id": log.planned_schedule_items_id}).first()
    
    operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
    supervisor = db.query(AccessUser).filter(AccessUser.id == log.supervisor_id).first() if log.supervisor_id else None
    
    # Build response manually to avoid ORM mapping issues
    response = ProductionLogWithDetails(
        id=log.id,
        planned_schedule_items_id=log.planned_schedule_items_id,
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
    
    # Add planned schedule item details
    if item_result:
        response.planned_schedule_item = {
            "id": item_result[0],
            "status": item_result[1]
        }
        
        # Get operation details using the operation model
        if item_result[2]:  # operation_id exists
            operation = db.query(Operation).filter(Operation.id == item_result[2]).first()
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
        if item_result[3]:  # machine_id exists
            machine = db.query(Machine).filter(Machine.id == item_result[3]).first()
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
    if "planned_schedule_items_id" in update_data:
        from sqlalchemy import text
        result = db.execute(text("SELECT id FROM scheduling.planned_schedule_items WHERE id = :item_id"), {"item_id": update_data["planned_schedule_items_id"]})
        if not result.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Planned schedule item with id {update_data['planned_schedule_items_id']} not found"
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
    
    old_status = db_log.status
    db_log.status = status_update.status
    
    # Update planned_schedule_items table based on status changes
    from sqlalchemy import text
    try:
        if status_update.status == "completed" and old_status != "completed":
            # Change to completed
            db.execute(
                text("UPDATE scheduling.planned_schedule_items SET status = 'completed' WHERE id = :item_id"),
                {"item_id": db_log.planned_schedule_items_id}
            )
        elif status_update.status == "rework" and old_status == "completed":
            # Change from completed back to rework - set to inprogress
            db.execute(
                text("UPDATE scheduling.planned_schedule_items SET status = 'inprogress' WHERE id = :item_id"),
                {"item_id": db_log.planned_schedule_items_id}
            )
        elif status_update.status == "rework" and old_status != "completed" and old_status != "rework":
            # Change to rework from other status (pending) - set to inprogress
            db.execute(
                text("UPDATE scheduling.planned_schedule_items SET status = 'inprogress' WHERE id = :item_id"),
                {"item_id": db_log.planned_schedule_items_id}
            )
    except Exception as e:
        # Log the error but don't fail the operation
        print(f"Error updating planned_schedule_items status: {e}")
    
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

@router.get("/planned-schedule-item/{planned_schedule_items_id}", response_model=List[ProductionLogResponse])
def get_production_logs_by_planned_schedule_item(
    planned_schedule_items_id: int,
    skip: int = 0,
    status: Optional[ProductionLogStatus] = None,
    db: Session = Depends(get_db)
):
    # Verify planned schedule item exists
    from sqlalchemy import text
    result = db.execute(text("SELECT id FROM scheduling.planned_schedule_items WHERE id = :item_id"), {"item_id": planned_schedule_items_id})
    if not result.fetchone():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Planned schedule item with id {planned_schedule_items_id} not found"
        )
    
    query = db.query(ProductionLog).filter(ProductionLog.planned_schedule_items_id == planned_schedule_items_id)
    
    if status:
        query = query.filter(ProductionLog.status == status)
    
    logs = query.offset(skip).all()
    return logs
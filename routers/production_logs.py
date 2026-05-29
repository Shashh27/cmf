from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from DB.database import get_db
from DB.models import ProductionLog, AccessUser, Operation
from DB.models.configuration import Machine
from DB.models.inventory import RawMaterialUsage, RawMaterialStock, RawMaterial
from DB.schemas import (
    ProductionLogCreate,
    ProductionLogUpdate,
    ProductionLogResponse,
    ProductionLogWithDetails,
    ProductionLogStatusUpdate,
    ProductionLogStatus,
    ProductionLogSubmit,
    ProductionLogBulkDelete
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

    # Check if production is already complete (based on approved quantity)
    if total_approved >= total_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Production already completed. Total approved: {total_approved}, Total quantity: {total_quantity}. No more production allowed."
        )
    
    # Check if there's a previous log with remaining_quantity_to_be_produced
    last_log = db.query(ProductionLog).filter(
        ProductionLog.operation_id == log.operation_id
    ).order_by(ProductionLog.created_at.desc()).first()

    # Determine remaining quantity
    if last_log and last_log.remaining_quantity_to_be_produced is not None:
        remaining_quantity = last_log.remaining_quantity_to_be_produced
    else:
        remaining_quantity = total_quantity - total_approved

    # Validate that produced_quantity is greater than 0
    if log.produced_quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Produced quantity must be greater than 0. Provided: {log.produced_quantity}"
        )

    # Validate that the new production doesn't exceed remaining quantity
    if log.produced_quantity > remaining_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot produce {log.produced_quantity} items. Only {remaining_quantity} items remaining to be produced."
        )

    db_log = ProductionLog(**log.model_dump())
    db_log.supervisor_id = None  # Force supervisor_id to null on creation
    db_log.remaining_quantity_to_be_produced = remaining_quantity
    db.add(db_log)
    db.commit()
    db.refresh(db_log)

    # Build response data dictionary
    response_data = {
        "id": db_log.id,
        "operation_id": db_log.operation_id,
        "operator_id": db_log.operator_id,
        "supervisor_id": db_log.supervisor_id,
        "notes": db_log.notes,
        "remarks": db_log.remarks,
        "from_date": db_log.from_date,
        "from_time": db_log.from_time,
        "to_date": db_log.to_date,
        "to_time": db_log.to_time,
        "status": db_log.status,
        "operator_status": db_log.operator_status,
        "produced_quantity": db_log.produced_quantity,
        "approved_quantity": db_log.approved_quantity,
        "rework_quantity": db_log.rework_quantity,
        "rejected_quantity": db_log.rejected_quantity,
        "remaining_quantity_to_be_produced": db_log.remaining_quantity_to_be_produced,
        "created_at": db_log.created_at,
        "supervisor_acknowledged": db_log.supervisor_acknowledged,
        "supervisor_acknowledged_at": db_log.supervisor_acknowledged_at,
        "operator_acknowledged": db_log.operator_acknowledged,
        "operator_acknowledged_at": db_log.operator_acknowledged_at
    }

    # Build response manually
    response = ProductionLogResponse(**response_data)

    return response

@router.get("/", response_model=List[ProductionLogWithDetails])
def get_all_production_logs(
    status: Optional[ProductionLogStatus] = None,
    operator_id: Optional[int] = None,
    operation_id: Optional[int] = None,
    hierarchical: Optional[bool] = None,
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

        # Build response data dictionary
        response_data = {
            "id": log.id,
            "operation_id": log.operation_id,
            "operator_id": log.operator_id,
            "supervisor_id": log.supervisor_id,
            "notes": log.notes,
            "remarks": log.remarks,
            "from_date": log.from_date,
            "from_time": log.from_time,
            "to_date": log.to_date,
            "to_time": log.to_time,
            "status": log.status,
            "operator_status": log.operator_status,
            "produced_quantity": log.produced_quantity,
            "approved_quantity": log.approved_quantity,
            "rework_quantity": log.rework_quantity,
            "rejected_quantity": log.rejected_quantity,
            "remaining_quantity_to_be_produced": log.remaining_quantity_to_be_produced,
            "created_at": log.created_at,
            "supervisor_acknowledged": log.supervisor_acknowledged,
            "supervisor_acknowledged_at": log.supervisor_acknowledged_at,
            "operator_acknowledged": log.operator_acknowledged,
            "operator_acknowledged_at": log.operator_acknowledged_at
        }

        response = ProductionLogWithDetails(**response_data)

        # Add operation details
        if operation:
            operation_data = {
                "id": operation.id,
                "operation_number": operation.operation_number,
                "operation_name": operation.operation_name
            }

            # Get raw materials through the part relationship
            if operation.part:
                # Add complete part details
                part_data = {
                    "id": operation.part.id,
                    "part_number": operation.part.part_number,
                    "part_name": operation.part.part_name,
                    "quantity": operation.part.qty,
                    "unit": "pcs"  # Default unit since Part model doesn't have unit attribute
                }
                operation_data["part"] = part_data

                # Add product details
                if operation.part.product:
                    product_data = {
                        "id": operation.part.product.id,
                        "product_name": operation.part.product.product_name,
                        "product_version": operation.part.product.product_version
                    }
                    operation_data["product"] = product_data

                    # Get order details through the product relationship
                    if operation.part.product.orders:
                        # Get the first order associated with this product
                        # Note: A product can have multiple orders, we'll take the first one
                        order = operation.part.product.orders[0] if operation.part.product.orders else None
                        if order:
                            order_data = {
                                "id": order.id,
                                "sale_order_number": order.sale_order_number,
                                "quantity": order.quantity,
                                "status": order.status
                            }
                            # Add customer information if available
                            if order.customer:
                                order_data["customer"] = {
                                    "id": order.customer.id,
                                    "customer_name": getattr(order.customer, 'customer_name', 'Unknown Customer')
                                }
                            operation_data["order"] = order_data

                # Get raw materials using raw_material_usage table
                raw_materials = []
                # Check if part has raw materials linked in raw_material_usage table
                raw_material_usages = db.query(RawMaterialUsage).filter(
                    RawMaterialUsage.part_id == operation.part.id
                ).all()
                
                for usage in raw_material_usages:
                    # Get the raw material unit to access stock and material info
                    raw_material_unit = db.query(RawMaterialStock).filter(
                        RawMaterialStock.id == usage.raw_material_unit_id
                    ).first()
                    
                    if raw_material_unit and raw_material_unit.material:
                        raw_materials.append({
                            "id": raw_material_unit.material.id,
                            "name": raw_material_unit.material.material_name,
                            "quantity": usage.used_length,
                            "unit": "units"  # Based on used_length field
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

    # Build response manually to avoid ORM mapping issues
    response_data = {
        "id": log.id,
        "operation_id": log.operation_id,
        "operator_id": log.operator_id,
        "supervisor_id": log.supervisor_id,
        "notes": log.notes,
        "remarks": log.remarks,
        "from_date": log.from_date,
        "from_time": log.from_time,
        "to_date": log.to_date,
        "to_time": log.to_time,
        "status": log.status,
        "operator_status": log.operator_status,
        "produced_quantity": log.produced_quantity,
        "approved_quantity": log.approved_quantity,
        "rework_quantity": log.rework_quantity,
        "rejected_quantity": log.rejected_quantity,
        "remaining_quantity_to_be_produced": log.remaining_quantity_to_be_produced,
        "created_at": log.created_at,
        "supervisor_acknowledged": log.supervisor_acknowledged,
        "supervisor_acknowledged_at": log.supervisor_acknowledged_at,
        "operator_acknowledged": log.operator_acknowledged,
        "operator_acknowledged_at": log.operator_acknowledged_at
    }
    
    response = ProductionLogWithDetails(**response_data)

    # Add operation details
    if operation:
        operation_data = {
            "id": operation.id,
            "operation_number": operation.operation_number,
            "operation_name": operation.operation_name
        }

        # Get raw materials through the part relationship
        if operation.part:
            # Add complete part details
            part_data = {
                "id": operation.part.id,
                "part_number": operation.part.part_number,
                "part_name": operation.part.part_name,
                "quantity": operation.part.qty,
                "unit": "pcs"  # Default unit since Part model doesn't have unit attribute
            }
            operation_data["part"] = part_data

            # Add product details
            if operation.part.product:
                product_data = {
                    "id": operation.part.product.id,
                    "product_name": operation.part.product.product_name,
                    "product_version": operation.part.product.product_version
                }
                operation_data["product"] = product_data

                # Get order details through the product relationship
                if operation.part.product.orders:
                    # Get the first order associated with this product
                    # Note: A product can have multiple orders, we'll take the first one
                    order = operation.part.product.orders[0] if operation.part.product.orders else None
                    if order:
                        order_data = {
                            "id": order.id,
                            "sale_order_number": order.sale_order_number,
                            "quantity": order.quantity,
                            "status": order.status
                        }
                        # Add customer information if available
                        if order.customer:
                            order_data["customer"] = {
                                "id": order.customer.id,
                                "customer_name": getattr(order.customer, 'customer_name', 'Unknown Customer')
                            }
                        operation_data["order"] = order_data

            # Get raw materials
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
    
    # Store operation_id before deletion
    operation_id = db_log.operation_id
    
    db.delete(db_log)
    db.commit()
    
    return None


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_production_logs(
    bulk_delete: ProductionLogBulkDelete = ProductionLogBulkDelete(),
    db: Session = Depends(get_db)
):
    """
    Delete multiple production logs at once.
    If log_ids is not provided, deletes ALL production logs.
    """
    if bulk_delete.log_ids:
        # Find all existing logs to delete by specific IDs
        logs_to_delete = db.query(ProductionLog).filter(
            ProductionLog.id.in_(bulk_delete.log_ids)
        ).all()
        
        if not logs_to_delete:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No production logs found with the provided IDs"
            )
    else:
        # Delete all production logs
        logs_to_delete = db.query(ProductionLog).all()
        
        if not logs_to_delete:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No production logs found to delete"
            )
    
    # Delete the logs
    for log in logs_to_delete:
        db.delete(log)
    
    db.commit()
    
    return None

@router.put("/{log_id}/status", response_model=ProductionLogResponse)
def update_production_log_status(
    log_id: int,
    status_update: ProductionLogStatusUpdate,
    db: Session = Depends(get_db)
):
    from sqlalchemy import text
    from DB.models.oms import Operation, Part

    db_log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Production log with id {log_id} not found"
        )

    # Store original status to detect changes that should notify the operator
    original_status = db_log.status
    
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
    
    # Get operation and part details for total quantity
    operation = db.query(Operation).filter(Operation.id == db_log.operation_id).first()
    part = db.query(Part).filter(Part.id == operation.part_id).first()
    total_quantity = part.qty or 0

    # Calculate total approved quantity across all logs for this operation
    total_approved = db.execute(text("""
        SELECT COALESCE(SUM(approved_quantity), 0)
        FROM scheduling.production_logs
        WHERE operation_id = :op_id AND approved_quantity IS NOT NULL AND id != :log_id
    """), {"op_id": db_log.operation_id, "log_id": log_id}).scalar()

    # Handle the new scenario: approve, rework, rejected together
    approved_qty = status_update.approved_quantity or 0
    rework_qty = status_update.rework_quantity or 0
    rejected_qty = status_update.rejected_quantity or 0

    # Validate that the sum of approved, rework, rejected equals produced quantity
    total_assigned = approved_qty + rework_qty + rejected_qty
    
    if status_update.status == "completed":
        # If status is completed, approved should equal produced
        if approved_qty != db_log.produced_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"For 'completed' status, approved quantity ({approved_qty}) must equal produced quantity ({db_log.produced_quantity})"
            )
    elif status_update.status == "pending":
        # If status is pending, we don't need to assign anything
        pass
    else:
        # For all other statuses, sum of approved, rework, rejected must equal produced
        if total_assigned != db_log.produced_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total of approved ({approved_qty}) + rework ({rework_qty}) + rejected ({rejected_qty}) must equal produced quantity ({db_log.produced_quantity}). Got total {total_assigned} instead."
            )

    # Update the production log fields
    db_log.approved_quantity = approved_qty
    db_log.rework_quantity = rework_qty
    db_log.rejected_quantity = rejected_qty

    # Calculate remaining quantity to be produced
    total_approved_now = total_approved + approved_qty
    remaining_to_produce = total_quantity - total_approved_now
    db_log.remaining_quantity_to_be_produced = remaining_to_produce

    # Determine the status
    if remaining_to_produce <= 0:
        db_log.status = "completed"
    elif rework_qty > 0 or rejected_qty > 0:
        db_log.status = "inprogress"
    else:
        db_log.status = status_update.status

    # If supervisor reviewed (status changed or quantities assigned), reset operator_acknowledged
    # so the operator gets notified and can acknowledge the supervisor's response
    if db_log.status != original_status or approved_qty > 0 or rework_qty > 0 or rejected_qty > 0:
        db_log.operator_acknowledged = False
        db_log.operator_acknowledged_at = None
    
    db.commit()
    db.refresh(db_log)

    # Build response data dictionary
    response_data = {
        "id": db_log.id,
        "operation_id": db_log.operation_id,
        "operator_id": db_log.operator_id,
        "supervisor_id": db_log.supervisor_id,
        "notes": db_log.notes,
        "remarks": db_log.remarks,
        "from_date": db_log.from_date,
        "from_time": db_log.from_time,
        "to_date": db_log.to_date,
        "to_time": db_log.to_time,
        "status": db_log.status,
        "operator_status": db_log.operator_status,
        "produced_quantity": db_log.produced_quantity,
        "approved_quantity": db_log.approved_quantity,
        "rework_quantity": db_log.rework_quantity,
        "rejected_quantity": db_log.rejected_quantity,
        "remaining_quantity_to_be_produced": db_log.remaining_quantity_to_be_produced,
        "created_at": db_log.created_at,
        "supervisor_acknowledged": db_log.supervisor_acknowledged,
        "supervisor_acknowledged_at": db_log.supervisor_acknowledged_at,
        "operator_acknowledged": db_log.operator_acknowledged,
        "operator_acknowledged_at": db_log.operator_acknowledged_at
    }

    # Build response manually
    response = ProductionLogResponse(**response_data)


    # ── TRIGGER DYNAMIC RESCHEDULE ──────────────────────────────────────── #
    # After supervisor approves (completed), marks rework, or rejects, re-plan remaining
    # quantity for this part's entire operation chain in rescheduling_items.
    if db_log.status in ["completed", "inprogress", "rework", "rejected"]:
        try:
            from algorithm import dynamic_reschedule
            from DB.models.scheduling import Rescheduling
            # Get part_id from Rescheduling or Operation (backward compatibility)
            rescheduling_row = db.query(Rescheduling).filter(
                Rescheduling.operation_id == db_log.operation_id,
                Rescheduling.status.in_(['scheduled', 'rescheduled'])
            ).first()
            part_id = None
            if rescheduling_row:
                part_id = rescheduling_row.part_id
            else:
                operation = db.query(Operation).filter(Operation.id == db_log.operation_id).first()
                if operation:
                    part_id = operation.part_id
            
            dynamic_reschedule(
                db,
                triggered_by_part_id = None,              # full reschedule — re-plans ALL active parts
                triggered_by_op_id   = db_log.operation_id
            )
            print(
                f"[DYNAMIC] Triggered after supervisor action on log {log_id} "
                f"(op={db_log.operation_id}, part={part_id}, "
                f"status={db_log.status})"
            )
        except Exception as e:
            # Non-fatal: log the error but don't fail the approval
            print(f"[WARN] dynamic_reschedule after supervisor approval failed: {e}")
    # ─────────────────────────────────────────────────────────────────────── #
 
    return response

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
    
    # Build response objects manually
    response_logs = []
    for log in logs:
        # Build response data dictionary
        response_data = {
            "id": log.id,
            "operation_id": log.operation_id,
            "operator_id": log.operator_id,
            "supervisor_id": log.supervisor_id,
            "notes": log.notes,
            "remarks": log.remarks,
            "from_date": log.from_date,
            "from_time": log.from_time,
            "to_date": log.to_date,
            "to_time": log.to_time,
            "status": log.status,
            "operator_status": log.operator_status,
            "produced_quantity": log.produced_quantity,
            "approved_quantity": log.approved_quantity,
            "rework_quantity": log.rework_quantity,
            "rejected_quantity": log.rejected_quantity,
            "remaining_quantity_to_be_produced": log.remaining_quantity_to_be_produced,
            "created_at": log.created_at,
            "supervisor_acknowledged": log.supervisor_acknowledged,
            "supervisor_acknowledged_at": log.supervisor_acknowledged_at,
            "operator_acknowledged": log.operator_acknowledged,
            "operator_acknowledged_at": log.operator_acknowledged_at
        }
        
        response_log = ProductionLogResponse(**response_data)
        response_logs.append(response_log)
    
    return response_logs


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

    # Build response objects manually
    response_logs = []
    for log in logs:
        # Build response data dictionary
        response_data = {
            "id": log.id,
            "operation_id": log.operation_id,
            "operator_id": log.operator_id,
            "supervisor_id": log.supervisor_id,
            "notes": log.notes,
            "remarks": log.remarks,
            "from_date": log.from_date,
            "from_time": log.from_time,
            "to_date": log.to_date,
            "to_time": log.to_time,
            "status": log.status,
            "operator_status": log.operator_status,
            "produced_quantity": log.produced_quantity,
            "approved_quantity": log.approved_quantity,
            "rework_quantity": log.rework_quantity,
            "rejected_quantity": log.rejected_quantity,
            "remaining_quantity_to_be_produced": log.remaining_quantity_to_be_produced,
            "created_at": log.created_at,
            "supervisor_acknowledged": log.supervisor_acknowledged,
            "supervisor_acknowledged_at": log.supervisor_acknowledged_at,
            "operator_acknowledged": log.operator_acknowledged,
            "operator_acknowledged_at": log.operator_acknowledged_at
        }

        response_log = ProductionLogResponse(**response_data)
        response_logs.append(response_log)

    return response_logs

@router.post("/operation/{operation_id}/submit", response_model=ProductionLogResponse)
def submit_production_log(
    operation_id: int,
    submit_data: ProductionLogSubmit,
    db: Session = Depends(get_db)
):
    """
    Submit production log - updates the inprogress production log with produced_quantity,
    sets operator_status to completed, and automatically sets to_date/to_time.
    """
    from sqlalchemy import text
    from DB.models.oms import Part, Operation
    
    # Find the inprogress production log for this operation
    db_log = db.query(ProductionLog).filter(
        ProductionLog.operation_id == operation_id,
        ProductionLog.operator_status == "inprogress"
    ).first()
    
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active production log found for operation {operation_id}. Please activate the job card first."
        )
    
    # Verify operation exists and get required quantity
    operation = db.query(Operation).filter(Operation.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    
    part = db.query(Part).filter(Part.id == operation.part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part associated with operation {operation_id} not found"
        )
    
    total_quantity = part.qty or 0
    
    # Calculate total approved quantity
    total_approved = db.execute(text("""
        SELECT COALESCE(SUM(approved_quantity), 0)
        FROM scheduling.production_logs
        WHERE operation_id = :op_id AND approved_quantity IS NOT NULL
    """), {"op_id": operation_id}).scalar()
    
    # Check if production is already complete
    if total_approved >= total_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Production already completed. Total approved: {total_approved}, Total quantity: {total_quantity}."
        )
    
    # Check if there's a previous log with remaining_quantity_to_be_produced
    last_log = db.query(ProductionLog).filter(
        ProductionLog.operation_id == operation_id,
        ProductionLog.id != db_log.id
    ).order_by(ProductionLog.created_at.desc()).first()

    # Determine remaining quantity
    if last_log and last_log.remaining_quantity_to_be_produced is not None:
        remaining_quantity = last_log.remaining_quantity_to_be_produced
    else:
        remaining_quantity = total_quantity - total_approved
    
    # Validate that produced quantity doesn't exceed remaining quantity
    if submit_data.produced_quantity > remaining_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot produce {submit_data.produced_quantity} items. Only {remaining_quantity} items remaining to be produced."
        )
    
    # Get current time for to_date/to_time
    current_time = datetime.now()
    
    # Update production log
    db_log.produced_quantity = submit_data.produced_quantity
    db_log.notes = submit_data.notes
    db_log.to_date = current_time.date()
    db_log.to_time = current_time.time()
    db_log.operator_status = "completed"
    db_log.remaining_quantity_to_be_produced = remaining_quantity
    
    db.commit()
    db.refresh(db_log)
    
    # Build response data dictionary
    response_data = {
        "id": db_log.id,
        "operation_id": db_log.operation_id,
        "operator_id": db_log.operator_id,
        "supervisor_id": db_log.supervisor_id,
        "notes": db_log.notes,
        "remarks": db_log.remarks,
        "from_date": db_log.from_date,
        "from_time": db_log.from_time,
        "to_date": db_log.to_date,
        "to_time": db_log.to_time,
        "status": db_log.status,
        "operator_status": db_log.operator_status,
        "produced_quantity": db_log.produced_quantity,
        "approved_quantity": db_log.approved_quantity,
        "rework_quantity": db_log.rework_quantity,
        "rejected_quantity": db_log.rejected_quantity,
        "remaining_quantity_to_be_produced": db_log.remaining_quantity_to_be_produced,
        "created_at": db_log.created_at,
        "supervisor_acknowledged": db_log.supervisor_acknowledged,
        "supervisor_acknowledged_at": db_log.supervisor_acknowledged_at,
        "operator_acknowledged": db_log.operator_acknowledged,
        "operator_acknowledged_at": db_log.operator_acknowledged_at
    }

    # Build response manually
    response = ProductionLogResponse(**response_data)
    
    return response


@router.get("/operation/{operation_id}/status-summary")
def get_operation_production_status(operation_id: int, db: Session = Depends(get_db)):
    """
    Get production status summary for an operation including total approved vs required quantity
    """
    from sqlalchemy import text
    
    # Verify operation exists
    operation = db.query(Operation).filter(Operation.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    
    # Get part details for required quantity
    part = operation.part
    required_quantity = part.qty if part else 0
    
    # Get production statistics
    stats = db.execute(text("""
        SELECT 
            COUNT(*) as total_logs,
            COALESCE(SUM(produced_quantity), 0) as total_produced,
            COALESCE(SUM(approved_quantity), 0) as total_approved,
            COALESCE(SUM(rework_quantity), 0) as total_rework,
            COALESCE(SUM(rejected_quantity), 0) as total_rejected
        FROM scheduling.production_logs
        WHERE operation_id = :op_id
    """), {"op_id": operation_id}).fetchone()
    
    # Get all production logs for this operation
    logs = db.query(ProductionLog).filter(
        ProductionLog.operation_id == operation_id
    ).order_by(ProductionLog.created_at.asc()).all()
    
    start_time = None
    end_time = None
    
    if logs:
        # Find earliest from_date + from_time
        for log in logs:
            if log.from_date and log.from_time:
                candidate = datetime.combine(log.from_date, log.from_time)
                if not start_time or candidate < start_time:
                    start_time = candidate
        
        # Find latest to_date + to_time
        for log in logs:
            if log.to_date and log.to_time:
                candidate = datetime.combine(log.to_date, log.to_time)
                if not end_time or candidate > end_time:
                    end_time = candidate
    
    # Check for inprogress logs
    has_inprogress = db.execute(text("""
        SELECT COUNT(*) 
        FROM scheduling.production_logs
        WHERE operation_id = :op_id
        AND operator_status = 'inprogress'
    """), {"op_id": operation_id}).scalar() > 0
    
    # Determine status
    if stats.total_approved >= required_quantity:
        current_status = "completed"
    elif has_inprogress or stats.total_logs > 0:
        current_status = "inprogress"
    else:
        current_status = "pending"
    
    # If status is inprogress or pending, set end_time to null
    if current_status in ["inprogress", "pending"]:
        end_time = None
    
    completion_percentage = 0
    if required_quantity > 0:
        completion_percentage = (stats.total_approved / required_quantity) * 100
    
    # Get machine details
    machine_make = None
    machine_model = None
    machine_id = None
    
    # First check if operation has machine_id
    if hasattr(operation, 'machine_id') and operation.machine_id:
        machine_id = operation.machine_id
    else:
        # If not, get from rescheduling_items
        try:
            from DB.models.scheduling import Rescheduling
            rescheduling_item = db.query(Rescheduling).filter(
                Rescheduling.operation_id == operation_id,
                Rescheduling.status.in_(['scheduled', 'rescheduled'])
            ).order_by(Rescheduling.start_time.desc()).first()
            if rescheduling_item and rescheduling_item.machine_id:
                machine_id = rescheduling_item.machine_id
        except:
            pass
    
    if machine_id:
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if machine:
            machine_make = machine.make
            machine_model = machine.model
    
    # Get operation name and number
    operation_name = getattr(operation, 'operation_name', None)
    operation_number = getattr(operation, 'operation_number', None)
    
    return {
        "operation_id": operation_id,
        "operation_number": operation_number,
        "operation_name": operation_name,
        "required_quantity": required_quantity,
        "total_produced": stats.total_produced,
        "total_approved": stats.total_approved,
        "total_rework": stats.total_rework,
        "total_rejected": stats.total_rejected,
        "completion_percentage": round(completion_percentage, 2),
        "is_completed": stats.total_approved >= required_quantity,
        "status": current_status,
        "start_time": start_time,
        "end_time": end_time,
        "machine_make": machine_make,
        "machine_model": machine_model
    }


@router.put("/{log_id}/acknowledge", response_model=ProductionLogResponse)
def acknowledge_production_log(
    log_id: int,
    operator_id: Optional[int] = None,
    supervisor_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Acknowledge a production log - operator or supervisor marks that they've seen the response
    """
    db_log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Production log with id {log_id} not found"
        )
    
    # Verify the user has permission to acknowledge
    if operator_id and db_log.operator_id != operator_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the operator who created this log can acknowledge it"
        )
    
    if supervisor_id and db_log.supervisor_id and db_log.supervisor_id != supervisor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the supervisor who reviewed this log can acknowledge it"
        )
    
    if not operator_id and not supervisor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either operator_id or supervisor_id must be provided"
        )
    
    # Verify the log status based on who is acknowledging
    if operator_id:
        if db_log.status not in ["completed", "rework", "rejected", "inprogress"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operator can only acknowledge logs with status 'completed', 'rework', 'rejected', or 'inprogress'"
            )
    elif supervisor_id:
        if db_log.status not in ["pending", "completed", "rework", "rejected", "inprogress"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Supervisor can only acknowledge logs with status 'pending', 'completed', 'rework', 'rejected', or 'inprogress'"
            )
    
    # Update acknowledgment fields based on who is acknowledging
    if operator_id:
        db_log.operator_acknowledged = True
        db_log.operator_acknowledged_at = datetime.now()
    elif supervisor_id:
        db_log.supervisor_acknowledged = True
        db_log.supervisor_acknowledged_at = datetime.now()
    
    db.commit()
    db.refresh(db_log)
    
    # Build response manually
    response_data = {
        "id": db_log.id,
        "operation_id": db_log.operation_id,
        "operator_id": db_log.operator_id,
        "supervisor_id": db_log.supervisor_id,
        "notes": db_log.notes,
        "remarks": db_log.remarks,
        "from_date": db_log.from_date,
        "from_time": db_log.from_time,
        "to_date": db_log.to_date,
        "to_time": db_log.to_time,
        "status": db_log.status,
        "operator_status": db_log.operator_status,
        "produced_quantity": db_log.produced_quantity,
        "approved_quantity": db_log.approved_quantity,
        "rework_quantity": db_log.rework_quantity,
        "rejected_quantity": db_log.rejected_quantity,
        "remaining_quantity_to_be_produced": db_log.remaining_quantity_to_be_produced,
        "created_at": db_log.created_at,
        "supervisor_acknowledged": db_log.supervisor_acknowledged,
        "supervisor_acknowledged_at": db_log.supervisor_acknowledged_at,
        "operator_acknowledged": db_log.operator_acknowledged,
        "operator_acknowledged_at": db_log.operator_acknowledged_at
    }
    
    response = ProductionLogResponse(**response_data)
    
    return response

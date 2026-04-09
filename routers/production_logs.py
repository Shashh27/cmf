from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

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

# Try to import OperationStatus, but make it optional for environments without scheduling models
try:
    from DB.models.scheduling import OperationStatus
    OPERATION_STATUS_AVAILABLE = True
except ImportError:
    OPERATION_STATUS_AVAILABLE = False
    OperationStatus = None

router = APIRouter(
    prefix="/production-logs",
    tags=["production-logs"]
)


def update_operation_status_if_completed(operation_id: int, db: Session) -> None:
    """
    Update operation status to 'completed' if total approved quantity meets part requirement.
    This function is called after production log status updates.
    Only works if OperationStatus model is available (scheduling models present).
    """
    # Skip if OperationStatus model is not available
    if not OPERATION_STATUS_AVAILABLE:
        return
    
    try:
        # Get operation and part details
        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        if not operation:
            return
        
        part = operation.part
        if not part:
            return
        
        required_quantity = part.qty or 0
        if required_quantity <= 0:
            return
        
        # Calculate total approved quantity for this operation
        from sqlalchemy import text
        total_approved = db.execute(text("""
            SELECT COALESCE(SUM(approved_quantity), 0)
            FROM scheduling.production_logs
            WHERE operation_id = :op_id AND approved_quantity IS NOT NULL
        """), {"op_id": operation_id}).scalar()
        
        # Check if operation should be marked as completed
        if total_approved >= required_quantity:
            # Update operation status to completed
            operation_status = db.query(OperationStatus).filter(
                OperationStatus.operation_id == operation_id
            ).first()
            
            if operation_status and operation_status.status != "completed":
                operation_status.status = "completed"
                operation_status.completed_at = datetime.now()
                db.commit()
        
    except Exception as e:
        db.rollback()


def update_operation_status_after_deletion(operation_id: int, db: Session) -> None:
    """
    Update operation status based on current production logs after deletion.
    This ensures operation status reflects the actual state of production logs.
    Only works if OperationStatus model is available (scheduling models present).
    """
    # Skip if OperationStatus model is not available
    if not OPERATION_STATUS_AVAILABLE:
        return
    
    try:
        # Get current production logs for this operation
        from sqlalchemy import text
        logs_summary = db.execute(text("""
            SELECT 
                COUNT(*) as total_logs,
                COALESCE(SUM(produced_quantity), 0) as total_produced,
                COALESCE(SUM(approved_quantity), 0) as total_approved
            FROM scheduling.production_logs
            WHERE operation_id = :op_id
        """), {"op_id": operation_id}).fetchone()
        
        # Get required quantity from part
        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        if not operation:
            return
        
        required_quantity = operation.part.qty or 0 if operation.part else 0
        
        # Determine correct status based on remaining production logs
        if logs_summary.total_logs == 0:
            # No production logs - should be pending with null timestamps
            correct_status = "pending"
            correct_completed_at = None
            correct_started_at = None
        elif logs_summary.total_approved >= required_quantity:
            # Enough approved quantity - should be completed
            correct_status = "completed"
            correct_completed_at = datetime.now()
            # Keep existing started_at if it exists
            correct_started_at = operation_status.started_at if operation_status else None
        elif logs_summary.total_approved > 0:
            # Some approved quantity but not enough - should be inprogress
            correct_status = "inprogress"
            correct_completed_at = None
            # Keep existing started_at if it exists, or set it now if this is first production
            correct_started_at = operation_status.started_at if operation_status and operation_status.started_at else datetime.now()
        else:
            # Has production logs but no approvals - should be inprogress
            correct_status = "inprogress"
            correct_completed_at = None
            # Keep existing started_at if it exists, or set it now if this is first production
            correct_started_at = operation_status.started_at if operation_status and operation_status.started_at else datetime.now()
        
        # Update operation status
        operation_status = db.query(OperationStatus).filter(
            OperationStatus.operation_id == operation_id
        ).first()
        
        if operation_status:
            # Always update if status is changing
            if operation_status.status != correct_status:
                operation_status.status = correct_status
                operation_status.completed_at = correct_completed_at
                operation_status.started_at = correct_started_at
                operation_status.updated_at = datetime.now()
                db.commit()
            # Also update timestamps if they should be null (when no logs remain)
            elif logs_summary.total_logs == 0 and (operation_status.started_at is not None or operation_status.completed_at is not None):
                operation_status.started_at = None
                operation_status.completed_at = None
                operation_status.updated_at = datetime.now()
                db.commit()
        
    except Exception as e:
        db.rollback()


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

    # Check if production is already complete (based on approved quantity)
    if total_approved >= total_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Production already completed. Total approved: {total_approved}, Total quantity: {total_quantity}. No more production allowed."
        )
    
    # NEW CONSTRAINT: Block duplicate production when total produced already matches required quantity
    # AND supervisor hasn't responded yet (logs are still pending)
    # SMART EXCEPTION: Only allow new production if there are rework logs AND no pending logs
    # This prevents operators from sending multiple logs while waiting for approval
    
    # Check if there are any rework logs
    has_rework_logs = db.execute(text("""
        SELECT COUNT(*) FROM scheduling.production_logs
        WHERE operation_id = :op_id AND status = 'rework'
    """), {"op_id": log.operation_id}).scalar() > 0
    
    # Check if there are any pending logs (waiting for supervisor approval)
    has_pending_logs = db.execute(text("""
        SELECT COUNT(*) FROM scheduling.production_logs
        WHERE operation_id = :op_id AND status = 'pending'
    """), {"op_id": log.operation_id}).scalar() > 0
    
    # Block if:
    # 1. Total produced meets required quantity
    # 2. Total approved is less than required (not completed yet)
    # 3. Either no rework logs, OR there are pending logs waiting for approval
    if total_produced >= total_quantity and total_approved < total_quantity and (not has_rework_logs or has_pending_logs):
        if has_rework_logs and has_pending_logs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot create new production log. You have rework items and pending logs waiting for approval. Total produced: {total_produced}, Total approved: {total_approved}. Please wait for supervisor to approve existing logs before sending more."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot create new production log. Total produced quantity ({total_produced}) already matches required quantity ({total_quantity}). Please wait for supervisor approval (total approved: {total_approved}) or delete existing logs."
            )
    
    # Calculate remaining quantity based on what's effectively approved (not produced)
    # This handles rework scenarios where produced > approved
    remaining_quantity = total_quantity - total_approved
    
    # Validate that the new production doesn't exceed what's still needed
    if log.produced_quantity > remaining_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot produce {log.produced_quantity} items. Only {remaining_quantity} items remaining to reach total quantity of {total_quantity}. Total approved: {total_approved}, Total produced: {total_produced}."
        )

    db_log = ProductionLog(**log.model_dump())
    db_log.supervisor_id = None  # Force supervisor_id to null on creation
    db.add(db_log)
    db.commit()
    db.refresh(db_log)

    # NEW: Check if operation should be marked as completed after creating this log
    # This handles cases where the created log immediately completes the operation
    if db_log.approved_quantity is not None:
        update_operation_status_if_completed(db_log.operation_id, db)

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
    
    # AUTOMATIC: Update operation status after deletion
    # This ensures operation status reflects current production log state
    update_operation_status_after_deletion(operation_id, db)
    
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
        # If status is completed, user should not provide approved_quantity at all
        # Check if approved_quantity is in the request (even if it's 0)
        if "approved_quantity" in status_update.model_dump(exclude_unset=True):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Approved quantity should not be provided when status is set to 'completed'. It will be automatically set to equal the produced quantity."
            )
        # Automatically set approved_quantity = produced_quantity
        db_log.approved_quantity = db_log.produced_quantity
        db_log.status = "completed"
    elif status_update.status == "rework":
        # If status is rework, approved_quantity is optional
        # If not provided, assume 0 (no approval)
        if status_update.approved_quantity is None:
            # Supervisor is not approving anything - set approved_quantity to 0
            db_log.approved_quantity = 0
        else:
            # If approved_quantity is provided, validate it
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

    # NEW LOGIC: Check if operation should be marked as completed
    # This is triggered after any production log status update that includes approved_quantity
    # For "completed" status, we check after the automatic approved_quantity is set
    if status_update.status in ["completed", "rework"] and db_log.approved_quantity is not None:
        update_operation_status_if_completed(db_log.operation_id, db)
    # Also check for completed status (where approved_quantity is auto-set)
    elif status_update.status == "completed":
        update_operation_status_if_completed(db_log.operation_id, db)

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
            COALESCE(SUM(CASE WHEN approved_quantity IS NOT NULL AND approved_quantity < produced_quantity 
                        THEN (produced_quantity - approved_quantity) ELSE 0 END), 0) as total_rework
        FROM scheduling.production_logs
        WHERE operation_id = :op_id
    """), {"op_id": operation_id}).fetchone()
    
    # Get operation status (only if OperationStatus model is available)
    operation_status = None
    if OPERATION_STATUS_AVAILABLE:
        operation_status = db.query(OperationStatus).filter(
            OperationStatus.operation_id == operation_id
        ).first()
    
    completion_percentage = 0
    if required_quantity > 0:
        completion_percentage = (stats.total_approved / required_quantity) * 100
    
    return {
        "operation_id": operation_id,
        "required_quantity": required_quantity,
        "total_produced": stats.total_produced,
        "total_approved": stats.total_approved,
        "total_rework": stats.total_rework,
        "completion_percentage": round(completion_percentage, 2),
        "is_completed": stats.total_approved >= required_quantity,
        "operation_status": operation_status.status if operation_status else None,
        "operation_completed_at": operation_status.completed_at if operation_status else None,
        "operation_status_tracking_enabled": OPERATION_STATUS_AVAILABLE
    }

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

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
    ProductionLogBulkDelete,
)
from DB.schemas.production_logs import ProductionLogReviewAlert
from production_log_helpers import (
    REVIEWER_ROLES,
    apply_manufacturing_coordinator_scope,
    assert_exclusive_reviewer,
    build_cross_review_alert_message,
    get_operation_handoff,
    get_operation_work_due,
    get_order_ids_for_manufacturing_coordinator,
    pending_reviewer_log_block_message,
    production_log_response_for_operation,
    production_log_response_dict,
    remaining_to_close,
    resolve_order_for_operation_part,
    revert_completed_parts_if_logs_cleared,
    reviewer_user_dict,
    total_approved_for_operation,
    validate_operator_submit,
    validate_production_log_reviewer,
    total_presented_on_log,
)

router = APIRouter(
    prefix="/production-logs",
    tags=["production-logs"]
)
logger = logging.getLogger(__name__)


def _revert_completed_parts_to_inactive_if_logs_cleared(db: Session, part_ids: set):
    """Backward-compatible wrapper — see production_log_helpers."""
    revert_completed_parts_if_logs_cleared(db, part_ids)


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
    total_approved = total_approved_for_operation(db, log.operation_id)

    # Check if production is already complete (based on approved quantity)
    if total_approved >= total_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Production already completed. Total approved: {total_approved}, Total quantity: {total_quantity}. No more production allowed."
        )
    
    # Remaining quantity ledger: order qty minus total approved
    remaining_quantity = remaining_to_close(total_quantity, total_approved)
    work = get_operation_work_due(db, log.operation_id, total_quantity)
    validate_operator_submit(
        work,
        log.produced_quantity or 0,
        log.operator_rework_quantity or 0,
    )

    machine_id = log.machine_id
    if not machine_id:
        from DB.models.scheduling import Rescheduling
        rescheduling_item = db.query(Rescheduling).filter(
            Rescheduling.operation_id == log.operation_id,
            Rescheduling.status.in_(['scheduled', 'rescheduled'])
        ).order_by(Rescheduling.start_time.desc()).first()
        if rescheduling_item and rescheduling_item.machine_id:
            machine_id = rescheduling_item.machine_id

    db_log = ProductionLog(**log.model_dump())
    db_log.user_id = None  # Reviewer assigned on first approval only
    db_log.machine_id = machine_id  # Set machine_id from Rescheduling if not provided
    db_log.remaining_quantity_to_be_produced = remaining_quantity
    db.add(db_log)
    db.commit()
    db.refresh(db_log)

    response = ProductionLogResponse(
        **production_log_response_for_operation(db, db_log, total_quantity)
    )

    return response

@router.get("/", response_model=List[ProductionLogWithDetails])
def get_all_production_logs(
    status: Optional[ProductionLogStatus] = None,
    operator_id: Optional[int] = None,
    operation_id: Optional[int] = None,
    hierarchical: Optional[bool] = None,
    awaiting_review: Optional[bool] = None,
    reviewer_id: Optional[int] = None,
    reviewer_role: Optional[str] = None,
    manufacturing_coordinator_id: Optional[int] = None,
    viewer_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    List production logs.

    Filters for dual-reviewer dashboards (no separate role endpoints needed):
      - awaiting_review=true  → user_id IS NULL (open for first approval)
      - reviewer_id=34        → logs approved by that supervisor / mfg coordinator
      - reviewer_role=...     → logs whose reviewer has that accesscontrol role
      - manufacturing_coordinator_id=N → only logs for sale orders assigned to that MC
      - viewer_id=N           → when that user is an MC, same order scope as above
      - hierarchical=true     → ignored for filtering; kept for API compatibility
    """
    if reviewer_role and reviewer_role not in REVIEWER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"reviewer_role must be one of: {', '.join(REVIEWER_ROLES)}",
        )

    query = db.query(ProductionLog)

    if status:
        query = query.filter(ProductionLog.status == status)
    if operator_id:
        query = query.filter(ProductionLog.operator_id == operator_id)
    if operation_id:
        query = query.filter(ProductionLog.operation_id == operation_id)

    if awaiting_review is True:
        query = query.filter(ProductionLog.user_id.is_(None))
    elif awaiting_review is False:
        query = query.filter(ProductionLog.user_id.isnot(None))

    if reviewer_id is not None:
        query = query.filter(ProductionLog.user_id == reviewer_id)

    if reviewer_role:
        query = (
            query.join(AccessUser, AccessUser.id == ProductionLog.user_id)
            .filter(AccessUser.role == reviewer_role)
        )

    mc_scope_id = manufacturing_coordinator_id
    if mc_scope_id is None and viewer_id is not None:
        viewer = db.query(AccessUser).filter(AccessUser.id == viewer_id).first()
        if viewer and viewer.role == "manufacturing_coordinator":
            mc_scope_id = viewer_id

    if mc_scope_id is not None:
        query = apply_manufacturing_coordinator_scope(query, db, mc_scope_id)

    mc_order_ids = None
    if mc_scope_id is not None:
        mc_order_ids = get_order_ids_for_manufacturing_coordinator(db, mc_scope_id)

    logs = query.order_by(ProductionLog.created_at.desc()).all()

    # Build detailed responses with related entities
    detailed_logs = []
    for log in logs:
        # Get operation details directly from the operation_id
        operation = db.query(Operation).filter(Operation.id == log.operation_id).first()

        operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
        reviewer = db.query(AccessUser).filter(AccessUser.id == log.user_id).first() if log.user_id else None

        # Build response data dictionary
        response = ProductionLogWithDetails(
            **production_log_response_for_operation(db, log)
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

                    # Get order for this part (scoped to MC's orders when filtered)
                    order = resolve_order_for_operation_part(
                        db, operation, order_ids=mc_order_ids
                    )
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

        # Add reviewer details (supervisor or manufacturing_coordinator)
        if reviewer:
            response.reviewer = reviewer_user_dict(reviewer)

        detailed_logs.append(response)

    return detailed_logs


@router.get("/review-alerts", response_model=List[ProductionLogReviewAlert])
def get_production_log_review_alerts(
    for_role: str,
    limit: int = 50,
    manufacturing_coordinator_id: Optional[int] = None,
    viewer_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Cross-role review alerts derived from production_logs (no new table).

    for_role=supervisor
      → logs already approved by manufacturing_coordinator
        (supervisor dashboard: show banner / disable status update)

    for_role=manufacturing_coordinator
      → logs already approved by supervisor
    """
    if for_role not in REVIEWER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"for_role must be one of: {', '.join(REVIEWER_ROLES)}",
        )

    other_role = (
        "manufacturing_coordinator" if for_role == "supervisor" else "supervisor"
    )

    alert_query = (
        db.query(ProductionLog, AccessUser)
        .join(AccessUser, AccessUser.id == ProductionLog.user_id)
        .filter(
            ProductionLog.user_id.isnot(None),
            AccessUser.role == other_role,
        )
    )

    mc_scope_id = manufacturing_coordinator_id
    if mc_scope_id is None and viewer_id is not None:
        viewer = db.query(AccessUser).filter(AccessUser.id == viewer_id).first()
        if viewer and viewer.role == "manufacturing_coordinator":
            mc_scope_id = viewer_id
    if for_role == "manufacturing_coordinator" and mc_scope_id is not None:
        alert_query = apply_manufacturing_coordinator_scope(
            alert_query, db, mc_scope_id
        )

    rows = (
        alert_query
        .order_by(ProductionLog.created_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )

    alerts: List[ProductionLogReviewAlert] = []
    for log, reviewer in rows:
        operator = db.query(AccessUser).filter(AccessUser.id == log.operator_id).first()
        operation = db.query(Operation).filter(Operation.id == log.operation_id).first()

        part_number = None
        operation_number = None
        operation_payload = None
        if operation:
            operation_number = str(operation.operation_number) if operation.operation_number else None
            part_number = (
                operation.part.part_number
                if getattr(operation, "part", None)
                else None
            )
            operation_payload = {
                "id": operation.id,
                "operation_number": operation.operation_number,
                "operation_name": operation.operation_name,
                "part_number": part_number,
            }

        message = build_cross_review_alert_message(
            reviewer_name=reviewer.user_name or f"User {reviewer.id}",
            reviewer_role=reviewer.role,
            operator_name=(operator.user_name if operator else f"User {log.operator_id}"),
            part_number=part_number,
            operation_number=operation_number,
        )

        alerts.append(
            ProductionLogReviewAlert(
                log_id=log.id,
                message=message,
                status=log.status,
                reviewed_at=log.acknowledged_at or log.created_at,
                operator=(
                    {
                        "id": operator.id,
                        "user_name": operator.user_name,
                        "role": operator.role,
                    }
                    if operator
                    else None
                ),
                reviewer=reviewer_user_dict(reviewer),
                operation=operation_payload,
                review_locked=True,
                can_review=False,
            )
        )

    return alerts


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
    reviewer = db.query(AccessUser).filter(AccessUser.id == log.user_id).first() if log.user_id else None

    # Build response manually to avoid ORM mapping issues
    response = ProductionLogWithDetails(
        **production_log_response_for_operation(db, log)
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

    # Add reviewer details (supervisor or manufacturing_coordinator)
    if reviewer:
        response.reviewer = reviewer_user_dict(reviewer)

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

    if "user_id" in update_data and update_data["user_id"] is not None:
        validate_production_log_reviewer(db, update_data["user_id"])

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
 
    # If this was the last remaining log for a part that had already been
    # marked 'completed', drop PartScheduleStatus to 'inactive' so it becomes
    # eligible for reactivation again.
    operation = db.query(Operation).filter(Operation.id == operation_id).first()
    if operation:
        _revert_completed_parts_to_inactive_if_logs_cleared(db, {operation.part_id})
    
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
    affected_operation_ids = {log.operation_id for log in logs_to_delete}
    for log in logs_to_delete:
        db.delete(log)
    
    db.commit()
 
    # Same as single-delete: any part that was 'completed' and now has zero
    # remaining production_logs drops to 'inactive'.
    affected_part_ids = set()
    if affected_operation_ids:
        affected_part_ids = {
            row[1] for row in db.query(Operation.id, Operation.part_id)
            .filter(Operation.id.in_(affected_operation_ids)).all()
        }
    _revert_completed_parts_to_inactive_if_logs_cleared(db, affected_part_ids)
    
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
    
    assigning_qty = any(
        v is not None
        for v in (
            status_update.approved_quantity,
            status_update.rework_quantity,
            status_update.rejected_quantity,
        )
    )
    needs_reviewer = (
        status_update.status != ProductionLogStatus.PENDING
        or assigning_qty
        or status_update.remarks is not None
    )

    if needs_reviewer:
        reviewer = validate_production_log_reviewer(db, status_update.user_id)
        assert_exclusive_reviewer(db, db_log, reviewer.id)
        db_log.user_id = reviewer.id
    
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

    total_presented = total_presented_on_log(
        db_log.produced_quantity or 0,
        db_log.operator_rework_quantity or 0,
    )

    # Validate that the sum of approved, rework, rejected equals what operator presented
    total_assigned = approved_qty + rework_qty + rejected_qty
    
    if status_update.status == "completed":
        if approved_qty != total_presented:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"For 'completed' status, approved quantity ({approved_qty}) must equal "
                    f"total presented ({total_presented} = "
                    f"{db_log.produced_quantity or 0} produced + "
                    f"{db_log.operator_rework_quantity or 0} rework)."
                )
            )
    elif status_update.status == "pending":
        pass
    else:
        if total_assigned != total_presented:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Total of approved ({approved_qty}) + rework ({rework_qty}) + "
                    f"rejected ({rejected_qty}) must equal total presented "
                    f"({total_presented} = {db_log.produced_quantity or 0} new produced + "
                    f"{db_log.operator_rework_quantity or 0} operator rework). "
                    f"Got {total_assigned} instead."
                )
            )

    # Partial-flow handoff: cannot approve more on this op than prior op released
    # (and other pending new-manufacture on this op already reserved).
    handoff = get_operation_handoff(
        db, db_log.operation_id, total_quantity, exclude_log_id=log_id
    )
    if handoff["has_predecessor"]:
        max_approvable = int(handoff["available_quantity"] or 0)
        if approved_qty > max_approvable:
            logger.warning(
                "Review approve blocked by upstream handoff cap",
                extra={
                    "event": "operation_handoff_approve_blocked",
                    "log_id": log_id,
                    "operation_id": db_log.operation_id,
                    "operation_number": getattr(operation, "operation_number", None),
                    "requested_approve": approved_qty,
                    "available_quantity": max_approvable,
                    "upstream_operation_id": handoff.get("upstream_operation_id"),
                    "upstream_operation_number": handoff.get("upstream_operation_number"),
                    "upstream_approved": handoff.get("upstream_approved"),
                    "self_approved": handoff.get("self_approved"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot approve {approved_qty} unit(s). Only "
                    f"{max_approvable} unit(s) are released from prior "
                    f"operation {handoff['upstream_operation_number']} "
                    f"(upstream approved={handoff['upstream_approved']}, "
                    f"already approved here={handoff['self_approved']})."
                ),
            )

    # Update the production log fields
    db_log.approved_quantity = approved_qty
    db_log.rework_quantity = rework_qty
    db_log.rejected_quantity = rejected_qty

    # Calculate remaining quantity to be produced
    total_approved_now = total_approved + approved_qty
    remaining_to_produce = remaining_to_close(total_quantity, total_approved_now)
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

    logger.info(
        "Production log reviewed",
        extra={
            "event": "production_log_reviewed",
            "log_id": log_id,
            "operation_id": db_log.operation_id,
            "operation_number": getattr(operation, "operation_number", None),
            "reviewer_id": db_log.user_id,
            "approved_quantity": approved_qty,
            "rework_quantity": rework_qty,
            "rejected_quantity": rejected_qty,
            "total_approved_on_operation": total_approved_now,
            "total_quantity": total_quantity,
            "to_status": db_log.status,
        },
    )

    # Approvals on this op are what unlock / raise the hard cap on the next op.
    if approved_qty > 0:
        logger.info(
            "Operation quantity released for downstream handoff",
            extra={
                "event": "operation_qty_released",
                "operation_id": db_log.operation_id,
                "operation_number": getattr(operation, "operation_number", None),
                "part_id": getattr(operation, "part_id", None),
                "approved_this_review": approved_qty,
                "total_approved_on_operation": total_approved_now,
                "total_quantity": total_quantity,
                "result_message": (
                    f"Op {getattr(operation, 'operation_number', db_log.operation_id)} "
                    f"now has {total_approved_now} approved unit(s) available "
                    f"to unlock the next schedulable operation (hard cap)."
                ),
            },
        )

    response = ProductionLogResponse(
        **production_log_response_for_operation(db, db_log, total_quantity)
    )


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
            logger.info(
                "Dynamic reschedule triggered after production review",
                extra={
                    "event": "dynamic_reschedule_triggered",
                    "trigger_source": "production_reviewed",
                    "log_id": log_id,
                    "operation_id": db_log.operation_id,
                    "part_id": part_id,
                    "to_status": db_log.status,
                },
            )

            # Unit-wise greedy refresh (does not touch batch rescheduling_items)
            try:
                from unit_wise_scheduler import rebuild_unit_schedule, unit_wise_enabled

                if unit_wise_enabled():
                    uw = rebuild_unit_schedule(
                        db,
                        part_id=part_id,
                        commit=True,
                    )
                    logger.info(
                        "Unit-wise rebuild after production review",
                        extra={
                            "event": "unit_wise_rebuild_triggered",
                            "trigger_source": "production_reviewed",
                            "part_id": part_id,
                            "rows_inserted": uw.get("rows_inserted"),
                            "schedule_version": uw.get("schedule_version"),
                        },
                    )
            except Exception as uw_err:
                logger.exception(
                    "Unit-wise rebuild failed after review (batch dynamic OK)",
                    extra={
                        "event": "unit_wise_rebuild_failed",
                        "part_id": part_id,
                        "error": str(uw_err),
                    },
                )

            # ── UPDATE PART STATUS TO COMPLETED IF ALL OPERATIONS DONE ──────────── #
            if part_id:
                from DB.models.oms import OrderPartPriority
                from DB.models.scheduling import PartScheduleStatus
                from sqlalchemy import text as sa_text

                # Check if all operations for this part are completed
                op_ids = [
                    row[0] for row in db.query(Operation.id)
                    .filter(Operation.part_id == part_id).all()
                ]
                if op_ids:
                    completed_count_row = db.execute(
                        sa_text("""
                            SELECT COUNT(DISTINCT operation_id)
                            FROM scheduling.production_logs
                            WHERE operation_id = ANY(:op_ids)
                              AND status = 'completed'
                        """),
                        {"op_ids": op_ids}
                    ).fetchone()
                    completed_count = completed_count_row[0] if completed_count_row else 0
 
                    # If all operations are completed, retire the part from the
                    # live priority queue and take it off the active schedule.
                    if completed_count == len(op_ids):
                        # Same advisory-lock key used everywhere OrderPartPriority is
                        # mutated (activation / deactivation / swap), so a completion
                        # event can never race with those and produce duplicate/gappy
                        # priorities.
                        _ADVISORY_LOCK_ORDER_PART_PRIORITY = 0x4F5050  # "OPP" in hex
                        db.execute(
                            sa_text("SELECT pg_advisory_xact_lock(:key)"),
                            {"key": _ADVISORY_LOCK_ORDER_PART_PRIORITY}
                        )
 
                        priority_record = db.query(OrderPartPriority).filter(
                            OrderPartPriority.part_id == part_id,
                            OrderPartPriority.status == "active"
                        ).first()
                        if priority_record:
                            sale_order_id_for_part = priority_record.order_id
 
                            # 1) Mark completed and pull it out of the active queue.
                            #    (priority=0 mirrors the convention already used for
                            #    deactivated rows — "not occupying a queue slot".)
                            priority_record.status = "completed"
                            priority_record.priority = 0
                            db.flush()
 
                            # 2) Re-pack remaining active rows to 1, 2, 3, ... so the
                            #    gap left behind is closed and swap/simulate-swap see
                            #    a clean, contiguous sequence.
                            active_rows = (
                                db.query(OrderPartPriority)
                                .filter(
                                    OrderPartPriority.status == "active",
                                    OrderPartPriority.priority > 0,
                                )
                                .order_by(
                                    OrderPartPriority.priority.asc(),
                                    OrderPartPriority.id.asc(),
                                )
                                .all()
                            )
                            for i, row in enumerate(active_rows, start=1):
                                row.priority = i
 
                            # 3) Flip PartScheduleStatus (PPS) to 'completed' so the
                            #    part drops out of "active parts" lists and can't be
                            #    picked up by the scheduler again. It stays
                            #    'completed' (not 'inactive') as long as its
                            #    production_logs history exists — see
                            #    _revert_completed_parts_to_inactive_if_logs_cleared,
                            #    which drops it to 'inactive' once that history is
                            #    cleared, matching the reactivation guard in
                            #    /update-part-status.
                            pps_record = db.query(PartScheduleStatus).filter(
                                PartScheduleStatus.sale_order_id == sale_order_id_for_part,
                                PartScheduleStatus.part_id == part_id
                            ).first()
                            if pps_record:
                                pps_record.status = "completed"
                                pps_record.updated_at = datetime.now(timezone.utc)
                                pps_record.start_date = None
 
                            db.commit()
                            logger.info(
                                "Part marked completed",
                                extra={
                                    "event": "part_marked_completed",
                                    "part_id": part_id,
                                    "order_id": sale_order_id_for_part,
                                    "completed_operations": len(op_ids),
                                    "remaining_active_parts": len(active_rows),
                                },
                            )
                
        except Exception as e:
            # Non-fatal: log the error but don't fail the approval
            logger.exception(
                "Dynamic reschedule after production review failed",
                extra={
                    "event": "dynamic_reschedule_failed",
                    "trigger_source": "production_reviewed",
                    "log_id": log_id,
                    "operation_id": db_log.operation_id,
                },
            )
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
        response_logs.append(
            ProductionLogResponse(**production_log_response_for_operation(db, log))
        )
    
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

    response_logs = []
    for log in logs:
        response_logs.append(
            ProductionLogResponse(**production_log_response_for_operation(db, log))
        )

    return response_logs

@router.post("/operation/{operation_id}/submit", response_model=ProductionLogResponse)
def submit_production_log(
    operation_id: int,
    submit_data: ProductionLogSubmit,
    db: Session = Depends(get_db)
):
    """
    Submit production log - updates the inprogress production log.

    produced_quantity       = new units manufactured (first run or reject replacement)
    rework_submit_quantity  = same parts reworked (NOT new order production)
    """
    from sqlalchemy.exc import OperationalError, ProgrammingError
    from DB.models.oms import Part, Operation

    try:
        db_log = db.query(ProductionLog).filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.operator_status == "inprogress",
        ).first()

        if not db_log:
            awaiting_review = db.query(ProductionLog).filter(
                ProductionLog.operation_id == operation_id,
                ProductionLog.operator_status == "completed",
                ProductionLog.status == "pending",
            ).first()
            if awaiting_review:
                logger.warning(
                    "Production log submit blocked",
                    extra={
                        "event": "production_log_submit_blocked",
                        "operation_id": operation_id,
                        "reason": "pending_reviewer_action",
                    },
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=pending_reviewer_log_block_message(
                        "submit production log"
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"No active production log found for operation {operation_id}. "
                    f"Please activate the job card first."
                ),
            )

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
        total_approved = total_approved_for_operation(db, operation_id)

        if total_approved >= total_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Production already completed. Total approved: {total_approved}, Total quantity: {total_quantity}."
            )

        work = get_operation_work_due(
            db, operation_id, total_quantity, exclude_log_id=db_log.id
        )
        try:
            validate_operator_submit(
                work,
                submit_data.produced_quantity,
                submit_data.rework_submit_quantity,
            )
        except HTTPException as exc:
            if "released" in str(exc.detail).lower():
                logger.warning(
                    "Submit blocked by upstream handoff cap",
                    extra={
                        "event": "operation_handoff_submit_blocked",
                        "operation_id": operation_id,
                        "operation_number": getattr(operation, "operation_number", None),
                        "produced_quantity": submit_data.produced_quantity,
                        "available_quantity": work.get("available_quantity"),
                        "upstream_operation_id": work.get("upstream_operation_id"),
                        "upstream_operation_number": work.get("upstream_operation_number"),
                        "upstream_approved": work.get("upstream_approved"),
                        "reason": exc.detail,
                    },
                )
            raise
        remaining_quantity = work["remaining_to_close"]

        current_time = datetime.now()

        db_log.produced_quantity = submit_data.produced_quantity
        db_log.operator_rework_quantity = submit_data.rework_submit_quantity
        db_log.notes = submit_data.notes
        db_log.to_date = current_time.date()
        db_log.to_time = current_time.time()
        db_log.operator_status = "completed"
        db_log.remaining_quantity_to_be_produced = remaining_quantity

        db.commit()
        db.refresh(db_log)

        logger.info(
            "Production log submitted",
            extra={
                "event": "production_log_submitted",
                "log_id": db_log.id,
                "operation_id": operation_id,
                "operation_number": getattr(operation, "operation_number", None),
                "operator_id": db_log.operator_id,
                "machine_id": db_log.machine_id,
                "produced_quantity": submit_data.produced_quantity,
                "rework_submit_quantity": submit_data.rework_submit_quantity,
                "available_quantity": work.get("available_quantity"),
                "upstream_operation_number": work.get("upstream_operation_number"),
                "upstream_approved": work.get("upstream_approved"),
            },
        )

        return ProductionLogResponse(
            **production_log_response_for_operation(db, db_log, total_quantity)
        )

    except HTTPException:
        db.rollback()
        raise
    except (OperationalError, ProgrammingError) as e:
        db.rollback()
        err = str(e).lower()
        if "operator_rework_quantity" in err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Database is missing column operator_rework_quantity. "
                    "Run: python migrations/add_operator_rework_quantity.py then restart the server."
                ),
            ) from e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while submitting production log: {e}",
        ) from e
    except Exception as e:
        db.rollback()
        logger.exception(
            "Production log submit failed",
            extra={
                "event": "production_log_submit_failed",
                "operation_id": operation_id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit production log: {e}",
        ) from e


@router.get("/operation/{operation_id}/status-summary")
def get_operation_production_status(operation_id: int, db: Session = Depends(get_db)):
    """
    Get production status summary for an operation including total approved vs required quantity
    and operator completion timestamps.
    """
    from sqlalchemy import text
    from DB.models.scheduling import OperationStatus
    
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
            COALESCE(SUM(operator_rework_quantity), 0) as total_operator_rework,
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
    operator_started_at = None
    operator_completed_at = None
    
    if logs:
        # Find earliest from_date + from_time
        for log in logs:
            if log.from_date and log.from_time:
                candidate = datetime.combine(log.from_date, log.from_time)
                if not start_time or candidate < start_time:
                    start_time = candidate
                if not operator_started_at or candidate < operator_started_at:
                    operator_started_at = candidate
        
        # Find latest to_date + to_time
        for log in logs:
            if log.to_date and log.to_time:
                candidate = datetime.combine(log.to_date, log.to_time)
                if log.operator_status == "completed":
                    if not operator_completed_at or candidate > operator_completed_at:
                        operator_completed_at = candidate
                if not end_time or candidate > end_time:
                    end_time = candidate

    op_status = db.query(OperationStatus).filter(
        OperationStatus.operation_id == operation_id
    ).first()
    if op_status:
        if op_status.started_at and (
            not operator_started_at or op_status.started_at < operator_started_at
        ):
            operator_started_at = op_status.started_at
        if not start_time:
            start_time = op_status.started_at
        if op_status.completed_at:
            if not operator_completed_at or op_status.completed_at > operator_completed_at:
                operator_completed_at = op_status.completed_at
            if not end_time or op_status.completed_at > end_time:
                end_time = op_status.completed_at
    
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
    
    work_due = get_operation_work_due(db, operation_id, required_quantity)

    return {
        "operation_id": operation_id,
        "operation_number": operation_number,
        "operation_name": operation_name,
        "required_quantity": required_quantity,
        "total_produced": stats.total_produced,
        "total_operator_rework_submitted": stats.total_operator_rework,
        "total_presented_for_review": stats.total_produced + stats.total_operator_rework,
        "total_approved": stats.total_approved,
        "total_rework": stats.total_rework,
        "total_rejected": stats.total_rejected,
        "remaining_to_close": work_due["remaining_to_close"],
        "rework_due": work_due["rework_due"],
        "reject_due": work_due["reject_due"],
        "fresh_needed": work_due.get("fresh_needed"),
        "max_produced_quantity": work_due.get("max_produced_quantity"),
        "max_rework_submit_quantity": work_due.get("max_rework_submit_quantity"),
        "completion_percentage": round(completion_percentage, 2),
        "is_completed": stats.total_approved >= required_quantity,
        "status": current_status,
        "start_time": start_time,
        "end_time": end_time,
        "operator_started_at": operator_started_at,
        "operator_completed_at": operator_completed_at,
        "machine_make": machine_make,
        "machine_model": machine_model
    }


@router.put("/{log_id}/acknowledge", response_model=ProductionLogResponse)
def acknowledge_production_log(
    log_id: int,
    operator_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Acknowledge a production log.
    - operator_id: operator acknowledges reviewer's response
    - user_id: supervisor or manufacturing_coordinator acknowledges operator submission
    """
    db_log = db.query(ProductionLog).filter(ProductionLog.id == log_id).first()
    
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Production log with id {log_id} not found"
        )
    
    if operator_id and db_log.operator_id != operator_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the operator who created this log can acknowledge it"
        )
    
    if user_id:
        validate_production_log_reviewer(db, user_id)
        if db_log.user_id and db_log.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the reviewer who approved this log can acknowledge it"
            )
    
    if not operator_id and not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either operator_id or user_id must be provided"
        )
    
    if operator_id:
        if db_log.status not in ["completed", "rework", "rejected", "inprogress"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operator can only acknowledge logs with status 'completed', 'rework', 'rejected', or 'inprogress'"
            )
    elif user_id:
        if db_log.status not in ["pending", "completed", "rework", "rejected", "inprogress"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reviewer can only acknowledge logs with status 'pending', 'completed', 'rework', 'rejected', or 'inprogress'"
            )
    
    if operator_id:
        db_log.operator_acknowledged = True
        db_log.operator_acknowledged_at = datetime.now()
    elif user_id:
        db_log.acknowledged = True
        db_log.acknowledged_at = datetime.now()
    
    db.commit()
    db.refresh(db_log)
    
    response = ProductionLogResponse(
        **production_log_response_for_operation(db, db_log)
    )
    
    return response

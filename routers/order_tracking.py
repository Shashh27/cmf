from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List, Optional

from DB.database import get_db
from DB.models.oms import (
    Order,
    Part,
    Operation,
)
from DB.models.scheduling import ProductionLog
from DB.models.access_control import AccessUser
from DB.schemas.oms import (
    OperationTrackingStatus,
    PartTrackingStatus,
    OrderTrackingStatus,
    OrderTrackingSummary,
)

router = APIRouter(prefix="/order-tracking", tags=["order-tracking"])


# =======================
# Helper Functions
# =======================

def get_operation_status_from_scheduling(db: Session, operation_ids: List[int]) -> dict:
    """
    Fetch operation status from scheduling.operation_status table.
    Returns a dictionary mapping operation_id to status details.
    """
    if not operation_ids:
        return {}
    
    try:
        placeholders = ','.join([str(oid) for oid in operation_ids])
        result = db.execute(
            text(f"""
                SELECT operation_id, status, started_at, completed_at, operator_id
                FROM scheduling.operation_status
                WHERE operation_id IN ({placeholders})
            """)
        )
        
        status_map = {}
        for row in result:
            status_map[row[0]] = {
                "status": row[1] if row[1] else "Pending",
                "started_at": row[2],
                "completed_at": row[3],
                "operator_id": row[4]
            }
        db.commit()
        return status_map
    except Exception as e:
        print(f"Error fetching operation status: {e}")
        db.rollback()
        # Return default values if query fails
        return {oid: {
            "status": "Pending",
            "started_at": None,
            "completed_at": None,
            "operator_id": None
        } for oid in operation_ids}


def calculate_part_status(operations: List[OperationTrackingStatus]) -> str:
    """
    Calculate part status based on operation statuses.
    - If all operations are completed: "Completed"
    - If any operation is in progress: "In Progress"
    - If no operations started: "Not Started"
    """
    if not operations:
        return "Not Started"
    
    completed_count = sum(1 for op in operations if op.status == "Completed")
    in_progress_count = sum(1 for op in operations if op.status in ["In Progress", "Started"])
    
    if completed_count == len(operations):
        return "Completed"
    elif in_progress_count > 0 or completed_count > 0:
        return "In Progress"
    else:
        return "Not Started"


def calculate_order_status(parts: List[PartTrackingStatus]) -> str:
    """
    Calculate order status based on part statuses.
    - If all parts are completed: "Completed"
    - If any part is in progress: "In Progress"
    - If no parts started: "Not Started"
    """
    if not parts:
        return "Not Started"
    
    completed_count = sum(1 for part in parts if part.status == "Completed")
    in_progress_count = sum(1 for part in parts if part.status == "In Progress")
    
    if completed_count == len(parts):
        return "Completed"
    elif in_progress_count > 0 or completed_count > 0:
        return "In Progress"
    else:
        return "Not Started"


# =======================
# Endpoints
# =======================

@router.get("/{order_id}", response_model=OrderTrackingStatus)
def get_order_tracking(order_id: int, db: Session = Depends(get_db)):
    """
    Get detailed tracking status for a specific order including all parts and their operations.
    Operation status is fetched from scheduling.operation_status table.
    """
    # Fetch order with related data
    order = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.product),
        joinedload(Order.admin),
        joinedload(Order.manufacturing_coordinator)
    ).filter(Order.id == order_id).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found"
        )
    
    # Fetch all parts for the order's product
    parts = db.query(Part).options(
        joinedload(Part.type)
    ).filter(Part.product_id == order.product_id).all()
    
    if not parts:
        return OrderTrackingStatus(
            order_id=order.id,
            sale_order_number=order.sale_order_number,
            customer_name=order.customer.company_name if order.customer else None,
            product_name=order.product.product_name if order.product else None,
            quantity=order.quantity,
            due_date=order.due_date,
            status=order.status,
            total_parts=0,
            completed_parts=0,
            pending_parts=0,
            completion_percentage=0.0,
            parts=[]
        )
    
    # Fetch all operations for all parts
    all_operations = []
    for part in parts:
        part_operations = db.query(Operation).filter(Operation.part_id == part.id).all()
        all_operations.extend(part_operations)
    
    # Get operation status from scheduling schema
    operation_ids = [op.id for op in all_operations]
    operation_status_map = get_operation_status_from_scheduling(db, operation_ids)
    
    # Fetch all production logs for these operations
    production_logs_map = {}
    if operation_ids:
        all_logs = db.query(ProductionLog).filter(ProductionLog.operation_id.in_(operation_ids)).all()
        for log in all_logs:
            if log.operation_id not in production_logs_map:
                production_logs_map[log.operation_id] = []
            
            # Calculate rework_quantity for the log
            rework_qty = 0
            if log.produced_quantity and log.approved_quantity:
                rework_qty = log.produced_quantity - log.approved_quantity
            elif log.produced_quantity and not log.approved_quantity:
                rework_qty = log.produced_quantity
            
            log.rework_quantity = rework_qty
            production_logs_map[log.operation_id].append(log)
    
    # Get operator names for operators
    operator_ids = set()
    for status_data in operation_status_map.values():
        if status_data["operator_id"]:
            operator_ids.add(status_data["operator_id"])
    
    operator_map = {}
    if operator_ids:
        operators = db.query(AccessUser).filter(AccessUser.id.in_(operator_ids)).all()
        operator_map = {op.id: op.user_name for op in operators}
    
    # Build part tracking status
    part_tracking_list = []
    completed_parts_count = 0
    
    for part in parts:
        part_operations = db.query(Operation).filter(Operation.part_id == part.id).all()
        
        operation_tracking_list = []
        completed_operations_count = 0
        required_qty = part.qty or 0
        
        for op in part_operations:
            op_status = operation_status_map.get(op.id, {
                "status": "Pending",
                "started_at": None,
                "completed_at": None,
                "operator_id": None
            })
            
            # Fetch production logs for this operation
            logs = production_logs_map.get(op.id, [])
            total_approved = sum(log.approved_quantity or 0 for log in logs)
            
            # Determine if operation is in progress or completed based on production logs
            status = op_status["status"]
            
            if required_qty > 0 and total_approved >= required_qty:
                status = "Completed"
            elif len(logs) > 0:
                status = "In Progress"
            elif op_status["completed_at"]:
                status = "Completed"
            elif op_status["started_at"]:
                status = "In Progress"
            else:
                status = "Pending"
            
            if status == "Completed":
                completed_operations_count += 1
            
            operation_tracking_list.append(OperationTrackingStatus(
                operation_id=op.id,
                operation_number=op.operation_number,
                operation_name=op.operation_name,
                status=status,
                started_at=op_status["started_at"] or (logs[0].created_at if logs else None),
                completed_at=op_status["completed_at"] or (logs[-1].created_at if status == "Completed" and logs else None),
                operator_id=op_status["operator_id"] or (logs[0].operator_id if logs else None),
                operator_name=operator_map.get(op_status["operator_id"] or (logs[0].operator_id if logs else None)),
                production_logs=logs
            ))
        
        # Calculate part status
        total_ops = len(part_operations)
        completed_ops = completed_operations_count
        pending_ops = total_ops - completed_ops
        completion_pct = (completed_ops / total_ops * 100) if total_ops > 0 else 0.0
        
        part_status = calculate_part_status(operation_tracking_list)
        
        if part_status == "Completed":
            completed_parts_count += 1
        
        part_tracking_list.append(PartTrackingStatus(
            part_id=part.id,
            part_name=part.part_name,
            part_number=part.part_number,
            part_type_name=part.type.type_name if part.type else None,
            status=part_status,
            total_operations=total_ops,
            completed_operations=completed_ops,
            pending_operations=pending_ops,
            completion_percentage=completion_pct,
            operations=operation_tracking_list
        ))
    
    # Calculate order-level metrics
    total_parts_count = len(parts)
    pending_parts_count = total_parts_count - completed_parts_count
    order_completion_pct = (completed_parts_count / total_parts_count * 100) if total_parts_count > 0 else 0.0
    
    order_status = calculate_order_status(part_tracking_list)
    
    return OrderTrackingStatus(
        order_id=order.id,
        sale_order_number=order.sale_order_number,
        customer_name=order.customer.company_name if order.customer else None,
        product_name=order.product.product_name if order.product else None,
        quantity=order.quantity,
        due_date=order.due_date,
        status=order_status,
        total_parts=total_parts_count,
        completed_parts=completed_parts_count,
        pending_parts=pending_parts_count,
        completion_percentage=order_completion_pct,
        parts=part_tracking_list
    )


@router.get("/{order_id}/summary", response_model=OrderTrackingSummary)
def get_order_tracking_summary(order_id: int, db: Session = Depends(get_db)):
    """
    Get summary tracking status for a specific order (without detailed operations).
    """
    # Fetch order
    order = db.query(Order).filter(Order.id == order_id).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found"
        )
    
    # Fetch all parts for the order's product
    parts = db.query(Part).filter(Part.product_id == order.product_id).all()
    
    if not parts:
        return OrderTrackingSummary(
            order_id=order.id,
            sale_order_number=order.sale_order_number,
            total_parts=0,
            completed_parts=0,
            pending_parts=0,
            completion_percentage=0.0,
            overall_status="Not Started"
        )
    
    # Fetch all operations for all parts
    all_operations = []
    for part in parts:
        part_operations = db.query(Operation).filter(Operation.part_id == part.id).all()
        all_operations.extend(part_operations)
    
    # Get operation status from scheduling schema
    operation_ids = [op.id for op in all_operations]
    operation_status_map = get_operation_status_from_scheduling(db, operation_ids)
    
    # Calculate part statuses
    completed_parts_count = 0
    part_tracking_list = []
    
    # Get all production logs for these operations
    production_logs_map = {}
    if operation_ids:
        all_logs = db.query(ProductionLog).filter(ProductionLog.operation_id.in_(operation_ids)).all()
        for log in all_logs:
            if log.operation_id not in production_logs_map:
                production_logs_map[log.operation_id] = []
            production_logs_map[log.operation_id].append(log)

    for part in parts:
        part_operations = db.query(Operation).filter(Operation.part_id == part.id).all()
        required_qty = part.qty or 0
        
        operation_tracking_list = []
        completed_operations_count = 0
        
        for op in part_operations:
            op_status = operation_status_map.get(op.id, {
                "status": "Pending",
                "started_at": None,
                "completed_at": None,
                "operator_id": None
            })
            
            # Fetch production logs for this operation
            logs = production_logs_map.get(op.id, [])
            total_approved = sum(log.approved_quantity or 0 for log in logs)
            
            status = op_status["status"]
            if required_qty > 0 and total_approved >= required_qty:
                status = "Completed"
            elif len(logs) > 0:
                status = "In Progress"
            elif op_status["completed_at"]:
                status = "Completed"
            elif op_status["started_at"]:
                status = "In Progress"
            else:
                status = "Pending"
            
            if status == "Completed":
                completed_operations_count += 1
            
            operation_tracking_list.append(OperationTrackingStatus(
                operation_id=op.id,
                operation_number=op.operation_number,
                operation_name=op.operation_name,
                status=status,
                started_at=op_status["started_at"] or (logs[0].created_at if logs else None),
                completed_at=op_status["completed_at"] or (logs[-1].created_at if status == "Completed" and logs else None),
                operator_id=op_status["operator_id"] or (logs[0].operator_id if logs else None),
                operator_name=None
            ))
        
        part_status = calculate_part_status(operation_tracking_list)
        
        if part_status == "Completed":
            completed_parts_count += 1
        
        part_tracking_list.append(PartTrackingStatus(
            part_id=part.id,
            part_name=part.part_name,
            part_number=part.part_number,
            part_type_name=None,
            status=part_status,
            total_operations=len(part_operations),
            completed_operations=completed_operations_count,
            pending_operations=len(part_operations) - completed_operations_count,
            completion_percentage=(completed_operations_count / len(part_operations) * 100) if len(part_operations) > 0 else 0.0,
            operations=[]
        ))
    
    # Calculate order-level metrics
    total_parts_count = len(parts)
    pending_parts_count = total_parts_count - completed_parts_count
    order_completion_pct = (completed_parts_count / total_parts_count * 100) if total_parts_count > 0 else 0.0
    order_status = calculate_order_status(part_tracking_list)
    
    return OrderTrackingSummary(
        order_id=order.id,
        sale_order_number=order.sale_order_number,
        total_parts=total_parts_count,
        completed_parts=completed_parts_count,
        pending_parts=pending_parts_count,
        completion_percentage=order_completion_pct,
        overall_status=order_status
    )


@router.get("/", response_model=List[OrderTrackingSummary])
def get_all_orders_tracking(
    admin_id: Optional[int] = None,
    manufacturing_coordinator_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get tracking summary for all orders. 
    Optionally filter by admin_id or manufacturing_coordinator_id.
    """
    # Build query with filters
    query = db.query(Order)
    
    if admin_id is not None:
        query = query.filter(Order.admin_id == admin_id)
    
    if manufacturing_coordinator_id is not None:
        query = query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)
    
    orders = query.all()
    
    tracking_summaries = []
    
    for order in orders:
        try:
            summary = get_order_tracking_summary(order.id, db)
            tracking_summaries.append(summary)
        except Exception as e:
            print(f"Error getting tracking for order {order.id}: {e}")
            continue
    
    return tracking_summaries


@router.get("/part/{part_id}", response_model=PartTrackingStatus)
def get_part_tracking(part_id: int, db: Session = Depends(get_db)):
    """
    Get detailed tracking status for a specific part including all its operations.
    """
    # Fetch part with type
    part = db.query(Part).options(
        joinedload(Part.type)
    ).filter(Part.id == part_id).first()
    
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )
    
    # Fetch operations for the part
    operations = db.query(Operation).filter(Operation.part_id == part.id).all()
    
    # Get operation status from scheduling schema
    operation_ids = [op.id for op in operations]
    operation_status_map = get_operation_status_from_scheduling(db, operation_ids)
    
    # Fetch all production logs for these operations
    production_logs_map = {}
    if operation_ids:
        all_logs = db.query(ProductionLog).filter(ProductionLog.operation_id.in_(operation_ids)).all()
        for log in all_logs:
            if log.operation_id not in production_logs_map:
                production_logs_map[log.operation_id] = []
            
            # Calculate rework_quantity for the log
            rework_qty = 0
            if log.produced_quantity and log.approved_quantity:
                rework_qty = log.produced_quantity - log.approved_quantity
            elif log.produced_quantity and not log.approved_quantity:
                rework_qty = log.produced_quantity
            
            log.rework_quantity = rework_qty
            production_logs_map[log.operation_id].append(log)
    
    # Get operator names
    operator_ids = set()
    for status_data in operation_status_map.values():
        if status_data["operator_id"]:
            operator_ids.add(status_data["operator_id"])
    
    operator_map = {}
    if operator_ids:
        operators = db.query(AccessUser).filter(AccessUser.id.in_(operator_ids)).all()
        operator_map = {op.id: op.user_name for op in operators}
    
    # Build operation tracking list
    operation_tracking_list = []
    completed_operations_count = 0
    required_qty = part.qty or 0
    
    for op in operations:
        op_status = operation_status_map.get(op.id, {
            "status": "Pending",
            "started_at": None,
            "completed_at": None,
            "operator_id": None
        })
        
        # Fetch production logs for this operation
        logs = production_logs_map.get(op.id, [])
        total_approved = sum(log.approved_quantity or 0 for log in logs)
        
        # Determine if operation is in progress or completed based on production logs
        status = op_status["status"]
        
        if required_qty > 0 and total_approved >= required_qty:
            status = "Completed"
        elif len(logs) > 0:
            status = "In Progress"
        elif op_status["completed_at"]:
            status = "Completed"
        elif op_status["started_at"]:
            status = "In Progress"
        else:
            status = "Pending"
        
        if status == "Completed":
            completed_operations_count += 1
        
        operation_tracking_list.append(OperationTrackingStatus(
            operation_id=op.id,
            operation_number=op.operation_number,
            operation_name=op.operation_name,
            status=status,
            started_at=op_status["started_at"] or (logs[0].created_at if logs else None),
            completed_at=op_status["completed_at"] or (logs[-1].created_at if status == "Completed" and logs else None),
            operator_id=op_status["operator_id"] or (logs[0].operator_id if logs else None),
            operator_name=operator_map.get(op_status["operator_id"] or (logs[0].operator_id if logs else None)),
            production_logs=logs
        ))
    
    # Calculate part metrics
    total_ops = len(operations)
    completed_ops = completed_operations_count
    pending_ops = total_ops - completed_ops
    completion_pct = (completed_ops / total_ops * 100) if total_ops > 0 else 0.0
    
    part_status = calculate_part_status(operation_tracking_list)
    
    return PartTrackingStatus(
        part_id=part.id,
        part_name=part.part_name,
        part_number=part.part_number,
        part_type_name=part.type.type_name if part.type else None,
        status=part_status,
        total_operations=total_ops,
        completed_operations=completed_ops,
        pending_operations=pending_ops,
        completion_percentage=completion_pct,
        operations=operation_tracking_list
    )

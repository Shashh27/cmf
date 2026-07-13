from datetime import date, datetime, time
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import Any, Dict, List, Optional, Tuple

from DB.database import get_db
from DB.models.oms import (
    Order,
    Part,
    Operation,
)
from DB.models.configuration import Machine
from DB.models.access_control import AccessUser
from DB.schemas.oms import (
    OperationTrackingStatus,
    PartTrackingStatus,
    OrderTrackingStatus,
    OrderTrackingSummary,
)

router = APIRouter(prefix="/order-tracking", tags=["order-tracking"])

QTY_DEFAULT_FIELDS = (
    "produced_quantity",
    "approved_quantity",
    "rework_quantity",
    "rejected_quantity",
    "operator_rework_quantity",
    "remaining_quantity_to_be_produced",
    "remaining_to_close",
    "rework_due",
    "reject_due",
)


# =======================
# Helper Functions
# =======================

def _normalize_status(value: Optional[str]) -> str:
    if not value:
        return ""
    return str(value).lower().replace("_", " ").strip()


def _is_in_progress_status(value: Optional[str]) -> bool:
    normalized = _normalize_status(value)
    return normalized in ("in progress", "inprogress", "started")


def _serialize_log_value(value: Any) -> Any:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return value


def _row_to_log_dict(row) -> Dict[str, Any]:
    log_dict = {key: _serialize_log_value(val) for key, val in dict(row._mapping).items()}
    for field in QTY_DEFAULT_FIELDS:
        if field not in log_dict or log_dict[field] is None:
            log_dict[field] = 0
    return log_dict


def _fetch_production_logs_for_operations(
    db: Session,
    operation_ids: List[int],
) -> Tuple[Dict[int, List[dict]], Dict[int, dict]]:
    """
    Load all production log columns for the given operations, sorted by stage (created_at ASC).
    Operation status aggregates use the latest log snapshot for approved qty.
    """
    production_logs_map: Dict[int, List[dict]] = {}
    operation_final_status_map: Dict[int, dict] = {}

    if not operation_ids:
        return production_logs_map, operation_final_status_map

    logs_query = text("""
        SELECT *
        FROM scheduling.production_logs
        WHERE operation_id IN :op_ids
        ORDER BY operation_id ASC, created_at ASC, id ASC
    """)
    all_logs = db.execute(logs_query, {"op_ids": tuple(operation_ids)}).fetchall()

    for log in all_logs:
        op_id = log.operation_id
        log_dict = _row_to_log_dict(log)
        production_logs_map.setdefault(op_id, []).append(log_dict)

        if op_id not in operation_final_status_map:
            operation_final_status_map[op_id] = {
                "has_in_progress": False,
                "total_approved": 0,
                "first_started": None,
                "last_completed": None,
                "operator_id": None,
            }

        status_info = operation_final_status_map[op_id]
        if _is_in_progress_status(log.operator_status) or _is_in_progress_status(log.status):
            status_info["has_in_progress"] = True

        log_created_at = log.created_at
        if status_info["first_started"] is None or log_created_at < status_info["first_started"]:
            status_info["first_started"] = log_created_at
            status_info["operator_id"] = log.operator_id

        if status_info["last_completed"] is None or log_created_at > status_info["last_completed"]:
            status_info["last_completed"] = log_created_at
            status_info["total_approved"] = log.approved_quantity or 0

    return production_logs_map, operation_final_status_map


def _resolve_operation_status(
    logs: List[dict],
    status_info: dict,
    required_qty: int,
) -> str:
    total_approved = status_info.get("total_approved", 0)
    if required_qty > 0 and total_approved >= required_qty:
        return "Completed"
    if status_info.get("has_in_progress"):
        return "In Progress"
    if logs:
        return "In Progress"
    return "Pending"


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
        part_operations = db.query(Operation).options(
            joinedload(Operation.machine)
        ).filter(Operation.part_id == part.id).all()
        all_operations.extend(part_operations)
    
    # Fetch all production logs for these operations
    operation_ids = [op.id for op in all_operations]
    production_logs_map, operation_final_status_map = _fetch_production_logs_for_operations(
        db, operation_ids
    )
    
    # Get operator names for operators
    operator_ids = set()
    for status_info in operation_final_status_map.values():
        if status_info["operator_id"]:
            operator_ids.add(status_info["operator_id"])
    
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
            status_info = operation_final_status_map.get(op.id, {
                "has_in_progress": False,
                "total_approved": 0,
                "first_started": None,
                "last_completed": None,
                "operator_id": None
            })
            
            # Fetch production logs for this operation
            logs = production_logs_map.get(op.id, [])
            status = _resolve_operation_status(logs, status_info, required_qty)
            
            if status == "Completed":
                completed_operations_count += 1
            
            operation_tracking_list.append(OperationTrackingStatus(
                operation_id=op.id,
                operation_number=op.operation_number,
                operation_name=op.operation_name,
                status=status,
                started_at=status_info["first_started"],
                completed_at=status_info["last_completed"] if status == "Completed" else None,
                operator_id=status_info["operator_id"],
                operator_name=operator_map.get(status_info["operator_id"]),
                production_logs=logs,
                machine_id=op.machine_id,
                machine_make=op.machine.make if op.machine else None,
                machine_model=op.machine.model if op.machine else None,
                machine_name=f"{op.machine.make} {op.machine.model}" if op.machine and op.machine.make and op.machine.model else None
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
        part_operations = db.query(Operation).options(
            joinedload(Operation.machine)
        ).filter(Operation.part_id == part.id).all()
        all_operations.extend(part_operations)
    
    # Get operation status logic
    operation_ids = [op.id for op in all_operations]
    
    # Calculate part statuses
    completed_parts_count = 0
    part_tracking_list = []
    
    production_logs_map, operation_final_status_map = _fetch_production_logs_for_operations(
        db, operation_ids
    )

    for part in parts:
        part_operations = db.query(Operation).filter(Operation.part_id == part.id).all()
        required_qty = part.qty or 0
        
        operation_tracking_list = []
        completed_operations_count = 0
        
        for op in part_operations:
            status_info = operation_final_status_map.get(op.id, {
                "has_in_progress": False,
                "total_approved": 0,
                "first_started": None,
                "last_completed": None,
                "operator_id": None
            })
            
            # Fetch production logs for this operation
            logs = production_logs_map.get(op.id, [])
            status = _resolve_operation_status(logs, status_info, required_qty)
            
            if status == "Completed":
                completed_operations_count += 1
            
            operation_tracking_list.append(OperationTrackingStatus(
                operation_id=op.id,
                operation_number=op.operation_number,
                operation_name=op.operation_name,
                status=status,
                started_at=status_info["first_started"],
                completed_at=status_info["last_completed"] if status == "Completed" else None,
                operator_id=status_info["operator_id"],
                operator_name=None,
                machine_id=op.machine_id,
                machine_make=op.machine.make if op.machine else None,
                machine_model=op.machine.model if op.machine else None,
                machine_name=f"{op.machine.make} {op.machine.model}" if op.machine and op.machine.make and op.machine.model else None
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
    operations = db.query(Operation).options(
        joinedload(Operation.machine)
    ).filter(Operation.part_id == part.id).all()
    
    # Get operation status logic
    operation_ids = [op.id for op in operations]
    
    production_logs_map, operation_final_status_map = _fetch_production_logs_for_operations(
        db, operation_ids
    )
    
    # Get operator names
    operator_ids = set()
    for status_info in operation_final_status_map.values():
        if status_info["operator_id"]:
            operator_ids.add(status_info["operator_id"])
    
    operator_map = {}
    if operator_ids:
        operators = db.query(AccessUser).filter(AccessUser.id.in_(operator_ids)).all()
        operator_map = {op.id: op.user_name for op in operators}
    
    # Build operation tracking list
    operation_tracking_list = []
    completed_operations_count = 0
    required_qty = part.qty or 0
    
    for op in operations:
        status_info = operation_final_status_map.get(op.id, {
            "has_in_progress": False,
            "total_approved": 0,
            "first_started": None,
            "last_completed": None,
            "operator_id": None
        })
        
        # Fetch production logs for this operation
        logs = production_logs_map.get(op.id, [])
        status = _resolve_operation_status(logs, status_info, required_qty)
        
        if status == "Completed":
            completed_operations_count += 1
        
        operation_tracking_list.append(OperationTrackingStatus(
            operation_id=op.id,
            operation_number=op.operation_number,
            operation_name=op.operation_name,
            status=status,
            started_at=status_info["first_started"],
            completed_at=status_info["last_completed"] if status == "Completed" else None,
            operator_id=status_info["operator_id"],
            operator_name=operator_map.get(status_info["operator_id"]),
            production_logs=logs,
            machine_id=op.machine_id,
            machine_make=op.machine.make if op.machine else None,
            machine_model=op.machine.model if op.machine else None,
            machine_name=f"{op.machine.make} {op.machine.model}" if op.machine and op.machine.make and op.machine.model else None
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

from bisect import insort_right
from threading import active_count
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional

# from sqlalchemy import cast, Integer  


from sqlalchemy import exists
from DB.database import get_db

from DB.models.oms import Order
from DB.models.scheduling import PartScheduleStatus, OrderScheduleStatus, MachineSchedule, ScheduleHistory, PlannedScheduleItem, EfficiencyFactor, ShiftHoursConfiguration
from DB.models.oms import Order, Part, Product
from DB.models.configuration import Machine, WorkCenter
from DB.models.oms import Operation, Part, Order, PartType

from DB.schemas.machine_scheduling import PartStatusUpdate, UpdatePartStatusResponse, OrderScheduleStatusResponse

from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Tuple
import calendar


# from services.scheduler_engine import run_scheduler














router = APIRouter(prefix="/scheduling", tags=["scheduling"])





def overlap_with_shift(downtime_start: datetime, downtime_end: datetime, shift_start_hour: int = 6,
                       shift_end_hour: int = 22) -> float:
    """
    Calculate the overlap in hours between a downtime interval and working shift hours for each day.
    shift_start_hour: hour when shift starts (inclusive)
    shift_end_hour: hour when shift ends (exclusive)
    Returns total overlap in hours (float)
    """
    # Optimize: If downtime is completely outside shift hours, return 0
    if downtime_end <= downtime_start:
        return 0.0

    # Optimize: If downtime spans multiple days, calculate more efficiently
    total_overlap = 0.0
    current = downtime_start

    # Calculate shift duration once
    shift_duration = shift_end_hour - shift_start_hour

    while current < downtime_end:
        # Define shift for this day
        shift_start = current.replace(hour=shift_start_hour, minute=0, second=0, microsecond=0)
        shift_end = current.replace(hour=shift_end_hour, minute=0, second=0, microsecond=0)

        # If shift_end is before shift_start (overnight shift), add a day
        if shift_end <= shift_start:
            shift_end += timedelta(days=1)

        # Calculate overlap for this day
        interval_start = max(current, shift_start)
        interval_end = min(downtime_end, shift_end)

        if interval_start < interval_end:
            total_overlap += (interval_end - interval_start).total_seconds() / 3600

        # Move to next day
        next_day = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        current = next_day

    return total_overlap




# =========================================================
# SET ORDER STATUS
# =========================================================

@router.post("/set-order-status/{sale_order_id}")
def set_order_status(
    sale_order_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    if status not in ["active", "inactive"]:
        raise HTTPException(400, "Status must be active/inactive")

    # -----------------------------
    # Get order
    # -----------------------------
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(404, "Order not found")

    if not order.product:
        raise HTTPException(400, "Order has no product")

    parts = [p for p in order.product.parts if p.type_id == 1]

    if not parts:
        raise HTTPException(400, "No parts found for this order's product")

    now = datetime.now(timezone.utc)

    # -----------------------------
    # Loop through parts
    # -----------------------------
    for part in parts:

        record = db.query(PartScheduleStatus).filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.part_id == part.id
        ).first()

        # CREATE
        if not record:
            record = PartScheduleStatus(
                sale_order_id=sale_order_id,
                part_id=part.id,
                status=status,
                start_date=now if status == "active" else None,
                created_at=now,
                updated_at=now
            )
            db.add(record)

        # UPDATE
        else:
            record.status = status
            record.updated_at = now
            record.start_date = now if status == "active" else None
    
    db.flush()
    
    active_count = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active"
    ).count()

    active_inhouse_count = db.query(PartScheduleStatus).join(Part, Part.id == PartScheduleStatus.part_id).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        Part.type_id == 1
    ).count()

    order_status = "active" if active_count > 0 else "inactive"

    summary = db.query(OrderScheduleStatus).filter(
        OrderScheduleStatus.order_id == sale_order_id
    ).first()

    if not summary:
        summary = OrderScheduleStatus(
            order_id=sale_order_id,
            product_id=order.product_id,
            active_parts_count=active_count,
            active_inhouse_parts=active_inhouse_count,
            status=order_status,
            activated_at=now if order_status == "active" else None,
            updated_at=now
        )
        db.add(summary)

    else:
        summary.active_parts_count = active_count
        summary.active_inhouse_parts = active_inhouse_count
        summary.status = order_status
        summary.updated_at = now
        summary.activated_at = now if status == "active" else None

        # only set activated_at when transitioning to active
        if order_status == "active" and not summary.activated_at:
            summary.activated_at = now

        # clear when inactive
        if order_status == "inactive":
            summary.activated_at = None


    db.commit()

    return {
        "message": f"In-house parts of Order {sale_order_id} set to {status}",
        "inhouse_parts_count": len(parts)
    }


# =========================================================
# GET ACTIVE PARTS FOR A SALE ORDER
# =========================================================
@router.get("/active-parts/{sale_order_id}")
def get_active_parts_for_order(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    records = (
        db.query(PartScheduleStatus, Part)
        .join(Part, Part.id == PartScheduleStatus.part_id)
        .filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active"
        )
        .all()
    )

    result = []

    for schedule, part in records:
        result.append({
            "sale_order_id": sale_order_id,
            "part_id": part.id,
            "part_number": part.part_number,   # if exists
            "status": schedule.status,
            "start_date": schedule.start_date,
            "quantity": order.quantity
        })

    return {"active_parts": result}


# =========================================================
# ALL ORDERS → PART STATUS
# =========================================================
@router.get("/orders-parts-status")
def get_all_orders_parts_status(db: Session = Depends(get_db)):

    orders = db.query(Order).all()
    response = []

    for order in orders:

        product = order.product
        if not product:
            continue

        # get parts of this product
        parts = db.query(Part).filter(
            Part.product_id == product.id
        ).all()

        # get schedule records for this order
        schedule_records = db.query(PartScheduleStatus).filter(
            PartScheduleStatus.sale_order_id == order.id
        ).all()

        # create lookup dictionary
        schedule_map = {r.part_id: r for r in schedule_records}

        for part in parts:

            status_record = schedule_map.get(part.id)

            response.append({
                "sale_order_id": order.id,
                "sale_order_number": order.sale_order_number,
                "product_id": product.id,
                "product_name": product.product_name,
                "part_id": part.id,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "part_type": part.type.type_name if part.type else None,
                "status": status_record.status if status_record else "inactive",
                "start_date": status_record.start_date if status_record else None
            })

    return {"orders": response}


# =========================================================
# GET MAKE (IN-HOUSE) PARTS FOR ORDER
# =========================================================
@router.get("/make-parts/{sale_order_id}")
def get_make_parts_for_order(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.type_name == "IN-House"
    ).all()

    return {
        "sale_order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,  # optional display
        "product_id": order.product_id,
        "make_parts": [
            {
                "part_id": p.id,
                "part_name": p.part_name,
                "part_number": p.part_number
            }
            for p in parts
        ]
    }


# =========================================================
# GET BUY (OUTSOURCE) PARTS FOR ORDER
# =========================================================
@router.get("/buy-parts/{sale_order_id}")
def get_buy_parts_for_order(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.type_name == "Out-Source"
    ).all()

    return {
        "sale_order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,
        "product_id": order.product_id,
        "buy_parts": [
            {
                "part_id": p.id,
                "part_name": p.part_name,
                "part_number": p.part_number
            }
            for p in parts
        ]
    }



# =========================================================
# UPDATE PART STATUS FOR ORDER
# =========================================================
@router.put(
    "/update-part-status/{sale_order_id}/{part_id}",
    response_model=UpdatePartStatusResponse
)
def update_part_status(
    sale_order_id: int,
    part_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    """
    Update status of a single part for a specific order
    Dynamic per-order per-part control
    """

    if status not in ["active", "inactive"]:
        raise HTTPException(400, "Status must be active/inactive")

    # ----------------------------
    # Check order exists
    # ----------------------------
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()

    if not order:
        raise HTTPException(404, "Order not found")

    # ----------------------------
    # Check part exists
    # ----------------------------
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.product_id == order.product_id   # part belongs to that product
    ).first()

    if not part:
        raise HTTPException(404, "Part not found for this order")

    # ----------------------------
    # Get part type
    # ----------------------------
    part_type = db.query(PartType).filter(
        PartType.id == part.type_id
    ).first()

    part_type_name = part_type.type_name  # IN-House / Out-Source

    # ----------------------------
    # Existing status record?
    # ----------------------------
    record = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.part_id == part_id
    ).first()

    now_utc = datetime.now(timezone.utc)

    # ----------------------------
    # IF RECORD EXISTS
    # ----------------------------
    if record:
        # already same status
        if record.status == status:
            return {
                "message": f"Part already {status}",
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "part_type": part_type_name,
                "status": status,
                "will_be_scheduled": part_type_name == "IN-House" and status == "active"
            }

        # update
        record.status = status
        record.updated_at = now_utc
        record.start_date = now_utc if status == "active" else None

        # if status == "active":
        #     record.start_date = now_utc
        # else:
        #     record.start_date = None

    else:
        # create new record
        record = PartScheduleStatus(
            sale_order_id=sale_order_id,
            part_id=part_id,
            status=status,
            created_at=now_utc,
            updated_at=now_utc,
            start_date=now_utc if status == "active" else None
        )
        db.add(record)

    db.commit()

    # ----------------------------
    # RESPONSE LOGIC
    # ----------------------------
    if part_type_name == "Out-Source":
        return {
            "message": "Part status updated",
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "part_type": part_type_name,
            "status": status,
            "will_be_scheduled": False,
            "note": "Out-source parts are not scheduled on machines"
        }

    # IN-HOUSE
    return {
        "message": "Part status updated",
        "sale_order_id": sale_order_id,
        "part_id": part_id,
        "part_type": part_type_name,
        "status": status,
        "will_be_scheduled": status == "active"
    }


@router.get("/order-status/{sale_order_id}")
def get_order_status(sale_order_id: int, db: Session = Depends(get_db)):
    """
    Order is active if any part is active.
    Otherwise inactive.
    """
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    # check if ANY active part exists
    active_exists = db.query(
        exists().where(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active"
        )
    ).scalar()

    order_status = "active" if active_exists else "inactive"

    return {
        "order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,
        "order_status": order_status
    }

@router.get("/order-summary/{sale_order_id}", response_model=OrderScheduleStatusResponse)
def get_order_summary(sale_order_id: int, db: Session = Depends(get_db)):

    summary = db.query(OrderScheduleStatus).filter(
        OrderScheduleStatus.order_id == sale_order_id
    ).first()

    if not summary:
        raise HTTPException(404, "Summary not found")

    return summary


# @router.post("/run-scheduler")
# def execute_scheduler(db: Session = Depends(get_db)):
#     """
#     Generate ADMIN planned schedule
#     """
#     return run_scheduler(db)



# @router.get("/planned-schedule")
# def get_planned_schedule(db: Session = Depends(get_db)):

#     schedules = (
#         db.query(MachineSchedule)
#         .order_by(
#             MachineSchedule.machine_id,
#             MachineSchedule.start_time
#         )
#         .all()
#     )

#     return [
#         {
#             "schedule_id": s.id,
#             "order_id": s.sale_order_id,
#             "part_id": s.part_id,
#             "operation_id": s.operation_id,
#             "machine_id": s.machine_id,
#             "start_time": s.start_time,
#             "end_time": s.end_time,
#             "status": s.status,
#         }
#         for s in schedules
#     ]



  


# @router.get("/planned")
# def get_planned_schedule(db: Session = Depends(get_db)):
#     """
#     Returns planned schedule for Gantt chart
#     """

#     schedules = (
#         db.query(MachineSchedule, Machine, Operation, Part, Order)
#         .join(Machine, Machine.id == MachineSchedule.machine_id)
#         .join(Operation, Operation.id == MachineSchedule.operation_id)
#         .join(Part, Part.id == MachineSchedule.part_id)
#         .join(Order, Order.id == MachineSchedule.order_id)
#         .order_by(MachineSchedule.start_time)
#         .all()
#     )

#     result = []

#     for sched, machine, op, part, order in schedules:
#         result.append({
#             "schedule_id": sched.id,
#             "machine": machine.make,
#             "part_number": part.part_number,
#             "operation": op.operation_name,
#             "sale_order": order.sale_order_number,
#             "start_time": sched.start_time,
#             "end_time": sched.end_time,
#             "status": sched.status
#         })

#     return result


# =========================================================
# OPTIMIZED SCHEDULE GENERATION FOR ACTIVE IN-HOUSE PARTS
# =========================================================

def _get_efficiency_factor(db: Session) -> float:
    """Get efficiency factor from database"""
    efficiency_record = db.query(EfficiencyFactor).first()
    return efficiency_record.efficiency_factor if efficiency_record else 0.85

def _calculate_operation_duration(operation: Operation, quantity: int, efficiency_factor: float) -> float:
    """Calculate operation duration in hours including setup and cycle time"""
    setup_seconds = 0
    cycle_seconds = 0
    
    if operation.setup_time:
        setup_seconds = (
            operation.setup_time.hour * 3600 + 
            operation.setup_time.minute * 60 + 
            operation.setup_time.second
        )
    
    if operation.cycle_time:
        cycle_seconds = (
            operation.cycle_time.hour * 3600 + 
            operation.cycle_time.minute * 60 + 
            operation.cycle_time.second
        )
    
    total_seconds = setup_seconds + (cycle_seconds * quantity)
    total_hours = total_seconds / 3600.0
    
    return total_hours / efficiency_factor

@router.post("/generate-schedule")
def generate_schedule_endpoint(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    """
    FIFO-based machine schedule generation for active IN-HOUSE parts
    
    Features:
    - Strict FIFO ordering (earliest due date first)
    - Proper operation sequencing
    - Setup time only for first unit
    - Shift boundary handling (9AM-5PM)
    - Parts continue next day if not completed
    - Workcenter-based machine assignment
    """
    try:
        from algorithm import generate_machine_schedule
        
        result = generate_machine_schedule(db, start_date, end_date)
        
        if not result.get('success', False):
            return {
                "message": result.get('message', 'Scheduling failed'),
                "schedule_history_id": result.get('schedule_history_id'),
                "operations_scheduled": 0,
                "success": False
            }
        
        return {
            "message": result['message'],
            "schedule_history_id": result['schedule_history_id'],
            "operations_scheduled": result['operations_scheduled'],
            "start_date": result['start_date'],
            "end_date": result['end_date'],
            "success": True,
            "parts_processed": result['parts_processed']
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Scheduling failed: {str(e)}"
        )

# =========================================================
# VIEW GENERATED SCHEDULE
# =========================================================

@router.get("/view-schedule")
def view_schedule(db: Session = Depends(get_db)):
    """
    View the current generated schedule
    
    Returns all planned schedule items with details
    """
    try:
        # Get the latest schedule history
        latest_schedule = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )
        
        if not latest_schedule:
            return {
                "message": "No schedule found. Please generate a schedule first.",
                "schedule_history_id": None,
                "schedule_items": [],
                "total_operations": 0
            }
        
        # Get all schedule items for the latest schedule
        schedule_items = (
            db.query(PlannedScheduleItem)
            .filter(PlannedScheduleItem.schedule_history_id == latest_schedule.id)
            .order_by(PlannedScheduleItem.planned_start_time)
            .all()
        )
        
        # Format the response
        result = []
        for item in schedule_items:
            result.append({
                "schedule_id": item.id,
                "part_id": item.part_id,
                "part_number": item.part_number,
                "sale_order_id": item.sale_order_id,
                "sale_order_number": item.sale_order_number,
                "operation_id": item.operation_id,
                "machine_id": item.machine_id,
                "planned_start_time": item.planned_start_time,
                "planned_end_time": item.planned_end_time,
                "total_quantity": item.total_quantity,
                "remaining_quantity": item.remaining_quantity,
                "status": item.status,
                "duration_hours": (item.planned_end_time - item.planned_start_time).total_seconds() / 3600.0
            })
        
        return {
            "message": f"Schedule found with {len(result)} operations",
            "schedule_history_id": latest_schedule.id,
            "schedule_version": latest_schedule.version,
            "generated_at": latest_schedule.generated_at,
            "is_active": latest_schedule.is_active,
            "schedule_items": result,
            "total_operations": len(result)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to view schedule: {str(e)}"
        )

@router.get("/view-schedule/{schedule_history_id}")
def view_schedule_by_id(schedule_history_id: int, db: Session = Depends(get_db)):
    """
    View a specific schedule by history ID
    """
    try:
        # Check if schedule history exists
        schedule_history = (
            db.query(ScheduleHistory)
            .filter(ScheduleHistory.id == schedule_history_id)
            .first()
        )
        
        if not schedule_history:
            raise HTTPException(404, "Schedule history not found")
        
        # Get all schedule items for this schedule
        schedule_items = (
            db.query(PlannedScheduleItem)
            .filter(PlannedScheduleItem.schedule_history_id == schedule_history_id)
            .order_by(PlannedScheduleItem.planned_start_time)
            .all()
        )
        
        # Format the response
        result = []
        for item in schedule_items:
            result.append({
                "schedule_id": item.id,
                "part_id": item.part_id,
                "part_number": item.part_number,
                "sale_order_id": item.sale_order_id,
                "sale_order_number": item.sale_order_number,
                "operation_id": item.operation_id,
                "machine_id": item.machine_id,
                "planned_start_time": item.planned_start_time,
                "planned_end_time": item.planned_end_time,
                "total_quantity": item.total_quantity,
                "remaining_quantity": item.remaining_quantity,
                "status": item.status,
                "duration_hours": (item.planned_end_time - item.planned_start_time).total_seconds() / 3600.0
            })
        
        return {
            "message": f"Schedule {schedule_history_id} found with {len(result)} operations",
            "schedule_history_id": schedule_history.id,
            "schedule_version": schedule_history.version,
            "generated_at": schedule_history.generated_at,
            "is_active": schedule_history.is_active,
            "schedule_items": result,
            "total_operations": len(result)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to view schedule: {str(e)}"
        )
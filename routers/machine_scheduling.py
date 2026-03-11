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
        # ❌ Before — always overwrites, loses original timestamp
        # summary.activated_at = now if status == "active" else None


        if order_status == "active":
            if not summary.activated_at:                      # Preserve earliest activation — only set once, never overwrite
                summary.activated_at = now
        else:
            summary.activated_at = None                       # All parts deactivated → clear activation timestamp     

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

    db.flush()


    # ----------------------------
    # SYNC OrderScheduleStatus
    # ----------------------------
    active_count = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active"
    ).count()

    active_inhouse_count = db.query(PartScheduleStatus).join(
        Part, Part.id == PartScheduleStatus.part_id
    ).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        Part.type_id == 1
    ).count()

    order_status = "active" if active_inhouse_count > 0 else "inactive"

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
            # activated_at = the part's own start_date (this request's timestamp)
            activated_at=record.start_date if order_status == "active" else None,
        )
        db.add(summary)
    else:
        summary.active_parts_count   = active_count
        summary.active_inhouse_parts = active_inhouse_count
        summary.status               = order_status

        if order_status == "active":
            # Preserve the EARLIEST activation time — never overwrite
            if not summary.activated_at:
                summary.activated_at = record.start_date
        else:
            # No more active IN-House parts → clear activation
            summary.activated_at = None

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
        "will_be_scheduled": status == "active" and part_type_name == "IN-House"
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

# @router.get("/order-summary/{sale_order_id}", response_model=OrderScheduleStatusResponse)
# def get_order_summary(sale_order_id: int, db: Session = Depends(get_db)):

#     summary = db.query(OrderScheduleStatus).filter(
#         OrderScheduleStatus.order_id == sale_order_id
#     ).first()

#     if not summary:
#         raise HTTPException(404, "Summary not found")

#     return summary

@router.get("/order-summary/{sale_order_id}")
def get_order_summary(sale_order_id: int, db: Session = Depends(get_db)):
    """
    Returns OrderScheduleStatus for the order.
    If no row exists yet (order never had any part activated),
    returns a computed default — never 404.
    """
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    summary = db.query(OrderScheduleStatus).filter(
        OrderScheduleStatus.order_id == sale_order_id
    ).first()

    if not summary:
        # Row not created yet — compute live from PartScheduleStatus
        active_count = db.query(PartScheduleStatus).filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active"
        ).count()
        active_inhouse = db.query(PartScheduleStatus).join(
            Part, Part.id == PartScheduleStatus.part_id
        ).filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active",
            Part.type_id == 1
        ).count()
        return {
            "order_id":            sale_order_id,
            "product_id":          order.product_id,
            "active_parts_count":  active_count,
            "active_inhouse_parts": active_inhouse,
            "status":              "active" if active_inhouse > 0 else "inactive",
            "activated_at":        None,
            "updated_at":          None,
        }

    return {
        "order_id":             summary.order_id,
        "product_id":           summary.product_id,
        "active_parts_count":   summary.active_parts_count,
        "active_inhouse_parts": summary.active_inhouse_parts,
        "status":               summary.status,
        "activated_at":         summary.activated_at,
        "updated_at":           summary.updated_at,
    }


# =========================================================
# SCHEDULE GENERATION ENDPOINT
# =========================================================
@router.post("/generate-schedule")
def generate_schedule_endpoint(
    start_date: Optional[datetime] = None,
    end_date:   Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    """
    Runs the FIFO scheduling algorithm over all active IN-HOUSE orders.
    Clears any existing schedule and replaces it with a fresh one.

    Parts with no operations defined are NOT scheduled and are listed
    in parts_without_operations.
    """
    try:
        from algorithm import generate_machine_schedule

        result = generate_machine_schedule(db, start_date, end_date)

        if not result.get("success", False):
            return {
                "success":                   False,
                "message":                   result.get("message", "Scheduling failed"),
                "schedule_history_id":       result.get("schedule_history_id"),
                "operations_scheduled":      0,
                "parts_processed":           0,
                "orders_scheduled":          0,
                "skipped_orders":            result.get("skipped_orders", []),
                "skipped_parts":             result.get("skipped_parts", []),
                "parts_without_operations":  result.get("parts_without_operations", []),
            }

        return {
            "success":                   True,
            "message":                   result["message"],
            "schedule_history_id":       result["schedule_history_id"],
            "operations_scheduled":      result["operations_scheduled"],
            "parts_processed":           result["parts_processed"],
            "orders_scheduled":          result["orders_scheduled"],
            "start_date":                result["start_date"],
            "end_date":                  result["end_date"],
            "skipped_orders":            result.get("skipped_orders", []),
            "skipped_parts":             result.get("skipped_parts", []),
            "parts_without_operations":  result.get("parts_without_operations", []),
        }

    except Exception as e:
        raise HTTPException(500, f"Scheduling failed: {str(e)}")

# =========================================================
# VIEW GENERATED SCHEDULE
# =========================================================

@router.get("/view-schedule")
def view_schedule(db: Session = Depends(get_db)):
    """
    Flat chronological list of all items in the latest schedule,
    enriched with operation name and machine details.
    """
    try:
        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )

        if not latest:
            return {
                "message":             "No schedule found. Please generate a schedule first.",
                "schedule_history_id": None,
                "schedule_items":      [],
                "total_operations":    0
            }

        rows = (
            db.query(PlannedScheduleItem, Operation, Machine, WorkCenter)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .filter(PlannedScheduleItem.schedule_history_id == latest.id)
            .order_by(PlannedScheduleItem.planned_start_time)
            .all()
        )

        result = [
            {
                "schedule_id":        item.id,
                "sale_order_id":      item.sale_order_id,
                "sale_order_number":  item.sale_order_number,
                "part_id":            item.part_id,
                "part_number":        item.part_number,
                "operation_id":       item.operation_id,
                "operation_number":   op.operation_number,
                "operation_name":     op.operation_name,
                "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                "machine_id":         item.machine_id,
                "machine_make":       machine.make if machine else None,
                "machine_model":      machine.model if machine else None,
                "machine_type":       machine.type if machine else None,
                "work_center_id":     wc.id if wc else None,
                "work_center_name":   wc.work_center_name if wc else None,
                "planned_start_time": item.planned_start_time,
                "planned_end_time":   item.planned_end_time,
                "duration_hours":     round(
                    (item.planned_end_time - item.planned_start_time)
                    .total_seconds() / 3600.0, 4
                ),
                "total_quantity":     item.total_quantity,
                "remaining_quantity": item.remaining_quantity,
                "status":             item.status,
            }
            for item, op, machine, wc in rows
        ]

        return {
            "message":             f"Schedule found with {len(result)} operation blocks",
            "schedule_history_id": latest.id,
            "schedule_version":    latest.version,
            "generated_at":        latest.generated_at,
            "is_active":           latest.is_active,
            "total_operations":    len(result),
            "schedule_items":      result,
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to view schedule: {str(e)}")


# =========================================================
# VIEW SCHEDULE  (flat list – by history ID)
# =========================================================

@router.get("/view-schedule/{schedule_history_id}")
def view_schedule_by_id(schedule_history_id: int, db: Session = Depends(get_db)):
    """
    Flat chronological list for a specific schedule version,
    enriched with operation name and machine details.
    """
    try:
        history = (
            db.query(ScheduleHistory)
            .filter(ScheduleHistory.id == schedule_history_id)
            .first()
        )
        if not history:
            raise HTTPException(404, "Schedule history not found")

        rows = (
            db.query(PlannedScheduleItem, Operation, Machine, WorkCenter)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .filter(PlannedScheduleItem.schedule_history_id == schedule_history_id)
            .order_by(PlannedScheduleItem.planned_start_time)
            .all()
        )

        result = [
            {
                "schedule_id":        item.id,
                "sale_order_id":      item.sale_order_id,
                "sale_order_number":  item.sale_order_number,
                "part_id":            item.part_id,
                "part_number":        item.part_number,
                "operation_id":       item.operation_id,
                "operation_number":   op.operation_number,
                "operation_name":     op.operation_name,
                "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                "machine_id":         item.machine_id,
                "machine_make":       machine.make if machine else None,
                "machine_model":      machine.model if machine else None,
                "machine_type":       machine.type if machine else None,
                "work_center_id":     wc.id if wc else None,
                "work_center_name":   wc.work_center_name if wc else None,
                "planned_start_time": item.planned_start_time,
                "planned_end_time":   item.planned_end_time,
                "duration_hours":     round(
                    (item.planned_end_time - item.planned_start_time)
                    .total_seconds() / 3600.0, 4
                ),
                "total_quantity":     item.total_quantity,
                "remaining_quantity": item.remaining_quantity,
                "status":             item.status,
            }
            for item, op, machine, wc in rows
        ]

        return {
            "message":             f"Schedule {schedule_history_id} — {len(result)} operation blocks",
            "schedule_history_id": history.id,
            "schedule_version":    history.version,
            "generated_at":        history.generated_at,
            "is_active":           history.is_active,
            "total_operations":    len(result),
            "schedule_items":      result,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to view schedule: {str(e)}")



# =========================================================
# GANTT CHART DATA  (latest active schedule)
# =========================================================

@router.get("/gantt-data")
def get_gantt_data(db: Session = Depends(get_db)):
    """
    Schedule items enriched with machine / work-center / operation details,
    grouped by machine. Intended for Gantt chart rendering.
    """
    try:
        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )

        if not latest:
            return {
                "message":             "No schedule found. Please generate a schedule first.",
                "schedule_history_id": None,
                "generated_at":        None,
                "gantt":               []
            }

        items = (
            db.query(PlannedScheduleItem, Machine, WorkCenter, Operation)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .filter(PlannedScheduleItem.schedule_history_id == latest.id)
            .order_by(PlannedScheduleItem.machine_id, PlannedScheduleItem.planned_start_time)
            .all()
        )

        machines_map: Dict[int, dict] = {}

        # Out-source items have no machine — collect under a sentinel key
        OUT_SOURCE_KEY = "out_source"

        for item, machine, wc, op in items:
            if machine is None:
                # Out-Source operation — no machine allocated
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id":       None,
                        "machine_type":     "Out-Source",
                        "machine_make":     None,
                        "machine_model":    None,
                        "work_center_id":   None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "status":             item.status,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id":       machine.id,
                        "machine_type":     machine.type,
                        "machine_make":     machine.make,
                        "machine_model":    machine.model,
                        "work_center_id":   wc.id if wc else None,
                        "work_center_name": wc.work_center_name if wc else None,
                        "work_center_code": wc.code              if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "status":             item.status,
                })

        return {
            "message":             f"Gantt data for schedule {latest.id}",
            "schedule_history_id": latest.id,
            "schedule_version":    latest.version,
            "generated_at":        latest.generated_at,
            "is_active":           latest.is_active,
            "total_machines":      len(machines_map),
            "total_tasks":         sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt":               list(machines_map.values()),
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to build Gantt data: {str(e)}")


# =========================================================
# GANTT CHART DATA  (specific history version)
# =========================================================

@router.get("/gantt-data/{schedule_history_id}")
def get_gantt_data_by_id(schedule_history_id: int, db: Session = Depends(get_db)):
    """Gantt chart data for a specific schedule version."""
    try:
        history = (
            db.query(ScheduleHistory)
            .filter(ScheduleHistory.id == schedule_history_id)
            .first()
        )
        if not history:
            raise HTTPException(404, f"Schedule history {schedule_history_id} not found")

        items = (
            db.query(PlannedScheduleItem, Machine, WorkCenter, Operation)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .outerjoin(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .filter(PlannedScheduleItem.schedule_history_id == schedule_history_id)
            .order_by(PlannedScheduleItem.machine_id, PlannedScheduleItem.planned_start_time)
            .all()
        )

        machines_map: Dict[int, dict] = {}
        OUT_SOURCE_KEY = "out_source"

        for item, machine, wc, op in items:
            if machine is None:
                # Out-Source operation: no machine allocated
                if OUT_SOURCE_KEY not in machines_map:
                    machines_map[OUT_SOURCE_KEY] = {
                        "machine_id":       None,
                        "machine_type":     "Out-Source",
                        "machine_make":     None,
                        "machine_model":    None,
                        "work_center_id":   None,
                        "work_center_name": "Out-Source",
                        "work_center_code": "OS",
                        "tasks": []
                    }
                machines_map[OUT_SOURCE_KEY]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "status":             item.status,
                })
            else:
                mid = machine.id
                if mid not in machines_map:
                    machines_map[mid] = {
                        "machine_id":       machine.id,
                        "machine_type":     machine.type,
                        "machine_make":     machine.make,
                        "machine_model":    machine.model,
                        "work_center_id":   wc.id               if wc else None,
                        "work_center_name": wc.work_center_name  if wc else None,
                        "work_center_code": wc.code              if wc else None,
                        "tasks": []
                    }
                machines_map[mid]["tasks"].append({
                    "schedule_item_id":   item.id,
                    "sale_order_id":      item.sale_order_id,
                    "sale_order_number":  item.sale_order_number,
                    "part_id":            item.part_id,
                    "part_number":        item.part_number,
                    "operation_id":       item.operation_id,
                    "operation_number":   op.operation_number,
                    "operation_name":     op.operation_name,
                    "operation_type":     ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time":   item.planned_end_time,
                    "duration_hours":     round(
                        (item.planned_end_time - item.planned_start_time)
                        .total_seconds() / 3600.0, 4
                    ),
                    "total_quantity":     item.total_quantity,
                    "status":             item.status,
                })

        return {
            "message":             f"Gantt data for schedule {schedule_history_id}",
            "schedule_history_id": history.id,
            "schedule_version":    history.version,
            "generated_at":        history.generated_at,
            "is_active":           history.is_active,
            "total_machines":      len(machines_map),
            "total_tasks":         sum(len(v["tasks"]) for v in machines_map.values()),
            "gantt":               list(machines_map.values()),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to build Gantt data: {str(e)}")


# =========================================================
# SCHEDULE HISTORY  (list all versions)
# =========================================================

@router.get("/schedule-history")
def get_schedule_history(db: Session = Depends(get_db)):
    """All schedule versions newest first, with operation block count per version."""
    try:
        from sqlalchemy import func

        # Single query: join ScheduleHistory with a count subquery
        count_sub = (
            db.query(
                PlannedScheduleItem.schedule_history_id,
                func.count(PlannedScheduleItem.id).label("block_count")
            )
            .group_by(PlannedScheduleItem.schedule_history_id)
            .subquery()
        )

        rows = (
            db.query(ScheduleHistory, count_sub.c.block_count)
            .outerjoin(count_sub, count_sub.c.schedule_history_id == ScheduleHistory.id)
            .order_by(ScheduleHistory.generated_at.desc())
            .all()
        )

        result = [
            {
                "schedule_history_id":    h.id,
                "version":                h.version,
                "is_active":              h.is_active,
                "generated_at":           h.generated_at,
                "total_operation_blocks": block_count or 0,
            }
            for h, block_count in rows
        ]

        return {
            "total_versions": len(result),
            "history":        result,
        }

    except Exception as e:
        raise HTTPException(500, f"Failed to fetch schedule history: {str(e)}")

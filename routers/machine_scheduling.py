from bisect import insort_right
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import exists
from DB.database import get_db

from DB.models.oms import Order
from DB.models.scheduling import PartScheduleStatus
from DB.models.oms import Order, Part, Product
from DB.models.oms import PartType

from DB.schemas.machine_scheduling import PartStatusUpdate, UpdatePartStatusResponse

















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
    sale_order_id: str,
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

            # if status == "active":
            #     record.start_date = now
            # else:
            #     record.start_date = None

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


from bisect import insort_right
from threading import active_count
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func

# from sqlalchemy import cast, Integer  


from sqlalchemy import exists, text
from DB.database import get_db

from DB.models.oms import Order
from DB.models.scheduling import PartScheduleStatus, OrderScheduleStatus, MachineSchedule, ScheduleHistory, PlannedScheduleItem, EfficiencyFactor, ShiftHoursConfiguration
from DB.models.oms import Order, Part, Product
from DB.models.configuration import Machine, WorkCenter
from DB.models.oms import Operation, Part, Order, PartType, OrderPartPriority

from DB.schemas.machine_scheduling import PartStatusUpdate, UpdatePartStatusResponse, OrderScheduleStatusResponse
from DB.schemas.oms import OrderPartPrioritySwap

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


# =========================================================
# PRIORITY HELPER FUNCTIONS (internal use)
# =========================================================

def _assign_order_priority(sale_order_id: int, product_id: int, parts: list, db: Session):
    """Assign global priorities to IN-House parts of an order on activation.
    Only creates missing rows — never overwrites existing.
    Appends after global max priority.
    """
    existing_priority_part_ids = {
        row.part_id for row in db.query(OrderPartPriority).filter(
            OrderPartPriority.order_id == sale_order_id
        ).all()
    }
    new_parts = sorted(
        [p for p in parts if p.id not in existing_priority_part_ids],
        key=lambda p: p.id
    )
    if not new_parts:
        return
    max_row = db.query(OrderPartPriority).filter(
        OrderPartPriority.priority > 0
    ).order_by(OrderPartPriority.priority.desc()).first()
    max_priority = max_row.priority if max_row else 0
    for i, p in enumerate(new_parts, start=1):
        db.add(OrderPartPriority(
            order_id=sale_order_id,
            product_id=product_id,
            part_id=p.id,
            priority=max_priority + i,
            status="active",
        ))


def _compact_order_part_priorities_by_part_order(db: Session) -> None:
    """
    Renumber all active OrderPartPriority rows to 1, 2, 3, ... in Part No order.
    Preserves cross-order sequence (current priority), then sorts by Part.part_number
    so UI order (002, 003, 004, 005) matches priority order.
    """
    active_rows = (
        db.query(OrderPartPriority)
        .join(Part, Part.id == OrderPartPriority.part_id)
        .filter(
            OrderPartPriority.status == "active",
            OrderPartPriority.priority > 0,
        )
        .order_by(OrderPartPriority.priority.asc(), Part.part_number.asc())
        .all()
    )
    for i, row in enumerate(active_rows, start=1):
        row.priority = i


def _resequence_active_order_part_priorities(db: Session) -> None:
    """
    Resequence all active OrderPartPriority rows to 1..N globally (no gaps).
    Use after deleting or deactivating a part so remaining parts get 1, 2, 3, ...
    """
    active_rows = (
        db.query(OrderPartPriority)
        .filter(
            OrderPartPriority.status == "active",
            OrderPartPriority.priority > 0,
        )
        .order_by(OrderPartPriority.priority.asc(), OrderPartPriority.id.asc())
        .all()
    )
    for i, row in enumerate(active_rows, start=1):
        row.priority = i


def _remove_order_priority(sale_order_id: int, db: Session):
    """
    Remove order priority and adjust priorities for remaining orders.
    Handles both scenarios:
    1. If first order is removed: shift all remaining orders down to start from priority 1
    2. If intermediate order is removed: shift higher priority orders down to fill the gap
    """
    # Get all priority records for this order, ordered by priority
    order_priorities = db.query(OrderPartPriority).filter(
        OrderPartPriority.order_id == sale_order_id
    ).order_by(OrderPartPriority.priority).all()
    
    if not order_priorities:
        return
    
    # Get the minimum and maximum priorities for this order
    min_priority = order_priorities[0].priority
    max_priority = order_priorities[-1].priority
    parts_count = len(order_priorities)
    
    # Delete all priority records for this order
    db.query(OrderPartPriority).filter(
        OrderPartPriority.order_id == sale_order_id
    ).delete(synchronize_session=False)
    
    # If this was the first order (min_priority == 1), shift ALL remaining orders down
    # Otherwise, shift only higher priority orders down
    if min_priority == 1:
        # First order removed: shift all remaining orders down by parts_count
        db.query(OrderPartPriority).update(
            {OrderPartPriority.priority: OrderPartPriority.priority - parts_count},
            synchronize_session=False
        )
    else:
        # Intermediate order removed: shift only higher priority orders down
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority > max_priority
        ).update(
            {OrderPartPriority.priority: OrderPartPriority.priority - parts_count},
            synchronize_session=False
        )
    
    db.commit()


# =========================================================
# ASSIGN ORDER PRIORITY ENDPOINT
# =========================================================
@router.post("/assign-order-priority/{sale_order_id}")
def assign_order_priority(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    """Assign global priorities to IN-House parts of an active order.
    Safe to call multiple times — only adds missing rows.
    """
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    if not order.product:
        raise HTTPException(400, "Order has no product")
    parts = [p for p in order.product.parts if p.type_id == 1]
    if not parts:
        raise HTTPException(400, "No IN-House parts found")
    _assign_order_priority(sale_order_id, order.product_id, parts, db)
    db.commit()
    return {"message": f"Priorities assigned for order {sale_order_id}"}


# =========================================================
# REMOVE ORDER PRIORITY ENDPOINT
# =========================================================
@router.delete("/remove-order-priority/{sale_order_id}")
def remove_order_priority(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    """Delete priority rows for an order and shift all higher priorities down."""
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    _remove_order_priority(sale_order_id, db)
    db.commit()
    return {"message": f"Priorities removed for order {sale_order_id}"}




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


    # -----------------------------
    # OrderPartPriority: adjust on inactive, create on active
    # -----------------------------
    if status == "inactive":
        # When an order is deactivated, remove its priorities and
        # shift remaining orders' priorities to close the gap
        _remove_order_priority(sale_order_id, db)


    # -----------------------------
    # Assign OrderPartPriority on activation
    # Only creates missing rows — never overwrites existing priorities
    # Default order: Part.id ASC (order of creation)
    # -----------------------------
    if status == "active":
        existing_priority_part_ids = {
            row.part_id for row in db.query(OrderPartPriority).filter(
                OrderPartPriority.order_id == sale_order_id
            ).all()
        }
        new_parts = sorted(
            [p for p in parts if p.id not in existing_priority_part_ids],
            key=lambda p: p.id
        )
        # Always use global max priority so new order appends after all existing orders
        max_row = db.query(OrderPartPriority).filter(
            OrderPartPriority.priority > 0
        ).order_by(OrderPartPriority.priority.desc()).first()
        max_priority = max_row.priority if max_row else 0
        for i, p in enumerate(new_parts, start=1):
            db.add(OrderPartPriority(
                order_id=sale_order_id,
                product_id=order.product_id,
                part_id=p.id,
                priority=max_priority + i,
                status="active",
            ))

    db.flush()
    
    
    active_count = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active"
    ).count()

    active_inhouse_count = db.query(PartScheduleStatus).join(
        Part, Part.id == PartScheduleStatus.part_id
    ).join(PartType, PartType.id == Part.type_id).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        PartType.type_name == "IN-House"
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
# ORDER PARTS METADATA FOR PROCESS PLAN
# =========================================================
@router.get("/order-parts-metadata/{sale_order_id}")
def get_order_parts_metadata(
    sale_order_id: int,
    db: Session = Depends(get_db)
):
    """
    Returns Process Plan metadata for a selected order:
      - total_inhouse_parts
      - total_outsource_parts
      - active_inhouse_parts
      - inactive_inhouse_parts
    """
    order = db.query(Order).filter(
        Order.id == sale_order_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    total_inhouse_parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.type_name == "IN-House"
    ).count()

    total_outsource_parts = db.query(Part).join(PartType).filter(
        Part.product_id == order.product_id,
        PartType.type_name == "Out-Source"
    ).count()

    active_inhouse_parts = db.query(PartScheduleStatus).join(
        Part, Part.id == PartScheduleStatus.part_id
    ).join(
        PartType, PartType.id == Part.type_id
    ).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        PartType.type_name == "IN-House"
    ).count()

    inactive_inhouse_parts = max(total_inhouse_parts - active_inhouse_parts, 0)

    return {
        "sale_order_id": sale_order_id,
        "sale_order_number": order.sale_order_number,
        "product_id": order.product_id,
        "total_inhouse_parts": total_inhouse_parts,
        "total_outsource_parts": total_outsource_parts,
        "active_inhouse_parts": active_inhouse_parts,
        "inactive_inhouse_parts": inactive_inhouse_parts
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
    # Assign OrderPartPriority if activating an IN-House part
    # EDGE CASE: Inactive order with many IN-House parts — user activates only
    # a few specific parts (not whole order). Each activated part gets a new
    # priority row; next priority = global max + 1, or 1 if no other active parts.
    # Only creates a row if one doesn't exist for this part+order.
    # ----------------------------
    if status == "active" and part_type_name == "IN-House":
        existing = db.query(OrderPartPriority).filter(
            OrderPartPriority.order_id == sale_order_id,
            OrderPartPriority.part_id == part_id
        ).first()
        if not existing:
            # Serialize priority assignment so bulk activation (multiple parts at once)
            # gets distinct priorities 1, 2, 3... instead of all getting the same number.
            _ADVISORY_LOCK_ORDER_PART_PRIORITY = 0x4F5050  # "OPP" in hex
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _ADVISORY_LOCK_ORDER_PART_PRIORITY})
            # Re-check after acquiring lock (another request may have added this part).
            existing = db.query(OrderPartPriority).filter(
                OrderPartPriority.order_id == sale_order_id,
                OrderPartPriority.part_id == part_id
            ).first()
            if not existing:
                max_row = db.query(OrderPartPriority).filter(
                    OrderPartPriority.priority > 0,
                    OrderPartPriority.status == "active"
                ).order_by(
                    OrderPartPriority.priority.desc()
                ).first()
                next_priority = (max_row.priority + 1) if max_row else 1
                db.add(OrderPartPriority(
                    order_id=sale_order_id,
                    product_id=order.product_id,
                    part_id=part_id,
                    priority=next_priority,
                    status="active",
                ))
                db.flush()
                # Renumber so priority order matches Part No order (002, 003, 004, 005 -> 1, 2, 3, 4)
                _compact_order_part_priorities_by_part_order(db)


    # ----------------------------
    # Sync status on OrderPartPriority row
    # If deactivating: set priority=0, shift all higher priorities down by 1
    # If activating:   status already set in the block above
    # ----------------------------
    priority_row = db.query(OrderPartPriority).filter(
        OrderPartPriority.order_id == sale_order_id,
        OrderPartPriority.part_id == part_id
    ).first()
    if priority_row:
        if status == "inactive":
            # Part-level deactivation: delete this row and resequence remaining (1..N, no gaps).
            _ADVISORY_LOCK_ORDER_PART_PRIORITY = 0x4F5050  # "OPP" in hex
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _ADVISORY_LOCK_ORDER_PART_PRIORITY})
            priority_row = db.query(OrderPartPriority).filter(
                OrderPartPriority.order_id == sale_order_id,
                OrderPartPriority.part_id == part_id
            ).first()
            if priority_row:
                db.delete(priority_row)
                db.flush()
                # Resequence remaining active parts globally to 1, 2, 3, ...
                _resequence_active_order_part_priorities(db)
        else:
            priority_row.status = "active"

    # ----------------------------
    # SYNC OrderScheduleStatus
    # ----------------------------
    active_count = db.query(PartScheduleStatus).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active"
    ).count()

    active_inhouse_count = db.query(PartScheduleStatus).join(
        Part, Part.id == PartScheduleStatus.part_id
    ).join(PartType, PartType.id == Part.type_id).filter(
        PartScheduleStatus.sale_order_id == sale_order_id,
        PartScheduleStatus.status == "active",
        PartType.type_name == "IN-House"
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


# =========================================================
# SHIFT PART PRIORITIES (GLOBAL)
# =========================================================
@router.put("/part-priorities/swap")
def swap_part_priorities(swap: OrderPartPrioritySwap, db: Session = Depends(get_db)):
    """
    Shift-part swap (stable reorder) between two priority records.

    Frontend behaviour: when swapping A with B, move A into B's position and
    shift all priorities in between by 1 so the global sequence stays valid.

    Example:
      A at 6, B at 1  => A becomes 1; items 1..5 shift to 2..6 (B ends at 6)
    """
    record1 = (
        db.query(OrderPartPriority)
        .filter(OrderPartPriority.id == swap.id1)
        .with_for_update()
        .first()
    )
    record2 = (
        db.query(OrderPartPriority)
        .filter(OrderPartPriority.id == swap.id2)
        .with_for_update()
        .first()
    )

    if not record1 or not record2:
        raise HTTPException(status_code=404, detail="One or both priority records not found")

    p1 = record1.priority
    p2 = record2.priority

    if p1 == p2:
        return {"message": "No change needed"}

    lo = min(p1, p2)
    hi = max(p1, p2)

    # Lock the impacted range to avoid concurrent reorder races.
    db.query(OrderPartPriority).filter(
        OrderPartPriority.priority >= lo,
        OrderPartPriority.priority <= hi
    ).with_for_update().all()

    if p1 > p2:
        # Move record1 up into p2; shift [p2, p1-1] downwards by +1
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority >= p2,
            OrderPartPriority.priority < p1
        ).update(
            {OrderPartPriority.priority: OrderPartPriority.priority + 1},
            synchronize_session=False
        )
        record1.priority = p2
    else:
        # Move record1 down into p2; shift [p1+1, p2] upwards by -1
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority > p1,
            OrderPartPriority.priority <= p2
        ).update(
            {OrderPartPriority.priority: OrderPartPriority.priority - 1},
            synchronize_session=False
        )
        record1.priority = p2

    db.commit()
    return {"message": "Priorities shifted successfully"}


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
        ).join(PartType, PartType.id == Part.type_id).filter(
            PartScheduleStatus.sale_order_id == sale_order_id,
            PartScheduleStatus.status == "active",
            PartType.type_name == "IN-House"
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
            db.query(PlannedScheduleItem, Operation, Machine, WorkCenter, OrderPartPriority)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .outerjoin(
                OrderPartPriority,
                (OrderPartPriority.order_id == PlannedScheduleItem.sale_order_id) &
                (OrderPartPriority.part_id == PlannedScheduleItem.part_id)
            )
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
                "priority":           priority.priority if priority else None,
                "order_part_priority_id": priority.id if priority else None,
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
            for item, op, machine, wc, priority in rows
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
            db.query(PlannedScheduleItem, Operation, Machine, WorkCenter, OrderPartPriority)
            .join(Operation,  Operation.id  == PlannedScheduleItem.operation_id)
            .outerjoin(Machine,    Machine.id    == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .outerjoin(
                OrderPartPriority,
                (OrderPartPriority.order_id == PlannedScheduleItem.sale_order_id) &
                (OrderPartPriority.part_id == PlannedScheduleItem.part_id)
            )
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
                "priority":           priority.priority if priority else None,
                "order_part_priority_id": priority.id if priority else None,
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
            for item, op, machine, wc, priority in rows
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
# PART OPERATION DETAILS FOR DROPDOWN (latest schedule)
# =========================================================
@router.get("/part-operation-details/{sale_order_id}/{part_id}")
def get_part_operation_details(
    sale_order_id: int,
    part_id: int,
    db: Session = Depends(get_db)
):
    """
    Dropdown endpoint for In-House Parts UI.
    Returns operation, machine, planned start and planned end for one part.

    Only returns data if the part is currently active in PartScheduleStatus.
    If the part/order is deactivated, returns `{ "message": "Part is deactivated", "operations": [] }`
    even if older schedule rows exist.
    """
    try:
        # Optional validation: order + part should exist for this order's product
        order = db.query(Order).filter(Order.id == sale_order_id).first()
        if not order:
            raise HTTPException(404, "Order not found")

        part = db.query(Part).filter(
            Part.id == part_id,
            Part.product_id == order.product_id
        ).first()
        if not part:
            raise HTTPException(404, "Part not found for this order")

        # If part is not active now, don't show any previous planned operations.
        part_status = (
            db.query(PartScheduleStatus.status)
            .filter(
                PartScheduleStatus.sale_order_id == sale_order_id,
                PartScheduleStatus.part_id == part_id,
            )
            .first()
        )
        if not part_status or part_status[0] != "active":
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "message": "Part is deactivated",
                "operations": []
            }

        latest = (
            db.query(ScheduleHistory)
            .order_by(ScheduleHistory.generated_at.desc())
            .first()
        )
        if not latest:
            return {
                "sale_order_id": sale_order_id,
                "part_id": part_id,
                "schedule_history_id": None,
                "message": "No schedule found. Please generate a schedule first.",
                "operations": []
            }
        schedule_history_id = latest.id

        rows = (
            db.query(PlannedScheduleItem, Operation, Machine)
            .join(Operation, Operation.id == PlannedScheduleItem.operation_id)
            .outerjoin(Machine, Machine.id == PlannedScheduleItem.machine_id)
            .filter(
                PlannedScheduleItem.schedule_history_id == schedule_history_id,
                PlannedScheduleItem.sale_order_id == sale_order_id,
                PlannedScheduleItem.part_id == part_id
            )
            .order_by(PlannedScheduleItem.planned_start_time.asc(), PlannedScheduleItem.id.asc())
            .all()
        )

        operations = [
            {
                "operation_id": op.id,
                "operation": f"{op.operation_number} - {op.operation_name}",
                "machine": (
                    f"{machine.make} {machine.model}".strip()
                    if machine else None
                ),
                "planned_start_time": item.planned_start_time,
                "planned_end_time": item.planned_end_time,
            }
            for item, op, machine in rows
        ]

        return {
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "schedule_history_id": schedule_history_id,
            "operations": operations
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch part operation details: {str(e)}")



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


# =========================================================
# GET MACHINE-WISE OPERATIONS
# =========================================================
@router.get("/machine-operations/{machine_id}")
def get_machine_operations(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """
    Fetch all planned schedule items (operations) for a specific machine,
    with full enriched response (same as view_schedule API).
    """
    try:
        # Check if machine exists
        machine_obj = db.query(Machine).filter(Machine.id == machine_id).first()
        if not machine_obj:
            raise HTTPException(404, f"Machine with ID {machine_id} not found")

        rows = (
            db.query(PlannedScheduleItem, Operation, Machine, WorkCenter, OrderPartPriority)
            .join(Operation, Operation.id == PlannedScheduleItem.operation_id)
            .outerjoin(Machine, Machine.id == PlannedScheduleItem.machine_id)
            .outerjoin(WorkCenter, WorkCenter.id == Machine.work_center_id)
            .outerjoin(
                OrderPartPriority,
                (OrderPartPriority.order_id == PlannedScheduleItem.sale_order_id) &
                (OrderPartPriority.part_id == PlannedScheduleItem.part_id)
            )
            .filter(PlannedScheduleItem.machine_id == machine_id)
            .order_by(PlannedScheduleItem.planned_start_time)
            .all()
        )

        # Group operations by operation_id to consolidate multiple time spans
        operation_groups = {}
        for item, op, machine, wc, priority in rows:
            op_id = item.operation_id
            if op_id not in operation_groups:
                # Initialize group with first operation
                operation_groups[op_id] = {
                    "schedule_id": item.id,
                    "sale_order_id": item.sale_order_id,
                    "sale_order_number": item.sale_order_number,
                    "part_id": item.part_id,
                    "part_number": item.part_number,
                    "priority": priority.priority if priority else None,
                    "order_part_priority_id": priority.id if priority else None,
                    "operation_id": item.operation_id,
                    "operation_number": op.operation_number,
                    "operation_name": op.operation_name,
                    "operation_type": ('Out-Source' if op.part_type_id == 2 else 'IN-House'),
                    "machine_id": item.machine_id,
                    "machine_make": machine.make if machine else None,
                    "machine_model": machine.model if machine else None,
                    "machine_type": machine.type if machine else None,
                    "work_center_id": wc.id if wc else None,
                    "work_center_name": wc.work_center_name if wc else None,
                    "planned_start_time": item.planned_start_time,
                    "planned_end_time": item.planned_end_time,
                    "total_quantity": item.total_quantity,
                    "remaining_quantity": item.remaining_quantity,
                    "status": item.status,
                }
            else:
                # Update start_time to earliest and end_time to latest
                group = operation_groups[op_id]
                if item.planned_start_time < group["planned_start_time"]:
                    group["planned_start_time"] = item.planned_start_time
                if item.planned_end_time > group["planned_end_time"]:
                    group["planned_end_time"] = item.planned_end_time
                    # Update schedule_id to the latest operation's ID
                    group["schedule_id"] = item.id
                # Update status to the most recent operation's status
                group["status"] = item.status

        # Calculate duration_hours for consolidated operations
        result = []
        for group in operation_groups.values():
            duration_hours = round(
                (group["planned_end_time"] - group["planned_start_time"]).total_seconds() / 3600.0,
                4
            )
            result.append({
                **group,
                "duration_hours": duration_hours
            })

        return {
            "machine_id": machine_id,
            "machine_name": machine_obj.make if hasattr(machine_obj, 'make') else None,
            "total_operations": len(result),
            "operations": result
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch machine operations: {str(e)}")

# =========================================================
# UPDATE OPERATION STATUS
# =========================================================
from pydantic import BaseModel

class OperationStatusUpdate(BaseModel):
    status: str  # PENDING, IN_PROGRESS, COMPLETED, REWORK

@router.put("/schedule-item/{schedule_item_id}/status")
def update_operation_status(
    schedule_item_id: int,
    data: OperationStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Update the status of a planned schedule item (operation).
    
    Workflow:
    - Operator clicks "Start Operation": status → IN_PROGRESS
    - Supervisor approves: status → COMPLETED
    - Supervisor disapproves: status → REWORK
    
    Valid status values: PENDING, IN_PROGRESS, COMPLETED, REWORK
    """
    try:
        # Valid status values
        valid_statuses = ["PENDING", "IN-PROGRESS", "COMPLETED", "REWORK"]
        
        # Validate status
        status_upper = data.status.upper()
        if status_upper not in valid_statuses:
            raise HTTPException(
                400, 
                f"Invalid status '{data.status}'. Valid values: {', '.join(valid_statuses)}"
            )
        
        # Fetch the schedule item
        item = db.query(PlannedScheduleItem).filter(
            PlannedScheduleItem.id == schedule_item_id
        ).first()
        
        if not item:
            raise HTTPException(404, f"Schedule item with ID {schedule_item_id} not found")
        
        # Store old status for response
        old_status = item.status
        
        # Update status
        item.status = status_upper
        
        db.commit()
        db.refresh(item)
        
        return {
            "message": "Operation status updated successfully",
            "schedule_item_id": schedule_item_id,
            "part_number": item.part_number,
            "sale_order_number": item.sale_order_number,
            "operation_id": item.operation_id,
            "previous_status": old_status,
            "current_status": item.status,
            "updated_at": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to update operation status: {str(e)}")


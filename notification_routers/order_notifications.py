from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import OrderNotification as OrderNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.oms import Order as OrderModel
from DB.schemas.notifications import (
    OrderNotificationWithDetails as OrderNotificationSchema,
    OrderNotificationCreate as OrderNotificationCreateSchema,
    OrderNotificationAcknowledge,
)

router = APIRouter(prefix="/order-notifications", tags=["notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


@router.get("/", response_model=List[OrderNotificationSchema])
def list_order_notifications(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    admin_id: Optional[int] = None,
    pc_id: Optional[int] = None,
    mc_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(OrderNotificationModel)
    if start_date:
        q = q.filter(OrderNotificationModel.created_at >= start_date)
    if end_date:
        q = q.filter(OrderNotificationModel.created_at <= end_date)
    notifs = q.order_by(OrderNotificationModel.id.desc()).all()
    # Preload related orders to avoid N+1 queries
    order_ids = [n.order_id for n in notifs]
    orders = (
        db.query(OrderModel)
        .filter(OrderModel.id.in_(order_ids))
        .all()
    )
    order_map = {o.id: o for o in orders}
    result = []
    for n in notifs:
        o = order_map.get(n.order_id)
        # Filter based on role IDs - skip if order not found
        if not o:
            continue
        # MC should only see notifications if they are assigned to the order
        if mc_id and (o.manufacturing_coordinator_id is None or o.manufacturing_coordinator_id != mc_id):
            continue
        # PC should only see notifications if they are the assigned PC
        if pc_id and (o.project_coordinator_id is None or o.project_coordinator_id != pc_id):
            continue
        # Admin should only see notifications if they are the assigned admin
        if admin_id and (o.admin_id is None or o.admin_id != admin_id):
            continue
        result.append({
            "id": n.id,
            "order_id": n.order_id,
            "mc_is_ack": n.mc_is_ack,
            "pc_is_ack": n.pc_is_ack,
            "admin_is_ack": n.admin_is_ack,
            "mc_ack_by": n.mc_ack_by,
            "mc_ack_at": n.mc_ack_at,
            "pc_ack_by": n.pc_ack_by,
            "pc_ack_at": n.pc_ack_at,
            "admin_ack_by": n.admin_ack_by,
            "admin_ack_at": n.admin_ack_at,
            "created_at": n.created_at,
            "updated_at": n.updated_at,
            "sale_order_number": getattr(o, "sale_order_number", None) if o else None,
            "project_name": getattr(o, "project_name", None) if o else None,
            "product_name": getattr(getattr(o, "product", None), "product_name", None) if o else None,
            "created_by": getattr(getattr(o, "user", None), "user_name", None) if o else None,
            "order_status": getattr(o, "status", None) if o else None,
        })
    return result


@router.get("/pending", response_model=List[OrderNotificationSchema])
def list_pending_order_notifications(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    admin_id: Optional[int] = None,
    pc_id: Optional[int] = None,
    mc_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(OrderNotificationModel)
    if start_date:
        q = q.filter(OrderNotificationModel.created_at >= start_date)
    if end_date:
        q = q.filter(OrderNotificationModel.created_at <= end_date)
    notifs = q.order_by(OrderNotificationModel.id.desc()).all()
    order_ids = [n.order_id for n in notifs]
    orders = (
        db.query(OrderModel)
        .filter(OrderModel.id.in_(order_ids))
        .all()
    )
    order_map = {o.id: o for o in orders}
    result = []
    for n in notifs:
        o = order_map.get(n.order_id)
        # Filter based on role IDs - skip if order not found
        if not o:
            continue
        # MC should only see notifications if they are assigned to the order
        if mc_id and (o.manufacturing_coordinator_id is None or o.manufacturing_coordinator_id != mc_id):
            continue
        # PC should only see notifications if they are the assigned PC
        if pc_id and (o.project_coordinator_id is None or o.project_coordinator_id != pc_id):
            continue
        # Admin should only see notifications if they are the assigned admin
        if admin_id and (o.admin_id is None or o.admin_id != admin_id):
            continue
        # Filter: only show notifications not yet acknowledged by the requesting role
        if mc_id and n.mc_is_ack:
            continue
        if pc_id and n.pc_is_ack:
            continue
        if admin_id and n.admin_is_ack:
            continue
        result.append({
            "id": n.id,
            "order_id": n.order_id,
            "mc_is_ack": n.mc_is_ack,
            "pc_is_ack": n.pc_is_ack,
            "admin_is_ack": n.admin_is_ack,
            "mc_ack_by": n.mc_ack_by,
            "mc_ack_at": n.mc_ack_at,
            "pc_ack_by": n.pc_ack_by,
            "pc_ack_at": n.pc_ack_at,
            "admin_ack_by": n.admin_ack_by,
            "admin_ack_at": n.admin_ack_at,
            "created_at": n.created_at,
            "updated_at": n.updated_at,
            "sale_order_number": getattr(o, "sale_order_number", None) if o else None,
            "project_name": getattr(o, "project_name", None) if o else None,
            "product_name": getattr(getattr(o, "product", None), "product_name", None) if o else None,
            "created_by": getattr(getattr(o, "user", None), "user_name", None) if o else None,
            "order_status": getattr(o, "status", None) if o else None,
        })
    return result




@router.put("/{notification_id}/ack", response_model=OrderNotificationSchema)
def acknowledge_order_notification(
    notification_id: int,
    ack_data: OrderNotificationAcknowledge,
    db: Session = Depends(get_db)
):
    notif = db.query(OrderNotificationModel).filter(OrderNotificationModel.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Update role-specific acknowledgment fields based on the role
    current_time = datetime.now(IST)
    
    if ack_data.role.lower() == 'admin':
        notif.admin_ack_by = ack_data.user_name
        notif.admin_ack_at = current_time
        notif.admin_is_ack = True
    elif ack_data.role.lower() == 'pc':
        notif.pc_ack_by = ack_data.user_name
        notif.pc_ack_at = current_time
        notif.pc_is_ack = True
    elif ack_data.role.lower() == 'mc':
        notif.mc_ack_by = ack_data.user_name
        notif.mc_ack_at = current_time
        notif.mc_is_ack = True
    else:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin', 'pc', or 'mc'")
    
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import OrderNotification as OrderNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.oms import Order as OrderModel
from DB.schemas.notifications import (
    OrderNotificationWithDetails as OrderNotificationSchema,
    OrderNotificationCreate as OrderNotificationCreateSchema,
)

router = APIRouter(prefix="/order-notifications", tags=["notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


@router.get("/", response_model=List[OrderNotificationSchema])
def list_order_notifications(db: Session = Depends(get_db)):
    notifs = db.query(OrderNotificationModel).order_by(OrderNotificationModel.id.desc()).all()
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
        result.append({
            "id": n.id,
            "order_id": n.order_id,
            "is_ack": n.is_ack,
            "ack_by": n.ack_by,
            "ack_at": n.ack_at,
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
def list_pending_order_notifications(db: Session = Depends(get_db)):
    notifs = (
        db.query(OrderNotificationModel)
        .filter(OrderNotificationModel.is_ack == False)  # noqa: E712
        .order_by(OrderNotificationModel.id.desc())
        .all()
    )
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
        result.append({
            "id": n.id,
            "order_id": n.order_id,
            "is_ack": n.is_ack,
            "ack_by": n.ack_by,
            "ack_at": n.ack_at,
            "created_at": n.created_at,
            "updated_at": n.updated_at,
            "sale_order_number": getattr(o, "sale_order_number", None) if o else None,
            "project_name": getattr(o, "project_name", None) if o else None,
            "product_name": getattr(getattr(o, "product", None), "product_name", None) if o else None,
            "created_by": getattr(getattr(o, "user", None), "user_name", None) if o else None,
            "order_status": getattr(o, "status", None) if o else None,
        })
    return result


@router.post("/", response_model=OrderNotificationSchema, status_code=status.HTTP_201_CREATED)
def create_order_notification(payload: OrderNotificationCreateSchema, db: Session = Depends(get_db)):
    notif = OrderNotificationModel(order_id=payload.order_id, is_ack=False)
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.put("/{notification_id}/ack", response_model=OrderNotificationSchema)
def acknowledge_order_notification(notification_id: int, db: Session = Depends(get_db)):
    notif = db.query(OrderNotificationModel).filter(OrderNotificationModel.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notif.is_ack:
        notif.is_ack = True
        notif.ack_by = get_admin_username(db)
        notif.ack_at = datetime.now(IST)
        db.add(notif)
        db.commit()
        db.refresh(notif)
    return notif

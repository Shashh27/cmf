from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from DB.database import get_db
from DB.models.notifications import QARMReceivedNotification as QARMReceivedNotificationModel
from DB.models.inventory import RawMaterialStock as RawMaterialStockModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.notifications import (
    QARMReceivedNotification as QARMReceivedNotificationSchema,
    QARMReceivedNotificationWithDetails,
)
from auth.deps import get_current_user

router = APIRouter(prefix="/qa-rm-notifications", tags=["qa-rm-notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def _require_qa(user: AccessUserModel):
    role = (getattr(user, "role", None) or "").strip().lower().replace(" ", "_")
    if role not in ("quality_assurance", "qa", "admin"):
        raise HTTPException(status_code=403, detail="Only Quality Assurance can access these notifications")


def _fmt_dimensions(stock: Optional[RawMaterialStockModel]) -> Optional[str]:
    if not stock:
        return None
    if stock.form_type == "Round":
        return f"⌀{stock.diameter} × {stock.length}mm"
    if stock.form_type == "Square":
        return f"{stock.length} × {stock.breadth} × {stock.height}mm"
    if stock.form_type == "Pipe":
        return f"⌀{stock.outer_diameter}/{stock.inner_diameter} × {stock.length}mm"
    return None


def _to_details(notif: QARMReceivedNotificationModel, stock: Optional[RawMaterialStockModel]) -> QARMReceivedNotificationWithDetails:
    return QARMReceivedNotificationWithDetails(
        id=notif.id,
        stock_id=notif.stock_id,
        order_id=notif.order_id,
        material_id=notif.material_id,
        material_name=notif.material_name,
        sale_order_number=notif.sale_order_number,
        product_name=notif.product_name,
        quantity=notif.quantity if notif.quantity is not None else (stock.quantity if stock else None),
        is_ack=notif.is_ack,
        ack_by=notif.ack_by,
        ack_at=notif.ack_at,
        created_at=notif.created_at,
        updated_at=notif.updated_at,
        process_type=getattr(stock, "process_type", None) if stock else None,
        form_type=getattr(stock, "form_type", None) if stock else None,
        dimensions=_fmt_dimensions(stock),
        diameter=getattr(stock, "diameter", None) if stock else None,
        length=getattr(stock, "length", None) if stock else None,
        breadth=getattr(stock, "breadth", None) if stock else None,
        height=getattr(stock, "height", None) if stock else None,
        inner_diameter=getattr(stock, "inner_diameter", None) if stock else None,
        outer_diameter=getattr(stock, "outer_diameter", None) if stock else None,
        mass=getattr(stock, "mass", None) if stock else None,
        final_cost=getattr(stock, "final_cost", None) if stock else None,
        stock_status=getattr(stock, "status", None) if stock else None,
    )


@router.get("/", response_model=List[QARMReceivedNotificationWithDetails])
def list_qa_rm_notifications(
    pending_only: bool = False,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    _require_qa(current_user)
    q = db.query(QARMReceivedNotificationModel)
    if pending_only:
        q = q.filter(QARMReceivedNotificationModel.is_ack == False)  # noqa: E712
    if start_date is not None:
        q = q.filter(QARMReceivedNotificationModel.created_at >= start_date)
    if end_date is not None:
        # Inclusive end-of-day if time is midnight
        end = end_date
        if end.hour == 0 and end.minute == 0 and end.second == 0 and end.microsecond == 0:
            end = end + timedelta(days=1) - timedelta(microseconds=1)
        q = q.filter(QARMReceivedNotificationModel.created_at <= end)
    notifications = q.order_by(QARMReceivedNotificationModel.id.desc()).limit(max(1, min(limit, 500))).all()

    stock_ids = list({n.stock_id for n in notifications if n.stock_id})
    stock_map = {}
    if stock_ids:
        stocks = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id.in_(stock_ids)).all()
        stock_map = {s.id: s for s in stocks}

    return [_to_details(n, stock_map.get(n.stock_id)) for n in notifications]


@router.get("/pending-count")
def pending_count(
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    _require_qa(current_user)
    count = (
        db.query(QARMReceivedNotificationModel)
        .filter(QARMReceivedNotificationModel.is_ack == False)  # noqa: E712
        .count()
    )
    return {"pending_count": count}


@router.put("/{notification_id}/acknowledge", response_model=QARMReceivedNotificationSchema)
def acknowledge_one(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    _require_qa(current_user)
    notif = db.query(QARMReceivedNotificationModel).filter(
        QARMReceivedNotificationModel.id == notification_id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notif.is_ack:
        notif.is_ack = True
        notif.ack_by = getattr(current_user, "user_name", None) or str(current_user.id)
        notif.ack_at = datetime.now(IST)
        db.add(notif)
        db.commit()
        db.refresh(notif)
    return notif


@router.put("/acknowledge-all")
def acknowledge_all(
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    _require_qa(current_user)
    pending = (
        db.query(QARMReceivedNotificationModel)
        .filter(QARMReceivedNotificationModel.is_ack == False)  # noqa: E712
        .all()
    )
    now = datetime.now(IST)
    ack_by = getattr(current_user, "user_name", None) or str(current_user.id)
    for notif in pending:
        notif.is_ack = True
        notif.ack_by = ack_by
        notif.ack_at = now
        db.add(notif)
    db.commit()
    return {"acknowledged_count": len(pending)}

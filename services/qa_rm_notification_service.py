"""Create Quality Assurance notifications when order RM status becomes received."""
from __future__ import annotations

from typing import Iterable, List

from sqlalchemy.orm import Session

from DB.models.notifications import QARMReceivedNotification
from DB.models.inventory import RawMaterial, RawMaterialStock
from DB.models.oms import Order, Product


def create_qa_rm_received_notifications(db: Session, stocks: Iterable[RawMaterialStock]) -> List[QARMReceivedNotification]:
    """
    Create QA notifications for stocks that transitioned to received.
    Skips stocks that already have a pending (unacked) notification.
    """
    created: List[QARMReceivedNotification] = []
    stock_list = [s for s in stocks if s is not None]
    if not stock_list:
        return created

    for stock in stock_list:
        existing = (
            db.query(QARMReceivedNotification)
            .filter(
                QARMReceivedNotification.stock_id == stock.id,
                QARMReceivedNotification.is_ack == False,  # noqa: E712
            )
            .first()
        )
        if existing:
            continue

        material_name = None
        if stock.material_id:
            material = db.query(RawMaterial).filter(RawMaterial.id == stock.material_id).first()
            material_name = material.material_name if material else None

        sale_order_number = None
        product_name = None
        order_id = stock.source_order_id
        if order_id:
            order = db.query(Order).filter(Order.id == order_id).first()
            if order:
                sale_order_number = order.sale_order_number
                if order.product_id:
                    product = db.query(Product).filter(Product.id == order.product_id).first()
                    product_name = product.product_name if product else None

        notif = QARMReceivedNotification(
            stock_id=stock.id,
            order_id=order_id,
            material_id=stock.material_id,
            material_name=material_name,
            sale_order_number=sale_order_number,
            product_name=product_name,
            quantity=stock.quantity,
            is_ack=False,
        )
        db.add(notif)
        created.append(notif)

    if created:
        db.flush()
    return created

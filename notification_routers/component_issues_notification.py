from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import ComponentIssuesNotification as ComponentIssuesNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.inventory import ToolsList
from DB.models.configuration import Machine
from DB.models.oms import Order, Part
from sqlalchemy import text
from DB.schemas.notifications import (
    ComponentIssuesNotification as ComponentIssuesNotificationSchema,
    ComponentIssuesNotificationCreate as ComponentIssuesNotificationCreateSchema,
    ComponentIssuesNotificationWithDetails,
)

router = APIRouter(prefix="/component-issues-notifications", tags=["notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


@router.get("/", response_model=List[ComponentIssuesNotificationWithDetails])
def list_component_issues_notifications(db: Session = Depends(get_db)):
    notifications = db.query(ComponentIssuesNotificationModel).order_by(ComponentIssuesNotificationModel.id.desc()).all()
    comp_issue_ids = [n.comp_issues_id for n in notifications]
    issues_map = {}
    machine_ids = set()
    order_ids = set()
    part_ids = set()
    operator_ids = set()
    if comp_issue_ids:
        rows = db.execute(
            text("""
                SELECT id, machine_id, production_order_id, part_id, component_status, description, created_at, operator_id
                FROM maintenance.component_issues
                WHERE id = ANY(:ids)
            """),
            {"ids": comp_issue_ids},
        ).fetchall()
        for r in rows:
            issues_map[int(r[0])] = {
                "machine_id": r[1],
                "production_order_id": r[2],
                "part_id": r[3],
                "component_status": r[4],
                "description": r[5],
                "created_at": r[6],
                "operator_id": r[7],
            }
            if r[1] is not None:
                machine_ids.add(int(r[1]))
            if r[2] is not None:
                order_ids.add(int(r[2]))
            if r[3] is not None:
                part_ids.add(int(r[3]))
            if r[7] is not None:
                operator_ids.add(int(r[7]))
    machine_map = {m.id: m for m in db.query(Machine).filter(Machine.id.in_(list(machine_ids))).all()} if machine_ids else {}
    order_map = {o.id: o for o in db.query(Order).filter(Order.id.in_(list(order_ids))).all()} if order_ids else {}
    part_map = {p.id: p for p in db.query(Part).filter(Part.id.in_(list(part_ids))).all()} if part_ids else {}
    operator_map = {u.id: u for u in db.query(AccessUserModel).filter(AccessUserModel.id.in_(list(operator_ids))).all()} if operator_ids else {}

    response: List[ComponentIssuesNotificationWithDetails] = []
    for n in notifications:
        issue = issues_map.get(n.comp_issues_id, {})
        m = machine_map.get(issue.get("machine_id"))
        o = order_map.get(issue.get("production_order_id"))
        p = part_map.get(issue.get("part_id"))
        op = operator_map.get(issue.get("operator_id"))
        response.append(ComponentIssuesNotificationWithDetails(
            id=n.id,
            comp_issues_id=n.comp_issues_id,
            is_ack=n.is_ack,
            ack_by=n.ack_by,
            ack_at=n.ack_at,
            created_at=n.created_at,
            updated_at=n.updated_at,
            component_name=getattr(p, "part_name", None) if p else None,  # fallback as component_name
            machine_name=getattr(m, "make", None) if m else None,
            sale_order_number=getattr(o, "sale_order_number", None) if o else None,
            part_name=getattr(p, "part_name", None) if p else None,
            component_status=issue.get("component_status"),
            description=issue.get("description"),
            created_by=getattr(op, "user_name", None) if op else None,
        ))
    return response

def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


@router.get("/", response_model=List[ComponentIssuesNotificationWithDetails])
def list_component_issues_notifications(db: Session = Depends(get_db)):
    notifications = db.query(ComponentIssuesNotificationModel).order_by(ComponentIssuesNotificationModel.id.desc()).all()
    response = []
    for notif in notifications:
        tool = db.query(ToolsList).filter(ToolsList.id == notif.comp_issues_id).first()
        response.append(
            ComponentIssuesNotificationWithDetails(
                **notif.__dict__,
                component_name=tool.item_description if tool else None,
            )
        )
    return response


@router.get("/pending", response_model=List[ComponentIssuesNotificationSchema])
def list_pending_component_issues_notifications(db: Session = Depends(get_db)):
    return db.query(ComponentIssuesNotificationModel).filter(ComponentIssuesNotificationModel.is_ack == False).order_by(ComponentIssuesNotificationModel.id.desc()).all()  # noqa: E712


@router.post("/", response_model=ComponentIssuesNotificationSchema, status_code=status.HTTP_201_CREATED)
def create_component_issues_notification(payload: ComponentIssuesNotificationCreateSchema, db: Session = Depends(get_db)):
    notif = ComponentIssuesNotificationModel(comp_issues_id=payload.comp_issues_id, is_ack=False)
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.put("/{notification_id}/ack", response_model=ComponentIssuesNotificationSchema)
def acknowledge_component_issues_notification(notification_id: int, db: Session = Depends(get_db)):
    notif = db.query(ComponentIssuesNotificationModel).filter(ComponentIssuesNotificationModel.id == notification_id).first()
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

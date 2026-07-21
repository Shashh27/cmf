from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import ToolIssuesNotification as ToolIssuesNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.inventory import ToolsList
from auth.deps import get_current_user
from auth.scope import scope_ids_from_user
from sqlalchemy import text
from sqlalchemy.sql import bindparam
from DB.schemas.notifications import (
    ToolIssuesNotification as ToolIssuesNotificationSchema,
    ToolIssuesNotificationCreate as ToolIssuesNotificationCreateSchema,
    ToolIssuesNotificationWithDetails,
)

router = APIRouter(prefix="/tool-issues-notifications", tags=["notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_admin_username(db: Session) -> str:
    admin = db.query(AccessUserModel).filter(AccessUserModel.role.ilike("%admin%")).first()
    return admin.user_name if admin else "admin"


@router.get("/", response_model=List[ToolIssuesNotificationWithDetails])
def list_tool_issues_notifications(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    admin_id: Optional[int] = None,
    pc_id: Optional[int] = None,
    mc_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    scope = scope_ids_from_user(current_user)
    admin_id = scope["admin_id"]
    pc_id = scope["pc_id"]
    mc_id = scope["mc_id"]
    q = db.query(ToolIssuesNotificationModel)
    if start_date:
        q = q.filter(ToolIssuesNotificationModel.created_at >= start_date)
    if end_date:
        q = q.filter(ToolIssuesNotificationModel.created_at <= end_date)
    notifications = q.order_by(ToolIssuesNotificationModel.id.desc()).all()
    issue_ids = [n.tool_issues_id for n in notifications]
    issues_map = {}
    tool_ids = set()
    operator_ids = set()
    if issue_ids:
        stmt = text("""
            SELECT id, tool_id, tool_issue_qty, status, operator_id, created_at
            FROM inventory.tool_issues
            WHERE id IN :ids
        """).bindparams(bindparam("ids", expanding=True))
        rows = db.execute(stmt, {"ids": issue_ids}).fetchall()
        for r in rows:
            issues_map[int(r[0])] = {
                "tool_id": r[1],
                "tool_issue_qty": r[2],
                "status": r[3],
                "operator_id": r[4],
                "created_at": r[5],
            }
            if r[1] is not None:
                tool_ids.add(int(r[1]))
            if r[4] is not None:
                operator_ids.add(int(r[4]))
    tools = []
    if tool_ids:
        tools = db.query(ToolsList).filter(ToolsList.id.in_(list(tool_ids))).all()
    tool_map = {t.id: t for t in tools}
    operators = []
    if operator_ids:
        operators = db.query(AccessUserModel).filter(AccessUserModel.id.in_(list(operator_ids))).all()
    operator_map = {u.id: u for u in operators}
    response: List[ToolIssuesNotificationWithDetails] = []
    for n in notifications:
        issue = issues_map.get(n.tool_issues_id, {})
        tool = tool_map.get(issue.get("tool_id"))
        op = operator_map.get(issue.get("operator_id"))
        # Filter based on role IDs - for tool issues, filter by operator_id
        # Skip if issue not found and role filtering is requested
        if (mc_id or pc_id or admin_id) and not issue:
            continue
        if mc_id and issue.get("operator_id") != mc_id:
            continue
        if pc_id and issue.get("operator_id") != pc_id:
            continue
        if admin_id and issue.get("operator_id") != admin_id:
            continue
        response.append(ToolIssuesNotificationWithDetails(
            id=n.id,
            tool_issues_id=n.tool_issues_id,
            is_ack=n.is_ack,
            ack_by=n.ack_by,
            ack_at=n.ack_at,
            created_at=n.created_at,
            updated_at=n.updated_at,
            tool_name=getattr(tool, "item_description", None) if tool else None,
            tool_issue_qty=issue.get("tool_issue_qty"),
            status=issue.get("status"),
            created_by=getattr(op, "user_name", None) if op else None,
        ))
    return response


@router.get("/pending", response_model=List[ToolIssuesNotificationSchema])
def list_pending_tool_issues_notifications(
    admin_id: Optional[int] = None,
    pc_id: Optional[int] = None,
    mc_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    scope = scope_ids_from_user(current_user)
    admin_id = scope["admin_id"]
    pc_id = scope["pc_id"]
    mc_id = scope["mc_id"]
    q = db.query(ToolIssuesNotificationModel).filter(ToolIssuesNotificationModel.is_ack == False)  # noqa: E712
    notifications = q.order_by(ToolIssuesNotificationModel.id.desc()).all()
    issue_ids = [n.tool_issues_id for n in notifications]
    if not issue_ids:
        return []
    stmt = text("""
        SELECT id, operator_id
        FROM inventory.tool_issues
        WHERE id IN :ids
    """).bindparams(bindparam("ids", expanding=True))
    rows = db.execute(stmt, {"ids": issue_ids}).fetchall()
    issue_map = {int(r[0]): r[1] for r in rows}
    result = []
    for n in notifications:
        operator_id = issue_map.get(n.tool_issues_id)
        # Filter based on role IDs - skip if issue not found and role filtering is requested
        if (mc_id or pc_id or admin_id) and operator_id is None:
            continue
        if mc_id and operator_id != mc_id:
            continue
        if pc_id and operator_id != pc_id:
            continue
        if admin_id and operator_id != admin_id:
            continue
        result.append(n)
    return result




@router.put("/{notification_id}/ack", response_model=ToolIssuesNotificationSchema)
def acknowledge_tool_issues_notification(notification_id: int, db: Session = Depends(get_db)):
    notif = db.query(ToolIssuesNotificationModel).filter(ToolIssuesNotificationModel.id == notification_id).first()
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

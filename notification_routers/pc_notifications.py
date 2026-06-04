from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.notifications import (
    ActivityLog as ActivityLogModel,
    PCNotification as PCNotificationModel
)
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.oms import Order as OrderModel, Part as PartModel, Operation as OperationModel, Document as DocumentModel, OrderDocument as OrderDocumentModel, PartType as PartTypeModel
from DB.models.configuration import WorkCenter as WorkCenterModel, Machine as MachineModel
from DB.models.inventory import Vendors as VendorModel
from DB.schemas.notifications import (
    PCNotificationWithDetails as PCNotificationSchema,
    ActivityLogWithDetails as ActivityLogSchema,
)

router = APIRouter(prefix="/pc-notifications", tags=["pc-notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


def enrich_details_with_names(db: Session, details: Dict[str, Any], entity_type: str) -> Dict[str, Any]:
    """Enrich details with names instead of IDs for foreign key fields"""
    if not details or not details.get("changes"):
        return details
    
    enriched_details = details.copy()
    changes = enriched_details.get("changes", {}).copy()
    
    # Get all unique IDs for each field type
    workcenter_ids = set()
    machine_ids = set()
    vendor_ids = set()
    part_type_ids = set()
    
    for field, values in changes.items():
        if field == "workcenter_id":
            if values.get("old") and values["old"] != "None":
                try:
                    workcenter_ids.add(int(values["old"]))
                except (ValueError, TypeError):
                    pass
            if values.get("new") and values["new"] != "None":
                try:
                    workcenter_ids.add(int(values["new"]))
                except (ValueError, TypeError):
                    pass
        elif field == "machine_id":
            if values.get("old") and values["old"] != "None":
                try:
                    machine_ids.add(int(values["old"]))
                except (ValueError, TypeError):
                    pass
            if values.get("new") and values["new"] != "None":
                try:
                    machine_ids.add(int(values["new"]))
                except (ValueError, TypeError):
                    pass
        elif field == "vendor_id":
            if values.get("old") and values["old"] != "None":
                try:
                    vendor_ids.add(int(values["old"]))
                except (ValueError, TypeError):
                    pass
            if values.get("new") and values["new"] != "None":
                try:
                    vendor_ids.add(int(values["new"]))
                except (ValueError, TypeError):
                    pass
        elif field == "part_type_id":
            if values.get("old") and values["old"] != "None":
                try:
                    part_type_ids.add(int(values["old"]))
                except (ValueError, TypeError):
                    pass
            if values.get("new") and values["new"] != "None":
                try:
                    part_type_ids.add(int(values["new"]))
                except (ValueError, TypeError):
                    pass
    
    # Fetch names in batch
    workcenter_names = {}
    if workcenter_ids:
        workcenters = db.query(WorkCenterModel).filter(WorkCenterModel.id.in_(workcenter_ids)).all()
        workcenter_names = {wc.id: wc.work_center_name for wc in workcenters}
    
    machine_names = {}
    if machine_ids:
        machines = db.query(MachineModel).filter(MachineModel.id.in_(machine_ids)).all()
        machine_names = {m.id: f"{m.make} {m.model}" if m.make and m.model else str(m.id) for m in machines}
    
    vendor_names = {}
    if vendor_ids:
        vendors = db.query(VendorModel).filter(VendorModel.id.in_(vendor_ids)).all()
        vendor_names = {v.id: v.company_name for v in vendors}
    
    part_type_names = {}
    if part_type_ids:
        part_types = db.query(PartTypeModel).filter(PartTypeModel.id.in_(part_type_ids)).all()
        part_type_names = {pt.id: pt.type_name for pt in part_types}
    
    # Replace IDs with names in changes
    for field, values in changes.items():
        if field == "workcenter_id":
            if values.get("old"):
                values["old"] = f"{values['old']} ({workcenter_names.get(values['old'], 'Unknown')})"
            if values.get("new"):
                values["new"] = f"{values['new']} ({workcenter_names.get(values['new'], 'Unknown')})"
        elif field == "machine_id":
            if values.get("old"):
                values["old"] = f"{values['old']} ({machine_names.get(values['old'], 'Unknown')})"
            if values.get("new"):
                values["new"] = f"{values['new']} ({machine_names.get(values['new'], 'Unknown')})"
        elif field == "vendor_id":
            if values.get("old"):
                values["old"] = f"{values['old']} ({vendor_names.get(values['old'], 'Unknown')})"
            if values.get("new"):
                values["new"] = f"{values['new']} ({vendor_names.get(values['new'], 'Unknown')})"
        elif field == "part_type_id":
            if values.get("old"):
                values["old"] = f"{values['old']} ({part_type_names.get(values['old'], 'Unknown')})"
            if values.get("new"):
                values["new"] = f"{values['new']} ({part_type_names.get(values['new'], 'Unknown')})"
    
    enriched_details["changes"] = changes
    return enriched_details


@router.get("/{pc_user_id}", response_model=List[PCNotificationSchema])
def get_pc_notifications(
    pc_user_id: int,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Get notifications for a specific Project Coordinator"""
    # Verify user exists and is a PC
    user = db.query(AccessUserModel).filter(AccessUserModel.id == pc_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build query
    q = db.query(PCNotificationModel).filter(PCNotificationModel.pc_user_id == pc_user_id)
    
    if unread_only:
        q = q.filter(PCNotificationModel.is_read == False)  # noqa: E712
    
    q = q.order_by(PCNotificationModel.created_at.desc())
    q = q.limit(limit).offset(offset)
    
    notifications = q.all()
    
    # Preload activity logs and related data
    activity_log_ids = [n.activity_log_id for n in notifications]
    activity_logs = (
        db.query(ActivityLogModel)
        .filter(ActivityLogModel.id.in_(activity_log_ids))
        .all()
    )
    activity_log_map = {al.id: al for al in activity_logs}
    
    # Preload related orders
    order_ids = [al.order_id for al in activity_logs if al.order_id]
    orders = {}
    if order_ids:
        order_query = db.query(OrderModel).filter(OrderModel.id.in_(order_ids)).all()
        orders = {o.id: o for o in order_query}
    
    # Build result with enriched details
    result = []
    for notif in notifications:
        activity_log = activity_log_map.get(notif.activity_log_id)
        if not activity_log:
            continue
            
        order = orders.get(activity_log.order_id) if activity_log.order_id else None
        
        # Get entity name based on entity_type
        entity_name = None
        part_name = None
        part_number = None
        document_version = None
        
        if activity_log.entity_type == "part":
            part = db.query(PartModel).filter(PartModel.id == activity_log.entity_id).first()
            entity_name = part.part_name if part else None
        elif activity_log.entity_type == "operation":
            operation = db.query(OperationModel).filter(OperationModel.id == activity_log.entity_id).first()
            entity_name = operation.operation_name if operation else None
        elif activity_log.entity_type == "document":
            document = db.query(DocumentModel).filter(DocumentModel.id == activity_log.entity_id).first()
            entity_name = document.document_name if document else None
            # Fetch part details for document
            if document and document.part_id:
                part = db.query(PartModel).filter(PartModel.id == document.part_id).first()
                if part:
                    part_name = part.part_name
                    part_number = part.part_number
            # Get document version
            if document:
                document_version = document.document_version
        elif activity_log.entity_type == "order_document":
            order_doc = db.query(OrderDocumentModel).filter(OrderDocumentModel.id == activity_log.entity_id).first()
            entity_name = order_doc.document_name if order_doc else None
        
        # Enrich details with names instead of IDs
        enriched_details = enrich_details_with_names(db, activity_log.details, activity_log.entity_type)
        
        result.append({
            "id": notif.id,
            "activity_log_id": notif.activity_log_id,
            "pc_user_id": notif.pc_user_id,
            "is_read": notif.is_read,
            "read_at": notif.read_at,
            "created_at": notif.created_at,
            "entity_type": activity_log.entity_type,
            "entity_id": activity_log.entity_id,
            "entity_name": entity_name,
            "action": activity_log.action,
            "order_id": activity_log.order_id,
            "sale_order_number": getattr(order, "sale_order_number", None) if order else None,
            "product_name": getattr(getattr(order, "product", None), "product_name", None) if order else None,
            "user_name": activity_log.user_name,
            "user_role": activity_log.user_role,
            "timestamp": activity_log.timestamp,
            "details": enriched_details,
            "part_name": part_name,
            "part_number": part_number,
            "document_version": document_version,
        })
    
    return result


@router.get("/{pc_user_id}/unread-count")
def get_unread_count(pc_user_id: int, db: Session = Depends(get_db)):
    """Get count of unread notifications for a PC user"""
    count = db.query(PCNotificationModel).filter(
        PCNotificationModel.pc_user_id == pc_user_id,
        PCNotificationModel.is_read == False  # noqa: E712
    ).count()
    
    return {"unread_count": count}


@router.put("/{notification_id}/read")
def mark_notification_as_read(notification_id: int, db: Session = Depends(get_db)):
    """Mark a notification as read"""
    notif = db.query(PCNotificationModel).filter(PCNotificationModel.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(IST)
        db.add(notif)
        db.commit()
        db.refresh(notif)
    
    return {"message": "Notification marked as read", "notification_id": notification_id}


@router.put("/{pc_user_id}/read-all")
def mark_all_as_read(pc_user_id: int, db: Session = Depends(get_db)):
    """Mark all notifications for a PC user as read"""
    notifications = db.query(PCNotificationModel).filter(
        PCNotificationModel.pc_user_id == pc_user_id,
        PCNotificationModel.is_read == False  # noqa: E712
    ).all()
    
    for notif in notifications:
        notif.is_read = True
        notif.read_at = datetime.now(IST)
        db.add(notif)
    
    db.commit()
    
    return {"message": f"Marked {len(notifications)} notifications as read"}


@router.get("/activity-log/{order_id}", response_model=List[ActivityLogSchema])
def get_activity_log_by_order(
    order_id: int,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Get activity log for a specific order with optional filters"""
    q = db.query(ActivityLogModel).filter(ActivityLogModel.order_id == order_id)
    
    if entity_type:
        q = q.filter(ActivityLogModel.entity_type == entity_type)
    
    if action:
        q = q.filter(ActivityLogModel.action == action)
    
    q = q.order_by(ActivityLogModel.timestamp.desc())
    q = q.limit(limit).offset(offset)
    
    activity_logs = q.all()
    
    # Preload related order
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    
    # Get entity names
    result = []
    for al in activity_logs:
        entity_name = None
        if al.entity_type == "part":
            part = db.query(PartModel).filter(PartModel.id == al.entity_id).first()
            entity_name = part.part_name if part else None
        elif al.entity_type == "operation":
            operation = db.query(OperationModel).filter(OperationModel.id == al.entity_id).first()
            entity_name = operation.operation_name if operation else None
        elif al.entity_type == "document":
            document = db.query(DocumentModel).filter(DocumentModel.id == al.entity_id).first()
            entity_name = document.document_name if document else None
        elif al.entity_type == "order_document":
            order_doc = db.query(OrderDocumentModel).filter(OrderDocumentModel.id == al.entity_id).first()
            entity_name = order_doc.document_name if order_doc else None
        
        # Get user role
        user_role = al.user_role  # Use cached role from activity_log
        
        # Enrich details with names instead of IDs
        enriched_details = enrich_details_with_names(db, al.details, al.entity_type)
        
        result.append({
            "id": al.id,
            "entity_type": al.entity_type,
            "entity_id": al.entity_id,
            "action": al.action,
            "order_id": al.order_id,
            "user_id": al.user_id,
            "user_name": al.user_name,
            "timestamp": al.timestamp,
            "details": enriched_details,
            "created_at": al.created_at,
            "sale_order_number": getattr(order, "sale_order_number", None) if order else None,
            "product_name": getattr(getattr(order, "product", None), "product_name", None) if order else None,
            "entity_name": entity_name,
            "user_role": user_role,
            "order_status": getattr(order, "status", None) if order else None,
        })
    
    return result

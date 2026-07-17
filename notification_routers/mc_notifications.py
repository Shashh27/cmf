from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from DB.database import get_db
from DB.models.notifications import MCNotification as MCNotificationModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.oms import Document as DocumentModel, Part as PartModel, Order as OrderModel
from services.notification_service import NotificationService

router = APIRouter(prefix="/mc-notifications", tags=["mc-notifications"])

IST = timezone(timedelta(hours=5, minutes=30))


class AcknowledgeRequest(BaseModel):
    remarks: Optional[str] = None


class RejectRequest(BaseModel):
    remarks: Optional[str] = None


@router.get("/{mc_user_id}")
def get_mc_notifications(
    mc_user_id: int,
    pending_only: bool = False,
    order_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Get document notifications for a Manufacturing Coordinator by path mc_user_id."""
    # Verify user exists and is an MC
    user = db.query(AccessUserModel).filter(AccessUserModel.id == mc_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build query
    q = db.query(MCNotificationModel).filter(MCNotificationModel.mc_user_id == mc_user_id)
    
    # Filter by order_id if provided
    if order_id:
        # Get the order's product_id
        from DB.models.oms import Order as OrderModel
        order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
        if order and order.product_id:
            # Get all part_ids for this product through hierarchy
            from DB.models.oms import Part as PartModel
            parts = db.query(PartModel.id).filter(PartModel.product_id == order.product_id).all()
            part_ids = [p.id for p in parts]
            
            # Filter notifications to only those with documents linked to these parts
            if part_ids:
                q = q.join(DocumentModel, MCNotificationModel.document_id == DocumentModel.id).filter(
                    DocumentModel.part_id.in_(part_ids)
                )
    
    if pending_only:
        q = q.filter(MCNotificationModel.is_acknowledged == False, MCNotificationModel.is_rejected == False)  # noqa: E712
    
    q = q.order_by(MCNotificationModel.created_at.desc())
    q = q.limit(limit).offset(offset)
    
    notifications = q.all()
    
    # Preload related documents
    document_ids = [n.document_id for n in notifications]
    documents = {}
    if document_ids:
        docs_query = db.query(DocumentModel).filter(DocumentModel.id.in_(document_ids)).all()
        documents = {d.id: d for d in docs_query}
    
    # Preload related parts
    part_ids = [d.part_id for d in documents.values() if d.part_id]
    parts = {}
    if part_ids:
        parts_query = db.query(PartModel).filter(PartModel.id.in_(part_ids)).all()
        parts = {p.id: p for p in parts_query}
    
    # Build result with enriched details
    result = []
    for notif in notifications:
        document = documents.get(notif.document_id)
        if not document:
            continue
        
        part = parts.get(document.part_id) if document.part_id else None
        
        result.append({
            "id": notif.id,
            "document_id": notif.document_id,
            "mc_user_id": notif.mc_user_id,
            "is_acknowledged": notif.is_acknowledged,
            "ack_remarks": notif.ack_remarks,
            "ack_at": notif.ack_at,
            "is_rejected": notif.is_rejected,
            "reject_remarks": notif.reject_remarks,
            "reject_at": notif.reject_at,
            "created_at": notif.created_at,
            "document": {
                "id": document.id,
                "document_name": document.document_name,
                "document_type": document.document_type,
                "document_version": document.document_version,
                "document_url": document.document_url,
                "part_id": document.part_id,
                "created_at": document.created_at,
            },
            "part": {
                "id": part.id if part else None,
                "part_name": part.part_name if part else None,
                "part_number": part.part_number if part else None,
            } if part else None
        })
    
    return result


@router.get("/{mc_user_id}/pending-count")
def get_pending_count(
    mc_user_id: int,
    db: Session = Depends(get_db),
):
    """Get count of pending document notifications for the MC identified by path mc_user_id."""
    count = db.query(MCNotificationModel).filter(
        MCNotificationModel.mc_user_id == mc_user_id,
        MCNotificationModel.is_acknowledged == False,  # noqa: E712
        MCNotificationModel.is_rejected == False  # noqa: E712
    ).count()
    
    return {"pending_count": count}


@router.put("/{notification_id}/acknowledge")
def acknowledge_document(
    notification_id: int,
    request: AcknowledgeRequest,
    db: Session = Depends(get_db),
):
    """Acknowledge a document notification with optional remarks"""
    notif = db.query(MCNotificationModel).filter(MCNotificationModel.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Get the document
    document = db.query(DocumentModel).filter(DocumentModel.id == notif.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Update notification
        notif.is_acknowledged = True
        notif.ack_remarks = request.remarks
        notif.ack_at = datetime.now(IST)
        db.add(notif)
        
        # Update document acknowledgment status
        document.is_acknowledged = True
        db.add(document)
        
        # Get MC user info
        mc_user = db.query(AccessUserModel).filter(AccessUserModel.id == notif.mc_user_id).first()
        mc_user_name = mc_user.user_name if mc_user else None
        mc_user_role = mc_user.role if mc_user else None
        
        # Create PC notification about MC acknowledgment
        NotificationService.log_mc_document_acknowledgment(
            db=db,
            document_id=document.id,
            action="acknowledged",
            mc_user_id=notif.mc_user_id,
            mc_user_name=mc_user_name,
            mc_user_role=mc_user_role,
            remarks=request.remarks
        )
        
        db.commit()
        db.refresh(notif)
        
        return {"message": "Document acknowledged successfully", "notification_id": notification_id}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to acknowledge document: {str(e)}"
        )


@router.put("/{notification_id}/reject")
def reject_document(
    notification_id: int,
    request: RejectRequest,
    db: Session = Depends(get_db),
):
    """Reject a document notification with optional remarks"""
    notif = db.query(MCNotificationModel).filter(MCNotificationModel.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Get the document
    document = db.query(DocumentModel).filter(DocumentModel.id == notif.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Update notification
        notif.is_rejected = True
        notif.reject_remarks = request.remarks
        notif.reject_at = datetime.now(IST)
        db.add(notif)
        
        # Document remains unacknowledged (PC can re-upload)
        
        # Get MC user info
        mc_user = db.query(AccessUserModel).filter(AccessUserModel.id == notif.mc_user_id).first()
        mc_user_name = mc_user.user_name if mc_user else None
        mc_user_role = mc_user.role if mc_user else None
        
        # Create PC notification about MC rejection
        NotificationService.log_mc_document_acknowledgment(
            db=db,
            document_id=document.id,
            action="rejected",
            mc_user_id=notif.mc_user_id,
            mc_user_name=mc_user_name,
            mc_user_role=mc_user_role,
            remarks=request.remarks
        )
        
        db.commit()
        db.refresh(notif)
        
        return {"message": "Document rejected successfully", "notification_id": notification_id}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject document: {str(e)}"
        )

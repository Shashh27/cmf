"""
Notification Service

Automatically logs changes and creates notifications for Project Coordinators
when entities are created, updated, deleted, or modified.
"""

from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta

from DB.models.notifications import ActivityLog, PCNotification
from DB.models.oms import Part, Operation, Document, Assembly, Order, Product
from DB.models.access_control import AccessUser

IST = timezone(timedelta(hours=5, minutes=30))


class NotificationService:
    """Service for logging changes and creating PC notifications"""
    
    @staticmethod
    def _get_order_id_for_part(db: Session, part_id: int) -> Optional[int]:
        """Get the order ID associated with a part through product"""
        part = db.query(Part).filter(Part.id == part_id).first()
        if not part or not part.product_id:
            return None
        
        # Find an order for this product
        order = db.query(Order).filter(Order.product_id == part.product_id).first()
        return order.id if order else None
    
    @staticmethod
    def _get_order_id_for_operation(db: Session, operation_id: int) -> Optional[int]:
        """Get the order ID associated with an operation through part -> product"""
        operation = db.query(Operation).filter(Operation.id == operation_id).first()
        if not operation or not operation.part_id:
            return None
        
        return NotificationService._get_order_id_for_part(db, operation.part_id)
    
    @staticmethod
    def _get_order_id_for_document(db: Session, document_id: int) -> Optional[int]:
        """Get the order ID associated with a document through part/assembly -> product, or directly from order_documents"""
        from DB.models.oms import OrderDocument
        
        # First check if this is an OrderDocument (uploaded directly to order)
        order_doc = db.query(OrderDocument).filter(OrderDocument.id == document_id).first()
        if order_doc and order_doc.order_id:
            return order_doc.order_id
        
        # Otherwise, check regular Document (uploaded to part/assembly)
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            return None
        
        if document.part_id:
            return NotificationService._get_order_id_for_part(db, document.part_id)
        elif document.assembly_id:
            assembly = db.query(Assembly).filter(Assembly.id == document.assembly_id).first()
            if assembly and assembly.product_id:
                order = db.query(Order).filter(Order.product_id == assembly.product_id).first()
                return order.id if order else None
        
        return None
    
    @staticmethod
    def _get_order_id_for_assembly(db: Session, assembly_id: int) -> Optional[int]:
        """Get the order ID associated with an assembly through product"""
        assembly = db.query(Assembly).filter(Assembly.id == assembly_id).first()
        if not assembly or not assembly.product_id:
            return None
        
        order = db.query(Order).filter(Order.product_id == assembly.product_id).first()
        return order.id if order else None
    
    @staticmethod
    def _get_pc_users_for_order(db: Session, order_id: int) -> List[int]:
        """Get PC user IDs who should be notified for an order"""
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            return []
        
        pc_user_ids = []
        
        # Add project_coordinator_id if set
        if order.project_coordinator_id:
            pc_user_ids.append(order.project_coordinator_id)
        
        # Add user_id if the creator is a PC
        if order.user_id:
            user = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
            if user and ('project_coordinator' in user.role.lower() or 'pc' in user.role.lower()):
                pc_user_ids.append(order.user_id)
        
        return list(set(pc_user_ids))  # Remove duplicates
    
    @staticmethod
    def _create_activity_log(
        db: Session,
        entity_type: str,
        entity_id: int,
        action: str,
        user_id: Optional[int],
        user_name: Optional[str],
        order_id: Optional[int],
        user_role: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> ActivityLog:
        """Create an activity log entry"""
        activity_log = ActivityLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            order_id=order_id,
            user_id=user_id,
            user_name=user_name,
            user_role=user_role,
            timestamp=datetime.now(IST),
            details=details
        )
        db.add(activity_log)
        db.flush()  # Get the ID without committing
        return activity_log
    
    @staticmethod
    def _create_pc_notifications(db: Session, activity_log_id: int, pc_user_ids: List[int]):
        """Create PC notification records for given users"""
        for pc_user_id in pc_user_ids:
            pc_notification = PCNotification(
                activity_log_id=activity_log_id,
                pc_user_id=pc_user_id,
                is_read=False
            )
            db.add(pc_notification)
    
    @staticmethod
    def log_part_change(
        db: Session,
        part_id: int,
        action: str,
        user_id: Optional[int],
        user_name: Optional[str],
        user_role: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Log a part change and create PC notifications
        
        Args:
            db: Database session
            part_id: Part ID that changed
            action: Action performed (created, updated, deleted, soft_deleted, restored)
            user_id: User who made the change
            user_name: User name for caching
            details: Additional details as JSON
            
        Returns:
            Dictionary with result
        """
        try:
            # Get order ID for this part
            order_id = NotificationService._get_order_id_for_part(db, part_id)
            
            # Create activity log
            activity_log = NotificationService._create_activity_log(
                db=db,
                entity_type="part",
                entity_id=part_id,
                action=action,
                user_id=user_id,
                user_name=user_name,
                user_role=user_role,
                order_id=order_id,
                details=details
            )
            
            # Create PC notifications if order exists
            if order_id:
                pc_user_ids = NotificationService._get_pc_users_for_order(db, order_id)
                if pc_user_ids:
                    NotificationService._create_pc_notifications(db, activity_log.id, pc_user_ids)
            
            db.commit()
            return {"success": True, "activity_log_id": activity_log.id}
            
        except Exception as e:
            db.rollback()
            print(f"Error logging part change: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def log_operation_change(
        db: Session,
        operation_id: int,
        action: str,
        user_id: Optional[int],
        user_name: Optional[str],
        user_role: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Log an operation change and create PC notifications"""
        try:
            order_id = NotificationService._get_order_id_for_operation(db, operation_id)
            
            activity_log = NotificationService._create_activity_log(
                db=db,
                entity_type="operation",
                entity_id=operation_id,
                action=action,
                user_id=user_id,
                user_name=user_name,
                user_role=user_role,
                order_id=order_id,
                details=details
            )
            
            if order_id:
                pc_user_ids = NotificationService._get_pc_users_for_order(db, order_id)
                if pc_user_ids:
                    NotificationService._create_pc_notifications(db, activity_log.id, pc_user_ids)
            
            db.commit()
            return {"success": True, "activity_log_id": activity_log.id}
            
        except Exception as e:
            db.rollback()
            print(f"Error logging operation change: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def log_order_document_change(
        db: Session,
        order_document_id: int,
        action: str,
        user_id: Optional[int],
        user_name: Optional[str],
        user_role: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Log an order document change and create PC notifications"""
        try:
            from DB.models.oms import OrderDocument
            
            order_doc = db.query(OrderDocument).filter(OrderDocument.id == order_document_id).first()
            if not order_doc:
                return {"success": False, "error": "Order document not found"}
            
            order_id = order_doc.order_id
            
            # Create activity log
            activity_log = NotificationService._create_activity_log(
                db=db,
                entity_type="order_document",
                entity_id=order_document_id,
                action=action,
                user_id=user_id,
                user_name=user_name,
                user_role=user_role,
                order_id=order_id,
                details=details
            )
            
            # Create PC notifications if order exists
            if order_id:
                pc_user_ids = NotificationService._get_pc_users_for_order(db, order_id)
                if pc_user_ids:
                    NotificationService._create_pc_notifications(db, activity_log.id, pc_user_ids)
            
            db.commit()
            return {"success": True, "activity_log_id": activity_log.id}
            
        except Exception as e:
            db.rollback()
            print(f"Error logging order document change: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def log_document_change(
        db: Session,
        document_id: int,
        action: str,
        user_id: Optional[int],
        user_name: Optional[str],
        user_role: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Log a document change and create PC notifications"""
        try:
            order_id = NotificationService._get_order_id_for_document(db, document_id)
            
            activity_log = NotificationService._create_activity_log(
                db=db,
                entity_type="document",
                entity_id=document_id,
                action=action,
                user_id=user_id,
                user_name=user_name,
                user_role=user_role,
                order_id=order_id,
                details=details
            )
            
            if order_id:
                pc_user_ids = NotificationService._get_pc_users_for_order(db, order_id)
                if pc_user_ids:
                    NotificationService._create_pc_notifications(db, activity_log.id, pc_user_ids)
            
            db.commit()
            return {"success": True, "activity_log_id": activity_log.id}
            
        except Exception as e:
            db.rollback()
            print(f"Error logging document change: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def log_assembly_change(
        db: Session,
        assembly_id: int,
        action: str,
        user_id: Optional[int],
        user_name: Optional[str],
        user_role: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Log an assembly change and create PC notifications"""
        try:
            order_id = NotificationService._get_order_id_for_assembly(db, assembly_id)
            
            activity_log = NotificationService._create_activity_log(
                db=db,
                entity_type="assembly",
                entity_id=assembly_id,
                action=action,
                user_id=user_id,
                user_name=user_name,
                user_role=user_role,
                order_id=order_id,
                details=details
            )
            
            if order_id:
                pc_user_ids = NotificationService._get_pc_users_for_order(db, order_id)
                if pc_user_ids:
                    NotificationService._create_pc_notifications(db, activity_log.id, pc_user_ids)
            
            db.commit()
            return {"success": True, "activity_log_id": activity_log.id}
            
        except Exception as e:
            db.rollback()
            print(f"Error logging assembly change: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def log_schedule_change(
        db: Session,
        part_id: int,
        status: str,
        user_id: Optional[int],
        user_name: Optional[str]
    ) -> Dict[str, Any]:
        """Log a schedule status change and create PC notifications"""
        try:
            order_id = NotificationService._get_order_id_for_part(db, part_id)
            
            action = "schedule_activated" if status == "active" else "schedule_deactivated"
            
            activity_log = NotificationService._create_activity_log(
                db=db,
                entity_type="part",
                entity_id=part_id,
                action=action,
                user_id=user_id,
                user_name=user_name,
                order_id=order_id,
                details={"schedule_status": status}
            )
            
            if order_id:
                pc_user_ids = NotificationService._get_pc_users_for_order(db, order_id)
                if pc_user_ids:
                    NotificationService._create_pc_notifications(db, activity_log.id, pc_user_ids)
            
            db.commit()
            return {"success": True, "activity_log_id": activity_log.id}
            
        except Exception as e:
            db.rollback()
            print(f"Error logging schedule change: {e}")
            return {"success": False, "error": str(e)}

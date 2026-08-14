from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey, func, text, JSON, Date
from ..database import Base


class OrderNotification(Base):
    __tablename__ = "order_notifications"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("oms.orders.id", ondelete="CASCADE"), nullable=False)
    # Role-specific acknowledgment status fields
    mc_is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    pc_is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    admin_is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    # Role-specific acknowledgment fields
    mc_ack_by = Column(String, nullable=True)  # Manufacturing Coordinator who acknowledged
    mc_ack_at = Column(TIMESTAMP(timezone=True), nullable=True)  # MC acknowledgment timestamp
    pc_ack_by = Column(String, nullable=True)  # Project Coordinator who acknowledged
    pc_ack_at = Column(TIMESTAMP(timezone=True), nullable=True)  # PC acknowledgment timestamp
    admin_ack_by = Column(String, nullable=True)  # Admin who acknowledged
    admin_ack_at = Column(TIMESTAMP(timezone=True), nullable=True)  # Admin acknowledgment timestamp
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MachineNotification(Base):
    __tablename__ = "machine_notifications"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Using a plain integer reference to avoid cross-schema FK dependency during table creation
    machine_breakdown_id = Column(Integer, nullable=False, index=True)
    is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    ack_by = Column(String, nullable=True)
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ToolIssuesNotification(Base):
    __tablename__ = "tool_issues_notification"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tool_issues_id = Column(Integer, ForeignKey("inventory.tool_issues.id", ondelete="CASCADE"), nullable=False)
    is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    ack_by = Column(String, nullable=True)
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ComponentIssuesNotification(Base):
    __tablename__ = "component_issues_notification"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Using a plain integer reference to avoid cross-schema FK dependency during table creation
    comp_issues_id = Column(Integer, nullable=False, index=True)
    is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    ack_by = Column(String, nullable=True)
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MachineCalibrationNotification(Base):
    __tablename__ = "machine_calibration_notification"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id", ondelete="CASCADE"), nullable=False)
    is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    ack_by = Column(String, nullable=True)
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ActivityLog(Base):
    """Tracks all changes across the system for audit trail and notifications"""
    __tablename__ = "activity_log"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    entity_type = Column(String, nullable=False, index=True)  # 'part', 'operation', 'document', 'assembly', etc.
    entity_id = Column(Integer, nullable=False, index=True)  # ID of the entity that changed
    action = Column(String, nullable=False, index=True)  # 'created', 'updated', 'deleted', 'soft_deleted', 'restored', 'schedule_activated', etc.
    order_id = Column(Integer, ForeignKey("oms.orders.id", ondelete="CASCADE"), nullable=True, index=True)  # Related order (if applicable)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id", ondelete="CASCADE"), nullable=True)  # User who made the change
    user_name = Column(String, nullable=True)  # Cached user name for performance
    user_role = Column(String, nullable=True)  # Cached user role for performance
    timestamp = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
    details = Column(JSON, nullable=True)  # Additional details as JSON (e.g., field changes, old values, new values)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class PCNotification(Base):
    """Links activity logs to Project Coordinators for notifications"""
    __tablename__ = "pc_notifications"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    activity_log_id = Column(Integer, ForeignKey("notifications.activity_log.id", ondelete="CASCADE"), nullable=False, index=True)
    pc_user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id", ondelete="CASCADE"), nullable=False, index=True)  # PC user to notify
    is_read = Column(Boolean, nullable=False, server_default=text("false"), index=True)
    read_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)


class MCNotification(Base):
    """Links document uploads to Manufacturing Coordinators for acknowledgment workflow"""
    __tablename__ = "mc_notifications"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("oms.documents.id"), nullable=False, index=True)
    mc_user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False, index=True)  # MC user to notify
    is_acknowledged = Column(Boolean, nullable=False, server_default=text("false"), index=True)
    ack_remarks = Column(String, nullable=True)  # Remarks when acknowledging
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    is_rejected = Column(Boolean, nullable=False, server_default=text("false"), index=True)
    reject_remarks = Column(String, nullable=True)  # Remarks when rejecting
    reject_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class PMMissedNotification(Base):
    """Compulsory PM checkpoint missed by end of shift — for Admin/MC."""
    __tablename__ = "pm_missed_notifications"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    assignment_item_id = Column(Integer, nullable=False, index=True)
    machine_id = Column(Integer, nullable=False, index=True)
    checklist_id = Column(Integer, nullable=True)
    due_date = Column(Date, nullable=False, index=True)
    item_text = Column(String, nullable=True)
    machine_label = Column(String, nullable=True)
    checklist_name = Column(String, nullable=True)
    message = Column(String, nullable=False)
    is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    ack_by = Column(String, nullable=True)
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


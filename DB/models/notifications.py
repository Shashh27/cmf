from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey, func, text
from ..database import Base


class OrderNotification(Base):
    __tablename__ = "order_notifications"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    ack_by = Column(String, nullable=True)  # stores accesscontrol.access_users.user_name
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
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
    tool_issues_id = Column(Integer, ForeignKey("inventory.tool_issues.id"), nullable=False)
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
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    is_ack = Column(Boolean, nullable=False, server_default=text("false"))
    ack_by = Column(String, nullable=True)
    ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


from sqlalchemy import Boolean, Column, Integer, String, Text, ForeignKey, func
from sqlalchemy.types import DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from ..database import Base

def get_ist_time():
    return datetime.utcnow() + timedelta(hours=5, minutes=30)

class OEEIssue(Base):
    __tablename__ = "oee_issues"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id", ondelete="CASCADE"), nullable=False)
    reported_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    issue_category = Column(String, nullable=False)
    issue_reason = Column(Text, nullable=False)
    start_time = Column(DateTime(timezone=False), nullable=False)
    end_time = Column(DateTime(timezone=False), nullable=False)
    reported_at = Column(DateTime(timezone=False), default=get_ist_time, nullable=False)

    machine = relationship("Machine")

class MachineBreakdown(Base):
    __tablename__ = "machine_breakdown"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id", ondelete="CASCADE"), nullable=False)
    reported_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    issue_category = Column(String, nullable=False)
    machine_status = Column(String, nullable=False)
    issue_reason = Column(Text, nullable=False)
    additional_reason = Column(Text, nullable=True)
    reported_at = Column(DateTime(timezone=False), default=get_ist_time, nullable=False)

    machine = relationship("Machine")

class ComponentIssue(Base):
    __tablename__ = "component_issues"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id", ondelete="CASCADE"), nullable=False)
    reported_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    component_status = Column(String, nullable=False)
    production_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=True)
    description = Column(Text, nullable=False)
    reported_at = Column(DateTime(timezone=False), default=get_ist_time, nullable=False)

    machine = relationship("Machine")

class HelpSupport(Base):
    __tablename__ = "help_support"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id", ondelete="CASCADE"), nullable=False)
    reported_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    production_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=True)
    description = Column(Text, nullable=False)
    mc_reply = Column(Text, nullable=True)
    replied_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    replied_at = Column(DateTime(timezone=False), nullable=True)
    reported_at = Column(DateTime(timezone=False), default=get_ist_time, nullable=False)

    machine = relationship("Machine")
    replied_by_user = relationship("AccessUser", foreign_keys=[replied_by])


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id", ondelete="CASCADE"), nullable=True)
    order_no = Column(String, nullable=True)
    project_name = Column(String, nullable=True)
    part_no = Column(String, nullable=True)
    part_name = Column(String, nullable=True)
    description = Column(Text, nullable=False)
    supervisor_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    status = Column(String, nullable=False, default="pending")
    remark = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=False), nullable=True)
    supervisor_ack = Column(Boolean, nullable=False, default=False)
    supervisor_ack_at = Column(DateTime(timezone=False), nullable=True)
    operator_ack = Column(Boolean, nullable=False, default=False)
    operator_ack_at = Column(DateTime(timezone=False), nullable=True)
    created_at = Column(DateTime(timezone=False), default=get_ist_time, nullable=False)

    machine = relationship("Machine")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    supervisor = relationship("AccessUser", foreign_keys=[supervisor_id])

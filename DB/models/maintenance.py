from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.types import DateTime
from sqlalchemy.orm import relationship
from ..database import Base

class OEEIssue(Base):
    __tablename__ = "oee_issues"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    reported_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    issue_category = Column(String, nullable=False)
    issue_reason = Column(Text, nullable=False)
    start_time = Column(DateTime(timezone=False), nullable=False)
    end_time = Column(DateTime(timezone=False), nullable=False)

    machine = relationship("Machine")

class MachineBreakdown(Base):
    __tablename__ = "machine_breakdown"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    reported_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    issue_category = Column(String, nullable=False)
    machine_status = Column(String, nullable=False)
    issue_reason = Column(Text, nullable=False)
    additional_reason = Column(Text, nullable=True)

    machine = relationship("Machine")

class ComponentIssue(Base):
    __tablename__ = "component_issues"
    __table_args__ = {"schema": "maintenance"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    reported_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    component_status = Column(String, nullable=False)
    production_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    description = Column(Text, nullable=False)

    machine = relationship("Machine")

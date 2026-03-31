from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Text,
    TIMESTAMP,
    TIME,
    Boolean,
    Float,
    func
)
from sqlalchemy.orm import relationship
from ..database import Base
from .access_control import AccessUser
from .oms import Order


# =======================
# Work Center
# =======================
class WorkCenter(Base):
    __tablename__ = "work_centers"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False)
    work_center_name = Column(String, nullable=False)
    description = Column(String)
    is_schedulable = Column(Boolean, default=True)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    machines = relationship("Machine", back_populates="work_center")
    user = relationship("AccessUser")


# =======================
# Machine
# =======================
class Machine(Base):
    __tablename__ = "machines"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True)
    work_center_id = Column(Integer, ForeignKey("configuration.work_centers.id"), nullable=False)
    type = Column(String, nullable=False)
    make = Column(String)
    model = Column(String)
    year_of_installation = Column(Integer)
    cnc_controller = Column(String)
    cnc_controller_service = Column(String)
    remarks = Column(String)
    calibration_date = Column(TIMESTAMP)
    calibration_due_date = Column(TIMESTAMP)
    password = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    work_center = relationship("WorkCenter", back_populates="machines")
    user = relationship("AccessUser")


# =======================
# Customer
# =======================
class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    branch = Column(String, nullable=False)
    email = Column(String, nullable=False)
    contact_number = Column(String, nullable=False)
    contact_person = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    orders = relationship("Order", back_populates="customer")
    user = relationship("AccessUser")


# =======================
# Pokayoke Checklists
# =======================
class PokayokeChecklist(Base):
    __tablename__ = "pokayoke_checklists"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    items = relationship("PokayokeChecklistItem", back_populates="checklist", cascade="all, delete-orphan")
    machine_assignments = relationship("PokayokeMachineAssignment", back_populates="checklist", cascade="all, delete-orphan")


class PokayokeChecklistItem(Base):
    __tablename__ = "pokayoke_checklist_items"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    checklist_id = Column(Integer, ForeignKey("configuration.pokayoke_checklists.id"), nullable=False)
    item_text = Column(String, nullable=False)
    sequence_number = Column(Integer, nullable=False)
    item_type = Column(String, nullable=False)  # 'boolean', 'numerical', 'text'
    is_required = Column(Boolean, default=True)
    expected_value = Column(String)  # Depends on item_type
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    checklist = relationship("PokayokeChecklist", back_populates="items")


class PokayokeMachineAssignment(Base):
    __tablename__ = "pokayoke_machine_assignments"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True)
    checklist_id = Column(Integer, ForeignKey("configuration.pokayoke_checklists.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    frequency = Column(String, nullable=True)  # 'Daily', 'Weekly', 'Monthly'
    shift = Column(String, nullable=True)      # 'Morning', 'Evening', 'Both' (if Daily)
    scheduled_day = Column(String, nullable=True) # Day of week (Weekly) or Day of month (Monthly)
    assigned_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    checklist = relationship("PokayokeChecklist", back_populates="machine_assignments")
    machine = relationship("Machine")


class PokayokeCompletedLog(Base):
    __tablename__ = "pokayoke_completed_logs"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    checklist_id = Column(Integer, ForeignKey("configuration.pokayoke_checklists.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    production_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=True)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=True)
    completed_at = Column(TIMESTAMP, nullable=False)
    all_items_passed = Column(Boolean, nullable=False)
    comments = Column(Text, nullable=True)
    read = Column(Boolean, default=False)
    assignment_id = Column(Integer, ForeignKey("configuration.pokayoke_machine_assignments.id"), nullable=True)
    frequency = Column(String, nullable=True)  # 'Daily', 'Weekly', 'Monthly'
    shift = Column(String, nullable=True)      # 'Morning', 'Evening', 'Both'

    # Relationships
    checklist = relationship("PokayokeChecklist")
    machine = relationship("Machine")
    part = relationship("DB.models.oms.Part")
    operator = relationship("AccessUser")
    order = relationship("Order")
    item_responses = relationship("PokayokeItemResponse", back_populates="completed_log", cascade="all, delete-orphan")
    machine_assignment = relationship("PokayokeMachineAssignment")


class PokayokeItemResponse(Base):
    __tablename__ = "pokayoke_item_responses"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    completed_log_id = Column(Integer, ForeignKey("configuration.pokayoke_completed_logs.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("configuration.pokayoke_checklist_items.id"), nullable=False)
    response_value = Column(String, nullable=False)
    is_confirming = Column(Boolean, default=False)
    timestamp = Column(TIMESTAMP, nullable=False)

    # Relationships
    completed_log = relationship("PokayokeCompletedLog", back_populates="item_responses")
    item = relationship("PokayokeChecklistItem")

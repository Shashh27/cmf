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
    func,
    text
)
from sqlalchemy.orm import relationship
from ..database import Base
from .access_control import AccessUser
from .oms import Order


# =======================
# Work Center
# =======================
class workcenter(Base):
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
    mhr = Column(Integer, nullable=True)
    calibration_date = Column(TIMESTAMP)
    calibration_due_date = Column(TIMESTAMP)
    calibration_frequency = Column(String)  # e.g., '6 months', '1 year', '2 years'
    password = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    work_center = relationship("workcenter", back_populates="machines")
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
    all_items_passed = Column(Boolean, nullable=True, default=None)
    comments = Column(Text, nullable=True)
    read = Column(Boolean, default=False)
    assignment_id = Column(Integer, ForeignKey("configuration.pokayoke_machine_assignments.id"), nullable=True)
    frequency = Column(String, nullable=True)  # 'Daily', 'Weekly', 'Monthly'
    shift = Column(String, nullable=True)      # 'Morning', 'Evening', 'Both'
    
    # Acknowledgment fields for operator
    operator_acknowledged = Column(Boolean, nullable=False, server_default=text("false"))
    operator_acknowledged_at = Column(TIMESTAMP(timezone=True), nullable=True)
    
    # Acknowledgment fields for supervisor
    supervisor_acknowledged = Column(Boolean, nullable=False, server_default=text("false"))
    supervisor_acknowledged_at = Column(TIMESTAMP(timezone=True), nullable=True)
    supervisor_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    # Relationships
    checklist = relationship("PokayokeChecklist")
    machine = relationship("Machine")
    part = relationship("DB.models.oms.Part")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    supervisor = relationship("AccessUser", foreign_keys=[supervisor_id])
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
    is_confirming = Column(Boolean, nullable=True, default=None)
    timestamp = Column(TIMESTAMP, nullable=False)

    # Approval fields
    approval_status = Column(String, nullable=True)  # 'approved', 'rejected', 'pending'
    approved_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    approved_at = Column(TIMESTAMP, nullable=True)
    approval_comments = Column(String, nullable=True)

    # Relationships
    completed_log = relationship("PokayokeCompletedLog", back_populates="item_responses")
    item = relationship("PokayokeChecklistItem")
    approver = relationship("AccessUser")


# =======================
# Operation Checklists
# =======================
class OperationChecklist(Base):
    __tablename__ = "operation_checklists"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # 'general' or 'custom'
    created_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    operation_assignments = relationship("OperationChecklistAssign", back_populates="checklist", cascade="all, delete-orphan")
    submission_details = relationship("SubmissionDetail", back_populates="checklist", cascade="all, delete-orphan")
    creator = relationship("AccessUser", foreign_keys=[created_by])


class OperationChecklistAssign(Base):
    __tablename__ = "operation_checklist_assign"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=False)
    checklist_id = Column(Integer, ForeignKey("configuration.operation_checklists.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    checklist = relationship("OperationChecklist", back_populates="operation_assignments")
    assigner = relationship("AccessUser", foreign_keys=[assigned_by])


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=False)
    operator = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    status = Column(String, nullable=False, default='pending')  # 'pending', 'approved', 'rejected'
    submitted_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    supervisor = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    sup_action_at = Column(TIMESTAMP(timezone=True), nullable=True)
    sup_remarks = Column(Text, nullable=True)
    supervisor_ack_by = Column(Boolean, nullable=True, default=None)
    supervisor_ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    operator_ack_by = Column(Boolean, nullable=True, default=None)
    operator_ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    mc_ack_by = Column(Boolean, nullable=True, default=None)
    mc_ack_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    details = relationship("SubmissionDetail", back_populates="submission", cascade="all, delete-orphan")
    operator_user = relationship("AccessUser", foreign_keys=[operator])
    supervisor_user = relationship("AccessUser", foreign_keys=[supervisor])


class SubmissionDetail(Base):
    __tablename__ = "submission_details"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sub_id = Column(Integer, ForeignKey("configuration.submissions.id"), nullable=False)
    checklist_id = Column(Integer, ForeignKey("configuration.operation_checklists.id"), nullable=False)
    response = Column(Boolean, nullable=True, default=None)  # True or False
    op_remarks = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    submission = relationship("Submission", back_populates="details")
    checklist = relationship("OperationChecklist", back_populates="submission_details")

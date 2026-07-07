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
    Date,
    func,
    text,
    UniqueConstraint,
    Index,
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


# =======================
# Preventive Maintenance (PM)
# =======================
class PMChecklist(Base):
    __tablename__ = "pm_checklists"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    items = relationship("PMChecklistItem", back_populates="checklist", cascade="all, delete-orphan")
    assignments = relationship("PMMachineAssignment", back_populates="checklist", cascade="all, delete-orphan")
    creator = relationship("AccessUser", foreign_keys=[created_by])


class PMChecklistItem(Base):
    __tablename__ = "pm_checklist_items"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    checklist_id = Column(Integer, ForeignKey("configuration.pm_checklists.id", ondelete="CASCADE"), nullable=False, index=True)
    item_text = Column(String, nullable=False)
    sequence_number = Column(Integer, nullable=False)
    item_type = Column(String, nullable=False)  # Boolean, Numeric, Text
    expected_value = Column(String, nullable=True)
    frequency_type = Column(String, nullable=False)  # Time Based, Usage Based, Condition Based
    interval_value = Column(Integer, nullable=True)
    interval_unit = Column(String, nullable=True)  # Day, Week, Month, Year
    trigger_hours = Column(Float, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    checklist = relationship("PMChecklist", back_populates="items")
    assignment_items = relationship("PMAssignmentItem", back_populates="checklist_item")


class PMMachineAssignment(Base):
    __tablename__ = "pm_machine_assignments"
    __table_args__ = (
        UniqueConstraint('machine_id', 'checklist_id', name='uq_pm_machine_checklist'),
        {'schema': 'configuration'},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False, index=True)
    checklist_id = Column(Integer, ForeignKey("configuration.pm_checklists.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    assigned_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    machine = relationship("Machine")
    checklist = relationship("PMChecklist", back_populates="assignments")
    assigner = relationship("AccessUser", foreign_keys=[assigned_by])
    assignment_items = relationship("PMAssignmentItem", back_populates="assignment", cascade="all, delete-orphan")


class PMAssignmentItem(Base):
    __tablename__ = "pm_assignment_items"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    assignment_id = Column(Integer, ForeignKey("configuration.pm_machine_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    checklist_item_id = Column(Integer, ForeignKey("configuration.pm_checklist_items.id"), nullable=False, index=True)
    is_required = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    assignment = relationship("PMMachineAssignment", back_populates="assignment_items")
    checklist_item = relationship("PMChecklistItem", back_populates="assignment_items")
    schedule = relationship("PMSchedule", back_populates="assignment_item", uselist=False, cascade="all, delete-orphan")
    submissions = relationship("PMCheckpointSubmission", back_populates="assignment_item")


class PMSchedule(Base):
    __tablename__ = "pm_schedule"
    __table_args__ = (
        UniqueConstraint('assignment_item_id', name='uq_pm_schedule_assignment_item'),
        Index('ix_pm_schedule_next_due_date', 'next_due_date'),
        {'schema': 'configuration'},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    assignment_item_id = Column(Integer, ForeignKey("configuration.pm_assignment_items.id", ondelete="CASCADE"), nullable=False, unique=True)
    last_completed_date = Column(Date, nullable=True)
    next_due_date = Column(Date, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    assignment_item = relationship("PMAssignmentItem", back_populates="schedule")
    submissions = relationship("PMCheckpointSubmission", back_populates="schedule")


class PMCheckpointSubmission(Base):
    __tablename__ = "pm_checkpoint_submissions"
    __table_args__ = (
        Index('ix_pm_submissions_status', 'status'),
        Index('ix_pm_submissions_schedule_id', 'schedule_id'),
        {'schema': 'configuration'},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey("configuration.pm_schedule.id"), nullable=False)
    assignment_item_id = Column(Integer, ForeignKey("configuration.pm_assignment_items.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    response_value = Column(String, nullable=False)
    operator_comments = Column(Text, nullable=True)
    submitted_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    status = Column(String, nullable=False, default='Submitted')  # Submitted, Approved, Rejected
    supervisor_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    reviewed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    supervisor_comments = Column(Text, nullable=True)
    supervisor_acknowledged = Column(Boolean, nullable=False, default=False)
    supervisor_acknowledged_at = Column(TIMESTAMP(timezone=True), nullable=True)
    operator_acknowledged = Column(Boolean, nullable=False, default=False)
    operator_acknowledged_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    schedule = relationship("PMSchedule", back_populates="submissions")
    assignment_item = relationship("PMAssignmentItem", back_populates="submissions")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    supervisor = relationship("AccessUser", foreign_keys=[supervisor_id])

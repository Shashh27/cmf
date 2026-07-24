from platform import machine
from typing import Optional
# from backend.cmf.routers import workcenter
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
    DateTime,
    Date,
    UniqueConstraint,
    DATE
)
from ..database import Base
from sqlalchemy.orm import relationship
from datetime import datetime
from datetime import date 
from ..database import Base


# Creating database models 

# =======================
# Status
# =======================
class Status(Base):
    __tablename__ = "status"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    machine_statuses = relationship("MachineStatus", back_populates="statuses")


# =======================
# Machine Status
# =======================
class MachineStatus(Base):
    __tablename__ = "machine_status"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)

    machine_id = Column(Integer, ForeignKey("configuration.machines.id"))
    status_id = Column(Integer, ForeignKey("scheduling.status.id"))
    

    description = Column(Text, nullable=True)

    available_from = Column(DateTime, nullable=True)
    available_to = Column(DateTime, nullable=True)

    # machine = relationship("Machine", back_populates="machine_statuses")
    statuses = relationship("Status", back_populates="machine_statuses")


# =======================
# Machine Downtime
# =======================
class MachineDowntime(Base):
    __tablename__ = "machine_downtimes"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)

    machine_id = Column(Integer, ForeignKey("configuration.machines.id"))
    status_id = Column(Integer, ForeignKey("scheduling.status.id"))
    status_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # ?machine = relationship("Machine", back_populates="downtimes")


# =======================
# Shift Hours Configuration
# =======================
class ShiftHoursConfiguration(Base):
    __tablename__ = "shift_hours_configuration"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    working_day = Column(Boolean, nullable=False, default=True)
    number_of_shifts = Column(Integer, nullable=False, default=1)
    shift_timings = relationship(
        "ShiftTimingConfiguration",
        back_populates="shift_config",
        cascade="all, delete-orphan",
    )


# =======================
# Shift Timing Configuration
# =======================
class ShiftTimingConfiguration(Base):
    __tablename__ = "shift_timing_configuration"
    __table_args__ = (
        UniqueConstraint("shift_config_id", "shift_code", name="uq_shift_timing_config_shift"),
        {'schema': 'scheduling'},
    )

    id = Column(Integer, primary_key=True, index=True)
    shift_config_id = Column(
        Integer,
        ForeignKey("scheduling.shift_hours_configuration.id"),
        nullable=False,
    )
    shift_code = Column(String, nullable=False)  # GENERAL / NEXT / NON_WORKING / CUSTOM
    shift_start = Column(TIME, nullable=False)
    shift_end = Column(TIME, nullable=False)
    custom_start = Column(TIME, nullable=True)  # For CUSTOM shifts
    custom_end = Column(TIME, nullable=True)    # For CUSTOM shifts

    shift_config = relationship("ShiftHoursConfiguration", back_populates="shift_timings")


# =======================
# Part Schedule Status
# =======================
class PartScheduleStatus(Base):
    __tablename__ = "part_schedule_status"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    sale_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    # part_number = Column(String, ForeignKey("oms.parts.part_number"), nullable=False)
    # sale_order_number = Column(String, ForeignKey("oms.orders.sale_order_number"), nullable=False)
    status = Column(String, nullable=False, default="inactive")
    start_date = Column(DateTime, nullable=True)   
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    order = relationship("Order", back_populates="part_schedule_status")
    # part = relationship("Part")


# =======================
# Planned Schedule Items
# =======================
class PlannedScheduleItem(Base):
    __tablename__ = "planned_schedule_items"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    part_number = Column(String, ForeignKey("oms.parts.part_number"), nullable=False)
    sale_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    sale_order_number = Column(String, ForeignKey("oms.orders.sale_order_number"), nullable=False)
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=True)
    
    planned_start_time = Column(DateTime, nullable=False)
    planned_end_time = Column(DateTime, nullable=False)

    total_quantity = Column(Integer, nullable=False)
    remaining_quantity = Column(Integer, nullable=False)

    status = Column(String, nullable=True, default="pending")

    created_at = Column(DateTime, nullable=False, default=func.now())


    schedule_history_id = Column(Integer, ForeignKey("scheduling.schedule_history.id"),nullable=True)
    schedule_history = relationship("ScheduleHistory",back_populates="planned_schedule_items")

    # updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())


# =======================
# Schedule History
# =======================
class ScheduleHistory(Base):
    __tablename__ = "schedule_history"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    version = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    generated_at = Column(DateTime, nullable=False, default=func.now())
    message = Column(String, nullable=True)
    
    planned_schedule_items = relationship("PlannedScheduleItem",back_populates="schedule_history")


# class ScheduleVersion
# class RescheduleHistory

# =======================
# Capacity Planning
# =======================
class EfficiencyFactor(Base):
    __tablename__ = "efficiency_factor"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    efficiency_factor = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())


# ====================================================================
# Order Schedule Status
# ====================================================================
class OrderScheduleStatus(Base):
    __tablename__ = "order_schedule_status"
    __table_args__ = {"schema": "scheduling"}

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(Integer, ForeignKey("oms.orders.id"))
    product_id = Column(Integer, ForeignKey("oms.products.id"))

    active_parts_count = Column(Integer, default=0)
    active_inhouse_parts = Column(Integer, default=0)   #  NEW

    status = Column(String, default="inactive")

    activated_at = Column(DateTime)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    order = relationship("Order")



# ====================================================================
# Machine Schedule
# ====================================================================
class MachineSchedule(Base):
    __tablename__ = "machine_schedule"
    __table_args__ = {"schema": "scheduling"}

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(Integer, ForeignKey("oms.orders.id"))
    part_id = Column(Integer, ForeignKey("oms.parts.id"))
    operation_id = Column(Integer, ForeignKey("oms.operations.id"))
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"))
    workcenter_id = Column(Integer, ForeignKey("configuration.work_centers.id"))

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)

    status = Column(String, default="planned")  # planned/running/completed

    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())


class OperationStatus(Base):
    __tablename__ = "operation_status"
    __table_args__ = (
        UniqueConstraint("operation_id", name="uq_operation_status_operation_id"),
        {"schema": "scheduling"}
    )

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(Integer, ForeignKey("oms.orders.id"))
    part_id = Column(Integer, ForeignKey("oms.parts.id"))
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=False, unique=True)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)  # Operator who activated the job card

    status = Column(String, nullable=False, default="pending")  # pending/inprogress/completed

    started_at = Column(DateTime, nullable=True)  # Set when status changes to inprogress
    completed_at = Column(DateTime, nullable=True)  # Set when status changes to completed
    
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())


# =======================
# Production Log
# =======================
class ProductionLog(Base):
    __tablename__ = "production_logs"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    operation_id = Column(Integer, ForeignKey('oms.operations.id'), nullable=False)
    operator_id = Column(Integer, ForeignKey('accesscontrol.access_users.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('accesscontrol.access_users.id'), nullable=True)
    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), nullable=True)
    notes = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    from_date = Column(DATE)
    from_time = Column(TIME)
    to_date = Column(DATE)
    to_time = Column(TIME)
    status = Column(String, default='pending', nullable=False)
    operator_status = Column(String, nullable=False, default='inprogress')
    produced_quantity = Column(Integer)
    operator_rework_quantity = Column(Integer, nullable=True)
    approved_quantity = Column(Integer, nullable=True)
    acknowledged = Column(Boolean, default=False, nullable=False)
    acknowledged_at = Column(DateTime, nullable=True)
    operator_acknowledged = Column(Boolean, default=False, nullable=False)
    operator_acknowledged_at = Column(DateTime, nullable=True)
    rework_quantity = Column(Integer, nullable=True)
    rejected_quantity = Column(Integer, nullable=True)
    remaining_quantity_to_be_produced = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)

    # Relationships
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    reviewer = relationship("AccessUser", foreign_keys=[user_id])
    machine = relationship("Machine", foreign_keys=[machine_id])


# =======================
# Machine Operator Shift Assignment
# =======================
class MachineOperatorShiftAssignment(Base):
    __tablename__ = "machine_operator_shift_assignment"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    shift_config_id = Column(Integer, ForeignKey("scheduling.shift_hours_configuration.id"), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    machine = relationship("Machine", foreign_keys=[machine_id])
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    assigner = relationship("AccessUser", foreign_keys=[assigned_by_id])
    shift_config = relationship("ShiftHoursConfiguration", foreign_keys=[shift_config_id])


class Rescheduling(Base):
    __tablename__ = "rescheduling_items"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey('oms.orders.id'), nullable=False)
    order_number = Column(String, ForeignKey("oms.orders.sale_order_number"), nullable=False)
    part_id = Column(Integer, ForeignKey('oms.parts.id'), nullable=False)
    part_number = Column(String, ForeignKey("oms.parts.part_number"), nullable=False)
    operation_id = Column(Integer, ForeignKey('oms.operations.id'), nullable=False)
    operation_number = Column(String, nullable=False)
    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), nullable=True)

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)

    total_qty = Column(Integer, nullable=False)     # Total part qty
    completed_qty = Column(Integer, nullable=False) # Approved_qty from production logs 
    remaining_qty = Column(Integer, nullable=False) # Total - Approved
    status = Column(String, nullable=False)         # Status of the rescheduling item -- scheduled | rescheduled
    schedule_version = Column(Integer, nullable=False, default=1)


# =======================
# Unit-wise schedule (greedy / future GA)
# =======================
class UnitScheduleItem(Base):
    """
    One segment for a single unit on one operation.
    Separate from batch rescheduling_items — Batch Gantt unchanged.
    """
    __tablename__ = "unit_schedule_items"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    order_number = Column(String, nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    part_number = Column(String, nullable=False)
    unit_index = Column(Integer, nullable=False)  # 1 .. part.qty
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=False)
    operation_number = Column(String, nullable=False)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default="unit_scheduled")
    schedule_version = Column(Integer, nullable=False, default=1)
    source = Column(String, nullable=False, default="greedy")
    created_at = Column(DateTime, nullable=False, default=func.now())


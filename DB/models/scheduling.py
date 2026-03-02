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
    Date
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
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    
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
    efficiency_factor = Column(Float, nullable=False, default=0.85)
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


# class MachineProductionLog(Base):
#     __tablename__ = "machine_production_log"
#     __table_args__ = {"schema": "execution"}

#     id = Column(Integer, primary_key=True)

#     machine_schedule_id = Column(Integer, ForeignKey("scheduling.machine_schedule.id"), nullable=False)

#     actual_start_time = Column(DateTime, nullable=True)
#     actual_end_time = Column(DateTime, nullable=True)

#     produced_quantity = Column(Integer, nullable=True)
#     # rejected_quantity = Column(Integer, nullable=True)

#     operator_id = Column(Integer, ForeignKey("users.users.id"))

#     status = Column(String)  # running/completed/paused
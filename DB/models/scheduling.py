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
    part_number = Column(String, ForeignKey("oms.parts.part_number"), nullable=False)
    sale_order_number = Column(String, ForeignKey("oms.orders.sale_order_number"), nullable=False)
    status = Column(String, nullable=False, default="inactive")
    start_date = Column(DateTime, nullable=True)   
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())


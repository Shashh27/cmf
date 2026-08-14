from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class MachineLiveStatus(Base):
    __tablename__ = "machine_live_status"
    __table_args__ = {"schema": "production_monitoring"}

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(
        Integer,
        ForeignKey("configuration.machines.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    status = Column(String, nullable=False, default="OFF")  # PRODUCTION, ON, OFF
    last_updated = Column(DateTime, default=datetime.now, nullable=False)

    # Current job info
    current_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=True)
    current_part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=True)
    current_operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=True)

    # CNC / process snapshot
    active_program_number = Column(Integer, nullable=True)
    main_program_number = Column(Integer, nullable=True)
    program_name = Column(String(255), nullable=True)
    mode = Column(String(255), nullable=True)
    run_status = Column(String(255), nullable=True)
    alarm_status = Column(Integer, nullable=True)
    emergency_status = Column(String(255), nullable=True)
    alarm_message = Column(String(500), nullable=True)
    feed_rate = Column(Float, nullable=True)
    spindle_speed = Column(Float, nullable=True)
    spindle_load = Column(Float, nullable=True)
    axis_load = Column(JSON, nullable=True)
    battery_alarm = Column(String(500), nullable=True)

    machine = relationship("Machine")
    order = relationship("Order")
    part = relationship("Part")
    operation = relationship("Operation")


class MachineProcessData(Base):
    __tablename__ = "machine_process_data"
    __table_args__ = {"schema": "production_monitoring"}

    machine_id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, primary_key=True, default=datetime.now)
    feed_rate = Column(Float, nullable=True)
    spindle_speed = Column(Float, nullable=True)
    spindle_load = Column(Float, nullable=True)
    axis_load = Column(JSON, nullable=True)


class MachineLiveHistory(Base):
    __tablename__ = "machine_live_history"
    __table_args__ = {"schema": "production_monitoring"}

    machine_id = Column(
        Integer,
        ForeignKey("configuration.machines.id", ondelete="CASCADE"),
        nullable=False,
    )
    last_updated = Column(DateTime, primary_key=True, default=datetime.now)
    status = Column(String, nullable=False)

    # Job info at the time of history record
    current_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=True)
    current_part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=True)
    current_operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=True)

    machine = relationship("Machine")
    order = relationship("Order")
    part = relationship("Part")
    operation = relationship("Operation")

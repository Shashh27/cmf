from sqlalchemy import Column, Integer, String, Float, TIMESTAMP, ForeignKey, Text, func, Time, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class ShiftSummary(Base):
    __tablename__ = "shift_summary"
    __table_args__ = {"schema": "production_monitoring"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    shift = Column(Integer, nullable=False)  # 1, 2, 3
    timestamp = Column(DateTime, nullable=False)

    updatedate = Column(DateTime, default=datetime.now)

    off_time = Column(Time)

    idle_time = Column(Time)

    production_time = Column(Time)

    total_parts = Column(Integer, default=0)

    good_parts = Column(Integer, default=0)

    bad_parts = Column(Integer, default=0)

    availability = Column(Float, default=0.0)

    performance = Column(Float, default=0.0)

    quality = Column(Float, default=0.0)

    availability_loss = Column(Float, default=0.0)

    performance_loss = Column(Float, default=0.0)

    quality_loss = Column(Float, default=0.0)

    oee = Column(Float, default=0.0)
    
    machine = relationship("Machine")



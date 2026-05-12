from sqlalchemy import Column, Integer, String, Float, TIMESTAMP, ForeignKey, Text, func, Time, DateTime
from sqlalchemy.orm import relationship
from ..database import Base

class ShiftSummary(Base):
    __tablename__ = "shift_summary"
    __table_args__ = {"schema": "production_monitoring"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    shift = Column(Integer, nullable=False)  # 1, 2, 3
    timestamp = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updatedate = Column(DateTime, server_default=func.now(), nullable=False)
    
    off_time = Column(Time, nullable=True)
    idle_time = Column(Time, nullable=True) 
    production_time = Column(Time, nullable=True)
    
    oee = Column(Float, default=0.0)
    availability = Column(Float, default=0.0)
    performance = Column(Float, default=0.0)
    quality = Column(Float, default=0.0)
    
    availability_loss = Column(Float, default=0.0)
    performance_loss = Column(Float, default=0.0)
    quality_loss = Column(Float, default=0.0)
    
    total_parts = Column(Integer, default=0)
    good_parts = Column(Integer, default=0)
    bad_parts = Column(Integer, default=0)

    machine = relationship("Machine")

class OEEIssue(Base):
    __tablename__ = "oee_issue"
    __table_args__ = {"schema": "production_monitoring"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    issue_category = Column(String, nullable=False) # Availability, Performance, Quality
    issue_reason = Column(Text, nullable=False)
    start_time = Column(TIMESTAMP, nullable=False)
    end_time = Column(TIMESTAMP, nullable=True)
    duration_minutes = Column(Float, default=0.0)
    timestamp = Column(TIMESTAMP, server_default=func.now())

    machine = relationship("Machine")

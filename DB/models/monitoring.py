from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class MachineLiveStatus(Base):
    __tablename__ = "machine_live_status"
    __table_args__ = {'schema': 'production_monitoring'}

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"),  nullable=False)
    status = Column(String, nullable=False, default="OFF")  # PRODUCTION, ON, OFF
    last_updated = Column(DateTime, default=datetime.now, nullable=False)
    
    # Current job info
    current_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=True)
    current_part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=True)
    current_operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=True)

    machine = relationship("Machine")
    order = relationship("Order")
    part = relationship("Part")
    operation = relationship("Operation")

class MachineLiveHistory(Base):
    __tablename__ = "machine_live_history"
    __table_args__ = {'schema': 'production_monitoring'}

    
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    
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

from sqlalchemy import Column, Integer, String, DATE, TIME, ForeignKey, TIMESTAMP, DateTime, func, Text
from sqlalchemy.orm import relationship
from ..database import Base




class ProductionLog(Base):
    __tablename__ = "production_logs"
    __table_args__ = {'schema': 'scheduling'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    planned_schedule_items_id = Column(Integer, nullable=False)
    operator_id = Column(Integer, ForeignKey('accesscontrol.access_users.id'), nullable=False)
    supervisor_id = Column(Integer, ForeignKey('accesscontrol.access_users.id'), nullable=True)
    notes = Column(Text, nullable=True)
    from_date = Column(DATE, nullable=False)
    from_time = Column(TIME, nullable=False)
    to_date = Column(DATE)
    to_time = Column(TIME)
    status = Column(String, default='pending', nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)

    # Relationships
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    supervisor = relationship("AccessUser", foreign_keys=[supervisor_id])

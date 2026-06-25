from sqlalchemy import Column, Integer, String, DateTime, func, Date, Text, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from ..database import Base

class AccessUser(Base):
    __tablename__ = "access_users"
    __table_args__ = {'schema': 'accesscontrol'}

    id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String, nullable=False)
    gmail = Column(String, unique=True, nullable=False)
    role = Column(String, nullable=False)
    center = Column(String)
    group = Column(String)
    password = Column(String, nullable=False)
    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

class OperatorLeave(Base):
    __tablename__ = "operator_leaves"
    __table_args__ = (
        CheckConstraint('from_date <= to_date', name='check_date_range'),
        CheckConstraint("status IN ('pending', 'acknowledged', 'rejected')", name='check_status_values'),
        {'schema': 'accesscontrol'}
    )

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(String, nullable=True)
    additional_remarks = Column(Text, nullable=True)
    status = Column(String, nullable=False, default='pending')
    approved_by = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationship to AccessUser (will be filtered by role = 'operator' in application logic)
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    approver = relationship("AccessUser", foreign_keys=[approved_by])
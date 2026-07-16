from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class MachineOperatorAssignmentNotification(Base):
    __tablename__ = "machine_operator_assignment_notification"
    __table_args__ = {"schema": "notifications"}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    assignment_id = Column(Integer, nullable=True)
    shift_date = Column(Date, nullable=False)
    action = Column(String, nullable=False)  # assigned | updated | removed
    message = Column(Text, nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

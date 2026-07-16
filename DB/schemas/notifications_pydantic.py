from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class MachineOperatorAssignmentNotificationResponse(BaseModel):
    id: int
    operator_id: int
    machine_id: int
    assignment_id: Optional[int] = None
    shift_date: date
    action: str
    message: str
    assigned_by_id: Optional[int] = None
    assigned_by_name: Optional[str] = None
    machine_label: Optional[str] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationReadUpdate(BaseModel):
    is_read: bool = True

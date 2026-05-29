from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class MachineDowntimeOut(BaseModel):
    work_center_name: str
    machine_id: int
    machine_name: str
    machine_model: Optional[str] = None
    status_id: int
    status_name: str
    description: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    created_at: datetime

    class Config:
        orm_mode = True

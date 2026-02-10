from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class MachineDowntimeOut(BaseModel):
    machine_id: int
    machine_name: str
    status_id: int
    status_name: str
    description: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    created_at: datetime

    class Config:
        orm_mode = True

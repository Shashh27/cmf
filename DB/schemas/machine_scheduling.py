from pydantic import BaseModel
from datetime import datetime, date
from typing import List, Dict, Optional, Any


from DB.models.scheduling import PartScheduleStatus


class PartStatusUpdate(BaseModel):
    status: str



class UpdatePartStatusResponse(BaseModel):
    message: str
    sale_order_number: str
    part_number: str
    part_type: str
    status: str
    will_be_scheduled: bool
    note: Optional[str] = None

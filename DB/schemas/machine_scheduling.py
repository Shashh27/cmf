from pydantic import BaseModel
from datetime import datetime, date
from typing import List, Dict, Optional, Any


from DB.models.scheduling import PartScheduleStatus
from DB.models.scheduling import OrderScheduleStatus


class PartStatusUpdate(BaseModel):
    status: str



class UpdatePartStatusResponse(BaseModel):
    message: str
    sale_order_id: int
    part_id: int
    part_type: str
    status: str
    will_be_scheduled: bool
    note: Optional[str] = None


class OrderScheduleStatusResponse(BaseModel):
    order_id: int
    product_id: int

    active_parts_count: int
    active_inhouse_parts: int

    status: str
    activated_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {
        "from_attributes": True   # Pydantic v2 replacement for orm_mode
    }


# class StartOperationRequest(BaseModel):
#     operator_id: Optional[int] = None


# class CompleteOperationRequest(BaseModel):
#     produced_quantity: int
#     rejected_quantity: int = 0


# class ProductionLogResponse(BaseModel):
#     id: int
#     machine_schedule_id: int
#     status: str
#     actual_start_time: Optional[datetime]
#     actual_end_time: Optional[datetime]

#     class Config:
#         from_attributes = True
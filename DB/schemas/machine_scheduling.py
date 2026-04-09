from pydantic import BaseModel, Field
from datetime import datetime, date, time
from typing import List, Dict, Optional, Any
from enum import Enum


from DB.models.scheduling import PartScheduleStatus
from DB.models.scheduling import OrderScheduleStatus
from DB.models.scheduling import OperationStatus


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


# class ProductionLogStatus(str, Enum):
#     PENDING = "pending"
#     COMPLETED = "completed"
#     REWORK = "rework"


# class ProductionLogBase(BaseModel):
#     operation_id: int = Field(..., description="ID of the operation")
#     operator_id: int = Field(..., description="ID of the operator")
#     supervisor_id: Optional[int] = Field(None, description="ID of the supervisor")
#     notes: Optional[str] = Field(None, description="Additional notes")
#     from_date: date = Field(..., description="Start date (yyyy-mm-dd)")
#     from_time: time = Field(..., description="Start time (hh:mm:ss)")
#     to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
#     to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
#     status: ProductionLogStatus = Field(ProductionLogStatus.PENDING, description="Status of production log")


# class ProductionLogCreate(ProductionLogBase):
#     pass


# class ProductionLogUpdate(BaseModel):
#     operation_id: Optional[int] = Field(None, description="ID of the operation")
#     operator_id: Optional[int] = Field(None, description="ID of the operator")
#     supervisor_id: Optional[int] = Field(None, description="ID of the supervisor")
#     notes: Optional[str] = Field(None, description="Additional notes")
#     from_date: Optional[date] = Field(None, description="Start date (yyyy-mm-dd)")
#     from_time: Optional[time] = Field(None, description="Start time (hh:mm:ss)")
#     to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
#     to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
#     status: Optional[ProductionLogStatus] = Field(None, description="Status of production log")


# class ProductionLogResponse(ProductionLogBase):
#     id: int = Field(..., description="Production log ID")
#     created_at: datetime = Field(..., description="When the production log was created")

#     class Config:
#         from_attributes = True


# class ProductionLogWithDetails(ProductionLogResponse):
#     operation: Optional[dict] = Field(None, description="Operation details")
#     operator: Optional[dict] = Field(None, description="Operator details")
#     supervisor: Optional[dict] = Field(None, description="Supervisor details")

#     class Config:
#         from_attributes = True


# class ProductionLogStatusUpdate(BaseModel):
#     status: ProductionLogStatus = Field(..., description="New status for production log")
#     supervisor_id: Optional[int] = Field(None, description="ID of the supervisor updating the status")


# =======================
# Operation Status Schemas
# =======================
class OperationStatusBase(BaseModel):
    order_id: int = Field(..., description="ID of the order")
    part_id: int = Field(..., description="ID of the part")
    operation_id: int = Field(..., description="ID of the operation")
    operator_id: Optional[int] = Field(None, description="ID of the operator who activated the job card")
    status: str = Field(default="pending", description="Status of operation: pending/inprogress/completed")


class OperationStatusCreate(OperationStatusBase):
    pass


class OperationStatusUpdate(BaseModel):
    status: str = Field(..., description="New status for operation: pending/inprogress/completed")


class OperationStatusResponse(OperationStatusBase):
    id: int = Field(..., description="Operation status ID")
    started_at: Optional[datetime] = Field(None, description="When operation was started")
    completed_at: Optional[datetime] = Field(None, description="When operation was completed")
    created_at: datetime = Field(..., description="When the record was created")
    updated_at: datetime = Field(..., description="When the record was last updated")

    model_config = {
        "from_attributes": True
    }


class OperationStatusWithDetails(OperationStatusResponse):
    operation: Optional[dict] = Field(None, description="Operation details")
    part: Optional[dict] = Field(None, description="Part details")
    order: Optional[dict] = Field(None, description="Order details")

    model_config = {
        "from_attributes": True
    }

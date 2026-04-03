from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, time, datetime
from enum import Enum


class ProductionLogStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    REWORK = "rework"


class ProductionLogBase(BaseModel):
    planned_schedule_items_id: int = Field(..., description="ID of the planned schedule item")
    operator_id: int = Field(..., description="ID of the operator")
    supervisor_id: Optional[int] = Field(None, description="ID of the supervisor")
    notes: Optional[str] = Field(None, description="Additional notes")
    from_date: date = Field(..., description="Start date (yyyy-mm-dd)")
    from_time: time = Field(..., description="Start time (hh:mm:ss)")
    to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
    to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
    status: ProductionLogStatus = Field(ProductionLogStatus.PENDING, description="Status of production log")


class ProductionLogCreate(ProductionLogBase):
    pass


class ProductionLogUpdate(BaseModel):
    planned_schedule_items_id: Optional[int] = Field(None, description="ID of the planned schedule item")
    operator_id: Optional[int] = Field(None, description="ID of the operator")
    supervisor_id: Optional[int] = Field(None, description="ID of the supervisor")
    notes: Optional[str] = Field(None, description="Additional notes")
    from_date: Optional[date] = Field(None, description="Start date (yyyy-mm-dd)")
    from_time: Optional[time] = Field(None, description="Start time (hh:mm:ss)")
    to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
    to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
    status: Optional[ProductionLogStatus] = Field(None, description="Status of production log")


class ProductionLogResponse(ProductionLogBase):
    id: int = Field(..., description="Production log ID")
    created_at: datetime = Field(..., description="When the production log was created")

    class Config:
        from_attributes = True


class ProductionLogWithDetails(ProductionLogResponse):
    planned_schedule_item: Optional[dict] = Field(None, description="Planned schedule item details")
    operation: Optional[dict] = Field(None, description="Operation details")
    machine: Optional[dict] = Field(None, description="Machine details")
    operator: Optional[dict] = Field(None, description="Operator details")
    supervisor: Optional[dict] = Field(None, description="Supervisor details")

    class Config:
        from_attributes = True


class ProductionLogStatusUpdate(BaseModel):
    status: ProductionLogStatus = Field(..., description="New status for production log")
    supervisor_id: Optional[int] = Field(None, description="ID of the supervisor updating the status")

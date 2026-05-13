from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, time, datetime
from enum import Enum


class ProductionLogStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    REWORK = "rework"


class OperatorStatus(str, Enum):
    INACTIVE = "inactive"
    INPROGRESS = "inprogress"
    COMPLETED = "completed"


class ProductionLogBase(BaseModel):
    operation_id: int = Field(..., description="ID of the operation")
    operator_id: int = Field(..., description="ID of the operator")
    supervisor_id: Optional[int] = Field(None, description="ID of the supervisor")
    notes: Optional[str] = Field(None, description="Additional notes")
    remarks: Optional[str] = Field(None, description="Supervisor remarks when updating status")
    from_date: Optional[date] = Field(None, description="Start date (yyyy-mm-dd)")
    from_time: Optional[time] = Field(None, description="Start time (hh:mm:ss)")
    to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
    to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
    status: ProductionLogStatus = Field(ProductionLogStatus.PENDING, description="Status of production log")
    operator_status: OperatorStatus = Field(OperatorStatus.INACTIVE, description="Operator status")
    produced_quantity: Optional[int] = Field(None, description="Quantity produced by operator (must be greater than 0)")
    approved_quantity: Optional[int] = Field(None, description="Quantity approved by supervisor")


class ProductionLogCreate(ProductionLogBase):
    pass


class ProductionLogUpdate(BaseModel):
    operation_id: Optional[int] = Field(None, description="ID of the operation")
    operator_id: Optional[int] = Field(None, description="ID of the operator")
    supervisor_id: Optional[int] = Field(None, description="ID of the supervisor")
    notes: Optional[str] = Field(None, description="Additional notes")
    remarks: Optional[str] = Field(None, description="Supervisor remarks when updating status")
    from_date: Optional[date] = Field(None, description="Start date (yyyy-mm-dd)")
    from_time: Optional[time] = Field(None, description="Start time (hh:mm:ss)")
    to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
    to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
    status: Optional[ProductionLogStatus] = Field(None, description="Status of production log")
    operator_status: Optional[OperatorStatus] = Field(None, description="Operator status")
    produced_quantity: Optional[int] = Field(None, description="Quantity produced by operator")
    approved_quantity: Optional[int] = Field(None, description="Quantity approved by supervisor")


class ProductionLogResponse(ProductionLogBase):
    id: int = Field(..., description="Production log ID")
    created_at: datetime = Field(..., description="When the production log was created")
    rework_quantity: Optional[int] = Field(None, description="Calculated rework quantity (produced - approved)")

    class Config:
        from_attributes = True


class ProductionLogWithDetails(ProductionLogResponse):
    operation: Optional[dict] = Field(None, description="Operation details")
    machine: Optional[dict] = Field(None, description="Machine details")
    operator: Optional[dict] = Field(None, description="Operator details")
    supervisor: Optional[dict] = Field(None, description="Supervisor details")

    class Config:
        from_attributes = True


class ProductionLogSubmit(BaseModel):
    notes: Optional[str] = Field(None, description="Additional notes")
    produced_quantity: int = Field(..., gt=0, description="Quantity produced by operator (must be greater than 0)")


class ProductionLogStatusUpdate(BaseModel):
    status: ProductionLogStatus = Field(..., description="New status for production log")
    supervisor_id: Optional[int] = Field(None, description="ID of the supervisor updating the status")
    remarks: Optional[str] = Field(None, description="Supervisor remarks when updating status")
    approved_quantity: Optional[int] = Field(None, description="Quantity approved by supervisor")

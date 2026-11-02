"""Pydantic schemas for Intelligent Scheduler qty allocations."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class QtyAllocationBand(BaseModel):
    operation_id: int
    unit_from: int = Field(..., ge=1)
    unit_to: int = Field(..., ge=1)
    machine_id: int

    @model_validator(mode="after")
    def unit_to_gte_from(self):
        if self.unit_to < self.unit_from:
            raise ValueError("unit_to must be >= unit_from")
        return self


class QtyAllocationsPutRequest(BaseModel):
    order_id: Optional[int] = None
    allocations: List[QtyAllocationBand] = Field(default_factory=list)
    created_by: Optional[int] = None


class QtyAllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    part_id: int
    order_id: Optional[int] = None
    operation_id: int
    unit_from: int
    unit_to: int
    machine_id: int
    created_by: Optional[int] = None


class OperationMachineOption(BaseModel):
    id: int
    name: Optional[str] = None
    workcenter_id: Optional[int] = None


class OperationAllocContext(BaseModel):
    operation_id: int
    operation_number: Optional[str] = None
    operation_name: Optional[str] = None
    workcenter_id: Optional[int] = None
    machines: List[OperationMachineOption] = Field(default_factory=list)


class QtyAllocationsGetResponse(BaseModel):
    part_id: int
    order_id: Optional[int] = None
    quantity: int
    operations: List[OperationAllocContext] = Field(default_factory=list)
    allocations: List[QtyAllocationOut] = Field(default_factory=list)

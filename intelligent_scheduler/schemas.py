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


class UnitWiseJobCard(BaseModel):
    """One operator card: a contiguous unit band on one machine for one operation."""

    order_id: int
    order_number: Optional[str] = None
    part_id: int
    part_number: Optional[str] = None
    part_name: Optional[str] = None
    priority: Optional[int] = None
    operation_id: int
    operation_number: Optional[str] = None
    operation_name: Optional[str] = None
    machine_id: int
    unit_from: int
    unit_to: int
    quantity: int
    planned_start: Optional[str] = None
    planned_end: Optional[str] = None
    schedule_version: Optional[int] = None
    source: Optional[str] = None
    assignment_mode: Optional[str] = None
    can_activate: bool = False
    blocked_reason: Optional[str] = None


class MachineJobCardsResponse(BaseModel):
    machine_id: int
    total: int
    jobs: List[UnitWiseJobCard] = Field(default_factory=list)


class UnitJobActivateRequest(BaseModel):
    """Start one unit-wise job card. Quantity is sent later, on log submit."""

    model_config = ConfigDict(extra="forbid")

    operator_id: int
    operation_id: int
    unit_from: int = Field(..., ge=1)
    unit_to: int = Field(..., ge=1)

    @model_validator(mode="after")
    def unit_to_gte_from(self):
        if self.unit_to < self.unit_from:
            raise ValueError("unit_to must be >= unit_from")
        return self


class UnitJobSubmitRequest(BaseModel):
    operation_id: int
    unit_from: int = Field(..., ge=1)
    unit_to: int = Field(..., ge=1)
    produced_quantity: int = Field(0, ge=0)
    rework_submit_quantity: int = Field(0, ge=0)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def unit_to_gte_from(self):
        if self.unit_to < self.unit_from:
            raise ValueError("unit_to must be >= unit_from")
        return self


class UnitJobReviewRequest(BaseModel):
    """Reviewer must be a supervisor or manufacturing_coordinator."""

    user_id: int
    status: str
    approved_quantity: Optional[int] = Field(None, ge=0)
    rework_quantity: Optional[int] = Field(None, ge=0)
    rejected_quantity: Optional[int] = Field(None, ge=0)
    remarks: Optional[str] = None


class UnitJobAcknowledgeRequest(BaseModel):
    operator_id: Optional[int] = None
    user_id: Optional[int] = None

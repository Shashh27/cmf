from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, time, datetime
from enum import Enum


class ProductionLogStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    REWORK = "rework"
    REJECTED = "rejected"
    INPROGRESS = "inprogress"


class OperatorStatus(str, Enum):

    INPROGRESS = "inprogress"
    COMPLETED = "completed"


class ProductionLogBase(BaseModel):
    operation_id: int = Field(..., description="ID of the operation")
    operator_id: int = Field(..., description="ID of the operator")
    user_id: Optional[int] = Field(
        None,
        description="ID of supervisor or manufacturing_coordinator who reviewed the log",
    )
    machine_id: Optional[int] = Field(None, description="ID of the machine")
    notes: Optional[str] = Field(None, description="Additional notes")
    remarks: Optional[str] = Field(None, description="Reviewer remarks when updating status")
    from_date: Optional[date] = Field(None, description="Start date (yyyy-mm-dd)")
    from_time: Optional[time] = Field(None, description="Start time (hh:mm:ss)")
    to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
    to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
    status: ProductionLogStatus = Field(ProductionLogStatus.PENDING, description="Status of production log")
    operator_status: OperatorStatus = Field(OperatorStatus.INPROGRESS, description="Operator status")
    produced_quantity: Optional[int] = Field(None, description="New units manufactured by operator")
    operator_rework_quantity: Optional[int] = Field(
        None,
        description="Same parts reworked by operator and sent for review (before reviewer acts)",
    )
    approved_quantity: Optional[int] = Field(None, description="Quantity approved by reviewer")
    rework_quantity: Optional[int] = Field(None, description="Rework quantity")
    rejected_quantity: Optional[int] = Field(None, description="Rejected quantity")
    remaining_quantity_to_be_produced: Optional[int] = Field(None, description="Remaining quantity to be produced")
    remaining_to_close: Optional[int] = Field(
        None, description="Order quantity minus total approved (operation not closed until 0)"
    )
    rework_due: Optional[int] = Field(
        None, description="Same-part rework units due from latest reviewer decision"
    )
    reject_due: Optional[int] = Field(
        None, description="Scrapped units requiring fresh manufacture from latest reviewer decision"
    )
    available_quantity: Optional[int] = Field(
        None,
        description=(
            "Units currently releasable on this operation "
            "(min of remaining_to_close and upstream_approved − self_approved − pending)"
        ),
    )
    upstream_operation_id: Optional[int] = Field(
        None, description="Immediate prior schedulable operation id, if any"
    )
    upstream_operation_number: Optional[str] = Field(
        None, description="Immediate prior schedulable operation number"
    )
    upstream_approved: Optional[int] = Field(
        None, description="Approved quantity on the immediate prior operation"
    )


class ProductionLogCreate(ProductionLogBase):
    pass


class ProductionLogUpdate(BaseModel):
    operation_id: Optional[int] = Field(None, description="ID of the operation")
    operator_id: Optional[int] = Field(None, description="ID of the operator")
    user_id: Optional[int] = Field(None, description="ID of reviewer (supervisor or manufacturing_coordinator)")
    machine_id: Optional[int] = Field(None, description="ID of the machine")
    notes: Optional[str] = Field(None, description="Additional notes")
    remarks: Optional[str] = Field(None, description="Reviewer remarks when updating status")
    from_date: Optional[date] = Field(None, description="Start date (yyyy-mm-dd)")
    from_time: Optional[time] = Field(None, description="Start time (hh:mm:ss)")
    to_date: Optional[date] = Field(None, description="End date (yyyy-mm-dd)")
    to_time: Optional[time] = Field(None, description="End time (hh:mm:ss)")
    status: Optional[ProductionLogStatus] = Field(None, description="Status of production log")
    operator_status: Optional[OperatorStatus] = Field(None, description="Operator status")
    produced_quantity: Optional[int] = Field(None, description="Quantity produced by operator")
    approved_quantity: Optional[int] = Field(None, description="Quantity approved by reviewer")
    rework_quantity: Optional[int] = Field(None, description="Rework quantity")
    rejected_quantity: Optional[int] = Field(None, description="Rejected quantity")
    remaining_quantity_to_be_produced: Optional[int] = Field(None, description="Remaining quantity to be produced")


class ProductionLogResponse(ProductionLogBase):
    id: int = Field(..., description="Production log ID")
    created_at: datetime = Field(..., description="When the production log was created")
    rework_quantity: Optional[int] = Field(None, description="Rework quantity")
    rejected_quantity: Optional[int] = Field(None, description="Rejected quantity")
    remaining_quantity_to_be_produced: Optional[int] = Field(None, description="Remaining quantity to be produced")
    acknowledged: bool = Field(
        False,
        description="Whether reviewer (supervisor or manufacturing_coordinator) acknowledged operator submission",
    )
    acknowledged_at: Optional[datetime] = Field(
        None,
        description="When reviewer acknowledged the submission",
    )
    operator_acknowledged: bool = Field(False, description="Whether operator acknowledged reviewer's response")
    operator_acknowledged_at: Optional[datetime] = Field(
        None,
        description="When operator acknowledged the reviewer's response",
    )
    machine_id: Optional[int] = Field(None, description="ID of the machine")
    review_locked: bool = Field(
        False,
        description="True when user_id is set — another reviewer already approved; UI must disable status update",
    )
    can_review: bool = Field(
        True,
        description="True when the log is still open for first review (user_id is null)",
    )

    class Config:
        from_attributes = True


class ProductionLogWithDetails(ProductionLogResponse):
    operation: Optional[dict] = Field(None, description="Operation details")
    machine: Optional[dict] = Field(None, description="Machine details")
    operator: Optional[dict] = Field(None, description="Operator details")
    reviewer: Optional[dict] = Field(
        None,
        description="Supervisor or manufacturing_coordinator who reviewed",
    )

    class Config:
        from_attributes = True


class ProductionLogReviewAlert(BaseModel):
    """Cross-role alert derived from production_logs (no extra notification table)."""

    log_id: int
    message: str
    status: str
    reviewed_at: Optional[datetime] = None
    operator: Optional[dict] = None
    reviewer: Optional[dict] = None
    operation: Optional[dict] = None
    review_locked: bool = True
    can_review: bool = False


class ProductionLogSubmit(BaseModel):
    notes: Optional[str] = Field(None, description="Additional notes")
    produced_quantity: int = Field(
        0,
        ge=0,
        description="New units manufactured (first run or replacement for rejected scrap)",
    )
    rework_submit_quantity: int = Field(
        0,
        ge=0,
        description=(
            "Same parts reworked and sent for review — NOT new order production. "
            "Stored as operator_rework_quantity on the log."
        ),
    )


class ProductionLogStatusUpdate(BaseModel):
    status: ProductionLogStatus = Field(..., description="New status for production log")
    user_id: Optional[int] = Field(
        None,
        description="ID of supervisor or manufacturing_coordinator updating the status",
    )
    remarks: Optional[str] = Field(None, description="Reviewer remarks when updating status")
    approved_quantity: Optional[int] = Field(None, description="Quantity approved by reviewer")
    rework_quantity: Optional[int] = Field(None, description="Rework quantity")
    rejected_quantity: Optional[int] = Field(None, description="Rejected quantity")


class ProductionLogBulkDelete(BaseModel):
    log_ids: Optional[List[int]] = Field(None, description="List of production log IDs to delete (if not provided, deletes all)")

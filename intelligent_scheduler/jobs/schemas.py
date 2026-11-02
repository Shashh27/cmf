"""Response shapes for operator job cards derived from unit_schedule_items."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class MachineJobCard(BaseModel):
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    part_id: int
    part_number: Optional[str] = None
    part_name: Optional[str] = None
    operation_id: int
    operation_number: Optional[str] = None
    operation_name: Optional[str] = None
    machine_id: int
    unit_from: int
    unit_to: int
    quantity: int
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    schedule_version: Optional[int] = None


class MachineJobsResponse(BaseModel):
    machine_id: int
    total: int
    cards: List[MachineJobCard] = Field(default_factory=list)

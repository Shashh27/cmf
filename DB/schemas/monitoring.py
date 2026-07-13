from pydantic import BaseModel
from typing import Optional
from datetime import datetime



class MachineLiveHistoryBase(BaseModel):
    machine_id: int
    status: str
    current_order_id: Optional[int] = None
    current_part_id: Optional[int] = None
    current_operation_id: Optional[int] = None


class MachineLiveHistory(MachineLiveHistoryBase):
    """Hypertable row — primary key is last_updated (time dimension)."""

    last_updated: datetime

    class Config:
        from_attributes = True


class LiveMonitoringDisplay(BaseModel):
    machine_id: int
    machine_name: str
    machine_type: Optional[str] = None
    work_center_name: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    cnc_controller: Optional[str] = None
    year_of_installation: Optional[int] = None
    remarks: Optional[str] = None
    mhr: Optional[int] = None
    status: str
    last_updated: datetime
    sale_order_number: Optional[str] = None
    part_number: Optional[str] = None
    operation_name: Optional[str] = None
    operation_number: Optional[str] = None
    part_qty: int = 0
    produced_qty: int = 0
    approved_qty: int = 0
    rejected_qty: int = 0

    class Config:
        from_attributes = True

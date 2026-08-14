from pydantic import BaseModel
from typing import Optional, Any, List
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
    schedule_status: str = "NOT_SCHEDULED"  # SCHEDULED | NOT_SCHEDULED
    operator_status: str = "INACTIVE"  # ACTIVATED | INACTIVE
    job_source: str = "NONE"  # ACTIVATED | SCHEDULED | NONE
    sale_order_number: Optional[str] = None
    part_number: Optional[str] = None
    operation_name: Optional[str] = None
    operation_number: Optional[str] = None
    part_qty: int = 0
    produced_qty: int = 0
    approved_qty: int = 0
    rejected_qty: int = 0
    # CNC / process snapshot from machine_live_status
    program_name: Optional[str] = None
    active_program_number: Optional[int] = None
    main_program_number: Optional[int] = None
    mode: Optional[str] = None
    run_status: Optional[str] = None
    feed_rate: Optional[float] = None
    spindle_speed: Optional[float] = None
    spindle_load: Optional[float] = None
    axis_load: Optional[Any] = None
    has_process_data: bool = False

    class Config:
        from_attributes = True


class MachineProcessPoint(BaseModel):
    timestamp: datetime
    value: Optional[float] = None


class MachineProcessHistoryResponse(BaseModel):
    machine_id: int
    parameter: str
    start: datetime
    end: datetime
    points: List[MachineProcessPoint]

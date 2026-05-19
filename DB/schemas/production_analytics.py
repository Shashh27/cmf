from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date

class OEELosses(BaseModel):
    availability_loss: float
    performance_loss: float
    quality_loss: float

class OEETrend(BaseModel):
    date: date
    oee: float
    availability: float
    performance: float
    quality: float

class ShiftOEE(BaseModel):
    shift: int
    oee: float
    availability: float
    performance: float
    quality: float
    total_parts: int
    good_parts: int
    bad_parts: int

class MachineOEE(BaseModel):
    machine_id: int
    machine_name: str
    oee: float
    availability: float
    performance: float
    quality: float
    total_parts: int
    good_parts: int
    bad_parts: int
    losses: OEELosses

class DetailedShiftSummary(BaseModel):
    date: str
    shift: str
    machine_name: str
    machine_id: int
    production_time: int
    idle_time: float
    off_time: int
    total_parts: int
    good_parts: int
    bad_parts: int
    oee_metrics: dict
    updatedate: Optional[datetime] = None

class OverallOEEAnalysis(BaseModel):
    period_start: datetime
    period_end: datetime
    overall_oee: float
    overall_availability: float
    overall_performance: float
    overall_quality: float
    shift_breakdown: List[ShiftOEE]
    machine_breakdown: List[MachineOEE]
    detailed_summaries: List[DetailedShiftSummary]
    daily_trends: List[OEETrend]
    losses: OEELosses
    total_production: int
    total_good_parts: int
    total_bad_parts: int
    machine_count: int

    class Config:
        from_attributes = True


class PlannedOperation(BaseModel):
    id: int
    part_number: str
    operation_id: int
    operation_name: Optional[str] = None
    operation_number: Optional[str] = None
    machine_id: Optional[int]
    machine_name: Optional[str]
    planned_start_time: datetime
    planned_end_time: datetime
    total_quantity: int
    remaining_quantity: int
    status: Optional[str]
    sale_order_number: Optional[str] = None


class ActualProductionLog(BaseModel):
    id: int
    operation_id: int
    operation_name: Optional[str] = None
    operation_number: Optional[str] = None
    part_number: Optional[str]
    sale_order_number: Optional[str] = None
    from_date: Optional[date] = None
    from_time: Optional[str] = None
    to_date: Optional[date] = None
    to_time: Optional[str] = None
    status: str
    produced_quantity: Optional[int] = 0
    approved_quantity: Optional[int] = 0
    operator_name: Optional[str] = None
    machine_id: Optional[int] = None
    machine_name: Optional[str] = None
    is_completed: bool


class MachineInfo(BaseModel):
    id: int
    name: str
    work_center: Optional[str] = None
    type: str

class CombinedScheduleProductionResponse(BaseModel):
    planned_operations: List[PlannedOperation]
    actual_production_logs: List[ActualProductionLog]
    all_machines: List[MachineInfo]

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, time

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
    oee: Optional[float] = None
    availability: Optional[float] = None
    performance: Optional[float] = None
    quality: Optional[float] = None
    total_parts: Optional[int] = None
    good_parts: Optional[int] = None
    bad_parts: Optional[int] = None
    losses: Optional[OEELosses] = None


class ShiftSummaryBase(BaseModel):
    machine_id: int
    shift: int
    timestamp: datetime
    off_time: Optional[time] = None
    idle_time: Optional[time] = None
    production_time: Optional[time] = None
    total_parts: int = 0
    good_parts: int = 0
    bad_parts: int = 0
    availability: float = 0.0
    performance: float = 0.0
    quality: float = 0.0
    availability_loss: float = 0.0
    performance_loss: float = 0.0
    quality_loss: float = 0.0
    oee: float = 0.0


class ShiftSummaryCreate(ShiftSummaryBase):
    updatedate: Optional[datetime] = None


class ShiftSummaryUpdate(BaseModel):
    machine_id: Optional[int] = None
    shift: Optional[int] = None
    timestamp: Optional[datetime] = None
    updatedate: Optional[datetime] = None
    off_time: Optional[time] = None
    idle_time: Optional[time] = None
    production_time: Optional[time] = None
    total_parts: Optional[int] = None
    good_parts: Optional[int] = None
    bad_parts: Optional[int] = None
    availability: Optional[float] = None
    performance: Optional[float] = None
    quality: Optional[float] = None
    availability_loss: Optional[float] = None
    performance_loss: Optional[float] = None
    quality_loss: Optional[float] = None
    oee: Optional[float] = None


class ShiftSummary(ShiftSummaryBase):
    id: int
    updatedate: Optional[datetime] = None

    class Config:
        from_attributes = True


class DetailedShiftSummary(BaseModel):
    date: str
    shift: str
    machine_name: str
    machine_id: int
    timestamp: Optional[datetime] = None
    production_time: Optional[time] = None
    idle_time: Optional[time] = None
    off_time: Optional[time] = None
    total_parts: Optional[int] = None
    good_parts: Optional[int] = None
    bad_parts: Optional[int] = None
    availability: Optional[float] = None
    performance: Optional[float] = None
    quality: Optional[float] = None
    availability_loss: Optional[float] = None
    performance_loss: Optional[float] = None
    quality_loss: Optional[float] = None
    oee: Optional[float] = None
    oee_metrics: Optional[dict] = None
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

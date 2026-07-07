from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class EMSDataModel(BaseModel):
    machine_id: int
    timestamp: datetime
    phase_a_voltage: Optional[float] = None
    phase_b_voltage: Optional[float] = None
    phase_c_voltage: Optional[float] = None
    avg_phase_voltage: Optional[float] = None
    line_ab_voltage: Optional[float] = None
    line_bc_voltage: Optional[float] = None
    line_ca_voltage: Optional[float] = None
    avg_line_voltage: Optional[float] = None
    phase_a_current: Optional[float] = None
    phase_b_current: Optional[float] = None
    phase_c_current: Optional[float] = None
    avg_three_phase_current: Optional[float] = None
    power_factor: Optional[float] = None
    frequency: Optional[float] = None
    total_instantaneous_power: Optional[float] = None
    active_energy_delivered: Optional[float] = None
    status: Optional[int] = None

    class Config:
        from_attributes = True


class ShiftwiseEnergyModel(BaseModel):
    machine_id: int
    timestamp: datetime
    first_shift: float
    second_shift: float
    total_energy: float

    class Config:
        from_attributes = True


class MachineDetailsResponse(BaseModel):
    machine_id: int
    machine_data: Dict[str, Any]
    status: Optional[int] = None
    timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True


class ShiftWiseEnergyRequest(BaseModel):
    machine_id: int
    column_name: str


class ShiftwiseEnergyResponse(BaseModel):
    data: List[Dict[str, Any]]
    timestamp: str

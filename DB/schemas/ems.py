from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, time


# ---------------------------------------------------------------------------
# Machine EMS — live (regular table with id PK)
# ---------------------------------------------------------------------------

class MachineEMSLiveBase(BaseModel):
    machine_id: int
    timestamp: Optional[datetime] = None
    status: Optional[int] = None
    phase_a_voltage: Optional[float] = None
    phase_b_voltage: Optional[float] = None
    phase_c_voltage: Optional[float] = None
    frequency: Optional[float] = None
    total_instantaneous_power: Optional[float] = None
    phase_a_current: Optional[float] = None
    phase_b_current: Optional[float] = None
    phase_c_current: Optional[float] = None
    active_energy_delivered: Optional[float] = None


class MachineEMSLiveCreate(MachineEMSLiveBase):
    pass


class MachineEMSLiveUpdate(BaseModel):
    timestamp: Optional[datetime] = None
    status: Optional[int] = None
    phase_a_voltage: Optional[float] = None
    phase_b_voltage: Optional[float] = None
    phase_c_voltage: Optional[float] = None
    frequency: Optional[float] = None
    total_instantaneous_power: Optional[float] = None
    phase_a_current: Optional[float] = None
    phase_b_current: Optional[float] = None
    phase_c_current: Optional[float] = None
    active_energy_delivered: Optional[float] = None


class MachineEMSLive(MachineEMSLiveBase):
    id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Machine EMS — history (hypertable; timestamp is the time-dimension PK)
# ---------------------------------------------------------------------------

class MachineEMSHistoryBase(BaseModel):
    machine_id: int
    phase_a_voltage: Optional[float] = None
    phase_b_voltage: Optional[float] = None
    phase_c_voltage: Optional[float] = None
    frequency: Optional[float] = None
    total_instantaneous_power: Optional[float] = None
    phase_a_current: Optional[float] = None
    phase_b_current: Optional[float] = None
    phase_c_current: Optional[float] = None
    active_energy_delivered: Optional[float] = None


class MachineEMSHistoryCreate(MachineEMSHistoryBase):
    timestamp: Optional[datetime] = None


class MachineEMSHistory(MachineEMSHistoryBase):
    timestamp: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Shiftwise energy — live (regular table with id PK)
# ---------------------------------------------------------------------------

class ShiftwiseEnergyLiveBase(BaseModel):
    machine_id: int
    timestamp: Optional[datetime] = None
    first_shift: float = 0.0
    second_shift: float = 0.0
    third_shift: float = 0.0
    total_energy: float = 0.0


class ShiftwiseEnergyLiveCreate(ShiftwiseEnergyLiveBase):
    pass


class ShiftwiseEnergyLiveUpdate(BaseModel):
    timestamp: Optional[datetime] = None
    first_shift: Optional[float] = None
    second_shift: Optional[float] = None
    third_shift: Optional[float] = None
    total_energy: Optional[float] = None


class ShiftwiseEnergyLive(ShiftwiseEnergyLiveBase):
    id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Shiftwise energy — history (hypertable; timestamp is the time-dimension PK)
# ---------------------------------------------------------------------------

class ShiftwiseEnergyHistoryBase(BaseModel):
    machine_id: int
    first_shift: Optional[float] = None
    second_shift: Optional[float] = None
    third_shift: Optional[float] = None
    total_energy: Optional[float] = None


class ShiftwiseEnergyHistoryCreate(ShiftwiseEnergyHistoryBase):
    timestamp: Optional[datetime] = None


class ShiftwiseEnergyHistory(ShiftwiseEnergyHistoryBase):
    timestamp: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# EMS machine status — history (hypertable; timestamp is the time-dimension PK)
# ---------------------------------------------------------------------------

class EMSMachineStatusHistoryBase(BaseModel):
    machine_id: int
    status: int


class EMSMachineStatusHistoryCreate(EMSMachineStatusHistoryBase):
    timestamp: Optional[datetime] = None


class EMSMachineStatusHistory(EMSMachineStatusHistoryBase):
    timestamp: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Shift info (regular table with id PK)
# ---------------------------------------------------------------------------

class ShiftInfoBase(BaseModel):
    start_time: time
    end_time: time


class ShiftInfoCreate(ShiftInfoBase):
    pass


class ShiftInfoUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class ShiftInfo(ShiftInfoBase):
    id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# API / legacy response helpers
# ---------------------------------------------------------------------------

class EMSDataModel(MachineEMSLiveBase):
    """Alias aligned with machine_ems_live for API payloads."""

    class Config:
        from_attributes = True


class ShiftwiseEnergyModel(BaseModel):
    machine_id: int
    timestamp: datetime
    first_shift: Optional[float] = 0.0
    second_shift: Optional[float] = 0.0
    third_shift: Optional[float] = 0.0
    total_energy: Optional[float] = 0.0

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

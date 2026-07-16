from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, time


class MachineOperatorShiftAssignmentBase(BaseModel):
    machine_id: int
    operator_id: int
    shift_config_id: int


class MachineOperatorShiftAssignmentCreate(MachineOperatorShiftAssignmentBase):
    assigned_by_id: int


class MachineOperatorShiftAssignmentUpdate(BaseModel):
    machine_id: Optional[int] = None
    operator_id: Optional[int] = None
    shift_config_id: Optional[int] = None
    assigned_by_id: int


class ShiftTimingInfo(BaseModel):
    shift_code: str
    shift_start: time
    shift_end: time
    custom_start: Optional[time] = None
    custom_end: Optional[time] = None
    
    class Config:
        from_attributes = True


class ShiftConfigDetails(BaseModel):
    id: int
    date: date
    working_day: bool
    number_of_shifts: int
    shift_timings: List[ShiftTimingInfo]
    
    class Config:
        from_attributes = True


class AssignedByInfo(BaseModel):
    id: int
    user_name: str
    role: str

    class Config:
        from_attributes = True


class MachineOperatorShiftAssignmentResponse(BaseModel):
    id: int
    machine_id: int
    operator_id: int
    shift_config: ShiftConfigDetails
    assigned_by: Optional[AssignedByInfo] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class MachineOperatorInfo(BaseModel):
    id: int
    user_name: str
    gmail: str
    role: str
    center: Optional[str] = None
    group: Optional[str] = None
    
    class Config:
        from_attributes = True


class MachineShiftConfigurationResponse(BaseModel):
    machine_id: int
    machine_make: Optional[str] = None
    work_center_name: Optional[str] = None
    operators_selected: List[MachineOperatorInfo]
    shift_configs: List[ShiftConfigDetails]  # Changed from single shift_config to list
    
    class Config:
        from_attributes = True

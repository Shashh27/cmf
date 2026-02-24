from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field
from pydantic import ConfigDict


class MachineUtilization(BaseModel):
    """Response model for machine utilization data"""
    machine_id: int
    machine_type: str
    machine_make: str
    machine_model: str
    work_center_name: Optional[str] = None
    work_center_bool: bool
    
    available_hours: float
    utilized_hours: float
    remaining_hours: float
    utilization_percentage: float


class EfficiencyCreate(BaseModel):
    efficiency_factor: float = Field(..., gt=0.1, lt=1)

class EfficiencyUpdate(BaseModel):
    efficiency_factor: float = Field(..., gt=0.1, lt=1)

class EfficiencyResponse(BaseModel):
    id: int
    efficiency_factor: float

    class Config:
        orm_mode = True

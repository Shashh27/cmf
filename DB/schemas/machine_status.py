from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# ==============================
# Base Schema
# ==============================
class MachineStatusBase(BaseModel):
    work_center_name: str
    machine_make: str
    machine_id: int
    status_id: int
    status_name: str
    description: Optional[str] = None
    available_from: Optional[datetime] = None
    available_to: Optional[datetime] = None


# ==============================
# Output Schema
# ==============================
class MachineStatusOut(MachineStatusBase):
    pass



# ==============================
# GET Response Schema
# ==============================
class MachineStatusResponse(BaseModel):
    total_machines: int
    statuses: List[MachineStatusOut]



# ==============================
# PUT Request Schema
# ==============================
class UpdateMachineStatusRequest(BaseModel):
    status_id: int
    description: Optional[str] = None
    available_from: Optional[datetime] = None
    available_to: Optional[datetime] = None


from pydantic import BaseModel, field_validator
from typing import Optional, List, Text
from datetime import datetime, time
from typing_extensions import Self


# =======================
# Work Center Schemas
# =======================
class WorkCenterBase(BaseModel):
    code: str
    work_center_name: str
    description: Optional[str] = None
    is_schedulable: bool = True


class WorkCenterCreate(WorkCenterBase):
    pass


class WorkCenterUpdate(BaseModel):
    code: Optional[str] = None
    work_center_name: Optional[str] = None
    description: Optional[str] = None
    is_schedulable: Optional[bool] = None


class WorkCenter(WorkCenterBase):
    id: int

    class Config:
        from_attributes = True


# =======================
# Machine Schemas
# =======================
class MachineBase(BaseModel):
    work_center_id: int
    type: str
    make: Optional[str] = None
    model: Optional[str] = None
    year_of_installation: Optional[int] = None
    cnc_controller: Optional[str] = None
    cnc_controller_service: Optional[str] = None
    remarks: Optional[str] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    password: str


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    work_center_id: Optional[int] = None
    type: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year_of_installation: Optional[int] = None
    cnc_controller: Optional[str] = None
    cnc_controller_service: Optional[str] = None
    remarks: Optional[str] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    password: Optional[str] = None


class Machine(MachineBase):
    id: int

    class Config:
        from_attributes = True

class MachinePublic(BaseModel):
    work_center_id: int
    type: str
    make: Optional[str] = None
    model: Optional[str] = None
    year_of_installation: Optional[int] = None
    cnc_controller: Optional[str] = None
    cnc_controller_service: Optional[str] = None
    remarks: Optional[str] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    id: int

    class Config:
        from_attributes = True


class MachineWithWorkCenter(Machine):
    work_center: WorkCenter

class MachineWithWorkCenterPublic(MachinePublic):
    work_center: WorkCenter


# =======================
# Customer Schemas
# =======================
class CustomerBase(BaseModel):
    company_name: str
    address: str
    branch: str
    email: str
    contact_number: str
    contact_person: str


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    company_name: Optional[str] = None
    address: Optional[str] = None
    branch: Optional[str] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    contact_person: Optional[str] = None


class Customer(CustomerBase):
    id: int

    class Config:
        from_attributes = True

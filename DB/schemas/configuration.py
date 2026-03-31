from pydantic import BaseModel, field_validator
from typing import Optional, List, Text, TYPE_CHECKING
from datetime import datetime, time
from typing_extensions import Self
from .access_control import AccessUserResponse

if TYPE_CHECKING:
    from .oms import Part as PartSchema, Order as OrderSchema


# =======================
# Work Center Schemas
# =======================
class WorkCenterBase(BaseModel):
    code: str
    work_center_name: str
    description: Optional[str] = None
    is_schedulable: bool = True
    user_id: Optional[int] = None


class WorkCenterCreate(WorkCenterBase):
    pass


class WorkCenterUpdate(BaseModel):
    code: Optional[str] = None
    work_center_name: Optional[str] = None
    description: Optional[str] = None
    is_schedulable: Optional[bool] = None
    user_id: Optional[int] = None


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
    user_id: Optional[int] = None


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
    user_id: Optional[int] = None


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
    user_id: Optional[int] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    company_name: Optional[str] = None
    address: Optional[str] = None
    branch: Optional[str] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    contact_person: Optional[str] = None
    user_id: Optional[int] = None


class Customer(CustomerBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Pokayoke Checklists Schemas
# =======================
class PokayokeChecklistBase(BaseModel):
    name: str
    description: str


class PokayokeChecklistItemBase(BaseModel):
    item_text: str
    item_type: str  # 'boolean', 'numerical', 'text'
    is_required: bool = True
    expected_value: Optional[str] = None


class PokayokeMachineAssignmentBase(BaseModel):
    machine_id: int
    frequency: Optional[str] = None  # 'Daily', 'Weekly', 'Monthly'
    shift: Optional[str] = None      # 'Morning', 'Evening', 'Both' (if Daily)
    scheduled_day: Optional[str] = None # Day of week (Weekly) or Day of month (Monthly)


# Response schemas
class PokayokeChecklist(PokayokeChecklistBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PokayokeChecklistItem(PokayokeChecklistItemBase):
    id: int
    checklist_id: int
    sequence_number: int
    created_at: datetime

    class Config:
        from_attributes = True


class PokayokeMachineAssignment(PokayokeMachineAssignmentBase):
    id: int
    checklist_id: int
    assigned_at: datetime

    class Config:
        from_attributes = True


# Create schemas
class PokayokeChecklistItemCreate(PokayokeChecklistItemBase):
    pass


class PokayokeChecklistCreate(PokayokeChecklistBase):
    items: List[PokayokeChecklistItemCreate] = []


class PokayokeMachineAssignmentCreate(PokayokeMachineAssignmentBase):
    pass


# Update schemas
class PokayokeChecklistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class PokayokeChecklistItemUpdate(BaseModel):
    item_text: Optional[str] = None
    sequence_number: Optional[int] = None
    item_type: Optional[str] = None
    is_required: Optional[bool] = None
    expected_value: Optional[str] = None


class PokayokeMachineAssignmentUpdate(BaseModel):
    checklist_id: Optional[int] = None
    machine_id: Optional[int] = None
    frequency: Optional[str] = None
    shift: Optional[str] = None
    scheduled_day: Optional[str] = None


# Response with nested data
class PokayokeChecklistWithItems(PokayokeChecklist):
    items: List[PokayokeChecklistItem] = []
    machine_assignments: List[PokayokeMachineAssignment] = []


class PokayokeMachineAssignmentWithChecklist(PokayokeMachineAssignment):
    checklist: PokayokeChecklistWithItems


# =======================
# POKAYOKE COMPLETED LOGS
# =======================
class PokayokeCompletedLogBase(BaseModel):
    checklist_id: int
    machine_id: int
    operator_id: int
    production_order_id: Optional[int] = None
    part_id: Optional[int] = None
    completed_at: datetime
    all_items_passed: bool
    comments: Optional[str] = None
    read: bool = False
    assignment_id: Optional[int] = None
    frequency: Optional[str] = None  # 'Daily', 'Weekly', 'Monthly'
    shift: Optional[str] = None      # 'Morning', 'Evening', 'Both'


class PokayokeCompletedLog(PokayokeCompletedLogBase):
    id: int

    class Config:
        from_attributes = True


# =======================
# POKAYOKE ITEM RESPONSES
# =======================
class PokayokeItemResponseBase(BaseModel):
    completed_log_id: int
    item_id: int
    response_value: str
    is_confirming: bool = False
    timestamp: datetime


class PokayokeItemResponse(PokayokeItemResponseBase):
    id: int

    class Config:
        from_attributes = True


class PokayokeItemResponseWithItem(PokayokeItemResponse):
    item: PokayokeChecklistItem


# Create schemas
class PokayokeCompletedLogCreate(PokayokeCompletedLogBase):
    pass


class PokayokeItemResponseCreate(PokayokeItemResponseBase):
    pass


# Update schemas
class PokayokeCompletedLogUpdate(BaseModel):
    checklist_id: Optional[int] = None
    machine_id: Optional[int] = None
    operator_id: Optional[int] = None
    production_order_id: Optional[int] = None
    part_id: Optional[int] = None
    all_items_passed: Optional[bool] = None
    comments: Optional[str] = None
    read: Optional[bool] = None
    assignment_id: Optional[int] = None
    frequency: Optional[str] = None
    shift: Optional[str] = None


class PokayokeItemResponseUpdate(BaseModel):
    completed_log_id: Optional[int] = None
    item_id: Optional[int] = None
    response_value: Optional[str] = None
    is_confirming: Optional[bool] = None


# Response with nested data
class PokayokeCompletedLogWithResponses(PokayokeCompletedLog):
    item_responses: List[PokayokeItemResponseWithItem] = []
    checklist: Optional[PokayokeChecklist] = None
    machine: Optional[Machine] = None
    part: Optional["PartSchema"] = None
    operator: Optional[AccessUserResponse] = None
    order: Optional["OrderSchema"] = None
    machine_assignment: Optional[PokayokeMachineAssignment] = None


from .oms import Part as PartSchema, Order as OrderSchema
PokayokeCompletedLogWithResponses.model_rebuild()

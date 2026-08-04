from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List, Text, TYPE_CHECKING
from datetime import datetime, time, date
from typing_extensions import Self
from .access_control import AccessUserResponse

if TYPE_CHECKING:
    from .oms import Part as PartSchema, Order as OrderSchema


# =======================
# Work Center Schemas
# =======================
class workcenterBase(BaseModel):
    code: str
    work_center_name: str
    description: Optional[str] = None
    is_schedulable: bool = True
    user_id: Optional[int] = None


class workcenterCreate(workcenterBase):
    pass


class workcenterUpdate(BaseModel):
    code: Optional[str] = None
    work_center_name: Optional[str] = None
    description: Optional[str] = None
    is_schedulable: Optional[bool] = None
    user_id: Optional[int] = None


class workcenter(workcenterBase):
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
    mhr: Optional[int] = None
    mhr_calculated_at: Optional[datetime] = None
    mhr_updated_by: Optional[int] = None
    recommended_mhr: Optional[int] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    calibration_frequency: Optional[str] = None  # e.g., '6 months', '1 year', '2 years'
    password: str
    user_id: Optional[int] = None


class MachineCreate(MachineBase):
    @model_validator(mode='after')
    def validate_calibration_fields(self) -> Self:
        if self.calibration_date and not self.calibration_frequency:
            raise ValueError('Calibration frequency must be provided when calibration date is specified')
        if self.calibration_frequency and not self.calibration_date:
            raise ValueError('Calibration date must be provided when calibration frequency is specified')
        return self


class MachineUpdate(BaseModel):
    work_center_id: Optional[int] = None
    type: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year_of_installation: Optional[int] = None
    cnc_controller: Optional[str] = None
    cnc_controller_service: Optional[str] = None
    remarks: Optional[str] = None
    mhr: Optional[int] = None
    mhr_calculated_at: Optional[datetime] = None
    mhr_updated_by: Optional[int] = None
    recommended_mhr: Optional[int] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    calibration_frequency: Optional[str] = None
    password: Optional[str] = None
    user_id: Optional[int] = None

    @model_validator(mode='after')
    def validate_calibration_fields(self) -> Self:
        if self.calibration_date and not self.calibration_frequency:
            raise ValueError('Calibration frequency must be provided when calibration date is specified')
        if self.calibration_frequency and not self.calibration_date:
            raise ValueError('Calibration date must be provided when calibration frequency is specified')
        return self


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
    mhr: Optional[int] = None
    mhr_calculated_at: Optional[datetime] = None
    mhr_updated_by: Optional[int] = None
    recommended_mhr: Optional[int] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    calibration_frequency: Optional[str] = None
    id: int

    class Config:
        from_attributes = True


class MachinePublicWithStatus(MachinePublic):
    machine_state: Optional[str] = None
    work_center_name: Optional[str] = None

    class Config:
        from_attributes = True


# =======================
# Machine MHR Schemas
# =======================
class MHRParticularBase(BaseModel):
    code: str
    name: str
    is_input: bool = True
    formula: Optional[str] = None
    default_sequence: int
    unit: Optional[str] = None
    is_active: bool = True
    created_by: int


class MHRParticularCreate(MHRParticularBase):
    pass


class MHRParticularUpdate(BaseModel):
    name: Optional[str] = None
    is_input: Optional[bool] = None
    formula: Optional[str] = None
    default_sequence: Optional[int] = None
    unit: Optional[str] = None
    is_active: Optional[bool] = None


class MHRParticular(MHRParticularBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class MachineMHRValueBase(BaseModel):
    machine_id: int
    particular_id: int
    is_applicable: bool = True
    sequence_override: Optional[int] = None
    input_value: Optional[float] = None
    computed_value: Optional[float] = None
    updated_by: int


class MachineMHRValueCreate(MachineMHRValueBase):
    pass


class MachineMHRValueUpdate(BaseModel):
    is_applicable: Optional[bool] = None
    sequence_override: Optional[int] = None
    input_value: Optional[float] = None


class MHRValueUpdate(BaseModel):
    particular_id: int
    value: Optional[float] = None


class MachineMHRValue(MachineMHRValueBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


class MachineMHRValueWithDetails(MachineMHRValue):
    particular: Optional[MHRParticular] = None


class MachineMHRResponse(BaseModel):
    machine_id: int
    values: List[MachineMHRValueWithDetails] = []
    final_mhr: Optional[int] = None
    recommended_mhr: Optional[int] = None
    mhr_calculated_at: Optional[datetime] = None


class MHRRecalculationResponse(BaseModel):
    context: dict
    final_mhr: Optional[float] = None


class MachineWithworkcenter(Machine):
    work_center: workcenter

class MachineWithworkcenterPublic(MachinePublic):
    work_center: workcenter


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
# Operation Checklists Schemas
# =======================
class OperationChecklistBase(BaseModel):
    name: str
    type: str  # 'general' or 'custom'
    created_by: int


class OperationChecklistCreate(OperationChecklistBase):
    pass


class OperationChecklistUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None


class OperationChecklist(OperationChecklistBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class OperationChecklistAssignBase(BaseModel):
    operation_id: int
    checklist_id: int
    assigned_by: int


class OperationChecklistAssignCreate(OperationChecklistAssignBase):
    pass


class OperationChecklistAssignUpdate(BaseModel):
    operation_id: Optional[int] = None
    checklist_id: Optional[int] = None


class OperationChecklistAssign(BaseModel):
    id: int
    operation_id: int
    checklist_id: int
    assigned_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class OperationChecklistAssignWithChecklist(OperationChecklistAssign):
    checklist: OperationChecklist


class SubmissionDetailBase(BaseModel):
    sub_id: int
    checklist_id: int
    response: Optional[bool] = None
    op_remarks: Optional[str] = None


class SubmissionDetailCreate(BaseModel):
    checklist_id: int
    response: Optional[bool] = None
    op_remarks: Optional[str] = None


class SubmissionDetailUpdate(BaseModel):
    response: Optional[bool] = None
    op_remarks: Optional[str] = None


class SubmissionDetail(SubmissionDetailBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubmissionDetailWithChecklist(SubmissionDetail):
    checklist: OperationChecklist


class SubmissionBase(BaseModel):
    operation_id: int
    operator: int
    status: str = 'pending'
    supervisor: Optional[int] = None
    sup_remarks: Optional[str] = None
    supervisor_ack_by: Optional[bool] = None
    operator_ack_by: Optional[bool] = None
    mc_ack_by: Optional[bool] = None


class SubmissionCreate(SubmissionBase):
    details: List[SubmissionDetailCreate] = []


class SubmissionUpdate(BaseModel):
    status: Optional[str] = None
    supervisor: Optional[int] = None
    sup_remarks: Optional[str] = None
    supervisor_ack_by: Optional[bool] = None
    supervisor_ack_at: Optional[datetime] = None
    operator_ack_by: Optional[bool] = None
    operator_ack_at: Optional[datetime] = None
    mc_ack_by: Optional[bool] = None
    mc_ack_at: Optional[datetime] = None


class SupervisorAction(BaseModel):
    status: str  # 'approved' or 'rejected'
    supervisor_id: Optional[int] = None
    sup_remarks: Optional[str] = None


class Submission(SubmissionBase):
    id: int
    submitted_at: datetime
    sup_action_at: Optional[datetime] = None
    supervisor_ack_at: Optional[datetime] = None
    operator_ack_at: Optional[datetime] = None
    mc_ack_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubmissionWithDetails(Submission):
    details: List[SubmissionDetail] = []


# =======================
# Preventive Maintenance (PM) Schemas
# =======================
PM_ITEM_TYPES = ("Boolean", "Numeric", "Text")
PM_FREQUENCY_TYPES = ("Time Based", "Usage Based", "Condition Based")
PM_INTERVAL_UNITS = ("Day", "Week", "Month", "Year")
class PMChecklistItemBase(BaseModel):
    item_text: str
    sequence_number: int
    item_type: str
    expected_value: Optional[str] = None
    frequency_type: str
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    trigger_hours: Optional[float] = None
    remarks: Optional[str] = None

    @field_validator("item_type")
    @classmethod
    def validate_item_type(cls, v: str) -> str:
        if v not in PM_ITEM_TYPES:
            raise ValueError(f"item_type must be one of {PM_ITEM_TYPES}")
        return v

    @field_validator("frequency_type")
    @classmethod
    def validate_frequency_type(cls, v: str) -> str:
        if v not in PM_FREQUENCY_TYPES:
            raise ValueError(f"frequency_type must be one of {PM_FREQUENCY_TYPES}")
        return v

    @field_validator("interval_unit")
    @classmethod
    def validate_interval_unit(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in PM_INTERVAL_UNITS:
            raise ValueError(f"interval_unit must be one of {PM_INTERVAL_UNITS}")
        return v

    @field_validator("interval_value")
    @classmethod
    def validate_interval_value(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("interval_value must be greater than 0")
        return v

    @field_validator("trigger_hours")
    @classmethod
    def validate_trigger_hours(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("trigger_hours must be greater than 0")
        return v


class PMChecklistItemCreate(PMChecklistItemBase):
    pass


class PMChecklistItemUpdate(BaseModel):
    item_text: Optional[str] = None
    sequence_number: Optional[int] = None
    item_type: Optional[str] = None
    expected_value: Optional[str] = None
    frequency_type: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    trigger_hours: Optional[float] = None
    remarks: Optional[str] = None


class PMChecklistItem(PMChecklistItemBase):
    id: int
    checklist_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PMChecklistBase(BaseModel):
    name: str
    description: Optional[str] = None
    created_by: int


class PMChecklistCreate(PMChecklistBase):
    items: List[PMChecklistItemCreate]

    @field_validator("items")
    @classmethod
    def validate_items_not_empty(cls, v: List[PMChecklistItemCreate]) -> List[PMChecklistItemCreate]:
        if not v:
            raise ValueError("A checklist must contain at least one checkpoint")
        return v


class PMChecklistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class PMChecklist(PMChecklistBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PMChecklistWithItems(PMChecklist):
    items: List[PMChecklistItem] = []


class PMAssignmentItemConfig(BaseModel):
    checklist_item_id: int
    is_required: bool = True


class PMMachineAssignmentCreate(BaseModel):
    machine_id: int
    checklist_id: int
    assigned_by: int
    items: List[PMAssignmentItemConfig]

    @field_validator("items")
    @classmethod
    def validate_items_not_empty(cls, v: List[PMAssignmentItemConfig]) -> List[PMAssignmentItemConfig]:
        if not v:
            raise ValueError("Assignment must include at least one checkpoint configuration")
        if not any(item.is_required for item in v):
            raise ValueError("At least one checkpoint must be marked required to assign to the machine")
        return v


class PMAssignmentItem(BaseModel):
    id: int
    assignment_id: int
    checklist_item_id: int
    is_required: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PMSchedule(BaseModel):
    id: int
    assignment_item_id: int
    last_completed_date: Optional[date] = None
    next_due_date: date
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PMAssignmentItemWithDetails(PMAssignmentItem):
    checklist_item: Optional[PMChecklistItem] = None
    schedule: Optional[PMSchedule] = None


class PMMachineAssignment(BaseModel):
    id: int
    machine_id: int
    checklist_id: int
    assigned_by: int
    assigned_at: datetime

    class Config:
        from_attributes = True


class PMMachineAssignmentWithDetails(PMMachineAssignment):
    checklist: Optional[PMChecklist] = None
    assignment_items: List[PMAssignmentItemWithDetails] = []


class PMMachineAssignmentOperatorView(PMMachineAssignment):
    """Deprecated nested shape — use PMOperatorAssignmentView for operator API."""
    checklist: Optional[PMChecklistWithItems] = None
    assignment_items: List[PMAssignmentItemWithDetails] = []


class PMOperatorCheckpoint(BaseModel):
    """Single checkpoint row for operator — merges assignment item, definition, and schedule."""
    assignment_item_id: int
    schedule_id: int
    checklist_item_id: int
    sequence_number: int
    item_text: str
    item_type: str
    expected_value: Optional[str] = None
    frequency_type: str
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    trigger_hours: Optional[float] = None
    remarks: Optional[str] = None
    is_required: bool
    last_completed_date: Optional[date] = None
    next_due_date: date
    is_due: bool
    latest_submission_id: Optional[int] = None
    last_submitted_at: Optional[datetime] = None


class PMOperatorAssignmentView(BaseModel):
    """Flat operator assignment — checklist info once, checkpoints in order."""
    assignment_id: int
    machine_id: int
    checklist_id: int
    checklist_name: str
    checklist_description: Optional[str] = None
    assigned_at: datetime
    checkpoints: List[PMOperatorCheckpoint] = []


class PMScheduleWithDetails(PMSchedule):
    assignment_item: Optional[PMAssignmentItemWithDetails] = None


class DueCheckpointResponse(BaseModel):
    schedule_id: int
    assignment_item_id: int
    assignment_id: int
    machine_id: int
    checklist_id: int
    checklist_name: str
    item_text: str
    sequence_number: int
    item_type: str
    expected_value: Optional[str] = None
    frequency_type: str
    is_required: bool
    last_completed_date: Optional[date] = None
    next_due_date: date
    latest_submission_id: Optional[int] = None
    last_submitted_at: Optional[datetime] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    trigger_hours: Optional[float] = None


class PMCheckpointSubmissionCreate(BaseModel):
    schedule_id: int
    assignment_item_id: int
    response_value: str
    operator_comments: Optional[str] = None


class PMOperatorSubmitRequest(BaseModel):
    operator_id: int
    submissions: List[PMCheckpointSubmissionCreate]

    @field_validator("submissions")
    @classmethod
    def validate_submissions_not_empty(cls, v: List[PMCheckpointSubmissionCreate]) -> List[PMCheckpointSubmissionCreate]:
        if not v:
            raise ValueError("At least one checkpoint response is required")
        return v


class PMCheckpointSubmission(BaseModel):
    id: int
    schedule_id: int
    assignment_item_id: int
    operator_id: int
    response_value: str
    operator_comments: Optional[str] = None
    submitted_at: datetime

    class Config:
        from_attributes = True


class PMCheckpointSubmissionWithDetails(PMCheckpointSubmission):
    operator_name: Optional[str] = None
    checklist_item: Optional[PMChecklistItem] = None
    checklist_id: Optional[int] = None
    checklist_name: Optional[str] = None
    machine_id: Optional[int] = None
    machine_label: Optional[str] = None


class PMSupervisorSubmissionFilters(BaseModel):
    machine_id: Optional[int] = None
    operator_id: Optional[int] = None
    checklist_id: Optional[int] = None
    month: Optional[int] = None
    year: Optional[int] = None

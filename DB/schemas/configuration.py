from pydantic import BaseModel, field_validator
from typing import Optional, List, Text, TYPE_CHECKING
from datetime import datetime, time, date
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
    mhr: Optional[int] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    calibration_frequency: Optional[str] = None  # e.g., '6 months', '1 year', '2 years'
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
    mhr: Optional[int] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    calibration_frequency: Optional[str] = None
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
    mhr: Optional[int] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    calibration_frequency: Optional[str] = None
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
    description: Optional[str] = None


class PokayokeChecklistItemBase(BaseModel):
    item_text: str
    item_type: str  # 'boolean', 'numerical', 'text'
    is_required: bool = True
    expected_value: Optional[str] = None
    # Scheduling fields for individual check points
    frequency_type: Optional[str] = None  # 'Time Based', 'Usage Based', 'Condition Based'
    interval_value: Optional[int] = None  # e.g., 3 for "Every 3 Months"
    interval_unit: Optional[str] = None  # 'Day', 'Week', 'Month', 'Year'
    trigger_hours: Optional[int] = None  # For Usage Based (e.g., 200 hours)
    inspection_interval: Optional[str] = None  # For Condition Based (e.g., 'Weekly', 'Monthly')
    remarks: Optional[str] = None  # Optional remarks for this check point


class PokayokeMachineAssignmentBase(BaseModel):
    machine_id: int
    next_due_date: Optional[date] = None  # Next due date for PM
    active: bool = True


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


class PokayokeMachineAssignmentCreate(BaseModel):
    machine_ids: List[int]
    checklist_ids: List[int]
    next_due_date: Optional[date] = None  # Next due date for PM
    active: bool = True


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
    # Scheduling fields for individual check points
    frequency_type: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    trigger_hours: Optional[int] = None
    inspection_interval: Optional[str] = None
    remarks: Optional[str] = None


class PokayokeMachineAssignmentUpdate(BaseModel):
    checklist_id: Optional[int] = None
    machine_id: Optional[int] = None
    next_due_date: Optional[date] = None
    active: Optional[bool] = None


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
    completed_at: datetime
    all_items_passed: Optional[bool] = None
    comments: Optional[str] = None
    read: bool = False
    assignment_id: Optional[int] = None
    operator_acknowledged: bool = False
    operator_acknowledged_at: Optional[datetime] = None
    supervisor_acknowledged: bool = False
    supervisor_acknowledged_at: Optional[datetime] = None
    supervisor_id: Optional[int] = None


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
    is_confirming: Optional[bool] = None
    timestamp: datetime
    # Scheduling fields for this item response
    frequency_type: Optional[str] = None  # 'Time Based', 'Usage Based', 'Condition Based'
    interval_value: Optional[int] = None  # e.g., 3 for "Every 3 Months"
    interval_unit: Optional[str] = None  # 'Day', 'Week', 'Month', 'Year'
    trigger_hours: Optional[int] = None  # For Usage Based
    inspection_interval: Optional[str] = None  # For Condition Based
    next_due_date: Optional[date] = None  # Next due date for this specific item
    approval_status: Optional[str] = None  # 'approved', 'rejected', 'pending'
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    approval_comments: Optional[str] = None


class PokayokeItemResponse(PokayokeItemResponseBase):
    id: int

    class Config:
        from_attributes = True


class PokayokeItemResponseWithItem(PokayokeItemResponse):
    item: PokayokeChecklistItem
    approver: Optional[AccessUserResponse] = None


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
    all_items_passed: Optional[bool] = None
    comments: Optional[str] = None
    read: Optional[bool] = None
    assignment_id: Optional[int] = None
    frequency_type: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    trigger_hours: Optional[int] = None
    inspection_interval: Optional[str] = None
    shift: Optional[str] = None
    due_date: Optional[date] = None
    operator_acknowledged: Optional[bool] = None
    operator_acknowledged_at: Optional[datetime] = None
    supervisor_acknowledged: Optional[bool] = None
    supervisor_acknowledged_at: Optional[datetime] = None
    supervisor_id: Optional[int] = None


class PokayokeItemResponseUpdate(BaseModel):
    completed_log_id: Optional[int] = None
    item_id: Optional[int] = None
    response_value: Optional[str] = None
    is_confirming: Optional[bool] = None
    approval_status: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    approval_comments: Optional[str] = None


# Response with nested data
class PokayokeCompletedLogWithResponses(PokayokeCompletedLog):
    item_responses: List[PokayokeItemResponseWithItem] = []
    checklist: Optional[PokayokeChecklist] = None
    machine: Optional[Machine] = None
    part: Optional["PartSchema"] = None
    operator: Optional[AccessUserResponse] = None
    order: Optional["OrderSchema"] = None
    machine_assignment: Optional[PokayokeMachineAssignment] = None


# Simplified approver info
class ApproverInfo(BaseModel):
    user_name: str


# Simplified response schema without nested item
class PokayokeItemResponseSimple(BaseModel):
    id: int
    completed_log_id: int
    response_value: str
    is_confirming: Optional[bool] = None
    timestamp: datetime
    approval_status: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    approval_comments: Optional[str] = None
    approver: Optional[ApproverInfo] = None

    class Config:
        from_attributes = True


# Schema for checklist item with approval responses
class PokayokeChecklistItemWithApprovals(BaseModel):
    item: PokayokeChecklistItem
    responses: List[PokayokeItemResponseSimple] = []


# Schema for structured approval status by completed log
class ChecklistItemApprovalStatus(BaseModel):
    item_id: int
    item_text: str
    item_type: str
    sequence_number: int
    response_value: str
    responded_by: Optional[str] = None
    responded_at: Optional[datetime] = None
    approval_status: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_comments: Optional[str] = None


class ChecklistApprovalByLog(BaseModel):
    completed_log_id: int
    production_order_id: Optional[int] = None
    part_id: Optional[int] = None
    machine_id: int
    operator_id: int
    operator_name: Optional[str] = None
    completed_at: datetime
    overall_approval_status: Optional[str] = None  # 'approved', 'rejected', 'pending'
    items: List[ChecklistItemApprovalStatus] = []


class ChecklistApprovalStatusResponse(BaseModel):
    checklist_id: int
    checklist_name: str
    completed_logs: List[ChecklistApprovalByLog] = []


# Simplified response schema for item responses by log
class SimpleItemResponse(BaseModel):
    item_id: int
    item_text: str
    response_value: str
    approval_status: Optional[str] = None  # 'approved', 'rejected', 'pending'
    approval_comments: Optional[str] = None


class SimpleLogResponse(BaseModel):
    log_id: int
    operator_name: str
    completed_at: datetime
    overall_status: str  # 'approved', 'rejected', 'pending'
    items: List[SimpleItemResponse] = []


class SimpleCompletedLog(BaseModel):
    log_id: int
    checklist_id: int
    checklist_name: str
    machine_id: int
    machine_name: str
    operator_name: str
    completed_at: datetime
    overall_status: str  # 'approved', 'rejected', 'pending'
    supervisor_name: Optional[str] = None
    operator_acknowledged: bool = False
    operator_acknowledged_at: Optional[datetime] = None
    supervisor_acknowledged: bool = False
    supervisor_acknowledged_at: Optional[datetime] = None
    items: List[SimpleItemResponse] = []



from .oms import Part as PartSchema, Order as OrderSchema
PokayokeCompletedLogWithResponses.model_rebuild()


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

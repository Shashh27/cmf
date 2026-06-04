from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class OrderNotificationBase(BaseModel):
    order_id: int
    is_ack: Optional[bool] = False


class OrderNotificationCreate(BaseModel):
    order_id: int


class OrderNotificationUpdate(BaseModel):
    is_ack: Optional[bool] = None


class OrderNotificationAcknowledge(BaseModel):
    """Schema for acknowledging order notifications with role information"""
    role: str  # 'admin', 'pc', or 'mc'
    user_name: str  # username of the person acknowledging


class OrderNotification(OrderNotificationBase):
    id: int
    # Role-specific acknowledgment status fields
    mc_is_ack: Optional[bool] = None
    pc_is_ack: Optional[bool] = None
    admin_is_ack: Optional[bool] = None
    # Role-specific acknowledgment fields
    mc_ack_by: Optional[str] = None
    mc_ack_at: Optional[datetime] = None
    pc_ack_by: Optional[str] = None
    pc_ack_at: Optional[datetime] = None
    admin_ack_by: Optional[str] = None
    admin_ack_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Enriched details for frontend display
class OrderNotificationWithDetails(OrderNotification):
    sale_order_number: Optional[str] = None
    project_name: Optional[str] = None
    product_name: Optional[str] = None
    created_by: Optional[str] = None
    order_status: Optional[str] = None


class MachineNotificationBase(BaseModel):
    machine_breakdown_id: int
    is_ack: Optional[bool] = False


class MachineNotificationCreate(BaseModel):
    machine_breakdown_id: int


class MachineNotificationUpdate(BaseModel):
    is_ack: Optional[bool] = None


class MachineNotification(MachineNotificationBase):
    id: int
    ack_by: Optional[str] = None
    ack_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MachineNotificationWithDetails(MachineNotification):
    machine_name: Optional[str] = None
    machine_status: Optional[str] = None
    issue_category: Optional[str] = None
    issues_reason: Optional[str] = None
    created_by: Optional[str] = None


class ToolIssuesNotificationBase(BaseModel):
    tool_issues_id: int
    is_ack: Optional[bool] = False


class ToolIssuesNotificationCreate(BaseModel):
    tool_issues_id: int


class ToolIssuesNotificationUpdate(BaseModel):
    is_ack: Optional[bool] = None


class ToolIssuesNotification(ToolIssuesNotificationBase):
    id: int
    ack_by: Optional[str] = None
    ack_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ToolIssuesNotificationWithDetails(ToolIssuesNotification):
    tool_name: Optional[str] = None
    tool_issue_qty: Optional[int] = None
    status: Optional[str] = None
    created_by: Optional[str] = None


class ComponentIssuesNotificationBase(BaseModel):
    comp_issues_id: int
    is_ack: Optional[bool] = False


class ComponentIssuesNotificationCreate(BaseModel):
    comp_issues_id: int


class ComponentIssuesNotificationUpdate(BaseModel):
    is_ack: Optional[bool] = None


class ComponentIssuesNotification(ComponentIssuesNotificationBase):
    id: int
    ack_by: Optional[str] = None
    ack_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ComponentIssuesNotificationWithDetails(ComponentIssuesNotification):
    component_name: Optional[str] = None
    machine_name: Optional[str] = None
    sale_order_number: Optional[str] = None
    part_name: Optional[str] = None
    component_status: Optional[str] = None
    description: Optional[str] = None
    created_by: Optional[str] = None


class MachineCalibrationNotificationBase(BaseModel):
    machine_id: int
    is_ack: Optional[bool] = False


class MachineCalibrationNotificationCreate(BaseModel):
    machine_id: int


class MachineCalibrationNotificationUpdate(BaseModel):
    is_ack: Optional[bool] = None


class MachineCalibrationNotification(MachineCalibrationNotificationBase):
    id: int
    ack_by: Optional[str] = None
    ack_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MachineCalibrationNotificationWithDetails(MachineCalibrationNotification):
    machine_name: Optional[str] = None
    type: Optional[str] = None
    work_center_name: Optional[str] = None
    model: Optional[str] = None
    calibration_date: Optional[datetime] = None
    calibration_due_date: Optional[datetime] = None
    created_by: Optional[str] = None


# =======================
# Activity Log Schemas
# =======================

class ActivityLogBase(BaseModel):
    entity_type: str
    entity_id: int
    action: str
    order_id: Optional[int] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class ActivityLogCreate(ActivityLogBase):
    pass


class ActivityLog(ActivityLogBase):
    id: int
    timestamp: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActivityLogWithDetails(ActivityLog):
    """Activity log with enriched details for frontend display"""
    sale_order_number: Optional[str] = None
    product_name: Optional[str] = None
    entity_name: Optional[str] = None  # e.g., part_name, operation_name, document_name
    user_role: Optional[str] = None
    order_status: Optional[str] = None


# =======================
# PC Notification Schemas
# =======================

class PCNotificationBase(BaseModel):
    activity_log_id: int
    pc_user_id: int
    is_read: Optional[bool] = False


class PCNotificationCreate(PCNotificationBase):
    pass


class PCNotificationUpdate(BaseModel):
    is_read: Optional[bool] = None


class PCNotification(PCNotificationBase):
    id: int
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PCNotificationWithDetails(PCNotification):
    """PC notification with enriched activity log details"""
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    entity_name: Optional[str] = None
    action: Optional[str] = None
    order_id: Optional[int] = None
    sale_order_number: Optional[str] = None
    product_name: Optional[str] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    timestamp: Optional[datetime] = None
    details: Optional[Dict[str, Any]] = None

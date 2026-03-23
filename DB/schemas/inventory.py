from pydantic import BaseModel, field_validator
from typing import Optional, List, Text
from datetime import datetime, time
from typing_extensions import Self


# =======================
# Raw Material Schemas
# =======================
class RawMaterialBase(BaseModel):
    material_name: str
    material_specification: Optional[str] = None
    mass: Optional[float] = None
    density: Optional[float] = None
    volume: Optional[float] = None
    stock_type: Optional[str] = None
    quantity: Optional[int] = None
    stock_dimensions: Optional[str] = None
    status: Optional[str] = None
    user_id: Optional[int] = None

    @field_validator('mass', 'density', 'volume', mode='before')
    @classmethod
    def round_to_three_decimal_places(cls, v):
        if v is None:
            return None
        try:
            return round(float(v), 3)
        except (ValueError, TypeError):
            return v


class RawMaterialCreate(RawMaterialBase):
    pass


class RawMaterialUpdate(BaseModel):
    material_name: Optional[str] = None
    material_specification: Optional[str] = None
    mass: Optional[float] = None
    density: Optional[float] = None
    volume: Optional[float] = None
    stock_type: Optional[str] = None
    quantity: Optional[int] = None
    stock_dimensions: Optional[str] = None
    status: Optional[str] = None
    user_id: Optional[int] = None

    @field_validator('mass', 'density', 'volume', mode='before')
    @classmethod
    def round_to_three_decimal_places(cls, v):
        if v is None:
            return None
        try:
            return round(float(v), 3)
        except (ValueError, TypeError):
            return v


class RawMaterial(RawMaterialBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Tools List Schemas
# =======================
class ToolsListBase(BaseModel):
    item_description:    Optional[str]   = None
    range:               Optional[str]   = None
    identification_code: Optional[str]   = None
    make:                Optional[str]   = None
    quantity:            Optional[int]   = None
    total_quantity:      Optional[int]   = None
    issues_qty:          Optional[int]   = None
    location:            Optional[str]   = None
    gauge:               Optional[str]   = None
    remarks:             Optional[str]   = None
    amount:              Optional[float] = None
    ref_ledger:          Optional[str]   = None
    type:                Optional[str]   = None       # CONSUMABLES / NON-CONSUMABLES
    category:            Optional[str]   = None       # Tools / Instruments / Misc
    sub_category:        Optional[str]   = None       # Keys & Wrenches, Micrometers …
 
 
class ToolsListCreate(ToolsListBase):
    pass
 
 
class ToolsListUpdate(BaseModel):
    item_description:    Optional[str]   = None
    range:               Optional[str]   = None
    identification_code: Optional[str]   = None
    make:                Optional[str]   = None
    quantity:            Optional[int]   = None
    total_quantity:      Optional[int]   = None
    location:            Optional[str]   = None
    gauge:               Optional[str]   = None
    remarks:             Optional[str]   = None
    amount:              Optional[float] = None
    ref_ledger:          Optional[str]   = None
    type:                Optional[str]   = None
    category:            Optional[str]   = None
    sub_category:        Optional[str]   = None
 
 
class ToolsList(ToolsListBase):
    id: int
 
    class Config:
        from_attributes = True
 
 
# =======================
# 3-Level Sidebar Tree
# =======================
 
class ItemNode(BaseModel):
    """Leaf node — a specific item_description e.g. 'Allen Key' with its row count"""
    item_description: str
    count: int
 
 
class SubCategoryNode(BaseModel):
    """Mid node — e.g. 'Keys & Wrenches' containing its items"""
    sub_category: str
    count: int
    items: List[ItemNode] = []
 
 
class CategoryTree(BaseModel):
    """Root node — 'Tools' or 'Instruments'"""
    category: str
    total_count: int
    sub_categories: List[SubCategoryNode] = []

# =======================
# Inventory Request Schemas
# =======================
class InventoryRequestBase(BaseModel):
    tool_id: int
    operator_id: int
    project_id: int
    part_id: int
    quantity: int
    purpose_of_use: Optional[str] = None
    status: Optional[str] = "pending"


class InventoryRequestCreate(BaseModel):
    tool_id: int
    operator_id: int
    project_id: int
    part_id: int
    quantity: int
    purpose_of_use: Optional[str] = None


class InventoryRequestUpdate(BaseModel):
    tool_id: Optional[int] = None
    operator_id: Optional[int] = None
    project_id: Optional[int] = None
    part_id: Optional[int] = None
    quantity: Optional[int] = None
    purpose_of_use: Optional[str] = None


class InventoryRequest(InventoryRequestBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InventoryRequestWithDetails(InventoryRequest):
    tool_name: Optional[str] = None
    tool_type: Optional[str] = None
    operator_name: Optional[str] = None
    inventory_supervisor_name: Optional[str] = None
    project_name: Optional[str] = None
    part_name: Optional[str] = None

    class Config:
        from_attributes = True


# =======================
# Inventory Return Request Schemas
# =======================
class InventoryReturnRequestBase(BaseModel):
    requested_id: int
    operator_id: int
    total_requested_qty: int
    returned_qty: int = 0
    remarks: Optional[str] = None
    inventory_supervisor_id: Optional[int] = None  # Set when status is updated to collected
    status: Optional[str] = "pending"


class InventoryReturnRequestCreate(BaseModel):
    requested_id: int
    operator_id: int
    returned_qty: int
    remarks: Optional[str] = None
    status: str = "pending"  # Can be "pending" or "collected"


class InventoryReturnRequestUpdate(BaseModel):
    requested_id: Optional[int] = None
    operator_id: Optional[int] = None
    total_requested_qty: Optional[int] = None
    returned_qty: Optional[int] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class InventoryReturnRequest(InventoryReturnRequestBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InventoryReturnRequestWithDetails(InventoryReturnRequest):
    operator_name: Optional[str] = None
    inventory_supervisor_name: Optional[str] = None
    inventory_request_details: Optional[InventoryRequestWithDetails] = None

    class Config:
        from_attributes = True


# =======================
# Transaction History Schemas
# =======================
class TransactionHistoryBase(BaseModel):
    request_id: int


class TransactionHistoryResponse(BaseModel):
    inventory_request: Optional[InventoryRequestWithDetails] = None
    return_requests: Optional[List[InventoryReturnRequestWithDetails]] = []

    class Config:
        from_attributes = True


# =======================
# Tool Issues Schemas
# =======================
class ToolIssueBase(BaseModel):
    tool_id: int
    request_id: int
    tool_issue_qty: int
    operator_id: int
    status: Optional[str] = "pending"
    issue_category: Optional[str] = None  # "wear and tear", "Calibration Drift", "other"
    description: Optional[str] = None  # Entered by operator
    remarks: Optional[str] = None  # Entered by admin
    document_url: Optional[str] = None  # URL to uploaded document in MinIO


class ToolIssueCreate(BaseModel):
    tool_id: int
    request_id: int
    tool_issue_qty: int
    operator_id: int
    issue_category: Optional[str] = None  # "wear and tear", "Calibration Drift", "other"
    description: Optional[str] = None  # Entered by operator
    # status remains pending on create


class ToolIssueUpdate(BaseModel):
    tool_id: Optional[int] = None
    request_id: Optional[int] = None
    tool_issue_qty: Optional[int] = None
    operator_id: Optional[int] = None
    issue_category: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None
    document_url: Optional[str] = None
    # status and admin are managed via dedicated endpoint


class ToolIssue(ToolIssueBase):
    id: int
    inventory_supervisor_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ToolIssueWithDetails(ToolIssue):
    tool_name: Optional[str] = None
    operator_name: Optional[str] = None
    inventory_supervisor_name: Optional[str] = None
    sale_order_number: Optional[str] = None

    class Config:
        from_attributes = True

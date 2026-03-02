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


class RawMaterial(RawMaterialBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Tools List Schemas
# =======================
class ToolsListBase(BaseModel):
    item_description: Optional[str] = None  # Changed to Optional
    range: Optional[str] = None
    identification_code: Optional[str] = None  # Changed to Optional
    make: Optional[str] = None
    quantity: Optional[int] = None  # Changed to Optional
    location: Optional[str] = None
    gauge: Optional[str] = None
    remarks: Optional[str] = None
    amount: Optional[float] = None
    ref_ledger: Optional[str] = None
    type: Optional[str] = None  # Changed to Optional


class ToolsListCreate(ToolsListBase):
    pass


class ToolsListUpdate(BaseModel):
    item_description: Optional[str] = None
    range: Optional[str] = None
    identification_code: Optional[str] = None
    make: Optional[str] = None
    quantity: Optional[int] = None
    location: Optional[str] = None
    gauge: Optional[str] = None
    remarks: Optional[str] = None
    amount: Optional[float] = None
    ref_ledger: Optional[str] = None
    type: Optional[str] = None


class ToolsList(ToolsListBase):
    id: int

    class Config:
        from_attributes = True


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
    admin_name: Optional[str] = None
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
    admin_id: Optional[int] = None  # Only set by admin during status update
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
    admin_name: Optional[str] = None
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

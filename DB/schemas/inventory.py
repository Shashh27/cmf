from pydantic import BaseModel, field_validator

from typing import Optional, List, Text

from datetime import datetime, time

from typing_extensions import Self





# =======================

# Raw Material Schemas (SIMPLIFIED)

# =======================

class RawMaterialBase(BaseModel):

    material_name: str

    density: float  # kg/m³

    cost_per_kg: Optional[float] = None  # Cost per kg

    user_id: Optional[int] = None  # User who created this raw material



class RawMaterialCreate(RawMaterialBase):

    pass



class RawMaterialUpdate(BaseModel):

    material_name: Optional[str] = None

    density: Optional[float] = None

    cost_per_kg: Optional[float] = None

    user_id: Optional[int] = None  # User who created this raw material



class RawMaterial(RawMaterialBase):

    id: int

    created_at: Optional[datetime] = None

    updated_at: Optional[datetime] = None

    # Stock status fields
    has_available_stock: Optional[bool] = False
    total_stock_quantity: Optional[int] = 0
    available_stock_count: Optional[int] = 0



    class Config:

        from_attributes = True



# =======================

# Raw Material Stock Schemas

# =======================

class RawMaterialStockBase(BaseModel):

    material_id: int

    process_type: Optional[str] = None  # "Forging", "Barstocks", "Casting"

    form_type: str  # "Round", "Square", "Pipe"

    diameter: Optional[float] = None  # For Round & Pipe

    length: Optional[float] = None    # For all forms

    breadth: Optional[float] = None   # For Square

    height: Optional[float] = None    # For Square

    inner_diameter: Optional[float] = None  # For Pipe

    outer_diameter: Optional[float] = None  # For Pipe

    quantity: int = 0

    volume: Optional[float] = None    # Single unit volume in m³

    mass: Optional[float] = None      # Single unit mass in kg

    weight: Optional[float] = None    # Single unit weight in N

    cost: Optional[float] = None      # Single unit cost

    estimated_cost: Optional[float] = None  # Estimated cost when procuring

    final_cost: Optional[float] = None      # Final cost when received

    source_type: str = "general"  # "general" or "order"

    source_order_id: Optional[int] = None

    order_status: Optional[str] = None  # "enquiry", "purchase_request", "purchase_order", "received", etc.

    creation_source: str = "manual"  # "manual" or "auto_extract"

    # New linking fields
    part_id: Optional[str] = None  # Can be single ID or comma-separated IDs like "1,2,3"

    vendor_id: Optional[str] = None  # Store comma-separated vendor IDs for enquiry: "1,2,3"
    
    received_vendor_id: Optional[int] = None  # Final vendor who received the order

    user_id: Optional[int] = None
    
    merge_group_id: Optional[str] = None  # UUID to track merged orders for bulk vendor linking

    status: str = "available"
    
    allocated_quantity: int = 0  # Quantity allocated to parts
    
    available_quantity: int = 0  # Quantity available for use



    @field_validator('process_type')

    @classmethod

    def validate_process_type(cls, v):

        return v



    @field_validator('form_type')

    @classmethod

    def validate_form_type(cls, v):

        if v not in ["Round", "Square", "Pipe"]:

            raise ValueError('form_type must be "Round", "Square", or "Pipe"')

        return v



    @field_validator('source_type')

    @classmethod

    def validate_source_type(cls, v):

        if v not in ["general", "order"]:

            raise ValueError('source_type must be "general" or "order"')

        return v



class RawMaterialStockCreate(RawMaterialStockBase):

    pass



class RawMaterialStockUpdate(BaseModel):

    material_id: Optional[int] = None

    process_type: Optional[str] = None

    form_type: Optional[str] = None

    diameter: Optional[float] = None

    length: Optional[float] = None

    breadth: Optional[float] = None

    height: Optional[float] = None

    inner_diameter: Optional[float] = None

    outer_diameter: Optional[float] = None

    quantity: Optional[int] = None

    volume: Optional[float] = None

    mass: Optional[float] = None

    weight: Optional[float] = None

    cost: Optional[float] = None

    estimated_cost: Optional[float] = None

    final_cost: Optional[float] = None

    source_type: Optional[str] = None

    source_order_id: Optional[int] = None

    order_status: Optional[str] = None

    part_id: Optional[str] = None  # Can be single ID or comma-separated IDs like "1,2,3"

    vendor_id: Optional[str] = None  # Store comma-separated vendor IDs for enquiry: "1,2,3"
    
    received_vendor_id: Optional[int] = None  # Final vendor who received the order

    user_id: Optional[int] = None
    
    merge_group_id: Optional[str] = None  # UUID to track merged orders for bulk vendor linking

    status: Optional[str] = None
    
    allocated_quantity: Optional[int] = None
    
    available_quantity: Optional[int] = None



class RawMaterialStock(RawMaterialStockBase):

    id: int

    created_at: Optional[datetime] = None

    updated_at: Optional[datetime] = None



    class Config:

        from_attributes = True



class RawMaterialStockWithDetails(RawMaterialStock):

    material_name: Optional[str] = None

    source_order_number: Optional[str] = None

    # Related entity names
    part_name: Optional[str] = None
    part_numbers: Optional[List[str]] = None
    part_names: Optional[List[str]] = None

    vendor_name: Optional[str] = None

    creator_name: Optional[str] = None

    order_parts_mapping: Optional[dict] = None  # Maps order numbers to their associated parts

    total_volume: Optional[float] = None  # volume * quantity

    total_mass: Optional[float] = None    # mass * quantity

    total_weight: Optional[float] = None  # weight * quantity

    total_cost: Optional[float] = None     # cost * quantity



# =======================

# Order Raw Material Linking Schema

# =======================

class OrderMaterialLinkRequest(BaseModel):

    """Request model for linking materials to an order"""

    raw_material_id: int

    process_type: Optional[str] = None  # "Forging", "Barstocks", "Casting"

    form_type: str

    diameter: Optional[float] = None

    length: float

    breadth: Optional[float] = None

    height: Optional[float] = None

    inner_diameter: Optional[float] = None

    outer_diameter: Optional[float] = None

    order_id: int

    part_ids: List[int]

    required_lengths: List[float]  # Required length for each part

    vendor_id: Optional[List[int]] = None  # Multiple vendors for enquiry

    quantity: int = 1

    estimated_cost: Optional[float] = None  # Estimated cost when procuring

    user_id: Optional[int] = None



    @field_validator('form_type')

    @classmethod

    def validate_form_type(cls, v):

        if v not in ["Round", "Square", "Pipe"]:

            raise ValueError('form_type must be "Round", "Square", or "Pipe"')

        return v





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

    inventory_supervisor_id: Optional[int] = None  # Only set by inventory supervisor during status update

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

# Vendors Schemas

# =======================

class VendorsBase(BaseModel):

    company_name: str



class VendorsCreate(VendorsBase):

    pass



class VendorsUpdate(BaseModel):

    company_name: Optional[str] = None



class Vendors(VendorsBase):

    id: int

    created_at: Optional[datetime] = None

    updated_at: Optional[datetime] = None



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

    remarks: Optional[str] = None  # Entered by supervisor





class ToolIssueCreate(BaseModel):

    tool_id: int

    request_id: int

    tool_issue_qty: int

    operator_id: int

    issue_category: Optional[str] = None  # "wear and tear", "Calibration Drift", "other"

    description: Optional[str] = None  # Entered by operator





class ToolIssueUpdate(BaseModel):

    tool_id: Optional[int] = None

    request_id: Optional[int] = None

    tool_issue_qty: Optional[int] = None

    operator_id: Optional[int] = None

    issue_category: Optional[str] = None

    description: Optional[str] = None

    remarks: Optional[str] = None





class ToolIssueDocument(BaseModel):

    id: int

    tool_issue_id: int

    document_url: str

    created_at: Optional[datetime] = None



    class Config:

        from_attributes = True





class ToolIssue(ToolIssueBase):

    id: int

    inventory_supervisor_id: Optional[int] = None

    created_at: Optional[datetime] = None

    updated_at: Optional[datetime] = None

    documents: List[ToolIssueDocument] = []



    class Config:

        from_attributes = True





class ToolIssueWithDetails(ToolIssue):

    tool_name: Optional[str] = None

    operator_name: Optional[str] = None

    inventory_supervisor_name: Optional[str] = None

    sale_order_number: Optional[str] = None



    class Config:

        from_attributes = True


# =======================

# 🔥 Raw Material Unit Schemas

# =======================

class RawMaterialUnitBase(BaseModel):
    stock_id: int
    total_length: float
    remaining_length: float
    volume: Optional[float] = None
    mass: Optional[float] = None
    weight: Optional[float] = None
    cost: Optional[float] = None
    status: str = "available"


class RawMaterialUnitCreate(RawMaterialUnitBase):
    pass


class RawMaterialUnitUpdate(BaseModel):
    stock_id: Optional[int] = None
    total_length: Optional[float] = None
    remaining_length: Optional[float] = None
    volume: Optional[float] = None
    mass: Optional[float] = None
    weight: Optional[float] = None
    cost: Optional[float] = None
    status: Optional[str] = None


class RawMaterialUnit(RawMaterialUnitBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RawMaterialUnitWithDetails(RawMaterialUnit):
    material_name: Optional[str] = None
    stock_details: Optional[dict] = None
    usages: Optional[List[dict]] = []

    class Config:
        from_attributes = True


# =======================

# 🔥 Raw Material Usage Schemas

# =======================

class RawMaterialUsageBase(BaseModel):
    raw_material_unit_id: int
    part_id: int
    used_length: float
    user_id: Optional[int] = None  # User who linked the material


class RawMaterialUsageCreate(RawMaterialUsageBase):
    pass


class RawMaterialUsageUpdate(BaseModel):
    raw_material_unit_id: Optional[int] = None
    part_id: Optional[int] = None
    used_length: Optional[float] = None
    user_id: Optional[int] = None  # User who linked the material


class RawMaterialUsage(RawMaterialUsageBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RawMaterialUsageWithDetails(RawMaterialUsage):
    part_name: Optional[str] = None
    part_number: Optional[str] = None
    unit_details: Optional[RawMaterialUnitWithDetails] = None

    class Config:
        from_attributes = True


# =======================
# 🔥 Raw Material History Schemas
# =======================

class RawMaterialHistoryItem(BaseModel):
    """Single history item for raw material activities"""
    id: int
    activity_type: str  # "stock_created", "material_linked", "order_status_changed", "stock_updated", "material_unlinked"
    timestamp: datetime
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    
    # Material details
    material_id: Optional[int] = None
    material_name: Optional[str] = None
    
    # Stock details
    stock_id: Optional[int] = None
    source_type: Optional[str] = None  # "general" or "order"
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    order_status: Optional[str] = None
    quantity: Optional[int] = None
    form_type: Optional[str] = None
    dimensions: Optional[str] = None
    
    # Part details
    part_id: Optional[int] = None
    part_name: Optional[str] = None
    part_number: Optional[str] = None
    used_length: Optional[float] = None
    
    # Unit details
    unit_id: Optional[int] = None
    total_length: Optional[float] = None
    remaining_length: Optional[float] = None
    
    # Vendor details
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    
    # Additional details
    description: Optional[str] = None


class RawMaterialHistoryResponse(BaseModel):
    """Response model for raw material history"""
    history: List[RawMaterialHistoryItem]
    total_count: int
    filtered_count: int


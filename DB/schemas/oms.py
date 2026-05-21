from typing import Optional, List, Text, TYPE_CHECKING

from datetime import datetime, time

from typing_extensions import Self

from pydantic import BaseModel, field_validator
from .inventory import ToolsList

if TYPE_CHECKING:
    from .configuration import Customer


# =======================
# Product Schemas
# =======================
class ProductBase(BaseModel):
    product_name: str
    product_version: str
    user_id: int


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    product_version: Optional[str] = None
    user_id: Optional[int] = None


class Product(ProductBase):
    id: int
    user_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Assembly Schemas
# =======================
class AssemblyBase(BaseModel):
    assembly_name: str
    assembly_number: str
    product_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class AssemblyCreate(AssemblyBase):
    pass


class AssemblyUpdate(BaseModel):
    assembly_name: Optional[str] = None
    assembly_number: Optional[str] = None
    product_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class Assembly(AssemblyBase):
    id: int
    user_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Part Type Schemas
# =======================
class PartTypeBase(BaseModel):
    type_name: str
    user_id: Optional[int] = None


class PartTypeCreate(PartTypeBase):
    pass


class PartTypeUpdate(BaseModel):
    type_name: Optional[str] = None
    user_id: Optional[int] = None


class PartType(PartTypeBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Part Schemas
# =======================
class PartBase(BaseModel):
    part_name: str
    part_number: str
    type_id: int
    raw_material_id: Optional[int] = None
    raw_material_unit_id: Optional[int] = None  # 🔥 Unit-based tracking
    required_length: Optional[float] = None  # 🔥 REQUIRED LENGTH
    part_detail: Optional[str] = None  # For out-source: WITH_RAW_MATERIAL | WITHOUT_RAW_MATERIAL
    assembly_id: Optional[int] = None
    product_id: Optional[int] = None
    user_id: Optional[int] = None
    qty: Optional[int] = None  # Optional quantity field
    size: Optional[str] = None  # Size specification for the part
    vendor_id: Optional[int] = None  # Vendor for outsourced parts


class PartCreate(PartBase):
    pass


class PartUpdate(BaseModel):
    part_name: Optional[str] = None
    part_number: Optional[str] = None
    type_id: Optional[int] = None
    raw_material_id: Optional[int] = None
    raw_material_unit_id: Optional[int] = None  # 🔥 Unit-based tracking
    required_length: Optional[float] = None  # 🔥 REQUIRED LENGTH
    part_detail: Optional[str] = None
    assembly_id: Optional[int] = None
    product_id: Optional[int] = None
    user_id: Optional[int] = None
    qty: Optional[int] = None  # Optional quantity field
    size: Optional[str] = None  # Size specification for the part
    vendor_id: Optional[int] = None  # Vendor for outsourced parts


class Part(PartBase):
    id: int
    type_name: Optional[str] = None
    raw_material_name: Optional[str] = None
    raw_material_status: Optional[str] = None  # From raw_materials.status: Available / Not Available / N/A
    raw_material_unit_details: Optional[dict] = None  # Unit details: total_length, remaining_length, status
    # New stock details fields (deprecated - for backward compatibility)
    raw_material_stock_details: Optional[dict] = None  # Stock form, dimensions, quantity, etc.
    raw_material_stock_form_type: Optional[str] = None  # Round, Square, Pipe
    raw_material_stock_dimensions: Optional[str] = None  # Formatted dimensions string
    priority: Optional[int] = None
    user_name: Optional[str] = None
    qty: Optional[int] = None  # Optional quantity field
    size: Optional[str] = None  # Size specification for the part
    vendor_id: Optional[int] = None  # Vendor for outsourced parts
    vendor_name: Optional[str] = None  # Vendor company name
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Operation Schemas
# =======================
class OperationBase(BaseModel):
    operation_number: Optional[str] = None
    operation_name: str
    part_type_id: Optional[int] = 1
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    setup_time: Optional[time] = None
    cycle_time: Optional[time] = None
    workcenter_id: Optional[int] = None
    machine_id: Optional[int] = None
    part_id: int
    user_id: Optional[int] = None
    work_instructions: Optional[str] = None
    notes: Optional[str] = None
    vendor_id: Optional[int] = None  # Vendor for outsourced operations

    @field_validator('setup_time', 'cycle_time', mode='before')
    @classmethod
    def parse_time(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            try:
                # Handle various time formats: "10:09:11", "10:09:11.978", "10:09"
                if ':' in v:
                    parts = v.split(':')
                    if len(parts) == 2:  # "HH:MM"
                        return time(int(parts[0]), int(parts[1]), 0)
                    elif len(parts) == 3:  # "HH:MM:SS" or "HH:MM:SS.mmm"
                        seconds_parts = parts[2].split('.')
                        hour = int(parts[0])
                        minute = int(parts[1])
                        second = int(seconds_parts[0])
                        microsecond = int(seconds_parts[1]) * 1000 if len(seconds_parts) > 1 else 0
                        return time(hour, minute, second, microsecond)
                raise ValueError(f"Invalid time format: {v}")
            except (ValueError, TypeError, IndexError):
                raise ValueError(f"Invalid time format: {v}. Expected format: HH:MM:SS or HH:MM")
        elif isinstance(v, time):
            return v
        elif isinstance(v, datetime):
            # Handle existing datetime objects from database - convert to time
            return v.time()
        else:
            raise ValueError(f"Invalid time type: {type(v)}")


class OperationCreate(OperationBase):
    pass


class OperationUpdate(BaseModel):
    operation_number: Optional[str] = None
    operation_name: Optional[str] = None
    part_type_id: Optional[int] = None
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    setup_time: Optional[time] = None
    cycle_time: Optional[time] = None
    workcenter_id: Optional[int] = None
    machine_id: Optional[int] = None
    part_id: Optional[int] = None
    user_id: Optional[int] = None
    work_instructions: Optional[str] = None
    notes: Optional[str] = None
    vendor_id: Optional[int] = None  # Vendor for outsourced operations

    @field_validator('setup_time', 'cycle_time', mode='before')
    @classmethod
    def parse_time(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            try:
                # Handle various time formats: "10:09:11", "10:09:11.978", "10:09"
                if ':' in v:
                    parts = v.split(':')
                    if len(parts) == 2:  # "HH:MM"
                        return time(int(parts[0]), int(parts[1]), 0)
                    elif len(parts) == 3:  # "HH:MM:SS" or "HH:MM:SS.mmm"
                        seconds_parts = parts[2].split('.')
                        hour = int(parts[0])
                        minute = int(parts[1])
                        second = int(seconds_parts[0])
                        microsecond = int(seconds_parts[1]) * 1000 if len(seconds_parts) > 1 else 0
                        return time(hour, minute, second, microsecond)
                raise ValueError(f"Invalid time format: {v}")
            except (ValueError, TypeError, IndexError):
                raise ValueError(f"Invalid time format: {v}. Expected format: HH:MM:SS or HH:MM")
        elif isinstance(v, time):
            return v
        elif isinstance(v, datetime):
            # Handle existing datetime objects from database - convert to time
            return v.time()
        else:
            raise ValueError(f"Invalid time type: {type(v)}")


class Operation(OperationBase):
    id: int
    part_type_name: Optional[str] = None
    work_center_name: Optional[str] = None
    machine_name: Optional[str] = None
    user_name: Optional[str] = None
    vendor_id: Optional[int] = None  # Vendor for outsourced operations
    vendor_name: Optional[str] = None  # Vendor company name
    operation_documents: List['OperationDocument'] = []
    tools: List['ToolWithPart'] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Process Plan Schemas (Removed - Merged into Operations)
# =======================
# class ProcessPlanBase(BaseModel):
#    operation_id: int
#    work_instructions: Optional[str] = None
#    notes: Optional[str] = None
#
#
# class ProcessPlanCreate(ProcessPlanBase):
#    pass
#
#
# class ProcessPlanUpdate(BaseModel):
#    operation_id: Optional[int] = None
#    work_instructions: Optional[str] = None
#    notes: Optional[str] = None
#
#
# class ProcessPlan(ProcessPlanBase):
#    id: int
#
#    class Config:
#        from_attributes = True


# =======================
# Document Schemas
# =======================
class DocumentBase(BaseModel):
    document_name: str
    document_type: str
    document_version: str
    part_id: Optional[int] = None
    assembly_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class DocumentCreate(DocumentBase):
    # document_url will be generated after file upload to MinIO
    pass


class DocumentUpdate(BaseModel):
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    document_version: Optional[str] = None
    part_id: Optional[int] = None
    assembly_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class Document(DocumentBase):
    id: int
    document_url: str  # MinIO URL
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Tool With Part Schemas
# =======================
class ToolWithPartBase(BaseModel):
    tool_id: int
    part_id: int
    operation_id: Optional[int] = None
    user_id: Optional[int] = None


class ToolWithPartCreate(ToolWithPartBase):
    pass


class ToolWithPartUpdate(BaseModel):
    tool_id: Optional[int] = None
    part_id: Optional[int] = None
    operation_id: Optional[int] = None
    user_id: Optional[int] = None


class ToolWithPart(ToolWithPartBase):
    id: int
    tool: Optional[ToolsList] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Hierarchical Product Data Schemas
# =======================
class PartDetails(BaseModel):
    part: Part
    operations: List[Operation] = []
    documents: List[Document] = []
    tools: List[ToolWithPart] = []
    extracted_data: List['DocumentExtractedData'] = []


class AssemblyDetails(BaseModel):
    assembly: Assembly
    parts: List[PartDetails] = []
    subassemblies: List['AssemblyDetails'] = []
    documents: List[Document] = []


class ProductHierarchicalData(BaseModel):
    product: Product
    assemblies: List[AssemblyDetails] = []
    direct_parts: List[PartDetails] = []


# =======================
# Lightweight Hierarchical Product Data Schemas (No operations/documents/tools)
# =======================
class PartLightweight(BaseModel):
    id: int
    part_name: str
    part_number: str
    type_id: Optional[int] = None
    type_name: Optional[str] = None
    assembly_id: Optional[int] = None
    product_id: Optional[int] = None
    qty: Optional[int] = None
    size: Optional[str] = None
    raw_material_id: Optional[int] = None
    raw_material_name: Optional[str] = None
    raw_material_status: Optional[str] = None
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AssemblyLightweight(BaseModel):
    id: int
    assembly_name: str
    assembly_number: str
    product_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    parts: List[PartLightweight] = []
    child_assemblies: List['AssemblyLightweight'] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProductHierarchicalLightweight(BaseModel):
    product: Product
    assemblies: List[AssemblyLightweight] = []
    parts: List[PartLightweight] = []




# =======================
# Order Schemas
# =======================
class OrderBase(BaseModel):
    sale_order_number: str
    project_name: Optional[str] = None
    order_date: Optional[datetime] = None
    customer_id: int
    product_id: int
    user_id: Optional[int] = None
    project_coordinator_id: Optional[int] = None
    admin_id: int
    manufacturing_coordinator_id: Optional[int] = None
    quantity: int
    due_date: Optional[datetime] = None
    status: str


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    sale_order_number: Optional[str] = None
    project_name: Optional[str] = None
    order_date: Optional[datetime] = None
    customer_id: Optional[int] = None
    product_id: Optional[int] = None
    user_id: Optional[int] = None
    project_coordinator_id: Optional[int] = None
    admin_id: Optional[int] = None
    manufacturing_coordinator_id: Optional[int] = None
    quantity: Optional[int] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None


class OrderAssign(BaseModel):
    manufacturing_coordinator_id: int


class Order(OrderBase):
    id: int
    company_name: Optional[str] = None
    product_name: Optional[str] = None
    user_name: Optional[str] = None
    project_coordinator_name: Optional[str] = None
    admin_name: Optional[str] = None
    manufacturing_coordinator_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrderWithCustomerAndProduct(Order):
    company_name: Optional[str] = None
    product_name: Optional[str] = None
    user_name: Optional[str] = None
    has_raw_materials: bool = False

    class Config:
        from_attributes = True


class OrderWithHierarchy(OrderWithCustomerAndProduct):
    product_hierarchy: ProductHierarchicalData

    class Config:
        from_attributes = True


class OrderWithCustomer(Order):
    customer: "Customer"


from .configuration import Customer
OrderWithCustomer.model_rebuild()





# =======================
# Order Document Schemas
# =======================
class OrderDocumentBase(BaseModel):
    order_id: int
    document_name: str
    document_type: str
    document_version: str
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class OrderDocumentCreate(OrderDocumentBase):
    document_url: Optional[str] = None


class OrderDocumentUpdate(BaseModel):
    order_id: Optional[int] = None
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    document_version: Optional[str] = None
    document_url: Optional[str] = None
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class OrderDocument(OrderDocumentBase):
    id: int
    document_url: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Operation Document Schemas
# =======================
class OperationDocumentBase(BaseModel):
    document_name: str
    document_url: str
    document_type: str
    document_version: str
    operation_id: int
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class OperationDocumentCreate(OperationDocumentBase):
    pass


class OperationDocumentUpdate(BaseModel):
    document_name: Optional[str] = None
    document_url: Optional[str] = None
    document_type: Optional[str] = None
    document_version: Optional[str] = None
    operation_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: Optional[int] = None


class OperationDocument(OperationDocumentBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OperationDocumentWithDetails(OperationDocument):
    operation_name: Optional[str] = None
    operation_number: Optional[str] = None

    class Config:
        from_attributes = True

# Update forward references
Operation.model_rebuild()




# =======================
# Order Part Priority Schemas
# =======================
class OrderPartPriorityBase(BaseModel):
    order_id: int
    product_id: int
    part_id: int
    priority: int


class OrderPartPriorityCreate(OrderPartPriorityBase):
    pass


class OrderPartPriorityUpdate(BaseModel):
    order_id: Optional[int] = None
    product_id: Optional[int] = None
    part_id: Optional[int] = None
    priority: Optional[int] = None


class OrderPartPriorityGlobalUpdate(BaseModel):
    id: int
    priority: int


class OrderPartPrioritySwap(BaseModel):
    id1: int
    id2: int


class OrderPartPriority(OrderPartPriorityBase):
    id: int
    part_name: Optional[str] = None
    part_number: Optional[str] = None
    sale_order_number: Optional[str] = None
    project_name: Optional[str] = None
    product_name: Optional[str] = None
    part_type_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrderWisePriority(BaseModel):
    order_id: int
    sale_order_number: Optional[str] = None
    project_name: Optional[str] = None
    product_name: Optional[str] = None
    min_priority: int
    max_priority: int
    part_count: int

    class Config:
        from_attributes = True


# =======================
# Document Extracted Data Schemas
# =======================
class DocumentExtractedDataBase(BaseModel):
    document_id: int
    part_id: int
    note: Optional[str] = None
    title: Optional[str] = None
    stock_size: Optional[str] = None
    material: Optional[str] = None
    stocksize_kg: Optional[str] = None
    net_wt_kg: Optional[str] = None


class DocumentExtractedDataCreate(DocumentExtractedDataBase):
    pass


class DocumentExtractedDataUpdate(BaseModel):
    document_id: Optional[int] = None
    part_id: Optional[int] = None
    note: Optional[str] = None
    title: Optional[str] = None
    stock_size: Optional[str] = None
    material: Optional[str] = None
    stocksize_kg: Optional[str] = None
    net_wt_kg: Optional[str] = None


class DocumentExtractedData(DocumentExtractedDataBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Rebuild forward references for hierarchical schemas
PartDetails.model_rebuild()
AssemblyDetails.model_rebuild()


# =======================
# Order Tracking Schemas
# =======================

class OperationTrackingStatus(BaseModel):
    operation_id: int
    operation_number: str
    operation_name: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None
    production_logs: List[dict] = []

    class Config:
        from_attributes = True


class PartTrackingStatus(BaseModel):
    part_id: int
    part_name: str
    part_number: str
    part_type_name: Optional[str] = None
    status: str
    total_operations: int
    completed_operations: int
    pending_operations: int
    completion_percentage: float
    operations: List[OperationTrackingStatus] = []

    class Config:
        from_attributes = True


class OrderTrackingStatus(BaseModel):
    order_id: int
    sale_order_number: str
    customer_name: Optional[str] = None
    product_name: Optional[str] = None
    quantity: int
    due_date: Optional[datetime] = None
    status: str
    total_parts: int
    completed_parts: int
    pending_parts: int
    completion_percentage: float
    parts: List[PartTrackingStatus] = []

    class Config:
        from_attributes = True


class OrderTrackingSummary(BaseModel):
    order_id: int
    sale_order_number: str
    total_parts: int
    completed_parts: int
    pending_parts: int
    completion_percentage: float
    overall_status: str

    class Config:
        from_attributes = True


# =======================
# Out Source Part Status Schemas
# =======================
class OutSourcePartStatusBase(BaseModel):
    part_id: int
    order_id: int
    start_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    status: str


class OutSourcePartStatusCreate(OutSourcePartStatusBase):
    pass


class OutSourcePartStatusUpdate(BaseModel):
    part_id: Optional[int] = None
    order_id: Optional[int] = None
    start_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    status: Optional[str] = None


class OutSourcePartStatus(OutSourcePartStatusBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Extracted Data Schemas
# =======================
class ExtractedDataUpdate(BaseModel):
    material: Optional[str] = None
    stock_size: Optional[str] = None
    stocksize_kg: Optional[str] = None
    net_wt_kg: Optional[str] = None
    note: Optional[str] = None
    title: Optional[str] = None
    user_id: Optional[int] = None

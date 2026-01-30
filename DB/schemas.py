from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime, time


# =======================
# Product Schemas
# =======================
class ProductBase(BaseModel):
    product_name: str
    product_number: str
    product_version: str


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    product_name: Optional[str] = None
    product_number: Optional[str] = None
    product_version: Optional[str] = None


class Product(ProductBase):
    id: int

    class Config:
        from_attributes = True


# =======================
# Assembly Schemas
# =======================
class AssemblyBase(BaseModel):
    assembly_name: str
    assembly_number: str
    product_id: int
    parent_id: Optional[int] = None


class AssemblyCreate(AssemblyBase):
    pass


class AssemblyUpdate(BaseModel):
    assembly_name: Optional[str] = None
    assembly_number: Optional[str] = None
    product_id: Optional[int] = None
    parent_id: Optional[int] = None


class Assembly(AssemblyBase):
    id: int

    class Config:
        from_attributes = True


# =======================
# Part Type Schemas
# =======================
class PartTypeBase(BaseModel):
    type_name: str


class PartTypeCreate(PartTypeBase):
    pass


class PartTypeUpdate(BaseModel):
    type_name: Optional[str] = None


class PartType(PartTypeBase):
    id: int

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
    assembly_id: Optional[int] = None
    product_id: int


class PartCreate(PartBase):
    pass


class PartUpdate(BaseModel):
    part_name: Optional[str] = None
    part_number: Optional[str] = None
    type_id: Optional[int] = None
    raw_material_id: Optional[int] = None
    assembly_id: Optional[int] = None
    product_id: Optional[int] = None


class Part(PartBase):
    id: int
    type_name: Optional[str] = None

    class Config:
        from_attributes = True


# =======================
# Operation Schemas
# =======================
class OperationBase(BaseModel):
    operation_number: str
    operation_name: str
    setup_time: Optional[time] = None
    cycle_time: Optional[time] = None
    workcenter_id: Optional[int] = None
    part_id: int

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
    setup_time: Optional[time] = None
    cycle_time: Optional[time] = None
    workcenter_id: Optional[int] = None
    part_id: Optional[int] = None

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

    class Config:
        from_attributes = True


# =======================
# Process Plan Schemas
# =======================
class ProcessPlanBase(BaseModel):
    operation_id: int
    work_instructions: Optional[str] = None
    notes: Optional[str] = None


class ProcessPlanCreate(ProcessPlanBase):
    pass


class ProcessPlanUpdate(BaseModel):
    operation_id: Optional[int] = None
    work_instructions: Optional[str] = None
    notes: Optional[str] = None


class ProcessPlan(ProcessPlanBase):
    id: int

    class Config:
        from_attributes = True


# =======================
# Document Schemas
# =======================
class DocumentBase(BaseModel):
    document_name: str
    document_type: str
    document_version: str
    part_id: int
    parent_id: Optional[int] = None


class DocumentCreate(DocumentBase):
    # document_url will be generated after file upload to MinIO
    pass


class DocumentUpdate(BaseModel):
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    document_version: Optional[str] = None
    part_id: Optional[int] = None
    parent_id: Optional[int] = None


class Document(DocumentBase):
    id: int
    document_url: str  # MinIO URL

    class Config:
        from_attributes = True


# =======================
# Tool With Part Schemas
# =======================
class ToolWithPartBase(BaseModel):
    tool_id: int
    part_id: int


class ToolWithPartCreate(ToolWithPartBase):
    pass


class ToolWithPartUpdate(BaseModel):
    tool_id: Optional[int] = None
    part_id: Optional[int] = None


class ToolWithPart(ToolWithPartBase):
    id: int

    class Config:
        from_attributes = True


# =======================
# Hierarchical Product Data Schemas
# =======================
class PartDetails(BaseModel):
    part: Part
    operations: List[Operation] = []
    process_plans: List[ProcessPlan] = []
    documents: List[Document] = []
    tools: List[ToolWithPart] = []


class AssemblyDetails(BaseModel):
    assembly: Assembly
    parts: List[PartDetails] = []
    subassemblies: List['AssemblyDetails'] = []


class ProductHierarchicalData(BaseModel):
    product: Product
    assemblies: List[AssemblyDetails] = []
    direct_parts: List[PartDetails] = []


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


# =======================
# Order Schemas
# =======================
class OrderBase(BaseModel):
    sale_order_number: str
    customer_id: int
    product_id: int
    quantity: int
    due_date: datetime
    priority: int
    supervisor_id: int
    status: str


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    sale_order_number: Optional[str] = None
    customer_id: Optional[int] = None
    product_id: Optional[int] = None
    quantity: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[int] = None
    supervisor_id: Optional[int] = None
    status: Optional[str] = None


class Order(OrderBase):
    id: int

    class Config:
        from_attributes = True


class OrderWithCustomer(Order):
    customer: Customer


# =======================
# Customer Document Schemas
# =======================
class CustomerDocumentBase(BaseModel):
    order_id: int
    document_name: str
    document_type: str
    document_version: str


class CustomerDocumentCreate(CustomerDocumentBase):
    document_url: Optional[str] = None


class CustomerDocumentUpdate(BaseModel):
    order_id: Optional[int] = None
    document_name: Optional[str] = None
    document_type: Optional[str] = None
    document_version: Optional[str] = None
    document_url: Optional[str] = None


class CustomerDocument(CustomerDocumentBase):
    id: int
    document_url: str

    class Config:
        from_attributes = True



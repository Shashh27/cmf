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
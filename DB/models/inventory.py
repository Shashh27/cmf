from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Text,
    TIMESTAMP,
    TIME,
    Boolean,
    Float,
    func
)
from sqlalchemy.orm import relationship
from ..database import Base


# =======================
# Raw Materials
# =======================
class RawMaterial(Base):
    __tablename__ = "raw_materials"
    __table_args__ = {'schema': 'inventory'}

    id = Column(Integer, primary_key=True, index=True)
    material_name = Column(String, nullable=False)
    material_specification = Column(String)
    mass = Column(Float)
    density = Column(Float)
    volume = Column(Float)
    stock_type = Column(String)
    quantity = Column(Integer)
    stock_dimensions = Column(String)
    status = Column(String)


# =======================
# Tools List
# =======================
class ToolsList(Base):
    __tablename__ = "tools_list"
    __table_args__ = {'schema': 'inventory'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    item_description = Column(String, nullable=True)  # Changed to nullable
    range = Column(String, nullable=True)
    identification_code = Column(String, nullable=True)  # Changed to nullable
    make = Column(String, nullable=True)
    quantity = Column(Integer, nullable=True)  # Changed to nullable
    location = Column(String, nullable=True)
    gauge = Column(String, nullable=True)
    remarks = Column(Text, nullable=True)
    amount = Column(Float, nullable=True)
    ref_ledger = Column(String, nullable=True)
    type = Column(String, nullable=True)  # Changed to nullable
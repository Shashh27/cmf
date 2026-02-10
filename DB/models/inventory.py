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


# =======================
# Inventory Requests
# =======================
class InventoryRequest(Base):
    __tablename__ = "inventory_requests"
    __table_args__ = {'schema': 'inventory'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tool_id = Column(Integer, ForeignKey("inventory.tools_list.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    purpose_of_use = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    admin_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending, approved, rejected
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    tool = relationship("ToolsList")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    admin = relationship("AccessUser", foreign_keys=[admin_id])
    project = relationship("Order")
    part = relationship("Part")
    return_requests = relationship("InventoryReturnRequest", back_populates="inventory_request")


# =======================
# Inventory Return Requests
# =======================
class InventoryReturnRequest(Base):
    __tablename__ = "inventory_return_requests"
    __table_args__ = {'schema': 'inventory'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    requested_id = Column(Integer, ForeignKey("inventory.inventory_requests.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    total_requested_qty = Column(Integer, nullable=False)
    returned_qty = Column(Integer, nullable=False, default=0)
    remarks = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    admin_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)  # Added admin_id
    status = Column(String, nullable=False, default="pending")  # pending, collected
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    inventory_request = relationship("InventoryRequest", back_populates="return_requests")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    admin = relationship("AccessUser", foreign_keys=[admin_id])  # Added admin relationship
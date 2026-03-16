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
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


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
    quantity = Column(Integer, nullable=True)  # Changed to nullable - This will be available quantity
    total_quantity = Column(Integer, nullable=True)  # New field - Original total quantity
    location = Column(String, nullable=True)
    gauge = Column(String, nullable=True)
    remarks = Column(Text, nullable=True)
    amount = Column(Float, nullable=True)
    ref_ledger = Column(String, nullable=True)
    type = Column(String, nullable=True)  # Changed to nullable
    issues_qty = Column(Integer, nullable=True)


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
    created_at = Column(TIMESTAMP, nullable=False)
    inventory_supervisor_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending, approved, rejected
    updated_at = Column(TIMESTAMP, nullable=True)

    # Relationships
    tool = relationship("ToolsList")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    inventory_supervisor = relationship("AccessUser", foreign_keys=[inventory_supervisor_id])
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
    created_at = Column(TIMESTAMP, nullable=False)
    inventory_supervisor_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)  # Added inventory_supervisor_id
    status = Column(String, nullable=False, default="pending")  # pending, collected
    updated_at = Column(TIMESTAMP, nullable=True)

    # Relationships
    inventory_request = relationship("InventoryRequest", back_populates="return_requests")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    inventory_supervisor = relationship("AccessUser", foreign_keys=[inventory_supervisor_id])  # Added inventory_supervisor relationship


# =======================
# Tool Issues (Issuance Transactions)
# =======================
class ToolIssue(Base):
    __tablename__ = "tool_issues"
    __table_args__ = {'schema': 'inventory'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tool_id = Column(Integer, ForeignKey("inventory.tools_list.id"), nullable=False)
    request_id = Column(Integer, ForeignKey("inventory.inventory_requests.id"), nullable=False)
    tool_issue_qty = Column(Integer, nullable=False)
    operator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)
    inventory_supervisor_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending, approved, rejected
    created_at = Column(TIMESTAMP, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=True)
    
    # New fields for tool issue details
    issue_category = Column(String, nullable=True)  # "wear and tear", "Calibration Drift", "other"
    description = Column(Text, nullable=True)  # Entered by operator
    remarks = Column(Text, nullable=True)  # Entered by supervisor

    # Relationships
    tool = relationship("ToolsList")
    request = relationship("InventoryRequest")
    operator = relationship("AccessUser", foreign_keys=[operator_id])
    inventory_supervisor = relationship("AccessUser", foreign_keys=[inventory_supervisor_id])
    documents = relationship("ToolIssueDocument", back_populates="tool_issue", cascade="all, delete-orphan")


# =======================
# Tool Issue Documents
# =======================
class ToolIssueDocument(Base):
    __tablename__ = "tool_issue_documents"
    __table_args__ = {'schema': 'inventory'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tool_issue_id = Column(Integer, ForeignKey("inventory.tool_issues.id"), nullable=False)
    document_url = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    # Relationships
    tool_issue = relationship("ToolIssue", back_populates="documents")

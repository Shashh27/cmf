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

# Raw Materials (MASTER TABLE - SIMPLIFIED)

# =======================

class RawMaterial(Base):

    __tablename__ = "raw_materials"

    __table_args__ = {'schema': 'inventory'}



    id = Column(Integer, primary_key=True, index=True)

    material_name = Column(String, nullable=False, unique=True)

    density = Column(Float, nullable=False)  # kg/m³

    cost_per_kg = Column(Float, nullable=True)  # Cost per kg in currency

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    # Relationships

    stock_items = relationship("RawMaterialStock", back_populates="material", cascade="all, delete-orphan")





# =======================

# Raw Material Stock (MAIN UNIFIED STOCK TABLE)

# =======================

class RawMaterialStock(Base):

    __tablename__ = "raw_material_stock"

    __table_args__ = {'schema': 'inventory'}



    id = Column(Integer, primary_key=True, index=True)

    material_id = Column(Integer, ForeignKey("inventory.raw_materials.id"), nullable=False)

    form_type = Column(String, nullable=False)  # "Round", "Square", "Pipe"

    # Dimensions (nullable based on form_type)

    diameter = Column(Float, nullable=True)  # For Round & Pipe

    length = Column(Float, nullable=True)    # For all forms

    breadth = Column(Float, nullable=True)   # For Square

    height = Column(Float, nullable=True)    # For Square

    inner_diameter = Column(Float, nullable=True)  # For Pipe

    outer_diameter = Column(Float, nullable=True)  # For Pipe (alias for diameter)

    quantity = Column(Integer, nullable=False, default=0)

    volume = Column(Float, nullable=True)    # Single unit volume in m³

    mass = Column(Float, nullable=True)      # Single unit mass in kg

    weight = Column(Float, nullable=True)    # Single unit weight in N

    cost = Column(Float, nullable=True)      # Single unit cost

    source_type = Column(String, nullable=False, default="general")  # "general" or "order"

    source_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=True)

    status = Column(String, nullable=False, default="available")

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    # Relationships

    material = relationship("RawMaterial", back_populates="stock_items")

    source_order = relationship("Order")

    usage_links = relationship("OrderPartsRawMaterialLinked", back_populates="stock_item", cascade="all, delete-orphan")



# =======================

# Vendors List

# =======================

class Vendors(Base):

    __tablename__ = "vendors"

    __table_args__ = {'schema': 'inventory'}



    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    company_name = Column(String, nullable=False, unique=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



# =======================

# Tools List

# =======================

class ToolsList(Base):

    __tablename__ = "tools_list"

    __table_args__ = {'schema': 'inventory'}

 

    id                  = Column(Integer, primary_key=True, index=True, autoincrement=True)

    item_description    = Column(String, nullable=True)

    range               = Column(String, nullable=True)

    identification_code = Column(String, nullable=True)

    make                = Column(String, nullable=True)

    quantity            = Column(Integer, nullable=True)      # available qty

    total_quantity      = Column(Integer, nullable=True)      # original total qty

    location            = Column(String, nullable=True)

    gauge               = Column(String, nullable=True)

    remarks             = Column(Text, nullable=True)

    amount              = Column(Float, nullable=True)

    ref_ledger          = Column(String, nullable=True)

    type                = Column(String, nullable=True)       # CONSUMABLES / NON-CONSUMABLES

    issues_qty          = Column(Integer, nullable=True)      # aggregate issued qty

    category            = Column(String, nullable=True)       # "Tools" / "Instruments" / "Misc"

    sub_category        = Column(String, nullable=True)       # "Drills", "Micrometers", etc.





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

    return_requests = relationship("InventoryReturnRequest", back_populates="inventory_request", cascade="all, delete-orphan")





# =======================

# Inventory Return Requests

# =======================

class InventoryReturnRequest(Base):

    __tablename__ = "inventory_return_requests"

    __table_args__ = {'schema': 'inventory'}



    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    requested_id = Column(Integer, ForeignKey("inventory.inventory_requests.id", ondelete="CASCADE"), nullable=False)

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

    request_id = Column(Integer, ForeignKey("inventory.inventory_requests.id", ondelete="CASCADE"), nullable=False)

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

    tool_issue_id = Column(Integer, ForeignKey("inventory.tool_issues.id", ondelete="CASCADE"), nullable=False)

    document_url = Column(String, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())



    # Relationships

    tool_issue = relationship("ToolIssue", back_populates="documents")


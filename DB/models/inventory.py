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

    user_id = Column(Integer, nullable=True)  # User who created this raw material

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

    process_type = Column(String, nullable=True)  # "Forging", "Barstocks", "Casting"

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

    estimated_cost = Column(Float, nullable=True)  # Estimated cost when procuring

    final_cost = Column(Float, nullable=True)      # Final cost when received

    source_type = Column(String, nullable=False, default="general")  # "general" or "order"

    source_order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=True)

    order_status = Column(String, nullable=True)  # "enquiry", "purchase_request", "purchase_order", "received", etc.

    # New columns for linking parts, vendors, and tracking who created
    part_id = Column(String, nullable=True)  # Can be single ID or comma-separated IDs like "1,2,3"
    
    vendor_id = Column(String, nullable=True)  # Store comma-separated vendor IDs for enquiry: "1,2,3"
    
    received_vendor_id = Column(Integer, ForeignKey("inventory.vendors.id"), nullable=True)  # Final vendor who received the order

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    status = Column(String, nullable=False, default="available")
    
    allocated_quantity = Column(Integer, nullable=False, default=0)  # Quantity allocated to parts
    
    available_quantity = Column(Integer, nullable=False, default=0)  # Quantity available for use

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    # Relationships

    material = relationship("RawMaterial", back_populates="stock_items")

    source_order = relationship("Order")

    vendor = relationship("Vendors", foreign_keys=[received_vendor_id])

    creator = relationship("AccessUser", foreign_keys=[user_id])
    
    # 🔥 NEW
    units = relationship("RawMaterialUnit", back_populates="stock", cascade="all, delete-orphan")
    
    @property
    def calculated_status(self):
        """Calculate status based on available_quantity and source type"""
        if self.source_type == "general":
            # For general stock: available only if available_quantity > 0
            return "available" if self.available_quantity > 0 else "exhausted"
        elif self.source_type == "order":
            # For order stock: available only if order_status = "received" AND available_quantity > 0
            if self.available_quantity <= 0:
                return "exhausted"
            elif self.order_status == "received":
                return "available"
            else:
                return self.order_status or "pending"  # Show order status if not received
        else:
            return self.status  # Fallback to stored status



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


# =======================

# 🔥 Raw Material Unit (CORE TABLE)

# =======================

class RawMaterialUnit(Base):

    __tablename__ = "raw_material_units"

    __table_args__ = {'schema': 'inventory'}



    id = Column(Integer, primary_key=True, index=True)

    stock_id = Column(Integer, ForeignKey("inventory.raw_material_stock.id"), nullable=False)



    # 🔥 PER UNIT TRACKING

    total_length = Column(Float, nullable=False)

    remaining_length = Column(Float, nullable=False)



    # 🔥 PER UNIT CALCULATIONS (IMPORTANT)

    volume = Column(Float, nullable=True)

    mass = Column(Float, nullable=True)

    weight = Column(Float, nullable=True)

    cost = Column(Float, nullable=True)



    status = Column(String, nullable=False, default="available")  # available / exhausted



    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    # RELATIONS

    stock = relationship("RawMaterialStock", back_populates="units")

    usages = relationship("RawMaterialUsage", back_populates="unit", cascade="all, delete-orphan")
    
    parts = relationship("Part", back_populates="material_unit")



# =======================

# 🔥 Raw Material Usage (TRACKING TABLE)

# =======================

class RawMaterialUsage(Base):

    __tablename__ = "raw_material_usage"

    __table_args__ = {'schema': 'inventory'}



    id = Column(Integer, primary_key=True, index=True)

    raw_material_unit_id = Column(Integer, ForeignKey("inventory.raw_material_units.id"), nullable=False)

    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)  # User who linked the material



    used_length = Column(Float, nullable=False)



    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)



    # RELATIONS

    unit = relationship("RawMaterialUnit", back_populates="usages")

    part = relationship("Part", back_populates="material_usages")

    user = relationship("AccessUser", foreign_keys=[user_id])


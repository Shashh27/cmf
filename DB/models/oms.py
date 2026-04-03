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

    func,

    text

)

from sqlalchemy.orm import relationship

from ..database import Base





# =======================

# Product

# =======================

class Product(Base):

    __tablename__ = "products"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    product_name = Column(String, nullable=False)

    product_version = Column(String, nullable=False)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    assemblies = relationship("Assembly", back_populates="product", cascade="all, delete-orphan")

    parts = relationship("Part", back_populates="product", cascade="all, delete-orphan")

    orders = relationship("Order", back_populates="product")

    user = relationship("AccessUser")





# =======================

# Assembly (Self-referencing)

# =======================

class Assembly(Base):

    __tablename__ = "assemblies"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    assembly_name = Column(String, nullable=False)

    assembly_number = Column(String, nullable=False)



    product_id = Column(Integer, ForeignKey("oms.products.id"))

    parent_id = Column(Integer, ForeignKey("oms.assemblies.id"), nullable=True)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    product = relationship("Product", back_populates="assemblies")

    parts = relationship("Part", back_populates="assembly", cascade="all, delete-orphan")

    documents = relationship("Document", back_populates="assembly", cascade="all, delete-orphan")

    user = relationship("AccessUser")



    @property

    def user_name(self):

        return self.user.user_name if self.user else None



    parent = relationship("Assembly", remote_side=[id])

    children = relationship("Assembly", cascade="all, delete-orphan", overlaps="parent")





# =======================

# Part Type

# =======================

class PartType(Base):

    __tablename__ = "part_types"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    type_name = Column(String, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    parts = relationship("Part", back_populates="type")

    operations = relationship("Operation", back_populates="part_type")

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    user = relationship("AccessUser")





# =======================

# Part

# =======================

class Part(Base):

    __tablename__ = "parts"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    part_name = Column(String, nullable=False)

    part_number = Column(String, unique=True, nullable=False)



    type_id = Column(Integer, ForeignKey("oms.part_types.id"))

    raw_material_id = Column(Integer, ForeignKey("inventory.raw_materials.id"))

    part_detail = Column(String, nullable=True)  # For out-source: WITH_RAW_MATERIAL | WITHOUT_RAW_MATERIAL

    assembly_id = Column(Integer, ForeignKey("oms.assemblies.id"), nullable=True)

    product_id = Column(Integer, ForeignKey("oms.products.id"))

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    size = Column(String, nullable=True)  # Optional size field (e.g., "25x25x160", "Ø210x110", "Tyre Coupling F160 Type:B")

    qty = Column(Integer, nullable=True, default=1)  # Optional quantity field, defaults to 1

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    type = relationship("PartType", back_populates="parts")

    raw_material = relationship("RawMaterial")

    assembly = relationship("Assembly", back_populates="parts")

    product = relationship("Product", back_populates="parts")

    user = relationship("AccessUser")



    @property

    def user_name(self):

        return self.user.user_name if self.user else None



    operations = relationship("Operation", back_populates="part", cascade="all, delete-orphan")

    documents = relationship("Document", back_populates="part", cascade="all, delete-orphan")

    tools = relationship("ToolWithPart", back_populates="part", cascade="all, delete-orphan")

    raw_material_links = relationship("OrderPartsRawMaterialLinked", back_populates="part", cascade="all, delete-orphan")



# =======================

# Operation

# =======================

class Operation(Base):

    __tablename__ = "operations"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    operation_number = Column(String, nullable=False)

    operation_name = Column(String, nullable=False)



    part_type_id = Column(Integer, ForeignKey("oms.part_types.id"), nullable=False, server_default=text("1"))

    from_date = Column(TIMESTAMP(timezone=True), nullable=True)

    to_date = Column(TIMESTAMP(timezone=True), nullable=True)



    setup_time = Column(TIME)

    cycle_time = Column(TIME)

    workcenter_id = Column(Integer)

    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=True)



    part_id = Column(Integer, ForeignKey("oms.parts.id"))

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)



    work_instructions = Column(Text, nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    part = relationship("Part", back_populates="operations")

    part_type = relationship("PartType", back_populates="operations")

    machine = relationship("DB.models.configuration.Machine")

    user = relationship("AccessUser")

    operation_documents = relationship("OperationDocument", back_populates="operation", cascade="all, delete-orphan")

    tools = relationship("ToolWithPart", back_populates="operation", cascade="all, delete-orphan")



    @property

    def user_name(self):

        return self.user.user_name if self.user else None









# =======================

# Documents (Self-referencing)

# =======================

class Document(Base):

    __tablename__ = "documents"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    document_name = Column(String, nullable=False)

    document_url = Column(String, nullable=False)  # MinIO URL will be stored here

    document_type = Column(String, nullable=False)

    document_version = Column(String, nullable=False)



    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=True)

    assembly_id = Column(Integer, ForeignKey("oms.assemblies.id"), nullable=True)

    parent_id = Column(Integer, ForeignKey("oms.documents.id"), nullable=True)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    part = relationship("Part", back_populates="documents")

    assembly = relationship("Assembly", back_populates="documents")

    parent = relationship("Document", remote_side=[id])

    user = relationship("AccessUser")





# =======================

# Tool With Part

# =======================

class ToolWithPart(Base):

    __tablename__ = "tools_with_part"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    tool_id = Column(Integer, ForeignKey("inventory.tools_list.id"), nullable=False)

    part_id = Column(Integer, ForeignKey("oms.parts.id"))

    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=True)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    part = relationship("Part", back_populates="tools")

    tool = relationship("DB.models.inventory.ToolsList")

    operation = relationship("Operation", back_populates="tools")

    user = relationship("AccessUser")







# =======================

# Order

# =======================

class Order(Base):

    __tablename__ = "orders"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    sale_order_number = Column(String, unique=True, nullable=False)

    order_date = Column(TIMESTAMP, nullable=True)

    customer_id = Column(Integer, ForeignKey("configuration.customers.id"), nullable=False)

    product_id = Column(Integer, ForeignKey("oms.products.id"), nullable=False)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)  # creator (PC or admin)

    project_coordinator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    admin_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    manufacturing_coordinator_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    quantity = Column(Integer, nullable=False)

    due_date = Column(TIMESTAMP, nullable=True)

    status = Column(String, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    customer = relationship("Customer", back_populates="orders")

    product = relationship("Product", back_populates="orders")

    user = relationship("AccessUser", foreign_keys=[user_id])

    project_coordinator = relationship("AccessUser", foreign_keys=[project_coordinator_id])

    admin = relationship("AccessUser", foreign_keys=[admin_id])

    manufacturing_coordinator = relationship("AccessUser", foreign_keys=[manufacturing_coordinator_id])

    order_documents = relationship("OrderDocument", back_populates="order", cascade="all, delete-orphan")

    raw_material_links = relationship("OrderPartsRawMaterialLinked", back_populates="order", cascade="all, delete-orphan")

    part_priorities = relationship("OrderPartPriority", back_populates="order", cascade="all, delete-orphan")



    # Kept for backward compatibility in code that still expects an

    # attribute named project_name, but the actual database column has

    # been dropped. Always returns None.

    @property

    def project_name(self):

        return None



# =======================

# Order Document

# =======================

class OrderDocument(Base):

    __tablename__ = "order_documents"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)

    document_name = Column(String, nullable=False)

    document_url = Column(String, nullable=False)

    document_type = Column(String, nullable=False)

    document_version = Column(String, nullable=False)

    parent_id = Column(Integer, ForeignKey("oms.order_documents.id"), nullable=True)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    order = relationship("Order", back_populates="order_documents")

    parent = relationship("OrderDocument", remote_side=[id])

    user = relationship("AccessUser")







# =======================

# Operation Document

# =======================

class OperationDocument(Base):

    __tablename__ = "operation_documents"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    document_name = Column(String, nullable=False)

    document_url = Column(String, nullable=False)

    document_type = Column(String, nullable=False)

    document_version = Column(String, nullable=False)

    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=False)

    parent_id = Column(Integer, ForeignKey("oms.operation_documents.id"), nullable=True)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    # Relationships

    operation = relationship("Operation", back_populates="operation_documents")

    parent = relationship("OperationDocument", remote_side=[id])

    user = relationship("AccessUser")





# =======================

# Order Parts Raw Material Linked

# =======================

class OrderPartsRawMaterialLinked(Base):

    __tablename__ = "order_parts_raw_material_linked"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    stock_id = Column(Integer, ForeignKey("inventory.raw_material_stock.id"), nullable=False)

    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)

    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)

    used_quantity = Column(Integer, nullable=False, default=1)  # Quantity used from this stock

    linkage_group_id = Column(String, nullable=True)  # Segregates demand batches (e.g. 20 kg vs 5 kg)

    # Procurement fields
    is_procurement = Column(Boolean, nullable=False, default=False)  # True if this is a procurement request
    procurement_quantity = Column(Integer, nullable=True)  # Quantity to procure
    procurement_weight = Column(Float, nullable=True)  # Weight in kg to procure
    vendor_id = Column(Integer, ForeignKey("inventory.vendors.id"), nullable=True)  # Selected vendor
    procurement_status = Column(String, nullable=False, default="pending")  # pending, ordered, received

     # Manufacturing coordinator responsible for this linkage (optional)

    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    # Relationships

    stock_item = relationship("RawMaterialStock", back_populates="usage_links")

    part = relationship("Part")

    order = relationship("Order")

    user = relationship("AccessUser")

    vendor = relationship("Vendors")





# =======================

# Order Part Priority

# =======================

class OrderPartPriority(Base):

    __tablename__ = "order_part_priorities"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)

    product_id = Column(Integer, ForeignKey("oms.products.id"), nullable=False)

    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)

    priority = Column(Integer, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    order = relationship("Order", back_populates="part_priorities")

    product = relationship("Product")

    part = relationship("Part")





# =======================

# Document Extracted Data

# =======================

class DocumentExtractedData(Base):

    __tablename__ = "document_extracted_data"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True)

    document_id = Column(Integer, ForeignKey("oms.documents.id"), nullable=False)

    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)

    note = Column(Text, nullable=True)

    title = Column(String, nullable=True)

    stock_size = Column(String, nullable=True)

    material = Column(String, nullable=True)

    stocksize_kg = Column(String, nullable=True)

    net_wt_kg = Column(String, nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)



    document = relationship("Document")

    part = relationship("Part")





# =======================

# Out Source Part Status

# =======================

class OutSourcePartStatus(Base):

    __tablename__ = "out_source_parts_status"

    __table_args__ = {'schema': 'oms'}



    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)

    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)

    start_date = Column(TIMESTAMP(timezone=True), nullable=True)

    to_date = Column(TIMESTAMP(timezone=True), nullable=True)

    status = Column(String, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



    part = relationship("Part")

    order = relationship("Order")


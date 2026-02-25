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
# Product
# =======================
class Product(Base):
    __tablename__ = "products"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, nullable=False)
    product_number = Column(String, unique=True, nullable=False)
    product_version = Column(String, nullable=False)

    assemblies = relationship("Assembly", back_populates="product")
    parts = relationship("Part", back_populates="product")
    orders = relationship("Order", back_populates="product")


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

    product = relationship("Product", back_populates="assemblies")
    parts = relationship("Part", back_populates="assembly")

    parent = relationship("Assembly", remote_side=[id])


# =======================
# Part Type
# =======================
class PartType(Base):
    __tablename__ = "part_types"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)
    type_name = Column(String, nullable=False)

    parts = relationship("Part", back_populates="type")


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
    assembly_id = Column(Integer, ForeignKey("oms.assemblies.id"), nullable=True)
    product_id = Column(Integer, ForeignKey("oms.products.id"))

    type = relationship("PartType", back_populates="parts")
    raw_material = relationship("RawMaterial")
    assembly = relationship("Assembly", back_populates="parts")
    product = relationship("Product", back_populates="parts")

    operations = relationship("Operation", back_populates="part")
    documents = relationship("Document", back_populates="part")
    tools = relationship("ToolWithPart", back_populates="part")
    raw_material_links = relationship("OrderPartsRawMaterialLinked", back_populates="part")

# =======================
# Operation
# =======================
class Operation(Base):
    __tablename__ = "operations"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)
    operation_number = Column(String, nullable=False)
    operation_name = Column(String, nullable=False)

    setup_time = Column(TIME)
    cycle_time = Column(TIME)
    workcenter_id = Column(Integer)

    part_id = Column(Integer, ForeignKey("oms.parts.id"))

    part = relationship("Part", back_populates="operations")
    process_plan = relationship("ProcessPlan", back_populates="operation", uselist=False)
    operation_documents = relationship("OperationDocument", back_populates="operation")


# =======================
# Process Plan
# =======================
class ProcessPlan(Base):
    __tablename__ = "process_plans"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)
    operation_id = Column(Integer, ForeignKey("oms.operations.id"))
    work_instructions = Column(Text)
    notes = Column(Text)

    operation = relationship("Operation", back_populates="process_plan")


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

    part_id = Column(Integer, ForeignKey("oms.parts.id"))
    parent_id = Column(Integer, ForeignKey("oms.documents.id"), nullable=True)

    part = relationship("Part", back_populates="documents")
    parent = relationship("Document", remote_side=[id])


# =======================
# Tool With Part
# =======================
class ToolWithPart(Base):
    __tablename__ = "tools_with_part"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)
    tool_id = Column(Integer, nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"))

    part = relationship("Part", back_populates="tools")



# =======================
# Order
# =======================
class Order(Base):
    __tablename__ = "orders"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)
    sale_order_number = Column(String, unique=True, nullable=False, index=True) # updated 
    customer_id = Column(Integer, ForeignKey("configuration.customers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("oms.products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    due_date = Column(TIMESTAMP, nullable=False)
    # priority = Column(Integer, nullable=False)
    # supervisor_id = Column(Integer, nullable=False)
    status = Column(String, nullable=False)

    customer = relationship("Customer", back_populates="orders")
    product = relationship("Product", back_populates="orders")
    order_documents = relationship("OrderDocument", back_populates="order")
    raw_material_links = relationship("OrderPartsRawMaterialLinked", back_populates="order")
    
    part_schedule_status = relationship("PartScheduleStatus", back_populates="order")
    # order_schedule_status = relationship("OrderScheduleStatus", back_populates="order", uselist=False)

# =======================
# Order Document
# =======================
class OrderDocument(Base):
    __tablename__ = "order_documents"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)  
    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False) # 
    document_name = Column(String, nullable=False)
    document_url = Column(String, nullable=False)
    document_type = Column(String, nullable=False)
    document_version = Column(String, nullable=False)

    order = relationship("Order", back_populates="order_documents")



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

    # Relationships
    operation = relationship("Operation", back_populates="operation_documents")


# =======================
# Order Parts Raw Material Linked
# =======================
class OrderPartsRawMaterialLinked(Base):
    __tablename__ = "order_parts_raw_material_linked"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    raw_material_id = Column(Integer, ForeignKey("inventory.raw_materials.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("oms.orders.id"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)

    # Relationships
    raw_material = relationship("RawMaterial")
    part = relationship("Part")
    order = relationship("Order")
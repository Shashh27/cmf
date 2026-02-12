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
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=True)

    part_id = Column(Integer, ForeignKey("oms.parts.id"))

    work_instructions = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    part = relationship("Part", back_populates="operations")
    machine = relationship("DB.models.configuration.Machine")
    operation_documents = relationship("OperationDocument", back_populates="operation")




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
    tool_id = Column(Integer, ForeignKey("inventory.tools_list.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("oms.parts.id"))
    operation_id = Column(Integer, ForeignKey("oms.operations.id"), nullable=True)

    part = relationship("Part", back_populates="tools")
    tool = relationship("DB.models.inventory.ToolsList")
    operation = relationship("Operation")



# =======================
# Order
# =======================
class Order(Base):
    __tablename__ = "orders"
    __table_args__ = {'schema': 'oms'}

    id = Column(Integer, primary_key=True, index=True)
    sale_order_number = Column(String, nullable=False)
    project_name = Column(String, nullable=True)
    order_date = Column(TIMESTAMP, nullable=True)
    customer_id = Column(Integer, ForeignKey("configuration.customers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("oms.products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    due_date = Column(TIMESTAMP, nullable=False)
    status = Column(String, nullable=False)

    customer = relationship("Customer", back_populates="orders")
    product = relationship("Product", back_populates="orders")
    order_documents = relationship("OrderDocument", back_populates="order")
    raw_material_links = relationship("OrderPartsRawMaterialLinked", back_populates="order")
    part_priorities = relationship("OrderPartPriority", back_populates="order")

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

    order = relationship("Order", back_populates="order_documents")
    parent = relationship("OrderDocument", remote_side=[id])



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

    # Relationships
    operation = relationship("Operation", back_populates="operation_documents")
    parent = relationship("OperationDocument", remote_side=[id])


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

    order = relationship("Order", back_populates="part_priorities")
    product = relationship("Product")
    part = relationship("Part")

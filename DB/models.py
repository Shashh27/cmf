from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Text,
    TIMESTAMP,
    TIME
)
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


# =======================
# Product
# =======================
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, nullable=False)
    product_number = Column(String, unique=True, nullable=False)
    product_version = Column(String, nullable=False)

    assemblies = relationship("Assembly", back_populates="product")
    parts = relationship("Part", back_populates="product")


# =======================
# Assembly (Self-referencing)
# =======================
class Assembly(Base):
    __tablename__ = "assemblies"

    id = Column(Integer, primary_key=True, index=True)
    assembly_name = Column(String, nullable=False)
    assembly_number = Column(String, nullable=False)

    product_id = Column(Integer, ForeignKey("products.id"))
    parent_id = Column(Integer, ForeignKey("assemblies.id"), nullable=True)

    product = relationship("Product", back_populates="assemblies")
    parts = relationship("Part", back_populates="assembly")

    parent = relationship("Assembly", remote_side=[id])


# =======================
# Part Type
# =======================
class PartType(Base):
    __tablename__ = "part_types"

    id = Column(Integer, primary_key=True, index=True)
    type_name = Column(String, nullable=False)

    parts = relationship("Part", back_populates="type")


# =======================
# Part
# =======================
class Part(Base):
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True, index=True)
    part_name = Column(String, nullable=False)
    part_number = Column(String, unique=True, nullable=False)

    type_id = Column(Integer, ForeignKey("part_types.id"))
    raw_material_id = Column(Integer)
    assembly_id = Column(Integer, ForeignKey("assemblies.id"), nullable=True)
    product_id = Column(Integer, ForeignKey("products.id"))

    type = relationship("PartType", back_populates="parts")
    assembly = relationship("Assembly", back_populates="parts")
    product = relationship("Product", back_populates="parts")

    operations = relationship("Operation", back_populates="part")
    documents = relationship("Document", back_populates="part")
    tools = relationship("ToolWithPart", back_populates="part")


# =======================
# Operation
# =======================
class Operation(Base):
    __tablename__ = "operations"

    id = Column(Integer, primary_key=True, index=True)
    operation_number = Column(String, nullable=False)
    operation_name = Column(String, nullable=False)

    setup_time = Column(TIME)
    cycle_time = Column(TIME)
    workcenter_id = Column(Integer)

    part_id = Column(Integer, ForeignKey("parts.id"))

    part = relationship("Part", back_populates="operations")
    process_plan = relationship("ProcessPlan", back_populates="operation", uselist=False)


# =======================
# Process Plan
# =======================
class ProcessPlan(Base):
    __tablename__ = "process_plans"

    id = Column(Integer, primary_key=True, index=True)
    operation_id = Column(Integer, ForeignKey("operations.id"))
    work_instructions = Column(Text)
    notes = Column(Text)

    operation = relationship("Operation", back_populates="process_plan")


# =======================
# Documents (Self-referencing)
# =======================
class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    document_name = Column(String, nullable=False)
    document_url = Column(String, nullable=False)  # MinIO URL will be stored here
    document_type = Column(String, nullable=False)
    document_version = Column(String, nullable=False)

    part_id = Column(Integer, ForeignKey("parts.id"))
    parent_id = Column(Integer, ForeignKey("documents.id"), nullable=True)

    part = relationship("Part", back_populates="documents")
    parent = relationship("Document", remote_side=[id])


# =======================
# Tool With Part
# =======================
class ToolWithPart(Base):
    __tablename__ = "tools_with_part"

    id = Column(Integer, primary_key=True, index=True)
    tool_id = Column(Integer, nullable=False)
    part_id = Column(Integer, ForeignKey("parts.id"))

    part = relationship("Part", back_populates="tools")


# =======================
# Customer
# =======================
class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    branch = Column(String, nullable=False)
    email = Column(String, nullable=False)
    contact_number = Column(String, nullable=False)
    contact_person = Column(String, nullable=False)

    orders = relationship("Order", back_populates="customer")


# =======================
# Order
# =======================
class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    sale_order_number = Column(String, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    product_id = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    due_date = Column(TIMESTAMP, nullable=False)
    priority = Column(Integer, nullable=False)
    supervisor_id = Column(Integer, nullable=False)
    status = Column(String, nullable=False)

    customer = relationship("Customer", back_populates="orders")
    customer_documents = relationship("CustomerDocument", back_populates="order")


# =======================
# Customer Document
# =======================
class CustomerDocument(Base):
    __tablename__ = "customer_documents"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    document_name = Column(String, nullable=False)
    document_url = Column(String, nullable=False)
    document_type = Column(String, nullable=False)
    document_version = Column(String, nullable=False)

    order = relationship("Order", back_populates="customer_documents")
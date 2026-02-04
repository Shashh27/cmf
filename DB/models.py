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
    orders = relationship("Order", back_populates="product")


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
    raw_material_id = Column(Integer, ForeignKey("raw_materials.id"))
    assembly_id = Column(Integer, ForeignKey("assemblies.id"), nullable=True)
    product_id = Column(Integer, ForeignKey("products.id"))

    type = relationship("PartType", back_populates="parts")
    raw_material = relationship("RawMaterial")
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
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    due_date = Column(TIMESTAMP, nullable=False)
    priority = Column(Integer, nullable=False)
    supervisor_id = Column(Integer, nullable=False)
    status = Column(String, nullable=False)

    customer = relationship("Customer", back_populates="orders")
    product = relationship("Product", back_populates="orders")
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


# =======================
# Raw Materials
# =======================
class RawMaterial(Base):
    __tablename__ = "raw_materials"

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
# Order Parts Raw Material Linked
# =======================
class OrderPartsRawMaterialLinked(Base):
    __tablename__ = "order_parts_raw_material_linked"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    raw_material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)

    # Relationships
    raw_material = relationship("RawMaterial")
    part = relationship("Part")
    order = relationship("Order")


# =======================
# Work Center
# =======================
class WorkCenter(Base):
    __tablename__ = "work_centers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False)
    work_center_name = Column(String, nullable=False)
    description = Column(String)
    is_schedulable = Column(Boolean, default=True)

    machines = relationship("Machine", back_populates="work_center")


# =======================
# Machine
# =======================
class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    work_center_id = Column(Integer, ForeignKey("work_centers.id"), nullable=False)
    type = Column(String, nullable=False)
    make = Column(String)
    model = Column(String)
    year_of_installation = Column(Integer)
    cnc_controller = Column(String)
    cnc_controller_service = Column(String)
    remarks = Column(String)
    calibration_date = Column(TIMESTAMP)
    calibration_due_date = Column(TIMESTAMP)

    work_center = relationship("WorkCenter", back_populates="machines")
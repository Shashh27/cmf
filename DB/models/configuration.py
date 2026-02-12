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
# Work Center
# =======================
class WorkCenter(Base):
    __tablename__ = "work_centers"
    __table_args__ = {'schema': 'configuration'}

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
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True)
    work_center_id = Column(Integer, ForeignKey("configuration.work_centers.id"), nullable=False)
    type = Column(String, nullable=False)
    make = Column(String)
    model = Column(String)
    year_of_installation = Column(Integer)
    cnc_controller = Column(String)
    cnc_controller_service = Column(String)
    remarks = Column(String)
    calibration_date = Column(TIMESTAMP)
    calibration_due_date = Column(TIMESTAMP)
    password = Column(String, nullable=False)

    work_center = relationship("WorkCenter", back_populates="machines")


# =======================
# Customer
# =======================
class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = {'schema': 'configuration'}

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    branch = Column(String, nullable=False)
    email = Column(String, nullable=False)
    contact_number = Column(String, nullable=False)
    contact_person = Column(String, nullable=False)

    orders = relationship("Order", back_populates="customer")
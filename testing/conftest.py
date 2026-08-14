"""
Test configuration and fixtures for dynamic scheduling tests.
"""
import pytest
from datetime import datetime, time, timedelta, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# Import models
from DB.models.oms import (
    Order, Part, Product, Operation, OrderPartPriority,
    PartType, OutSourceOperationStatus
)
from DB.models.configuration import Machine, WorkCenter
from DB.models.scheduling import (
    OrderScheduleStatus, PartScheduleStatus, ScheduleHistory,
    PlannedScheduleItem, ShiftHoursConfiguration, ShiftTimingConfiguration,
    MachineStatus, EfficiencyFactor, Rescheduling, ProductionLog
)
from DB.models.inventory import RawMaterialUsage
from DB.models.inventory import RawMaterial

# Test database URL (in-memory SQLite)
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def db_engine():
    """Create a test database engine."""
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    return engine

@pytest.fixture(scope="function")
def db_session(db_engine):
    """Create a test database session with only scheduling-related tables."""
    from DB.database import Base
    from sqlalchemy import inspect, Table, Column, Integer, String, DateTime, Float, Boolean, Time, Date, ForeignKey, UniqueConstraint
    from sqlalchemy.orm import declarative_base
    
    # Create a minimal base for testing without schemas
    TestBase = declarative_base()
    
    # Define minimal test models (schema-less for SQLite compatibility)
    class TestProduct(TestBase):
        __tablename__ = 'products'
        id = Column(Integer, primary_key=True)
        product_name = Column(String)
        product_code = Column(String)
    
    class TestPartType(TestBase):
        __tablename__ = 'part_types'
        id = Column(Integer, primary_key=True)
        type_name = Column(String)
    
    class TestPart(TestBase):
        __tablename__ = 'parts'
        id = Column(Integer, primary_key=True)
        product_id = Column(Integer, ForeignKey('products.id'))
        part_number = Column(String)
        part_name = Column(String)
        type_id = Column(Integer, ForeignKey('part_types.id'))
        qty = Column(Integer)
    
    class TestOrder(TestBase):
        __tablename__ = 'orders'
        id = Column(Integer, primary_key=True)
        sale_order_number = Column(String)
        product_id = Column(Integer, ForeignKey('products.id'))
        quantity = Column(Integer)
        due_date = Column(DateTime)
        status = Column(String)
    
    class TestOperation(TestBase):
        __tablename__ = 'operations'
        id = Column(Integer, primary_key=True)
        part_id = Column(Integer, ForeignKey('parts.id'))
        operation_number = Column(String)
        setup_time = Column(Time)
        cycle_time = Column(Time)
        workcenter_id = Column(Integer)
        machine_id = Column(Integer)
        part_type_id = Column(Integer)
        from_date = Column(DateTime)
        to_date = Column(DateTime)
    
    class TestOrderPartPriority(TestBase):
        __tablename__ = 'order_part_priorities'
        id = Column(Integer, primary_key=True)
        order_id = Column(Integer, ForeignKey('orders.id'))
        product_id = Column(Integer)
        part_id = Column(Integer, ForeignKey('parts.id'))
        priority = Column(Integer)
        status = Column(String)
    
    class TestWorkCenter(TestBase):
        __tablename__ = 'work_centers'
        id = Column(Integer, primary_key=True)
        work_center_name = Column(String)
        code = Column(String)
        is_schedulable = Column(Boolean)
    
    class TestMachine(TestBase):
        __tablename__ = 'machines'
        id = Column(Integer, primary_key=True)
        work_center_id = Column(Integer, ForeignKey('work_centers.id'))
        type = Column(String)
        make = Column(String)
        model = Column(String)
    
    class TestOrderScheduleStatus(TestBase):
        __tablename__ = 'order_schedule_status'
        id = Column(Integer, primary_key=True)
        order_id = Column(Integer, ForeignKey('orders.id'))
        product_id = Column(Integer)
        status = Column(String)
        activated_at = Column(DateTime)
    
    class TestPartScheduleStatus(TestBase):
        __tablename__ = 'part_schedule_status'
        id = Column(Integer, primary_key=True)
        sale_order_id = Column(Integer, ForeignKey('orders.id'))
        part_id = Column(Integer, ForeignKey('parts.id'))
        status = Column(String)
        start_date = Column(DateTime)
    
    class TestScheduleHistory(TestBase):
        __tablename__ = 'schedule_history'
        id = Column(Integer, primary_key=True)
        version = Column(Integer)
        is_active = Column(Boolean)
        generated_at = Column(DateTime)
    
    class TestPlannedScheduleItem(TestBase):
        __tablename__ = 'planned_schedule_items'
        id = Column(Integer, primary_key=True)
        part_id = Column(Integer, ForeignKey('parts.id'))
        part_number = Column(String)
        sale_order_id = Column(Integer, ForeignKey('orders.id'))
        sale_order_number = Column(String)
        operation_id = Column(Integer, ForeignKey('operations.id'))
        machine_id = Column(Integer, ForeignKey('machines.id'))
        planned_start_time = Column(DateTime)
        planned_end_time = Column(DateTime)
        total_quantity = Column(Integer)
        remaining_quantity = Column(Integer)
        status = Column(String)
        schedule_history_id = Column(Integer, ForeignKey('schedule_history.id'))
    
    class TestShiftHoursConfiguration(TestBase):
        __tablename__ = 'shift_hours_configuration'
        id = Column(Integer, primary_key=True)
        date = Column(Date)
        working_day = Column(Boolean)
        number_of_shifts = Column(Integer)
    
    class TestShiftTimingConfiguration(TestBase):
        __tablename__ = 'shift_timing_configuration'
        id = Column(Integer, primary_key=True)
        shift_config_id = Column(Integer, ForeignKey('shift_hours_configuration.id'))
        shift_code = Column(String)
        shift_start = Column(Time)
        shift_end = Column(Time)
    
    class TestMachineStatus(TestBase):
        __tablename__ = 'machine_status'
        id = Column(Integer, primary_key=True)
        machine_id = Column(Integer, ForeignKey('machines.id'))
        status_id = Column(Integer)
        available_from = Column(DateTime)
        available_to = Column(DateTime)
    
    class TestEfficiencyFactor(TestBase):
        __tablename__ = 'efficiency_factor'
        id = Column(Integer, primary_key=True)
        efficiency_factor = Column(Float)
    
    class TestRescheduling(TestBase):
        __tablename__ = 'rescheduling_items'
        id = Column(Integer, primary_key=True)
        order_id = Column(Integer, ForeignKey('orders.id'))
        order_number = Column(String)
        part_id = Column(Integer, ForeignKey('parts.id'))
        part_number = Column(String)
        operation_id = Column(Integer, ForeignKey('operations.id'))
        operation_number = Column(String)
        machine_id = Column(Integer, ForeignKey('machines.id'))
        start_time = Column(DateTime)
        end_time = Column(DateTime)
        total_qty = Column(Integer)
        completed_qty = Column(Integer)
        remaining_qty = Column(Integer)
        status = Column(String)
        schedule_version = Column(Integer)
    
    class TestProductionLog(TestBase):
        __tablename__ = 'production_logs'
        id = Column(Integer, primary_key=True)
        operation_id = Column(Integer, ForeignKey('operations.id'))
        operator_id = Column(Integer)
        from_date = Column(Date)
        from_time = Column(Time)
        to_date = Column(Date)
        to_time = Column(Time)
        status = Column(String)
        operator_status = Column(String)
        approved_quantity = Column(Integer)
        remaining_quantity_to_be_produced = Column(Integer)

    class TestOperationStatus(TestBase):
        __tablename__ = 'operation_status'
        id = Column(Integer, primary_key=True)
        order_id = Column(Integer)
        part_id = Column(Integer)
        operation_id = Column(Integer)
        operator_id = Column(Integer)
        status = Column(String)
        started_at = Column(DateTime)
        completed_at = Column(DateTime)
    
    class TestRawMaterial(TestBase):
        __tablename__ = 'raw_materials'
        id = Column(Integer, primary_key=True)
        material_name = Column(String)
        material_code = Column(String)
        status = Column(String)
        quantity = Column(Integer)
    
    class TestRawMaterialUsage(TestBase):
        __tablename__ = 'raw_material_usage'
        id = Column(Integer, primary_key=True)
        part_id = Column(Integer, ForeignKey('parts.id'))
        raw_material_id = Column(Integer, ForeignKey('raw_materials.id'))
        quantity = Column(Integer)
    
    class TestOutSourceOperationStatus(TestBase):
        __tablename__ = 'out_source_operation_status'
        id = Column(Integer, primary_key=True)
        part_id = Column(Integer, ForeignKey('parts.id'))
        order_id = Column(Integer, ForeignKey('orders.id'))
        operation_id = Column(Integer, ForeignKey('operations.id'))
        status = Column(String)
        delivered_date = Column(DateTime)
    
    # Create all tables
    TestBase.metadata.create_all(bind=db_engine)
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = SessionLocal()
    
    # Store test models in session for access in tests
    session.test_models = {
        'Product': TestProduct,
        'PartType': TestPartType,
        'Part': TestPart,
        'Order': TestOrder,
        'Operation': TestOperation,
        'OrderPartPriority': TestOrderPartPriority,
        'WorkCenter': TestWorkCenter,
        'Machine': TestMachine,
        'OrderScheduleStatus': TestOrderScheduleStatus,
        'PartScheduleStatus': TestPartScheduleStatus,
        'ScheduleHistory': TestScheduleHistory,
        'PlannedScheduleItem': TestPlannedScheduleItem,
        'ShiftHoursConfiguration': TestShiftHoursConfiguration,
        'ShiftTimingConfiguration': TestShiftTimingConfiguration,
        'MachineStatus': TestMachineStatus,
        'EfficiencyFactor': TestEfficiencyFactor,
        'Rescheduling': TestRescheduling,
        'ProductionLog': TestProductionLog,
        'OperationStatus': TestOperationStatus,
        'RawMaterial': TestRawMaterial,
        'RawMaterialUsage': TestRawMaterialUsage,
        'OutSourceOperationStatus': TestOutSourceOperationStatus,
    }
    
    yield session
    
    session.close()
    TestBase.metadata.drop_all(bind=db_engine)

@pytest.fixture
def sample_workcenter(db_session: Session):
    """Create a sample work center."""
    WorkCenter = db_session.test_models['WorkCenter']
    wc = WorkCenter(
        work_center_name="Test WorkCenter",
        code="TWC",
        is_schedulable=True
    )
    db_session.add(wc)
    db_session.commit()
    db_session.refresh(wc)
    return wc

@pytest.fixture
def sample_machine(db_session: Session, sample_workcenter):
    """Create a sample machine."""
    Machine = db_session.test_models['Machine']
    machine = Machine(
        work_center_id=sample_workcenter.id,
        type="CNC",
        make="TestMake",
        model="TestModel"
    )
    db_session.add(machine)
    db_session.commit()
    db_session.refresh(machine)
    return machine

@pytest.fixture
def sample_machine_2(db_session: Session, sample_workcenter):
    """Create a second sample machine."""
    Machine = db_session.test_models['Machine']
    machine = Machine(
        work_center_id=sample_workcenter.id,
        type="CNC",
        make="TestMake2",
        model="TestModel2"
    )
    db_session.add(machine)
    db_session.commit()
    db_session.refresh(machine)
    return machine

@pytest.fixture
def sample_part_type_inhouse(db_session: Session):
    """Create IN-HOUSE part type."""
    PartType = db_session.test_models['PartType']
    pt = PartType(id=1, type_name="IN-House")
    db_session.add(pt)
    db_session.commit()
    db_session.refresh(pt)
    return pt

@pytest.fixture
def sample_part_type_outsource(db_session: Session):
    """Create Out-Source part type."""
    PartType = db_session.test_models['PartType']
    pt = PartType(id=2, type_name="Out-Source")
    db_session.add(pt)
    db_session.commit()
    db_session.refresh(pt)
    return pt

@pytest.fixture
def sample_product(db_session: Session):
    """Create a sample product."""
    Product = db_session.test_models['Product']
    product = Product(
        product_name="Test Product",
        product_code="TP001"
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)
    return product

@pytest.fixture
def sample_order(db_session: Session, sample_product):
    """Create a sample order."""
    Order = db_session.test_models['Order']
    order = Order(
        sale_order_number="SO001",
        product_id=sample_product.id,
        quantity=10,
        due_date=datetime.now() + timedelta(days=30),
        status="active"
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order

@pytest.fixture
def sample_part(db_session: Session, sample_product, sample_part_type_inhouse):
    """Create a sample IN-HOUSE part."""
    Part = db_session.test_models['Part']
    part = Part(
        product_id=sample_product.id,
        part_number="PN001",
        part_name="Test Part",
        type_id=sample_part_type_inhouse.id,
        qty=10
    )
    db_session.add(part)
    db_session.commit()
    db_session.refresh(part)
    return part

@pytest.fixture
def sample_raw_material(db_session: Session):
    """Create a sample raw material."""
    RawMaterial = db_session.test_models['RawMaterial']
    rm = RawMaterial(
        material_name="Test Material",
        material_code="TM001",
        status="Available",
        quantity=1000
    )
    db_session.add(rm)
    db_session.commit()
    db_session.refresh(rm)
    return rm

@pytest.fixture
def sample_operation(db_session: Session, sample_part, sample_machine):
    """Create a sample operation."""
    Operation = db_session.test_models['Operation']
    op = Operation(
        part_id=sample_part.id,
        operation_number="10",
        setup_time=time(hour=0, minute=30),
        cycle_time=time(hour=0, minute=10),
        workcenter_id=sample_machine.work_center_id,
        machine_id=sample_machine.id,
        part_type_id=1  # IN-HOUSE
    )
    db_session.add(op)
    db_session.commit()
    db_session.refresh(op)
    return op

@pytest.fixture
def sample_operation_2(db_session: Session, sample_part, sample_machine):
    """Create a second sample operation."""
    Operation = db_session.test_models['Operation']
    op = Operation(
        part_id=sample_part.id,
        operation_number="20",
        setup_time=time(hour=0, minute=15),
        cycle_time=time(hour=0, minute=5),
        workcenter_id=sample_machine.work_center_id,
        machine_id=sample_machine.id,
        part_type_id=1  # IN-HOUSE
    )
    db_session.add(op)
    db_session.commit()
    db_session.refresh(op)
    return op

@pytest.fixture
def setup_active_order(db_session: Session, sample_order, sample_part, sample_raw_material):
    """Setup an active order with part and raw material."""
    OrderScheduleStatus = db_session.test_models['OrderScheduleStatus']
    PartScheduleStatus = db_session.test_models['PartScheduleStatus']
    RawMaterialUsage = db_session.test_models['RawMaterialUsage']
    OrderPartPriority = db_session.test_models['OrderPartPriority']
    
    # Activate order
    oss = OrderScheduleStatus(
        order_id=sample_order.id,
        product_id=sample_order.product_id,
        status="active",
        activated_at=datetime.now(timezone.utc)
    )
    db_session.add(oss)
    
    # Activate part
    pss = PartScheduleStatus(
        sale_order_id=sample_order.id,
        part_id=sample_part.id,
        status="active",
        start_date=datetime.now(timezone.utc)
    )
    db_session.add(pss)
    
    # Link raw material
    rm_usage = RawMaterialUsage(
        part_id=sample_part.id,
        raw_material_id=sample_raw_material.id,
        quantity=100
    )
    db_session.add(rm_usage)
    
    # Set priority
    opp = OrderPartPriority(
        order_id=sample_order.id,
        product_id=sample_order.product_id,
        part_id=sample_part.id,
        priority=1,
        status="active"
    )
    db_session.add(opp)
    
    db_session.commit()
    return sample_order

@pytest.fixture
def setup_shift_configuration(db_session: Session):
    """Setup shift configuration for testing."""
    ShiftHoursConfiguration = db_session.test_models['ShiftHoursConfiguration']
    ShiftTimingConfiguration = db_session.test_models['ShiftTimingConfiguration']
    
    today = datetime.now().date()
    
    # Create shift config
    shc = ShiftHoursConfiguration(
        date=today,
        working_day=True,
        number_of_shifts=1
    )
    db_session.add(shc)
    db_session.commit()
    db_session.refresh(shc)
    
    # Create shift timing
    stc = ShiftTimingConfiguration(
        shift_config_id=shc.id,
        shift_code="GENERAL",
        shift_start=time(hour=8, minute=30),
        shift_end=time(hour=17, minute=0)
    )
    db_session.add(stc)
    db_session.commit()
    
    return shc

@pytest.fixture
def setup_efficiency_factor(db_session: Session):
    """Setup efficiency factor."""
    EfficiencyFactor = db_session.test_models['EfficiencyFactor']
    ef = EfficiencyFactor(efficiency_factor=1.0)
    db_session.add(ef)
    db_session.commit()
    return ef

@pytest.fixture
def base_time():
    """Base time for test scenarios."""
    return datetime(2024, 1, 1, 8, 30, 0)

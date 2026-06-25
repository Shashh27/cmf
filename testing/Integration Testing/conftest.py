"""
Configuration for Integration Testing.

This file sets up the test environment for integration tests.
"""
import pytest
import os
import sys
from datetime import datetime, time, timedelta, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import actual DB models (for PostgreSQL)
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


@pytest.fixture(scope="session")
def test_database_url():
    """Get the test database URL from environment variable.
    
    IMPORTANT: This should point to a SEPARATE test database, NOT the production database.
    Production: CMF_Demo (DO NOT USE)
    Test: cmf_test (USE THIS - lowercase)
    Default: postgresql://postgres:postgres@172.18.7.86:5432/cmf_test
    """
    return os.getenv("TEST_DATABASE_URL", "postgresql://postgres:postgres@172.18.7.86:5432/cmf_test")


@pytest.fixture(scope="session")
def api_base_url():
    """Get the API base URL for endpoint testing."""
    return os.getenv("API_BASE_URL", "http://localhost:8000")


@pytest.fixture(scope="function")
def db_engine(test_database_url):
    """Create a test database engine for PostgreSQL."""
    engine = create_engine(test_database_url)
    return engine


@pytest.fixture(scope="function")
def db_session(db_engine):
    """Create a test database session with PostgreSQL."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = SessionLocal()
    
    # Start transaction for rollback
    connection = session.connection()
    transaction = connection.begin()
    
    yield session
    
    # Rollback transaction to clean up
    session.rollback()
    session.close()
    connection.close()


@pytest.fixture(scope="function")
def skip_if_no_database(test_database_url):
    """Skip test if database is not available."""
    import sqlalchemy
    try:
        engine = sqlalchemy.create_engine(test_database_url)
        conn = engine.connect()
        conn.close()
        engine.dispose()
    except Exception as e:
        pytest.skip(f"Database not available: {e}")


@pytest.fixture(scope="function")
def skip_if_no_api(api_base_url):
    """Skip test if API is not available."""
    import requests
    try:
        response = requests.get(f"{api_base_url}/health", timeout=5)
        if response.status_code != 200:
            pytest.skip("API health check failed")
    except Exception as e:
        pytest.skip(f"API not available: {e}")


# ============================================================================
# TEST DATA FIXTURES FOR INTEGRATION TESTING
# ============================================================================

@pytest.fixture
def sample_workcenter(db_session: Session):
    """Create a sample work center."""
    wc = WorkCenter(
        work_center_name="Test WorkCenter",
        code="TWC",
        is_schedulable=True
    )
    db_session.add(wc)
    db_session.flush()
    db_session.refresh(wc)
    return wc


@pytest.fixture
def sample_machine(db_session: Session, sample_workcenter):
    """Create a sample machine."""
    machine = Machine(
        work_center_id=sample_workcenter.id,
        type="CNC",
        make="TestMake",
        model="TestModel"
    )
    db_session.add(machine)
    db_session.flush()
    db_session.refresh(machine)
    return machine


@pytest.fixture
def sample_machine_2(db_session: Session, sample_workcenter):
    """Create a second sample machine."""
    machine = Machine(
        work_center_id=sample_workcenter.id,
        type="CNC",
        make="TestMake2",
        model="TestModel2"
    )
    db_session.add(machine)
    db_session.flush()
    db_session.refresh(machine)
    return machine


@pytest.fixture
def sample_part_type_inhouse(db_session: Session):
    """Create IN-HOUSE part type."""
    pt = PartType(id=1, type_name="IN-House")
    db_session.add(pt)
    db_session.flush()
    db_session.refresh(pt)
    return pt


@pytest.fixture
def sample_part_type_outsource(db_session: Session):
    """Create Out-Source part type."""
    pt = PartType(id=2, type_name="Out-Source")
    db_session.add(pt)
    db_session.flush()
    db_session.refresh(pt)
    return pt


@pytest.fixture
def sample_product(db_session: Session):
    """Create a sample product."""
    product = Product(
        product_name="Test Product",
        product_code="TP001"
    )
    db_session.add(product)
    db_session.flush()
    db_session.refresh(product)
    return product


@pytest.fixture
def sample_order(db_session: Session, sample_product):
    """Create a sample order."""
    order = Order(
        sale_order_number="SO001",
        product_id=sample_product.id,
        quantity=10,
        due_date=datetime.now() + timedelta(days=30),
        status="active"
    )
    db_session.add(order)
    db_session.flush()
    db_session.refresh(order)
    return order


@pytest.fixture
def sample_part(db_session: Session, sample_product, sample_part_type_inhouse):
    """Create a sample IN-HOUSE part."""
    part = Part(
        product_id=sample_product.id,
        part_number="PN001",
        part_name="Test Part",
        type_id=sample_part_type_inhouse.id,
        qty=10
    )
    db_session.add(part)
    db_session.flush()
    db_session.refresh(part)
    return part


@pytest.fixture
def sample_raw_material(db_session: Session):
    """Create a sample raw material."""
    rm = RawMaterial(
        material_name="Test Material",
        material_code="TM001",
        status="Available",
        quantity=1000
    )
    db_session.add(rm)
    db_session.flush()
    db_session.refresh(rm)
    return rm


@pytest.fixture
def sample_operation(db_session: Session, sample_part, sample_machine):
    """Create a sample operation."""
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
    db_session.flush()
    db_session.refresh(op)
    return op


@pytest.fixture
def sample_operation_2(db_session: Session, sample_part, sample_machine):
    """Create a second sample operation."""
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
    db_session.flush()
    db_session.refresh(op)
    return op


@pytest.fixture
def setup_active_order(db_session: Session, sample_order, sample_part, sample_raw_material):
    """Setup an active order with part and raw material."""
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
    
    db_session.flush()
    return sample_order


@pytest.fixture
def setup_shift_configuration(db_session: Session):
    """Setup shift configuration for testing."""
    today = datetime.now().date()
    
    # Create shift config
    shc = ShiftHoursConfiguration(
        date=today,
        working_day=True,
        number_of_shifts=1
    )
    db_session.add(shc)
    db_session.flush()
    db_session.refresh(shc)
    
    # Create shift timing
    stc = ShiftTimingConfiguration(
        shift_config_id=shc.id,
        shift_code="GENERAL",
        shift_start=time(hour=8, minute=30),
        shift_end=time(hour=17, minute=0)
    )
    db_session.add(stc)
    db_session.flush()
    
    return shc


@pytest.fixture
def setup_efficiency_factor(db_session: Session):
    """Setup efficiency factor."""
    ef = EfficiencyFactor(efficiency_factor=1.0)
    db_session.add(ef)
    db_session.flush()
    return ef


@pytest.fixture
def base_time():
    """Base time for test scenarios."""
    return datetime(2024, 1, 1, 8, 30, 0)


# Test markers
pytest.mark.integration = pytest.mark.skip(reason="Integration tests require database setup")
pytest.mark.api = pytest.mark.skip(reason="API tests require running server")

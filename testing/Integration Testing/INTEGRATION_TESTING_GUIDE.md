# Integration Testing Implementation Guide

## Table of Contents
1. [What is Integration Testing?](#what-is-integration-testing)
2. [Why Integration Testing?](#why-integration-testing)
3. [Architecture Overview](#architecture-overview)
4. [Data Flow Diagram](#data-flow-diagram)
5. [Data Sources](#data-sources)
6. [Test Execution Process](#test-execution-process)
7. [Setup Requirements](#setup-requirements)
8. [Step-by-Step Implementation](#step-by-step-implementation)
9. [Example Test Walkthrough](#example-test-walkthrough)
10. [Troubleshooting](#troubleshooting)

---

## What is Integration Testing?

Integration testing is a type of software testing that verifies how different components of a system work together. Unlike unit tests (which test individual functions in isolation), integration tests test the complete flow through the system.

### Unit Testing vs Integration Testing

| Aspect | Unit Testing | Integration Testing |
|--------|-------------|-------------------|
| **Scope** | Single function/class | Multiple components together |
| **Dependencies** | Mocked/Stubbed | Real database, API, services |
| **Speed** | Very fast (milliseconds) | Slower (seconds to minutes) |
| **Database** | In-memory or mocked | Real PostgreSQL database |
| **Purpose** | Validate logic correctness | Validate system behavior |

### Example

**Unit Test:**
```python
# Tests the calculation logic in isolation
def test_remaining_quantity():
    total = 10
    approved = 5
    remaining = total - approved
    assert remaining == 5
```

**Integration Test:**
```python
# Tests the complete flow with real database
def test_dynamic_reschedule_integration():
    # 1. Create order in database
    # 2. Generate planned schedule (writes to database)
    # 3. Submit production log (writes to database)
    # 4. Trigger dynamic reschedule (reads from database, writes to database)
    # 5. Verify database state is correct
```

---

## Why Integration Testing?

For the CMF Digitalization system, integration testing is crucial because:

1. **Complex Data Flow**: Production logs → Dynamic rescheduling → Database updates
2. **Database Interactions**: The system heavily relies on PostgreSQL
3. **Real-World Validation**: Need to test actual SQL queries, transactions, and constraints
4. **End-to-End Scenarios**: Validate complete workflows from order creation to completion

## ⚠️ CRITICAL WARNING: Use Separate Test Database

**NEVER run integration tests against the production database!**

### Production Database (DO NOT USE FOR TESTING)
- **Name**: `CMF_Demo`
- **URL**: `postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo`
- **Purpose**: Production data used by the team
- **Risk**: Running tests here will corrupt production data

### Test Database (USE THIS FOR TESTING)
- **Name**: `cmf_test` (lowercase)
- **URL**: `postgresql://postgres:postgres@172.18.7.86:5432/cmf_test`
- **Purpose**: Dedicated test database for integration testing
- **Safe**: Tests can modify data freely without affecting production

### Verification

Before running tests, verify you're using the correct database:

```bash
# Check environment variable
echo $TEST_DATABASE_URL

# Should output: postgresql://postgres:postgres@172.18.7.86:5432/cmf_test
# NOT: postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo
```

### Safety Features

The integration test configuration includes safety measures:
1. **Default to test database**: conftest.py defaults to `cmf_test` (lowercase)
2. **Transaction rollback**: Each test rolls back changes
3. **Environment variable override**: Can be set to different database if needed

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Integration Test Suite                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │  Test Code       │    │  Test Fixtures   │                  │
│  │  (test_*.py)     │    │  (conftest.py)   │                  │
│  └────────┬─────────┘    └────────┬─────────┘                  │
│           │                        │                             │
│           │                        │                             │
│           ▼                        ▼                             │
│  ┌──────────────────────────────────────────────────┐          │
│  │         Test Execution Framework (pytest)        │          │
│  └──────────────────────┬───────────────────────────┘          │
│                         │                                      │
│                         │                                      │
│           ┌─────────────┴─────────────┐                       │
│           │                           │                       │
│           ▼                           ▼                       │
│  ┌──────────────────┐      ┌──────────────────┐              │
│  │  Algorithm      │      │  FastAPI         │              │
│  │  (algorithm.py)  │      │  (routers/*.py)  │              │
│  └────────┬─────────┘      └────────┬─────────┘              │
│           │                        │                             │
│           │                        │                             │
│           └────────────┬───────────┘                             │
│                        │                                        │
│                        ▼                                        │
│           ┌──────────────────────┐                             │
│           │  PostgreSQL Database │                             │
│           │  (Test Database)     │                             │
│           └──────────────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### Complete Test Execution Flow

```
1. TEST SETUP
   ┌─────────────┐
   │ pytest     │
   │ starts     │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ conftest.py │
   │ fixtures   │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ PostgreSQL  │
   │ Database    │
   │ (clean)     │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Seed Test   │
   │ Data        │
   │ (orders,    │
   │  parts,     │
   │  machines)  │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Database    │
   │ (with data) │
   └─────────────┘

2. TEST EXECUTION
   ┌─────────────┐
   │ Test Code   │
   │ calls       │
   │ function    │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Algorithm/  │
   │ API Function│
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Reads from  │
   │ Database    │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Processes   │
   │ Data        │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Writes to   │
   │ Database    │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Returns     │
   │ Result      │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Test Code   │
   │ Validates   │
   │ Result      │
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ pytest     │
   │ reports    │
   │ pass/fail  │
   └─────────────┘

3. TEST CLEANUP
   ┌─────────────┐
   │ pytest     │
   │ rolls back │
   │ transaction│
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │ Database    │
   │ (clean)     │
   └─────────────┘
```

---

## Data Sources

### 1. Test Data (Input Data)

**Where it comes from:**
- **Test Fixtures** (`conftest.py`) - Programmatically created test data
- **Seed Scripts** - SQL scripts to populate test database
- **Hardcoded in Tests** - Specific data for each test case

**Example:**
```python
# conftest.py fixture creates test data
@pytest.fixture
def sample_order(db_session):
    order = Order(
        order_number="TEST-001",
        quantity=10,
        status="active"
    )
    db_session.add(order)
    db_session.commit()
    return order
```

### 2. Database Data (Runtime Data)

**Where it comes from:**
- **PostgreSQL Test Database** - Real database with test schema
- **Session per Test** - Each test gets its own database session
- **Transaction Rollback** - Changes are rolled back after each test

**Example:**
```python
# Test reads from database
orders = db_session.query(Order).all()

# Test writes to database
db_session.add(new_order)
db_session.commit()
```

### 3. API Responses (Output Data)

**Where it comes from:**
- **FastAPI Endpoints** - HTTP responses from API
- **Function Returns** - Direct return values from functions
- **Database Queries** - Results of SQL queries

**Example:**
```python
# API response
response = client.post("/api/scheduling/generate")
data = response.json()  # Output data

# Function return
result = generate_machine_schedule(db_session)  # Output data
```

---

## Test Execution Process

### Phase 1: Environment Setup

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set Environment Variables**
   ```bash
   # CRITICAL: Use the TEST database, NOT the production database
   export TEST_DATABASE_URL="postgresql://postgres:postgres@172.18.7.86:5432/cmf_test"
   export API_BASE_URL="http://localhost:8000"
   ```

3. **Start PostgreSQL Database**
   - Ensure PostgreSQL is running
   - Create test database: `createdb cmf_test`
   - Run migrations to create schema

4. **Start FastAPI Server** (for API tests)
   ```bash
   uvicorn main:app --reload
   ```

### Phase 2: Test Execution

1. **pytest discovers tests**
   - Scans for files matching `test_*.py`
   - Finds test functions matching `test_*`

2. **pytest runs fixtures**
   - `conftest.py` fixtures run before tests
   - Database session created
   - Test data seeded

3. **Test function executes**
   - Test code calls system functions
   - System reads/writes to database
   - Results returned

4. **Assertions validated**
   - Test validates results
   - pytest reports pass/fail

5. **Cleanup**
   - Database transaction rolled back
   - Session closed
   - Next test starts fresh

### Phase 3: Results Reporting

```
========================= test session starts =========================
collected 114 items

test_planned_schedule_workflow.py::test_generate_planned_schedule PASSED
test_planned_schedule_workflow.py::test_generate_multiple_orders PASSED
test_dynamic_schedule_workflow.py::test_dynamic_reschedule PASSED
test_production_log_workflow.py::test_production_log_creation PASSED
test_end_to_end_integration.py::test_complete_workflow PASSED
test_api_endpoints.py::test_generate_schedule_endpoint PASSED

========================= 114 passed in 45.23s =========================
```

---

## Setup Requirements

### Hardware/Software Requirements

1. **PostgreSQL Database**
   - Version: 12 or higher
   - Must be accessible from test machine
   - Test database: `cmf_test`

2. **Python Environment**
   - Python 3.8 or higher
   - Virtual environment recommended

3. **Dependencies** (from requirements.txt)
   ```
   pytest>=7.4.0
   pytest-cov>=4.1.0
   requests>=2.31.0
   psycopg2-binary>=2.9.0
   sqlalchemy>=2.0.0
   ```

### Database Schema Requirements

The test database must have the same schema as production:
- `scheduling` schema (machine_status, planned_schedule_items, etc.)
- `oms` schema (orders, parts, operations, etc.)
- `inventory` schema (raw_materials, raw_material_usage, etc.)
- `configuration` schema (machines, work_centers, etc.)

### Test Data Requirements

Before running tests, the database should have:
- **Machines** - At least 2-3 machines in different work centers
- **Shift Configuration** - Shift hours defined
- **Efficiency Factors** - Default efficiency factors set

---

## Step-by-Step Implementation

### Step 1: Create Test Database

**CRITICAL: Create a SEPARATE test database, do NOT use the production database**

```bash
# Connect to PostgreSQL
psql -U postgres -h 172.18.7.86

# Create test database (cmf_test - lowercase, separate from production CMF_Demo)
CREATE DATABASE cmf_test;

# Exit
\q
```

### Step 2: Copy Schema and Data from Production

```bash
# Copy complete schema and data from CMF_Demo to cmf_test
cd backend/cmf
python copy_full_db.py
```

### Step 3: Configure Environment

```bash
# Set environment variables (pointing to TEST database, not production)
export TEST_DATABASE_URL="postgresql://postgres:postgres@172.18.7.86:5432/cmf_test"
export API_BASE_URL="http://localhost:8000"
```

### Step 4: Install Dependencies

```bash
cd "Integration Testing"
pip install -r requirements.txt
```

### Step 5: Remove Skip Markers

Currently, tests are skipped. To enable them:

**Option A: Remove all skip markers**
```bash
# Remove @pytest.mark.skip from all test files
# This can be done manually or with a script
```

**Option B: Run specific tests without skip**
```bash
# Run only specific test files
pytest test_planned_schedule_workflow.py -v --no-skip
```

### Step 6: Run Tests

```bash
# Run all integration tests
pytest -v

# Run specific test file
pytest test_planned_schedule_workflow.py -v

# Run specific test
pytest test_planned_schedule_workflow.py::test_generate_planned_schedule -v

# Run with coverage
pytest --cov=../algorithm --cov-report=html
```

---

## Example Test Walkthrough

### Test: `test_generate_planned_schedule`

Let's walk through a complete test execution:

#### 1. Test Code

```python
def test_generate_planned_schedule(db_session, setup_active_order, sample_operation):
    """Test planned schedule generation for a single order."""
    
    # Step 1: Get test data from fixtures
    order = setup_active_order
    operation = sample_operation
    
    # Step 2: Call the function
    result = generate_machine_schedule(db_session)
    
    # Step 3: Verify the result
    assert result['success'] is True
    assert result['operations_inserted'] > 0
    
    # Step 4: Verify database state
    schedule_items = db_session.query(PlannedScheduleItem).all()
    assert len(schedule_items) > 0
    
    # Step 5: Verify specific data
    first_item = schedule_items[0]
    assert first_item.operation_id == operation.id
    assert first_item.planned_start is not None
    assert first_item.planned_end is not None
```

#### 2. Fixtures (from conftest.py)

```python
@pytest.fixture
def db_session():
    """Create database session with rollback."""
    engine = create_engine(TEST_DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    yield session
    
    session.rollback()
    session.close()

@pytest.fixture
def setup_active_order(db_session):
    """Create an active order with parts and operations."""
    order = Order(
        order_number="TEST-001",
        quantity=10,
        status="active"
    )
    db_session.add(order)
    
    part = Part(
        order_id=order.id,
        part_number="PART-001",
        status="active"
    )
    db_session.add(part)
    
    operation = Operation(
        part_id=part.id,
        operation_number="10",
        total_qty=10
    )
    db_session.add(operation)
    
    db_session.commit()
    return order
```

#### 3. Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. pytest starts test_generate_planned_schedule              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. db_session fixture runs                                   │
│    - Creates database connection                             │
│    - Starts transaction                                      │
│    - Yields session to test                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. setup_active_order fixture runs                           │
│    - Creates Order in database                               │
│    - Creates Part in database                                │
│    - Creates Operation in database                           │
│    - Commits to database                                     │
│    - Yields order to test                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Test code executes                                        │
│    - order = setup_active_order (gets Order object)          │
│    - operation = sample_operation (gets Operation object)    │
│    - result = generate_machine_schedule(db_session)          │
│      - Function reads Order from database                    │
│      - Function reads Part from database                     │
│      - Function reads Operation from database               │
│      - Function calculates schedule                          │
│      - Function writes PlannedScheduleItem to database       │
│      - Function returns result dict                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Assertions validated                                      │
│    - assert result['success'] is True ✓                      │
│    - assert result['operations_inserted'] > 0 ✓              │
│    - schedule_items = db_session.query(PlannedScheduleItem)   │
│    - assert len(schedule_items) > 0 ✓                        │
│    - assert first_item.operation_id == operation.id ✓         │
│    - assert first_item.planned_start is not None ✓            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Test passes                                                │
│    - pytest reports PASSED                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Cleanup                                                    │
│    - db_session fixture rollback runs                         │
│    - Transaction rolled back                                 │
│    - Database returns to clean state                          │
│    - Session closed                                           │
└─────────────────────────────────────────────────────────────┘
```

#### 4. Database State Changes

**Before Test:**
```
Database: Empty (clean state)
```

**During Test:**
```
Database:
- Order: TEST-001 (active)
- Part: PART-001 (active)
- Operation: 10 (qty=10)
- PlannedScheduleItem: 1 record (after generate_machine_schedule)
```

**After Test:**
```
Database: Empty (rollback to clean state)
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: Database Connection Failed

**Error:**
```
sqlalchemy.exc.OperationalError: could not connect to server
```

**Solution:**
1. Check PostgreSQL is running: `pg_isready`
2. Verify database exists: `psql -l`
3. Check connection string in environment variable
4. Verify credentials are correct

#### Issue 2: Schema Not Found

**Error:**
```
sqlalchemy.exc.ProgrammingError: relation "scheduling.machine_status" does not exist
```

**Solution:**
1. Run migrations: `alembic upgrade head`
2. Verify schema exists: `psql -d cmf_test -c "\dt scheduling.*"`
3. Check schema name matches models

#### Issue 3: Tests Skipped

**Observation:**
```
test_generate_planned_schedule SKIPPED
```

**Solution:**
1. Remove `@pytest.mark.skip` decorators
2. Check if prerequisites are met (database, API server)
3. Run with `-v` to see skip reason

#### Issue 4: Import Errors

**Error:**
```
ModuleNotFoundError: No module named 'DB'
```

**Solution:**
1. Run tests from correct directory: `cd backend/cmf`
2. Add parent directory to PYTHONPATH
3. Verify virtual environment is activated

#### Issue 5: Transaction Rollback Issues

**Error:**
```
sqlalchemy.exc.InvalidRequestError: This session is in 'committed' state
```

**Solution:**
1. Ensure tests don't commit transactions manually
2. Use `session.flush()` instead of `session.commit()` for test data
3. Let fixture handle rollback

---

## Summary

### Key Points

1. **Integration tests use real database** - PostgreSQL test database
2. **Test data comes from fixtures** - Programmatically created in conftest.py
3. **Each test is isolated** - Transaction rollback after each test
4. **Tests validate complete flows** - End-to-end workflows
5. **API tests require running server** - FastAPI must be running

### Data Flow Summary

```
Test Fixtures → Database (Test Data) → Test Code → System Functions → Database (Results) → Assertions
```

### Next Steps

1. Set up PostgreSQL test database
2. Run migrations to create schema
3. Configure environment variables
4. Remove skip markers from tests
5. Run tests to validate system

---

## Additional Resources

- [pytest Documentation](https://docs.pytest.org/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

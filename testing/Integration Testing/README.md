# Integration Testing Suite

This folder contains comprehensive end-to-end integration tests for the CMF Digitalization dynamic scheduling system.

## Objective

Validate the complete end-to-end workflow, including:
- Planned schedule execution
- Dynamic schedule execution
- Production log generation and processing
- Interconnection and data flow between Production Logs and Dynamic Schedules
- Overall business and workflow logic
- Integration between all related components

## Test Coverage

### Test Categories

1. **Positive Scenarios** - Happy path workflows
2. **Negative Scenarios** - Error handling and edge cases
3. **Boundary Scenarios** - Limits and thresholds

### Test Files

- `test_planned_schedule_workflow.py` - Planned schedule generation and execution (24 tests)
- `test_dynamic_schedule_workflow.py` - Dynamic rescheduling workflows (24 tests)
- `test_production_log_workflow.py` - Production log generation and processing (25 tests)
- `test_end_to_end_integration.py` - Complete end-to-end workflows (22 tests)
- `test_api_endpoints.py` - API endpoint integration tests (19 tests)
- `conftest.py` - Test configuration and fixtures

**Total: 114 integration tests**

## Running Tests

### Prerequisites

- PostgreSQL test database
- Environment variables configured
- All dependencies installed

### Run All Integration Tests

```bash
cd "Integration Testing"
pytest -v
```

### Run Specific Test File

```bash
pytest test_planned_schedule_workflow.py -v
```

### Run Specific Test

```bash
pytest test_planned_schedule_workflow.py::test_generate_planned_schedule -v
```

## Important Notes

- **No development or business logic changes** - This is strictly for testing and validation
- Tests use actual database connections (PostgreSQL)
- **CRITICAL: Tests use a SEPARATE test database (cmf_test - lowercase), NOT the production database (CMF_Demo)**
- Tests validate existing implementation as-is
- Any issues found should be reported, not fixed in this test suite

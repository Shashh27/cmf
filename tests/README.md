# CMF-OMS Backend — Integration Test Suite

This folder contains functionality-driven integration tests for the CMF-OMS backend API.
Tests are written using **pytest** and run against the `cmf_test` database.

---

## Project Structure

```
tests/
├── README.md                        ← You are here
├── __init__.py
├── conftest.py                      ← Shared fixtures (DB session, TestClient, sample payloads)
└── routers/
    ├── __init__.py
    ├── test_access_control.py       ← /api/v1/access-users/
    ├── test_login.py                ← /api/v1/login/
    ├── test_orders.py               ← /api/v1/orders/
    └── test_parts.py                ← /api/v1/parts/
```

---

## Prerequisites

### 1. Python version

Make sure you are using **Python 3.11**. Verify with:

```bash
python --version
# Expected: Python 3.11.x
```

### 2. Virtual environment

Activate the project virtual environment before running tests:

```bash
# Windows
venv\Scripts\activate

# You should see (venv) in your terminal prompt
```

### 3. Install test dependencies

```bash
pip install pytest httpx
```

### 4. Database

Tests run against **`cmf_test`** — a separate PostgreSQL database restored from `CMF_DEMO`.

> ⚠️ Tests **never touch** the real `CMF_DEMO` database.
> Each test rolls back its changes automatically — no data is permanently written to `cmf_test`.

Make sure you are connected to the company network (`172.18.7.86`) before running tests.

### 5. conftest.py — update DB credentials

Open `tests/conftest.py` and verify the connection string matches your credentials:

```python
TEST_DATABASE_URL = "postgresql://postgres:yourpassword@172.18.7.86:5432/cmf_test"
```

Ask your team lead for the postgres password if you don't have it.

---

## Running Tests

### Run all tests

```bash
cd D:\Projects\cmf-oms
pytest
```

### Run a specific test file

```bash
pytest tests/routers/test_access_control.py -v
pytest tests/routers/test_login.py -v
pytest tests/routers/test_orders.py -v
pytest tests/routers/test_parts.py -v
```

### Run a specific test class

```bash
pytest tests/routers/test_access_control.py::TestCreateAccessUser -v
pytest tests/routers/test_parts.py::TestBulkCreateParts -v
```

### Run a single test

```bash
pytest tests/routers/test_login.py::TestLogin::test_login_success -v
```

### Run with detailed failure output

```bash
pytest -vv
```

### Run and stop at first failure

```bash
pytest -x
```

---

## Understanding Test Output

```
tests/routers/test_login.py::TestLogin::test_login_success PASSED   [ 5%]
tests/routers/test_login.py::TestLogin::test_login_wrong_password   FAILED  [10%]
```

| Keyword  | Meaning                                    | Action needed     |
| -------- | ------------------------------------------ | ----------------- |
| `PASSED` | Test ran and code behaved correctly        | ✅ Nothing        |
| `FAILED` | Test ran but code returned wrong result    | 🔴 Fix your code  |
| `ERROR`  | Test could not run (setup/DB/import issue) | 🔧 Fix test setup |

The **percentage** shown beside each test is overall progress — how many tests have run out of total.

---

## How Tests Are Isolated

- Every test gets a **fresh DB session** that rolls back after the test completes.
- Test data created during a test (users, orders, parts) is **never permanently saved**.
- Tests do not depend on each other — each test is fully self-contained.
- The `cmf_test` database existing data is safe and untouched.

---

## Test Database References

These IDs from `cmf_test` are used as seed references in test fixtures:

| Entity                      | ID   | Name / Note               |
| --------------------------- | ---- | ------------------------- |
| Customer                    | 2    | BEL                       |
| Product                     | 47   | Hydro Locking tool holder |
| Product (safe test product) | 63   | ISP1234567                |
| Admin user                  | 16   | admin role                |
| Project coordinator         | 20   | project coordinator role  |
| Manufacturing coordinator   | 32   | bharath                   |
| Assembly (active)           | 23   | Protusion System Assembly |
| Assembly (empty/safe)       | 28   | Primary Control Assembly  |
| Assembly (recycle bin)      | 55   | assm1                     |
| Part type — IN-House        | 1    |                           |
| Part type — Out-Source      | 2    |                           |
| Part type — STANDARD        | 3    |                           |
| Raw material                | 1    | 45C8                      |
| Existing part (read-only)   | 1575 | demo                      |
| Existing order (read-only)  | 95   | ISP2502101                |

---

## Adding New Tests

When a new router is added to the project, follow these steps:

1. Create a new file: `tests/routers/test_<router_name>.py`
2. Import fixtures from `conftest.py` (they are auto-available — no import needed)
3. Write test classes grouped by operation: `TestCreate`, `TestGet`, `TestUpdate`, `TestDelete`
4. Each test must be **functionality-driven** — test what the endpoint does, not how it does it
5. Always use `unique_<field>()` helpers to avoid data collisions between tests
6. Run your new test file before committing: `pytest tests/routers/test_<router_name>.py -v`

### Test naming convention

```
test_<action>_<scenario>_<expected_result>

Examples:
  test_create_order_success
  test_create_order_duplicate_sale_order_number_rejected
  test_get_order_by_invalid_id_returns_404
  test_delete_order_removed_from_list
```

---

## Common Issues

### ❌ `password authentication failed`

Your DB credentials in `conftest.py` are wrong.
→ Update `TEST_DATABASE_URL` with the correct password.

### ❌ `connection refused` / `could not connect`

You are not connected to the company network.
→ Connect to the office network or VPN and retry.

### ❌ `404 Not Found` on all tests

The API prefix in tests doesn't match the app.
→ All routes use `/api/v1/` prefix. Check `main.py` for `app.include_router(..., prefix="/api/v1")`.

### ❌ `ERROR` on setup (not FAILED)

The test fixture itself crashed before the test ran.
→ Check the `conftest.py` fixtures — usually a DB connection or missing seed data issue.

### ❌ `ModuleNotFoundError`

Virtual environment is not activated or dependencies not installed.
→ Run `venv\Scripts\activate` then `pip install pytest httpx`.

---

## Contact

For questions about the test setup, contact the backend team.

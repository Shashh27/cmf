"""
conftest.py - Shared fixtures for all tests.
Automatically loaded by pytest before any test runs.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from DB.database import get_db

# ──────────────────────────────────────────────
# TEST DATABASE - using cmf_test (already restored from CMF_DEMO)
# ──────────────────────────────────────────────
TEST_DATABASE_URL = "postgresql://postgres:postgres@172.18.7.86:5432/cmf_test"

engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# @pytest.fixture(scope="session", autouse=True)
# def setup_database():
#     """
#     Creates all tables before tests run, drops them after.
#     scope="session" means this runs once for the entire test session.
#     """
#     Base.metadata.create_all(bind=engine)
#     yield
#     Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """
    cmf_test already has the full schema restored from CMF_DEMO.
    We skip create/drop entirely — no cascade errors.
    Each test rolls back via db_session fixture, keeping DB clean.
    """
    yield  # nothing to do — schema already exists


@pytest.fixture(scope="function")
def db_session():
    """
    Provides a clean DB session per test.
    Rolls back after each test so tests don't affect each other.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db_session):
    """
    FastAPI TestClient with test DB injected.
    Overrides real get_db so no real/dev DB is touched.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_user_payload():
    """Reusable valid user payload for creating access users."""
    return {
        "user_name": "testuser",
        "gmail": "testuser@gmail.com",
        "role": "admin",
        "center": "center_a",
        "group": "group_1",
        "password": "securepassword123"
    }


@pytest.fixture
def created_user(client, sample_user_payload):
    """
    Creates a user and returns the response data.
    Use this fixture when your test needs an existing user.
    """
    response = client.post("/api/v1/access-users/", json=sample_user_payload)
    assert response.status_code == 201
    return response.json()
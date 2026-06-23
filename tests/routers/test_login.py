"""
test_login.py

Functionality-driven integration tests for POST /api/v1/login/

Real test DB seed references (cmf_test):
  Valid user: username and password from access_control.access_users
  We use the test user created via access_control fixture to avoid
  depending on real production credentials.
"""

import pytest


# ─────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────

@pytest.fixture
def registered_user(client):
    """
    Creates a fresh user via access_control endpoint,
    then returns their credentials for login tests.
    """
    payload = {
        "user_name": "logintest_user",
        "gmail": "logintest@gmail.com",
        "role": "supervisor",
        "center": "CMF",
        "group": "CMF",
        "password": "testpassword123"
    }
    response = client.post("/api/v1/access-users/", json=payload)
    assert response.status_code == 201, response.text
    return payload  # return credentials, not the response


# ══════════════════════════════════════════════════════════
# LOGIN  POST /api/v1/login/
# ══════════════════════════════════════════════════════════

class TestLogin:

    def test_login_success_with_valid_credentials(self, client, registered_user):
        """
        FUNCTIONALITY: A user can login with correct username and password.
        EXPECT: 200 OK + user details returned (without password).
        """
        response = client.post("/api/v1/login/", json={
            "user_name": registered_user["user_name"],
            "password": registered_user["password"]
        })

        assert response.status_code == 200
        data = response.json()
        assert data["user_name"] == registered_user["user_name"]
        assert data["gmail"] == registered_user["gmail"]
        assert data["role"] == registered_user["role"]
        assert "id" in data
        assert "createdAt" in data
        assert "updatedAt" in data

    def test_login_response_does_not_include_password(self, client, registered_user):
        """
        FUNCTIONALITY: Login response must NOT expose the password field.
        EXPECT: 'password' key absent from LoginResponse.
        """
        response = client.post("/api/v1/login/", json={
            "user_name": registered_user["user_name"],
            "password": registered_user["password"]
        })

        assert response.status_code == 200
        assert "password" not in response.json()

    def test_login_wrong_password_returns_401(self, client, registered_user):
        """
        FUNCTIONALITY: Login with correct username but wrong password is rejected.
        EXPECT: 401 Unauthorized.
        """
        response = client.post("/api/v1/login/", json={
            "user_name": registered_user["user_name"],
            "password": "wrongpassword"
        })

        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    def test_login_nonexistent_username_returns_401(self, client):
        """
        FUNCTIONALITY: Login with a username that doesn't exist is rejected.
        EXPECT: 401 Unauthorized (not 404 — to avoid exposing user existence).
        """
        response = client.post("/api/v1/login/", json={
            "user_name": "ghost_user_xyz",
            "password": "anypassword"
        })

        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    def test_login_empty_username_rejected(self, client):
        """
        FUNCTIONALITY: Login with empty username is rejected at validation level.
        EXPECT: 422 Unprocessable Entity.
        """
        response = client.post("/api/v1/login/", json={
            "user_name": "",
            "password": "somepassword"
        })

        # Empty string passes Pydantic (it's still a str) but fails DB lookup → 401
        assert response.status_code in [401, 422]

    def test_login_missing_username_field_rejected(self, client):
        """
        FUNCTIONALITY: Login payload must include user_name field.
        EXPECT: 422 Unprocessable Entity.
        """
        response = client.post("/api/v1/login/", json={
            "password": "somepassword"
            # missing user_name
        })

        assert response.status_code == 422

    def test_login_missing_password_field_rejected(self, client):
        """
        FUNCTIONALITY: Login payload must include password field.
        EXPECT: 422 Unprocessable Entity.
        """
        response = client.post("/api/v1/login/", json={
            "user_name": "someuser"
            # missing password
        })

        assert response.status_code == 422

    def test_login_case_sensitive_username(self, client, registered_user):
        """
        FUNCTIONALITY: Username matching is case-sensitive.
        EXPECT: 401 Unauthorized when username casing is different.
        """
        response = client.post("/api/v1/login/", json={
            "user_name": registered_user["user_name"].upper(),
            "password": registered_user["password"]
        })

        # DB query uses exact match — different case should fail
        assert response.status_code == 401

    def test_login_returns_correct_role(self, client, registered_user):
        """
        FUNCTIONALITY: Login response includes the user's role.
        EXPECT: role matches what was set during user creation.
        """
        response = client.post("/api/v1/login/", json={
            "user_name": registered_user["user_name"],
            "password": registered_user["password"]
        })

        assert response.status_code == 200
        assert response.json()["role"] == registered_user["role"]

    def test_login_returns_center_and_group(self, client, registered_user):
        """
        FUNCTIONALITY: Login response includes center and group fields.
        EXPECT: center and group match what was set during user creation.
        """
        response = client.post("/api/v1/login/", json={
            "user_name": registered_user["user_name"],
            "password": registered_user["password"]
        })

        assert response.status_code == 200
        data = response.json()
        assert data["center"] == registered_user["center"]
        assert data["group"] == registered_user["group"]

    def test_login_wrong_password_error_message_not_specific(self, client, registered_user):
        """
        FUNCTIONALITY: Error message should not reveal whether username or password was wrong.
        EXPECT: Same generic message for both wrong username and wrong password.
        """
        wrong_password_response = client.post("/api/v1/login/", json={
            "user_name": registered_user["user_name"],
            "password": "wrongpassword"
        })

        wrong_username_response = client.post("/api/v1/login/", json={
            "user_name": "nonexistent_user",
            "password": registered_user["password"]
        })

        # Both should return 401 with the same message
        assert wrong_password_response.status_code == 401
        assert wrong_username_response.status_code == 401
        assert wrong_password_response.json()["detail"] == wrong_username_response.json()["detail"]
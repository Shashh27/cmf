"""
test_access_control.py

Functionality-driven integration tests for /api/v1/access-users/ endpoints.
Covers: Create, Read, Update, Delete + duplicate/validation checks.
"""

from http import client

import pytest


# ══════════════════════════════════════════════════════════
# CREATE USER  POST /api/v1/access-users/
# ══════════════════════════════════════════════════════════

class TestCreateAccessUser:

    def test_create_user_success(self, client, sample_user_payload):
        """
        FUNCTIONALITY: A new user can be created with valid data.
        EXPECT: 201 Created + all fields returned correctly.
        """
        response = client.post("/api/v1/access-users/", json=sample_user_payload)

        assert response.status_code == 201
        data = response.json()
        assert data["user_name"] == sample_user_payload["user_name"]
        assert data["gmail"] == sample_user_payload["gmail"]
        assert data["role"] == sample_user_payload["role"]
        assert "id" in data
        assert "createdAt" in data
        assert "updatedAt" in data

    def test_create_user_duplicate_gmail_rejected(self, client, sample_user_payload):
        """
        FUNCTIONALITY: Two users cannot share the same gmail.
        EXPECT: 400 Bad Request on second attempt.
        """
        client.post("/api/v1/access-users/", json=sample_user_payload)

        duplicate = sample_user_payload.copy()
        duplicate["user_name"] = "differentuser"  # different username, same gmail

        response = client.post("/api/v1/access-users/", json=duplicate)

        assert response.status_code == 400
        assert "gmail" in response.json()["detail"].lower()

    def test_create_user_duplicate_username_rejected(self, client, sample_user_payload):
        """
        FUNCTIONALITY: Two users cannot share the same username.
        EXPECT: 400 Bad Request on second attempt.
        """
        client.post("/api/v1/access-users/", json=sample_user_payload)

        duplicate = sample_user_payload.copy()
        duplicate["gmail"] = "different@gmail.com"  # different gmail, same username

        response = client.post("/api/v1/access-users/", json=duplicate)

        assert response.status_code == 400
        assert "username" in response.json()["detail"].lower()

    def test_create_user_missing_required_fields(self, client):
        """
        FUNCTIONALITY: Required fields must be present.
        EXPECT: 422 Unprocessable Entity.
        """
        incomplete_payload = {
            "user_name": "onlyname"
            # missing gmail, role, password
        }
        response = client.post("/api/v1/access-users/", json=incomplete_payload)

        assert response.status_code == 422

    def test_create_user_optional_fields_can_be_null(self, client):
        """
        FUNCTIONALITY: center and group are optional.
        EXPECT: 201 Created even without center and group.
        """
        payload = {
            "user_name": "minimaluser",
            "gmail": "minimal@gmail.com",
            "role": "viewer",
            "password": "pass123"
            # no center, no group
        }
        response = client.post("/api/v1/access-users/", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert data["center"] is None
        assert data["group"] is None


# ══════════════════════════════════════════════════════════
# READ USERS  GET /api/v1/access-users/  and  /{id}
# ══════════════════════════════════════════════════════════

class TestGetAccessUsers:

    def test_get_all_users_returns_list(self, client, created_user):
        """
        FUNCTIONALITY: Fetching all users returns a list.
        EXPECT: 200 OK + list contains at least the created user.
        """
        response = client.get("/api/v1/access-users/")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    # def test_get_all_users_empty_db(self, client):
    #     """
    #     FUNCTIONALITY: When no users exist, returns empty list not an error.
    #     EXPECT: 200 OK + empty list.
    #     """
    #     response = client.get("/api/v1/access-users/")

    #     assert response.status_code == 200
    #     assert response.json() == []


    def test_get_all_users_empty_db(self, client):
        """
        FUNCTIONALITY: GET all users returns 200 even when no new users are created in this test.
        EXPECT: 200 OK + returns a list (may contain existing seeded data).
        """
        response = client.get("/api/v1/access-users/")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_user_by_id_success(self, client, created_user):
        """
        FUNCTIONALITY: Fetching a user by valid ID returns correct data.
        EXPECT: 200 OK + correct user fields.
        """
        user_id = created_user["id"]
        response = client.get(f"/api/v1/access-users/{user_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == user_id
        assert data["user_name"] == created_user["user_name"]
        assert data["gmail"] == created_user["gmail"]

    def test_get_user_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent user ID returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/access-users/99999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# ══════════════════════════════════════════════════════════
# UPDATE USER  PUT /api/v1/access-users/{id}
# ══════════════════════════════════════════════════════════

class TestUpdateAccessUser:

    def test_update_user_role_success(self, client, created_user):
        """
        FUNCTIONALITY: A user's role can be updated.
        EXPECT: 200 OK + updated role reflected in response.
        """
        user_id = created_user["id"]
        response = client.put(f"/api/v1/access-users/{user_id}", json={"role": "operator"})

        assert response.status_code == 200
        assert response.json()["role"] == "operator"

    def test_update_user_partial_fields(self, client, created_user):
        """
        FUNCTIONALITY: Only provided fields are updated, others stay same.
        EXPECT: 200 OK + only changed fields differ.
        """
        user_id = created_user["id"]
        response = client.put(f"/api/v1/access-users/{user_id}", json={"center": "center_b"})

        assert response.status_code == 200
        data = response.json()
        assert data["center"] == "center_b"
        assert data["user_name"] == created_user["user_name"]  # unchanged
        assert data["gmail"] == created_user["gmail"]           # unchanged

    def test_update_user_gmail_to_existing_gmail_rejected(self, client, sample_user_payload, created_user):
        """
        FUNCTIONALITY: Cannot update gmail to one already used by another user.
        EXPECT: 400 Bad Request.
        """
        second_payload = sample_user_payload.copy()
        second_payload["user_name"] = "seconduser"
        second_payload["gmail"] = "second@gmail.com"
        second_response = client.post("/api/v1/access-users/", json=second_payload)
        second_user_id = second_response.json()["id"]

        response = client.put(
            f"/api/v1/access-users/{second_user_id}",
            json={"gmail": sample_user_payload["gmail"]}
        )

        assert response.status_code == 400
        assert "gmail" in response.json()["detail"].lower()

    def test_update_user_username_to_existing_username_rejected(self, client, sample_user_payload, created_user):
        """
        FUNCTIONALITY: Cannot update username to one already taken.
        EXPECT: 400 Bad Request.
        """
        second_payload = sample_user_payload.copy()
        second_payload["user_name"] = "seconduser"
        second_payload["gmail"] = "second@gmail.com"
        second_response = client.post("/api/v1/access-users/", json=second_payload)
        second_user_id = second_response.json()["id"]

        response = client.put(
            f"/api/v1/access-users/{second_user_id}",
            json={"user_name": sample_user_payload["user_name"]}
        )

        assert response.status_code == 400
        assert "username" in response.json()["detail"].lower()

    def test_update_nonexistent_user_returns_404(self, client):
        """
        FUNCTIONALITY: Updating a user that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put("/api/v1/access-users/99999", json={"role": "admin"})

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_user_same_gmail_allowed(self, client, created_user):
        """
        FUNCTIONALITY: Updating with own existing gmail should not be rejected.
        EXPECT: 200 OK (not a conflict with itself).
        """
        user_id = created_user["id"]
        response = client.put(
            f"/api/v1/access-users/{user_id}",
            json={"gmail": created_user["gmail"]}  # same gmail, same user
        )

        assert response.status_code == 200


# ══════════════════════════════════════════════════════════
# DELETE USER  DELETE /api/v1/access-users/{id}
# ══════════════════════════════════════════════════════════

class TestDeleteAccessUser:

    def test_delete_user_success(self, client, created_user):
        """
        FUNCTIONALITY: A user can be deleted by ID.
        EXPECT: 204 No Content.
        """
        user_id = created_user["id"]
        response = client.delete(f"/api/v1/access-users/{user_id}")

        assert response.status_code == 204

    def test_deleted_user_no_longer_accessible(self, client, created_user):
        """
        FUNCTIONALITY: After deletion, the user cannot be fetched.
        EXPECT: 404 Not Found on GET after DELETE.
        """
        user_id = created_user["id"]
        client.delete(f"/api/v1/access-users/{user_id}")

        response = client.get(f"/api/v1/access-users/{user_id}")
        assert response.status_code == 404

    def test_delete_nonexistent_user_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting a user that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/access-users/99999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_user_removed_from_list(self, client, created_user):
        """
        FUNCTIONALITY: After deletion, user no longer appears in the full list.
        EXPECT: GET /api/v1/access-users/ does not include deleted user.
        """
        user_id = created_user["id"]
        client.delete(f"/api/v1/access-users/{user_id}")

        response = client.get("/api/v1/access-users/")
        ids = [u["id"] for u in response.json()]
        assert user_id not in ids
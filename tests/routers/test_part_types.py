"""
test_part_types.py

Functionality-driven integration tests for /api/v1/part-types/ endpoints.
Covers: Create, Read, Update, Delete.

Note: cmf_test already has 3 seeded part types (ids 1,2,3).
Tests create their own fresh part types and only read/delete those.
"""

import pytest


# ══════════════════════════════════════════════════════════
# CREATE PART TYPE  POST /api/v1/part-types/
# ══════════════════════════════════════════════════════════

class TestCreatePartType:

    def test_create_part_type_success(self, client):
        """
        FUNCTIONALITY: A new part type can be created with a valid name.
        EXPECT: 201 Created + fields returned correctly.
        """
        response = client.post("/api/v1/part-types/", json={"type_name": "TestType"})

        assert response.status_code == 201
        data = response.json()
        assert data["type_name"] == "TestType"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_part_type_with_user_id(self, client):
        """
        FUNCTIONALITY: A part type can be created with an optional user_id.
        EXPECT: 201 Created + user_id reflected in response.
        """
        response = client.post("/api/v1/part-types/", json={
            "type_name": "TypeWithUser",
            "user_id": 30
        })

        assert response.status_code == 201
        assert response.json()["user_id"] == 30

    def test_create_part_type_without_user_id(self, client):
        """
        FUNCTIONALITY: user_id is optional — part type can be created without it.
        EXPECT: 201 Created + user_id is null.
        """
        response = client.post("/api/v1/part-types/", json={"type_name": "TypeNoUser"})

        assert response.status_code == 201
        assert response.json()["user_id"] is None

    def test_create_part_type_missing_type_name_rejected(self, client):
        """
        FUNCTIONALITY: type_name is required — cannot create without it.
        EXPECT: 422 Unprocessable Entity.
        """
        response = client.post("/api/v1/part-types/", json={"user_id": 30})

        assert response.status_code == 422


# ══════════════════════════════════════════════════════════
# READ PART TYPES  GET /api/v1/part-types/  and  /{id}
# ══════════════════════════════════════════════════════════

class TestGetPartTypes:

    def test_get_all_part_types_returns_list(self, client):
        """
        FUNCTIONALITY: GET all part types returns a list.
        EXPECT: 200 OK + list type + contains seeded types (IN-House, Out-Source, STANDARD).
        """
        response = client.get("/api/v1/part-types/")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # at least the 3 seeded types exist

    def test_get_all_part_types_ordered_by_id(self, client):
        """
        FUNCTIONALITY: Part types are returned ordered by ID ascending.
        EXPECT: First item has lower ID than second.
        """
        response = client.get("/api/v1/part-types/")

        assert response.status_code == 200
        data = response.json()
        if len(data) >= 2:
            assert data[0]["id"] < data[1]["id"]

    def test_get_part_type_by_id_success(self, client):
        """
        FUNCTIONALITY: Fetching a part type by valid ID returns correct data.
        EXPECT: 200 OK + correct fields returned.
        Uses seeded type_id 1 (IN-House) from cmf_test.
        """
        response = client.get("/api/v1/part-types/1")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 1
        assert data["type_name"] is not None

    def test_get_part_type_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent part type ID returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/part-types/99999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_all_part_types_includes_created_type(self, client):
        """
        FUNCTIONALITY: A newly created part type appears in the full list.
        EXPECT: GET all returns the newly created type.
        """
        # Create a fresh type
        create_response = client.post("/api/v1/part-types/", json={"type_name": "NewListType"})
        new_id = create_response.json()["id"]

        response = client.get("/api/v1/part-types/")

        ids = [t["id"] for t in response.json()]
        assert new_id in ids


# ══════════════════════════════════════════════════════════
# UPDATE PART TYPE  PUT /api/v1/part-types/{id}
# ══════════════════════════════════════════════════════════

class TestUpdatePartType:

    def test_update_part_type_name_success(self, client):
        """
        FUNCTIONALITY: A part type's name can be updated.
        EXPECT: 200 OK + updated type_name in response.
        """
        # Create a fresh type to update
        create_response = client.post("/api/v1/part-types/", json={"type_name": "OriginalType"})
        type_id = create_response.json()["id"]

        response = client.put(f"/api/v1/part-types/{type_id}", json={"type_name": "UpdatedType"})

        assert response.status_code == 200
        assert response.json()["type_name"] == "UpdatedType"

    def test_update_part_type_user_id(self, client):
        """
        FUNCTIONALITY: A part type's user_id can be updated.
        EXPECT: 200 OK + updated user_id in response.
        """
        create_response = client.post("/api/v1/part-types/", json={"type_name": "TypeForUserUpdate"})
        type_id = create_response.json()["id"]

        response = client.put(f"/api/v1/part-types/{type_id}", json={"user_id": 30})

        assert response.status_code == 200
        assert response.json()["user_id"] == 30

    def test_update_part_type_partial_update(self, client):
        """
        FUNCTIONALITY: Only provided fields are updated; others stay the same.
        EXPECT: 200 OK + unchanged fields match original values.
        """
        create_response = client.post("/api/v1/part-types/", json={
            "type_name": "PartialUpdateType",
            "user_id": 30
        })
        type_id = create_response.json()["id"]

        # Update only type_name
        response = client.put(f"/api/v1/part-types/{type_id}", json={"type_name": "PartialUpdated"})

        assert response.status_code == 200
        data = response.json()
        assert data["type_name"] == "PartialUpdated"
        assert data["user_id"] == 30  # unchanged

    def test_update_nonexistent_part_type_returns_404(self, client):
        """
        FUNCTIONALITY: Updating a part type that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put("/api/v1/part-types/99999", json={"type_name": "ghost"})

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_part_type_reflects_in_get(self, client):
        """
        FUNCTIONALITY: After update, fetching the part type returns the new value.
        EXPECT: GET /{id} returns updated type_name.
        """
        create_response = client.post("/api/v1/part-types/", json={"type_name": "BeforeUpdate"})
        type_id = create_response.json()["id"]

        client.put(f"/api/v1/part-types/{type_id}", json={"type_name": "AfterUpdate"})

        response = client.get(f"/api/v1/part-types/{type_id}")
        assert response.json()["type_name"] == "AfterUpdate"


# ══════════════════════════════════════════════════════════
# DELETE PART TYPE  DELETE /api/v1/part-types/{id}
# ══════════════════════════════════════════════════════════

class TestDeletePartType:

    def test_delete_part_type_success(self, client):
        """
        FUNCTIONALITY: A newly created part type can be deleted.
        EXPECT: 204 No Content.
        """
        create_response = client.post("/api/v1/part-types/", json={"type_name": "ToDelete"})
        type_id = create_response.json()["id"]

        response = client.delete(f"/api/v1/part-types/{type_id}")

        assert response.status_code == 204

    def test_deleted_part_type_no_longer_accessible(self, client):
        """
        FUNCTIONALITY: After deletion, the part type cannot be fetched by ID.
        EXPECT: 404 Not Found on GET after DELETE.
        """
        create_response = client.post("/api/v1/part-types/", json={"type_name": "ToDeleteAndCheck"})
        type_id = create_response.json()["id"]

        client.delete(f"/api/v1/part-types/{type_id}")

        response = client.get(f"/api/v1/part-types/{type_id}")
        assert response.status_code == 404

    def test_delete_part_type_removed_from_list(self, client):
        """
        FUNCTIONALITY: After deletion, part type no longer appears in the full list.
        EXPECT: GET /part-types/ does not include deleted type.
        """
        create_response = client.post("/api/v1/part-types/", json={"type_name": "ToDeleteFromList"})
        type_id = create_response.json()["id"]

        client.delete(f"/api/v1/part-types/{type_id}")

        response = client.get("/api/v1/part-types/")
        ids = [t["id"] for t in response.json()]
        assert type_id not in ids

    def test_delete_nonexistent_part_type_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting a part type that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/part-types/99999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
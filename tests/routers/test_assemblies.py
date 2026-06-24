"""
test_assemblies.py

Functionality-driven integration tests for /api/v1/assemblies/ endpoints.
Covers: Create, Read (with filters), Update, Delete (soft delete with cascade).

Real test DB seed references (cmf_test):
  product_id with assemblies : 14  (Control Valve Assembly)
  assembly with parts        : 24  (Wire Tunnel Assembly — 4 parts)
  assembly with parts        : 25  (Balance Pins Assembly — 2 parts)
  assembly with child        : 28  (Primary Control Assembly — 1 child assembly)
  user_id (admin)            : 16
  user_id (supervisor)       : 30
"""

import uuid
import pytest


# ─────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────

def unique_assembly_name():
    return f"Test Assembly {uuid.uuid4().hex[:8].upper()}"

def unique_assembly_number():
    return f"ASM-{uuid.uuid4().hex[:6].upper()}"


# ─────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────

@pytest.fixture
def sample_assembly_payload():
    """Minimal valid payload to create an assembly."""
    return {
        "assembly_name": unique_assembly_name(),
        "assembly_number": unique_assembly_number(),
        "product_id": 14,
        "parent_id": None,
        "user_id": 16,
        "recycle_bin": False,
    }


@pytest.fixture
def created_assembly(client, sample_assembly_payload):
    """Creates an assembly and returns the response data."""
    response = client.post("/api/v1/assemblies/", json=sample_assembly_payload)
    assert response.status_code == 201, response.text
    return response.json()


# ══════════════════════════════════════════════════════════
# CREATE ASSEMBLY  POST /api/v1/assemblies/
# ══════════════════════════════════════════════════════════

class TestCreateAssembly:

    def test_create_assembly_success(self, client, sample_assembly_payload):
        """
        FUNCTIONALITY: A new assembly can be created with valid data.
        EXPECT: 201 Created + all key fields returned correctly.
        """
        response = client.post("/api/v1/assemblies/", json=sample_assembly_payload)

        assert response.status_code == 201
        data = response.json()
        assert data["assembly_name"] == sample_assembly_payload["assembly_name"]
        assert data["assembly_number"] == sample_assembly_payload["assembly_number"]
        assert data["product_id"] == sample_assembly_payload["product_id"]
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_assembly_response_includes_user_name(self, client, sample_assembly_payload):
        """
        FUNCTIONALITY: Response enriches user_id with user_name.
        EXPECT: user_name is not null.
        """
        response = client.post("/api/v1/assemblies/", json=sample_assembly_payload)

        assert response.status_code == 201
        assert response.json()["user_name"] is not None

    def test_create_assembly_with_parent_id(self, client, sample_assembly_payload):
        """
        FUNCTIONALITY: An assembly can be created as a child of another assembly.
        EXPECT: 201 Created + parent_id reflected in response.
        """
        sample_assembly_payload["parent_id"] = 23  # Protusion System Assembly

        response = client.post("/api/v1/assemblies/", json=sample_assembly_payload)

        assert response.status_code == 201
        assert response.json()["parent_id"] == 23

    def test_create_assembly_without_product_id(self, client):
        """
        FUNCTIONALITY: product_id is optional — assembly can be created without it.
        EXPECT: 201 Created + product_id is null.
        """
        payload = {
            "assembly_name": unique_assembly_name(),
            "assembly_number": unique_assembly_number(),
            "user_id": 16,
        }
        response = client.post("/api/v1/assemblies/", json=payload)

        assert response.status_code == 201
        assert response.json()["product_id"] is None

    def test_create_assembly_without_user_id(self, client):
        """
        FUNCTIONALITY: user_id is optional — assembly can be created without it.
        EXPECT: 201 Created + user_id is null.
        """
        payload = {
            "assembly_name": unique_assembly_name(),
            "assembly_number": unique_assembly_number(),
            "product_id": 14,
        }
        response = client.post("/api/v1/assemblies/", json=payload)

        assert response.status_code == 201
        assert response.json()["user_id"] is None

    def test_create_assembly_missing_required_fields_rejected(self, client):
        """
        FUNCTIONALITY: assembly_name and assembly_number are required.
        EXPECT: 422 Unprocessable Entity.
        """
        response = client.post("/api/v1/assemblies/", json={"product_id": 14})

        assert response.status_code == 422

    def test_create_assembly_recycle_bin_defaults_to_false(self, client, sample_assembly_payload):
        """
        FUNCTIONALITY: New assemblies are not in recycle bin by default.
        EXPECT: recycle_bin == False in response.
        """
        response = client.post("/api/v1/assemblies/", json=sample_assembly_payload)

        assert response.status_code == 201
        assert response.json()["recycle_bin"] == False


# ══════════════════════════════════════════════════════════
# READ ASSEMBLIES  GET /api/v1/assemblies/  and  /{id}
# ══════════════════════════════════════════════════════════

class TestGetAssemblies:

    def test_get_all_assemblies_returns_list(self, client, created_assembly):
        """
        FUNCTIONALITY: GET all assemblies returns a list.
        EXPECT: 200 OK + list type + created assembly is included.
        """
        response = client.get("/api/v1/assemblies/")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        ids = [a["id"] for a in data]
        assert created_assembly["id"] in ids

    def test_get_all_assemblies_ordered_by_id(self, client, created_assembly):
        """
        FUNCTIONALITY: Assemblies returned ordered by ID ascending.
        EXPECT: First item ID < second item ID.
        """
        response = client.get("/api/v1/assemblies/")

        assert response.status_code == 200
        data = response.json()
        if len(data) >= 2:
            assert data[0]["id"] < data[1]["id"]

    def test_get_assemblies_filter_by_user_id(self, client, sample_assembly_payload):
        """
        FUNCTIONALITY: Filtering by user_id returns only assemblies for that user.
        EXPECT: All returned assemblies have user_id == 16.
        """
        client.post("/api/v1/assemblies/", json=sample_assembly_payload)

        response = client.get("/api/v1/assemblies/", params={"user_id": 16})

        assert response.status_code == 200
        data = response.json()
        for assembly in data:
            assert assembly["user_id"] == 16

    def test_get_assembly_by_id_success(self, client, created_assembly):
        """
        FUNCTIONALITY: Fetching an assembly by valid ID returns correct data.
        EXPECT: 200 OK + correct fields returned.
        """
        assembly_id = created_assembly["id"]
        response = client.get(f"/api/v1/assemblies/{assembly_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == assembly_id
        assert data["assembly_name"] == created_assembly["assembly_name"]
        assert data["assembly_number"] == created_assembly["assembly_number"]

    def test_get_assembly_by_id_includes_user_name(self, client, created_assembly):
        """
        FUNCTIONALITY: Assembly by ID response includes user_name enrichment.
        EXPECT: user_name is not null.
        """
        assembly_id = created_assembly["id"]
        response = client.get(f"/api/v1/assemblies/{assembly_id}")

        assert response.status_code == 200
        assert response.json()["user_name"] is not None

    def test_get_assembly_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent assembly ID returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/assemblies/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_assemblies_by_product_id(self, client, created_assembly):
        """
        FUNCTIONALITY: GET /assemblies/product/{product_id} returns only
        assemblies for that product.
        EXPECT: 200 OK + all returned assemblies have product_id == 14.
        """
        response = client.get("/api/v1/assemblies/product/14")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for assembly in data:
            assert assembly["product_id"] == 14

    def test_get_assemblies_by_product_id_includes_created_assembly(self, client, created_assembly):
        """
        FUNCTIONALITY: Newly created assembly appears in product filter results.
        EXPECT: created assembly is in GET /assemblies/product/14 results.
        """
        response = client.get("/api/v1/assemblies/product/14")

        ids = [a["id"] for a in response.json()]
        assert created_assembly["id"] in ids

    def test_get_child_assemblies_by_parent_id(self, client, sample_assembly_payload):
        """
        FUNCTIONALITY: GET /assemblies/parent/{parent_id} returns child assemblies.
        EXPECT: 200 OK + all returned assemblies have parent_id == 28.
        """
        # Create a child assembly under parent 28
        sample_assembly_payload["parent_id"] = 28
        client.post("/api/v1/assemblies/", json=sample_assembly_payload)

        response = client.get("/api/v1/assemblies/parent/28")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for assembly in data:
            assert assembly["parent_id"] == 28

    def test_get_child_assemblies_returns_list_for_existing_parent(self, client):
        """
        FUNCTIONALITY: Assembly 28 already has a child — verify it's returned.
        EXPECT: 200 OK + non-empty list.
        """
        response = client.get("/api/v1/assemblies/parent/28")

        assert response.status_code == 200
        assert len(response.json()) >= 1


# ══════════════════════════════════════════════════════════
# UPDATE ASSEMBLY  PUT /api/v1/assemblies/{assembly_id}
# ══════════════════════════════════════════════════════════

class TestUpdateAssembly:

    def test_update_assembly_name_success(self, client, created_assembly):
        """
        FUNCTIONALITY: Assembly name can be updated.
        EXPECT: 200 OK + updated assembly_name in response.
        """
        assembly_id = created_assembly["id"]
        new_name = unique_assembly_name()
        response = client.put(f"/api/v1/assemblies/{assembly_id}", json={"assembly_name": new_name})

        assert response.status_code == 200
        assert response.json()["assembly_name"] == new_name

    def test_update_assembly_number_success(self, client, created_assembly):
        """
        FUNCTIONALITY: Assembly number can be updated.
        EXPECT: 200 OK + updated assembly_number in response.
        """
        assembly_id = created_assembly["id"]
        new_number = unique_assembly_number()
        response = client.put(f"/api/v1/assemblies/{assembly_id}", json={"assembly_number": new_number})

        assert response.status_code == 200
        assert response.json()["assembly_number"] == new_number

    def test_update_assembly_partial_fields_others_unchanged(self, client, created_assembly):
        """
        FUNCTIONALITY: Only provided fields are updated; others stay the same.
        EXPECT: 200 OK + unchanged fields match original values.
        """
        assembly_id = created_assembly["id"]
        original_number = created_assembly["assembly_number"]

        response = client.put(
            f"/api/v1/assemblies/{assembly_id}",
            json={"assembly_name": unique_assembly_name()}
        )

        assert response.status_code == 200
        assert response.json()["assembly_number"] == original_number  # unchanged

    def test_update_assembly_recycle_bin_flag(self, client, created_assembly):
        """
        FUNCTIONALITY: recycle_bin flag can be toggled via update.
        EXPECT: 200 OK + recycle_bin == True after update.
        """
        assembly_id = created_assembly["id"]
        response = client.put(
            f"/api/v1/assemblies/{assembly_id}",
            json={"recycle_bin": True}
        )

        assert response.status_code == 200
        assert response.json()["recycle_bin"] == True

    def test_update_assembly_response_includes_user_name(self, client, created_assembly):
        """
        FUNCTIONALITY: Update response includes user_name enrichment.
        EXPECT: user_name is not null after update.
        """
        assembly_id = created_assembly["id"]
        response = client.put(
            f"/api/v1/assemblies/{assembly_id}",
            json={"assembly_name": unique_assembly_name()}
        )

        assert response.status_code == 200
        assert response.json()["user_name"] is not None

    def test_update_nonexistent_assembly_returns_404(self, client):
        """
        FUNCTIONALITY: Updating an assembly that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put(
            "/api/v1/assemblies/99999999",
            json={"assembly_name": "ghost"}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_assembly_reflects_in_get(self, client, created_assembly):
        """
        FUNCTIONALITY: After update, fetching the assembly returns the new values.
        EXPECT: GET /{id} returns updated assembly_name.
        """
        assembly_id = created_assembly["id"]
        new_name = unique_assembly_name()
        client.put(f"/api/v1/assemblies/{assembly_id}", json={"assembly_name": new_name})

        response = client.get(f"/api/v1/assemblies/{assembly_id}")
        assert response.json()["assembly_name"] == new_name


# ══════════════════════════════════════════════════════════
# DELETE (SOFT DELETE)  DELETE /api/v1/assemblies/{assembly_id}
# ══════════════════════════════════════════════════════════

class TestDeleteAssembly:

    def test_soft_delete_assembly_success(self, client, created_assembly):
        """
        FUNCTIONALITY: Deleting an assembly moves it to recycle bin (soft delete).
        EXPECT: 200 OK (not 204 — router returns None but no explicit status).
        """
        assembly_id = created_assembly["id"]
        response = client.delete(f"/api/v1/assemblies/{assembly_id}")

        assert response.status_code == 200

    def test_soft_delete_sets_recycle_bin_true(self, client, created_assembly):
        """
        FUNCTIONALITY: After soft delete, assembly recycle_bin flag is True.
        EXPECT: GET /{id} returns recycle_bin == True (assembly still exists in DB).
        """
        assembly_id = created_assembly["id"]
        client.delete(f"/api/v1/assemblies/{assembly_id}")

        response = client.get(f"/api/v1/assemblies/{assembly_id}")
        assert response.status_code == 200
        assert response.json()["recycle_bin"] == True

    def test_soft_delete_assembly_still_exists_in_db(self, client, created_assembly):
        """
        FUNCTIONALITY: Soft deleted assembly is NOT permanently removed — still fetchable by ID.
        EXPECT: GET /{id} still returns 200 (unlike hard delete which returns 404).
        """
        assembly_id = created_assembly["id"]
        client.delete(f"/api/v1/assemblies/{assembly_id}")

        response = client.get(f"/api/v1/assemblies/{assembly_id}")
        assert response.status_code == 200  # still exists, just flagged

    def test_soft_delete_cascades_parts_to_recycle_bin(self, client):
        """
        FUNCTIONALITY: Soft deleting an assembly also moves its parts to recycle bin.
        EXPECT: Parts linked to assembly 24 (Wire Tunnel — 4 parts) have recycle_bin = True.

        NOTE: Uses fresh assembly created with parts via creating parts on it.
        We verify cascade via checking parts endpoint for assembly after delete.
        """
        # Create a fresh assembly
        asm_response = client.post("/api/v1/assemblies/", json={
            "assembly_name": unique_assembly_name(),
            "assembly_number": unique_assembly_number(),
            "product_id": 47,
            "user_id": 16,
        })
        assembly_id = asm_response.json()["id"]

        # Create a part linked to this assembly
        part_response = client.post("/api/v1/parts/", json={
            "part_name": "Cascade Test Part",
            "part_number": unique_assembly_number(),
            "type_id": 1,
            "assembly_id": assembly_id,
            "product_id": 47,
        })
        part_id = part_response.json()["id"]

        # Soft delete the assembly
        client.delete(f"/api/v1/assemblies/{assembly_id}")

        # Verify the part is also in recycle bin
        part_response = client.get(f"/api/v1/parts/{part_id}")
        assert part_response.status_code == 200
        assert part_response.json()["recycle_bin"] == True

    def test_soft_delete_nonexistent_assembly_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting an assembly that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/assemblies/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_soft_delete_cascades_to_sub_assemblies(self, client):
        """
        FUNCTIONALITY: Soft deleting a parent assembly also moves all child
        assemblies to recycle bin (recursive cascade).
        EXPECT: Child assembly recycle_bin == True after parent is soft deleted.
        """
        # Create a parent assembly
        parent_response = client.post("/api/v1/assemblies/", json={
            "assembly_name": unique_assembly_name(),
            "assembly_number": unique_assembly_number(),
            "product_id": 47,
            "user_id": 16,
        })
        parent_id = parent_response.json()["id"]

        # Create a child assembly under the parent
        child_response = client.post("/api/v1/assemblies/", json={
            "assembly_name": unique_assembly_name(),
            "assembly_number": unique_assembly_number(),
            "product_id": 47,
            "parent_id": parent_id,
            "user_id": 16,
        })
        child_id = child_response.json()["id"]

        # Soft delete the parent
        client.delete(f"/api/v1/assemblies/{parent_id}")

        # Verify child is also in recycle bin
        child_check = client.get(f"/api/v1/assemblies/{child_id}")
        assert child_check.status_code == 200
        assert child_check.json()["recycle_bin"] == True
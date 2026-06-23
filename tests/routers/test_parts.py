"""
test_parts.py

Functionality-driven integration tests for /api/v1/parts/ endpoints.
Covers: Create, Read, Update, Delete + duplicate/validation/recycle bin checks.

Real test DB seed references (cmf_test):
  product_id        : 47  (Hydro Locking tool holder)
  type_id (inhouse) : 1   (IN-House)
  type_id (outsrc)  : 2   (Out-Source)
  type_id (standard): 3   (STANDARD)
  assembly_id       : 23  (Protusion System Assembly) — NOT in recycle bin
  recycle_bin_asm   : 55  (assm1) — IN recycle bin
  user_id           : 30  (supervisor)
  raw_material_id   : 1   (45C8)
  existing_part_id  : 1575 — used only for safe read tests
"""

import uuid
import pytest


# ─────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────

def unique_part_number():
    """Generate a unique part number so tests never collide."""
    return f"TEST-{uuid.uuid4().hex[:8].upper()}"


# ─────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────

@pytest.fixture
def sample_part_payload():
    """Minimal valid payload to create a part."""
    return {
        "part_name": "Test Part",
        "part_number": unique_part_number(),
        "type_id": 1,           # IN-House
        "product_id": 47,       # Hydro Locking tool holder
        "user_id": 30,          # supervisor
        "qty": 5,
        "size": "10x20",
        "assembly_id": None,
        "raw_material_id": None,
        "part_detail": None,
        "vendor_id": None,
    }


@pytest.fixture
def created_part(client, sample_part_payload):
    """
    Creates a part and returns the response data.
    Use this when the test needs a pre-existing part.
    """
    response = client.post("/api/v1/parts/", json=sample_part_payload)
    assert response.status_code == 201, response.text
    return response.json()


# ══════════════════════════════════════════════════════════
# CREATE PART  POST /api/v1/parts/
# ══════════════════════════════════════════════════════════

class TestCreatePart:

    def test_create_part_success(self, client, sample_part_payload):
        """
        FUNCTIONALITY: A new part can be created with valid data.
        EXPECT: 201 Created + all key fields returned correctly.
        """
        response = client.post("/api/v1/parts/", json=sample_part_payload)

        assert response.status_code == 201
        data = response.json()
        assert data["part_name"] == sample_part_payload["part_name"]
        assert data["part_number"] == sample_part_payload["part_number"]
        assert data["type_id"] == sample_part_payload["type_id"]
        assert data["product_id"] == sample_part_payload["product_id"]
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_part_response_includes_type_name(self, client, sample_part_payload):
        """
        FUNCTIONALITY: Response enriches type_id with human-readable type_name.
        EXPECT: type_name is not null.
        """
        response = client.post("/api/v1/parts/", json=sample_part_payload)

        assert response.status_code == 201
        assert response.json()["type_name"] is not None

    def test_create_part_duplicate_part_number_in_same_product_rejected(self, client, sample_part_payload):
        """
        FUNCTIONALITY: Two parts cannot share the same part_number within the same product.
        EXPECT: 400 Bad Request on second attempt.
        """
        client.post("/api/v1/parts/", json=sample_part_payload)

        duplicate = sample_part_payload.copy()
        duplicate["part_name"] = "Different Name Same Number"
        # same part_number, same product_id

        response = client.post("/api/v1/parts/", json=duplicate)

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    def test_create_part_same_part_number_different_product_allowed(self, client, sample_part_payload):
        """
        FUNCTIONALITY: Same part_number is allowed across different products.
        EXPECT: 201 Created for second part with different product_id.
        """
        client.post("/api/v1/parts/", json=sample_part_payload)

        different_product = sample_part_payload.copy()
        different_product["product_id"] = 60  # QUALITY product

        response = client.post("/api/v1/parts/", json=different_product)

        assert response.status_code == 201

    def test_create_part_with_assembly_id_success(self, client, sample_part_payload):
        """
        FUNCTIONALITY: A part can be linked to a valid assembly.
        EXPECT: 201 Created + assembly_id reflected in response.
        """
        sample_part_payload["assembly_id"] = 23  # Protusion System Assembly (not in recycle bin)

        response = client.post("/api/v1/parts/", json=sample_part_payload)

        assert response.status_code == 201
        assert response.json()["assembly_id"] == 23

    def test_create_part_with_assembly_in_recycle_bin_rejected(self, client, sample_part_payload):
        """
        FUNCTIONALITY: Cannot add a part to an assembly that is in the recycle bin.
        EXPECT: 400 Bad Request with recycle bin message.
        """
        sample_part_payload["assembly_id"] = 55  # assm1 — in recycle bin

        response = client.post("/api/v1/parts/", json=sample_part_payload)

        assert response.status_code == 400
        assert "recycle bin" in response.json()["detail"].lower()

    def test_create_part_with_raw_material(self, client, sample_part_payload):
        """
        FUNCTIONALITY: A part can be created with a raw material linked.
        EXPECT: 201 Created + raw_material_id in response.
        """
        sample_part_payload["raw_material_id"] = 1  # 45C8

        response = client.post("/api/v1/parts/", json=sample_part_payload)

        assert response.status_code == 201
        assert response.json()["raw_material_id"] == 1

    def test_create_part_outsource_type(self, client, sample_part_payload):
        """
        FUNCTIONALITY: A part can be created with Out-Source type.
        EXPECT: 201 Created + type_id == 2.
        """
        sample_part_payload["type_id"] = 2  # Out-Source

        response = client.post("/api/v1/parts/", json=sample_part_payload)

        assert response.status_code == 201
        assert response.json()["type_id"] == 2

    def test_create_part_missing_required_fields_rejected(self, client):
        """
        FUNCTIONALITY: Required fields (part_name, part_number, type_id) must be present.
        EXPECT: 422 Unprocessable Entity.
        """
        incomplete = {"part_name": "only name"}  # missing part_number, type_id

        response = client.post("/api/v1/parts/", json=incomplete)

        assert response.status_code == 422

    def test_create_part_optional_fields_can_be_null(self, client, sample_part_payload):
        """
        FUNCTIONALITY: Optional fields (assembly_id, raw_material_id) can be omitted.
        EXPECT: 201 Created without optional fields — assembly_id and raw_material_id are null.
        """
        minimal = {
            "part_name": "Minimal Part",
            "part_number": unique_part_number(),
            "type_id": 1,
        }

        response = client.post("/api/v1/parts/", json=minimal)

        assert response.status_code == 201
        data = response.json()
        assert data["assembly_id"] is None
        assert data["raw_material_id"] is None


# ══════════════════════════════════════════════════════════
# READ PARTS  GET /api/v1/parts/  and  /{part_id}
# ══════════════════════════════════════════════════════════

class TestGetParts:

    def test_get_all_parts_returns_list(self, client, created_part):
        """
        FUNCTIONALITY: GET all parts returns a list.
        EXPECT: 200 OK + list type + contains created part.
        """
        response = client.get("/api/v1/parts/")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        ids = [p["id"] for p in data]
        assert created_part["id"] in ids

    def test_get_all_parts_returns_enriched_data(self, client, created_part):
        """
        FUNCTIONALITY: Each part in list includes type_name enrichment.
        EXPECT: type_name present and not null for our created part.
        """
        response = client.get("/api/v1/parts/")

        assert response.status_code == 200
        our_part = next((p for p in response.json() if p["id"] == created_part["id"]), None)
        assert our_part is not None
        assert our_part["type_name"] is not None

    def test_get_part_by_id_success(self, client, created_part):
        """
        FUNCTIONALITY: Fetching a part by valid ID returns correct data.
        EXPECT: 200 OK + correct part fields.
        """
        part_id = created_part["id"]
        response = client.get(f"/api/v1/parts/{part_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == part_id
        assert data["part_name"] == created_part["part_name"]
        assert data["part_number"] == created_part["part_number"]

    def test_get_part_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent part ID returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/parts/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_parts_by_product_id(self, client, created_part):
        """
        FUNCTIONALITY: GET /parts/product/{product_id} returns only parts for that product.
        EXPECT: 200 OK + all returned parts have product_id == 47.
        """
        response = client.get("/api/v1/parts/product/47")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for part in data:
            assert part["product_id"] == 47

    def test_get_parts_by_assembly_id(self, client, sample_part_payload):
        """
        FUNCTIONALITY: GET /parts/assembly/{assembly_id} returns parts for that assembly.
        EXPECT: 200 OK + all returned parts have assembly_id == 23.
        """
        sample_part_payload["assembly_id"] = 23
        client.post("/api/v1/parts/", json=sample_part_payload)

        response = client.get("/api/v1/parts/assembly/23")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for part in data:
            assert part["assembly_id"] == 23

    def test_get_parts_by_type_id(self, client, created_part):
        """
        FUNCTIONALITY: GET /parts/type/{type_id} returns only parts of that type.
        EXPECT: 200 OK + all returned parts have type_id == 1.
        """
        response = client.get("/api/v1/parts/type/1")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for part in data:
            assert part["type_id"] == 1

    def test_get_existing_part_from_db(self, client):
        """
        FUNCTIONALITY: An existing part in cmf_test can be fetched by ID.
        EXPECT: 200 OK + part data returned.
        """
        response = client.get("/api/v1/parts/1575")

        assert response.status_code == 200
        assert response.json()["id"] == 1575


# ══════════════════════════════════════════════════════════
# UPDATE PART  PUT /api/v1/parts/{part_id}
# ══════════════════════════════════════════════════════════

class TestUpdatePart:

    def test_update_part_name_success(self, client, created_part):
        """
        FUNCTIONALITY: A part's name can be updated.
        EXPECT: 200 OK + updated part_name in response.
        """
        part_id = created_part["id"]
        response = client.put(f"/api/v1/parts/{part_id}", json={"part_name": "Updated Part Name"})

        assert response.status_code == 200
        assert response.json()["part_name"] == "Updated Part Name"

    def test_update_part_qty_success(self, client, created_part):
        """
        FUNCTIONALITY: A part's quantity can be updated.
        EXPECT: 200 OK + updated qty in response.
        """
        part_id = created_part["id"]
        response = client.put(f"/api/v1/parts/{part_id}", json={"qty": 99})

        assert response.status_code == 200
        assert response.json()["qty"] == 99

    def test_update_part_type_success(self, client, created_part):
        """
        FUNCTIONALITY: A part's type can be changed.
        EXPECT: 200 OK + updated type_id in response.
        """
        part_id = created_part["id"]
        response = client.put(f"/api/v1/parts/{part_id}", json={"type_id": 3})  # STANDARD

        assert response.status_code == 200
        assert response.json()["type_id"] == 3

    def test_update_part_partial_fields_others_unchanged(self, client, created_part):
        """
        FUNCTIONALITY: Only provided fields are updated; others stay the same.
        EXPECT: 200 OK + unchanged fields match original values.
        """
        part_id = created_part["id"]
        original_part_number = created_part["part_number"]

        response = client.put(f"/api/v1/parts/{part_id}", json={"qty": 10})

        assert response.status_code == 200
        data = response.json()
        assert data["qty"] == 10
        assert data["part_number"] == original_part_number  # unchanged

    def test_update_part_add_raw_material(self, client, created_part):
        """
        FUNCTIONALITY: Raw material can be linked to an existing part.
        EXPECT: 200 OK + raw_material_id updated.
        """
        part_id = created_part["id"]
        response = client.put(f"/api/v1/parts/{part_id}", json={"raw_material_id": 1})

        assert response.status_code == 200
        assert response.json()["raw_material_id"] == 1

    def test_update_nonexistent_part_returns_404(self, client):
        """
        FUNCTIONALITY: Updating a part that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put("/api/v1/parts/99999999", json={"part_name": "ghost"})

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_part_size(self, client, created_part):
        """
        FUNCTIONALITY: A part's size specification can be updated.
        EXPECT: 200 OK + updated size in response.
        """
        part_id = created_part["id"]
        response = client.put(f"/api/v1/parts/{part_id}", json={"size": "50x100"})

        assert response.status_code == 200
        assert response.json()["size"] == "50x100"


# ══════════════════════════════════════════════════════════
# DELETE PART  DELETE /api/v1/parts/{part_id}
# ══════════════════════════════════════════════════════════

class TestDeletePart:

    def test_delete_part_success(self, client, created_part):
        """
        FUNCTIONALITY: A newly created part can be deleted.
        EXPECT: 204 No Content.
        """
        part_id = created_part["id"]
        response = client.delete(f"/api/v1/parts/{part_id}")

        assert response.status_code == 204

    def test_deleted_part_no_longer_accessible(self, client, created_part):
        """
        FUNCTIONALITY: After deletion, the part cannot be fetched by ID.
        EXPECT: 404 Not Found on GET after DELETE.
        """
        part_id = created_part["id"]
        client.delete(f"/api/v1/parts/{part_id}")

        response = client.get(f"/api/v1/parts/{part_id}")
        assert response.status_code == 404

    def test_delete_part_removed_from_list(self, client, created_part):
        """
        FUNCTIONALITY: After deletion, part no longer appears in the full list.
        EXPECT: GET /api/v1/parts/ does not include the deleted part.
        """
        part_id = created_part["id"]
        client.delete(f"/api/v1/parts/{part_id}")

        response = client.get("/api/v1/parts/")
        ids = [p["id"] for p in response.json()]
        assert part_id not in ids

    def test_delete_nonexistent_part_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting a part that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/parts/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_part_removed_from_product(self, client, sample_part_payload):
        """
        FUNCTIONALITY: After deletion, part no longer appears under its product.
        EXPECT: GET /parts/product/47 does not include the deleted part.
        """
        response = client.post("/api/v1/parts/", json=sample_part_payload)
        part_id = response.json()["id"]

        client.delete(f"/api/v1/parts/{part_id}")

        response = client.get("/api/v1/parts/product/47")
        ids = [p["id"] for p in response.json()]
        assert part_id not in ids


# ══════════════════════════════════════════════════════════
# BULK CREATE  POST /api/v1/parts/bulk
# ══════════════════════════════════════════════════════════

class TestBulkCreateParts:

    def test_bulk_create_parts_success(self, client):
        """
        FUNCTIONALITY: Multiple parts can be created in a single request.
        EXPECT: 200 OK + all parts in 'created' list + no errors/duplicates.
        """
        payload = {
            "parts": [
                {
                    "part_name": "Bulk Part 1",
                    "part_number": unique_part_number(),
                    "type_id": 1,
                    "product_id": 47,
                },
                {
                    "part_name": "Bulk Part 2",
                    "part_number": unique_part_number(),
                    "type_id": 1,
                    "product_id": 47,
                }
            ]
        }

        response = client.post("/api/v1/parts/bulk", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert len(data["created"]) == 2
        assert len(data["duplicates"]) == 0
        assert len(data["errors"]) == 0

    def test_bulk_create_skips_duplicate_part_numbers(self, client, created_part):
        """
        FUNCTIONALITY: Bulk create skips parts whose part_number already exists in the product.
        EXPECT: Duplicate goes into 'duplicates' list, not 'created'.
        """
        payload = {
            "parts": [
                {
                    "part_name": "Duplicate Part",
                    "part_number": created_part["part_number"],  # already exists
                    "type_id": 1,
                    "product_id": 47,
                },
                {
                    "part_name": "New Part",
                    "part_number": unique_part_number(),
                    "type_id": 1,
                    "product_id": 47,
                }
            ]
        }

        response = client.post("/api/v1/parts/bulk", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert len(data["created"]) == 1
        assert created_part["part_number"] in data["duplicates"]

    def test_bulk_create_with_recycle_bin_assembly_rejected(self, client):
        """
        FUNCTIONALITY: Bulk create fails entirely if any part targets a recycle bin assembly.
        EXPECT: 400 Bad Request with recycle bin message.
        """
        payload = {
            "parts": [
                {
                    "part_name": "Recycle Bin Part",
                    "part_number": unique_part_number(),
                    "type_id": 1,
                    "assembly_id": 55,  # in recycle bin
                }
            ]
        }

        response = client.post("/api/v1/parts/bulk", json=payload)

        assert response.status_code == 400
        assert "recycle bin" in response.json()["detail"].lower()

    def test_bulk_create_returns_correct_structure(self, client):
        """
        FUNCTIONALITY: Bulk create response always has created, duplicates, errors keys.
        EXPECT: All three keys present regardless of outcome.
        """
        payload = {
            "parts": [
                {
                    "part_name": "Structure Test Part",
                    "part_number": unique_part_number(),
                    "type_id": 1,
                }
            ]
        }

        response = client.post("/api/v1/parts/bulk", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert "created" in data
        assert "duplicates" in data
        assert "errors" in data


# ══════════════════════════════════════════════════════════
# BULK DELETE BY ASSEMBLY  DELETE /api/v1/parts/bulk-by-assembly/{assembly_id}
# ══════════════════════════════════════════════════════════

class TestBulkDeletePartsByAssembly:

    def test_bulk_delete_by_assembly_success(self, client):
        """
        FUNCTIONALITY: All parts linked to an assembly can be deleted in one call.
        EXPECT: 200 OK + deleted_count matches number of parts created.

        NOTE: Using assembly 28 (Primary Control Assembly) — confirmed empty in cmf_test,
        no pre-existing parts or dependent records.
        """
        # Step 1: Create 2 fresh parts linked to assembly 28
        part_ids = []
        for _ in range(2):
            response = client.post("/api/v1/parts/", json={
                "part_name": "Bulk Delete Assembly Part",
                "part_number": unique_part_number(),
                "type_id": 1,
                "assembly_id": 28,
                "product_id": 47,
            })
            assert response.status_code == 201
            part_ids.append(response.json()["id"])

        # Step 2: Bulk delete by assembly
        response = client.delete("/api/v1/parts/bulk-by-assembly/28")

        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] >= 2
        assert data["assembly_id"] == 28
        assert "part_ids" in data

    def test_bulk_delete_by_assembly_parts_no_longer_accessible(self, client):
        """
        FUNCTIONALITY: After bulk delete, individual parts cannot be fetched.
        EXPECT: 404 Not Found for each deleted part.
        """
        # Create a fresh part linked to assembly 28 (empty, no dependent records)
        response = client.post("/api/v1/parts/", json={
            "part_name": "To Be Bulk Deleted",
            "part_number": unique_part_number(),
            "type_id": 1,
            "assembly_id": 28,
            "product_id": 47,
        })
        assert response.status_code == 201
        part_id = response.json()["id"]

        # Bulk delete all parts in assembly 28
        client.delete("/api/v1/parts/bulk-by-assembly/28")

        # Verify our part is gone
        response = client.get(f"/api/v1/parts/{part_id}")
        assert response.status_code == 404

    def test_bulk_delete_by_assembly_no_parts_returns_gracefully(self, client):
        """
        FUNCTIONALITY: Bulk delete on an assembly with no parts returns gracefully.
        EXPECT: 200 OK + deleted_count == 0 (not a 404 error).
        """
        # Use assembly 24 which we haven't added any test parts to
        # First delete any existing parts to ensure it's empty
        client.delete("/api/v1/parts/bulk-by-assembly/24")

        # Now bulk delete again on empty assembly
        response = client.delete("/api/v1/parts/bulk-by-assembly/24")

        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] == 0
        assert data["assembly_id"] == 24

    def test_bulk_delete_by_assembly_response_has_correct_structure(self, client):
        """
        FUNCTIONALITY: Bulk delete response always includes assembly_id, deleted_count, part_ids.
        EXPECT: All three keys present in response.
        """
        response = client.delete("/api/v1/parts/bulk-by-assembly/25")

        assert response.status_code == 200
        data = response.json()
        assert "assembly_id" in data
        assert "deleted_count" in data
        assert "part_ids" in data


# ══════════════════════════════════════════════════════════
# BULK DELETE BY PRODUCT  DELETE /api/v1/parts/bulk-by-product/{product_id}
# ══════════════════════════════════════════════════════════

class TestBulkDeletePartsByProduct:

    def test_bulk_delete_by_product_success(self, client):
        """
        FUNCTIONALITY: All parts linked to a product can be deleted in one call.
        EXPECT: 200 OK + deleted_count matches number of parts created + product_id in response.

        NOTE: Using product_id 63 (ISP1234567) — a safe test product
        that won't affect real production data.
        """
        # Step 1: Create 2 fresh parts linked to product 63
        part_ids = []
        for _ in range(2):
            response = client.post("/api/v1/parts/", json={
                "part_name": "Bulk Delete Product Part",
                "part_number": unique_part_number(),
                "type_id": 1,
                "product_id": 63,  # ISP1234567 — safe test product
            })
            assert response.status_code == 201
            part_ids.append(response.json()["id"])

        # Step 2: Bulk delete by product
        response = client.delete("/api/v1/parts/bulk-by-product/63")

        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] >= 2
        assert data["product_id"] == 63
        assert "part_ids" in data

    def test_bulk_delete_by_product_parts_no_longer_accessible(self, client):
        """
        FUNCTIONALITY: After bulk delete by product, individual parts cannot be fetched.
        EXPECT: 404 Not Found for each deleted part.
        """
        # Create a fresh part in product 63
        response = client.post("/api/v1/parts/", json={
            "part_name": "Product Bulk Delete Part",
            "part_number": unique_part_number(),
            "type_id": 1,
            "product_id": 63,
        })
        assert response.status_code == 201
        part_id = response.json()["id"]

        # Bulk delete all parts in product 63
        client.delete("/api/v1/parts/bulk-by-product/63")

        # Verify our part is gone
        response = client.get(f"/api/v1/parts/{part_id}")
        assert response.status_code == 404

    def test_bulk_delete_by_product_no_parts_returns_gracefully(self, client):
        """
        FUNCTIONALITY: Bulk delete on a product with no parts returns gracefully.
        EXPECT: 200 OK + deleted_count == 0 (not a 404 error).
        """
        # First clear product 63
        client.delete("/api/v1/parts/bulk-by-product/63")

        # Now bulk delete again on empty product
        response = client.delete("/api/v1/parts/bulk-by-product/63")

        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] == 0
        assert data["product_id"] == 63

    def test_bulk_delete_by_product_response_has_correct_structure(self, client):
        """
        FUNCTIONALITY: Bulk delete by product response has product_id, deleted_count, part_ids.
        EXPECT: All three keys present in response.
        """
        response = client.delete("/api/v1/parts/bulk-by-product/63")

        assert response.status_code == 200
        data = response.json()
        assert "product_id" in data
        assert "deleted_count" in data
        assert "part_ids" in data
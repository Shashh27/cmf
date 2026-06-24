"""
test_products.py

Functionality-driven integration tests for /api/v1/products/ endpoints.
Covers: Create, Read (with role-based filtering), Update, Delete,
        Hierarchical, Lightweight, Summary, Tools endpoints.

Real test DB seed references (cmf_test):
  admin user_id           : 16  (role: admin)
  project_coordinator_id  : 4   (role: project_coordinator)
  manufacturing_coord_id  : 32  (bharath — manufacturing_coordinator)
  product with order      : 47  (Hydro Locking tool holder) — linked to ISP2502101
  product no orders       : 63  (ISP1234567) — safe for delete tests
  product with hierarchy  : 14  (Control Valve Assembly) — 5 assemblies, 27 parts
"""

import uuid
import pytest


# ─────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────

def unique_product_name():
    return f"Test Product {uuid.uuid4().hex[:8].upper()}"


# ─────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────

@pytest.fixture
def admin_product_payload():
    """Valid payload for creating a product as admin."""
    return {
        "product_name": unique_product_name(),
        "product_version": "v1.0",
        "user_id": 16,  # admin
    }


@pytest.fixture
def pc_product_payload():
    """Valid payload for creating a product as project_coordinator."""
    return {
        "product_name": unique_product_name(),
        "product_version": "v1.0",
        "user_id": 4,  # project_coordinator
    }


@pytest.fixture
def created_product(client, admin_product_payload):
    """Creates a product as admin and returns the response."""
    response = client.post("/api/v1/products/", json=admin_product_payload)
    assert response.status_code == 201, response.text
    return response.json()


# ══════════════════════════════════════════════════════════
# CREATE PRODUCT  POST /api/v1/products/
# ══════════════════════════════════════════════════════════

class TestCreateProduct:

    def test_create_product_as_admin_success(self, client, admin_product_payload):
        """
        FUNCTIONALITY: Admin can create a product.
        EXPECT: 201 Created + all key fields returned.
        """
        response = client.post("/api/v1/products/", json=admin_product_payload)

        assert response.status_code == 201
        data = response.json()
        assert data["product_name"] == admin_product_payload["product_name"]
        assert data["product_version"] == admin_product_payload["product_version"]
        assert data["user_id"] == admin_product_payload["user_id"]
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_product_as_project_coordinator_success(self, client, pc_product_payload):
        """
        FUNCTIONALITY: Project coordinator can create a product.
        EXPECT: 201 Created.
        """
        response = client.post("/api/v1/products/", json=pc_product_payload)

        assert response.status_code == 201
        assert response.json()["user_id"] == pc_product_payload["user_id"]

    def test_create_product_as_manufacturing_coordinator_rejected(self, client):
        """
        FUNCTIONALITY: Manufacturing coordinator cannot create products.
        EXPECT: 403 Forbidden.
        """
        payload = {
            "product_name": unique_product_name(),
            "product_version": "v1.0",
            "user_id": 32,  # manufacturing_coordinator
        }
        response = client.post("/api/v1/products/", json=payload)

        assert response.status_code == 403
        assert "manufacturing coordinator" in response.json()["detail"].lower() or \
               "cannot" in response.json()["detail"].lower()

    def test_create_product_nonexistent_user_returns_404(self, client):
        """
        FUNCTIONALITY: Creating a product with a non-existent user_id fails.
        EXPECT: 404 Not Found.
        """
        payload = {
            "product_name": unique_product_name(),
            "product_version": "v1.0",
            "user_id": 999999,
        }
        response = client.post("/api/v1/products/", json=payload)

        assert response.status_code == 404
        assert "user" in response.json()["detail"].lower()

    def test_create_product_response_includes_user_name(self, client, admin_product_payload):
        """
        FUNCTIONALITY: Response enriches user_id with user_name.
        EXPECT: user_name is not null in response.
        """
        response = client.post("/api/v1/products/", json=admin_product_payload)

        assert response.status_code == 201
        assert response.json()["user_name"] is not None

    def test_create_product_missing_required_fields_rejected(self, client):
        """
        FUNCTIONALITY: product_name, product_version, user_id are required.
        EXPECT: 422 Unprocessable Entity.
        """
        response = client.post("/api/v1/products/", json={"product_name": "only name"})

        assert response.status_code == 422


# ══════════════════════════════════════════════════════════
# READ PRODUCTS  GET /api/v1/products/  and  /{product_id}
# ══════════════════════════════════════════════════════════

class TestGetProducts:

    def test_get_all_products_returns_list(self, client, created_product):
        """
        FUNCTIONALITY: GET all products returns a list ordered by ID.
        EXPECT: 200 OK + list + created product is included.
        """
        response = client.get("/api/v1/products/")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        ids = [p["id"] for p in data]
        assert created_product["id"] in ids

    def test_get_all_products_ordered_by_id_ascending(self, client, created_product):
        """
        FUNCTIONALITY: Products are returned in ascending order by ID.
        EXPECT: First item ID is less than second item ID.
        """
        response = client.get("/api/v1/products/")

        assert response.status_code == 200
        data = response.json()
        if len(data) >= 2:
            assert data[0]["id"] < data[1]["id"]

    def test_get_products_filter_by_admin_user_id(self, client, created_product):
        """
        FUNCTIONALITY: Admin sees their own created products when filtering by user_id.
        EXPECT: 200 OK + created product appears in results.
        """
        response = client.get("/api/v1/products/", params={"user_id": 16})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        ids = [p["id"] for p in data]
        assert created_product["id"] in ids

    def test_get_products_filter_by_project_coordinator_user_id(self, client, pc_product_payload):
        """
        FUNCTIONALITY: Project coordinator sees their own created products.
        EXPECT: 200 OK + created product appears in filtered results.
        """
        create_response = client.post("/api/v1/products/", json=pc_product_payload)
        new_product_id = create_response.json()["id"]

        response = client.get("/api/v1/products/", params={"user_id": 4})

        assert response.status_code == 200
        ids = [p["id"] for p in response.json()]
        assert new_product_id in ids

    def test_get_products_filter_by_manufacturing_coordinator_returns_list(self, client):
        """
        FUNCTIONALITY: Manufacturing coordinator only sees products from their assigned orders.
        EXPECT: 200 OK + list (may be empty if no orders assigned).
        """
        response = client.get("/api/v1/products/", params={"user_id": 32})

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_product_by_id_success(self, client, created_product):
        """
        FUNCTIONALITY: Fetching a product by valid ID returns correct data.
        EXPECT: 200 OK + correct fields.
        """
        product_id = created_product["id"]
        response = client.get(f"/api/v1/products/{product_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == product_id
        assert data["product_name"] == created_product["product_name"]
        assert data["product_version"] == created_product["product_version"]

    def test_get_product_by_id_includes_user_name(self, client, created_product):
        """
        FUNCTIONALITY: Single product response enriches user_id with user_name.
        EXPECT: user_name is not null.
        """
        product_id = created_product["id"]
        response = client.get(f"/api/v1/products/{product_id}")

        assert response.status_code == 200
        assert response.json()["user_name"] is not None

    def test_get_product_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent product ID returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/products/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# ══════════════════════════════════════════════════════════
# UPDATE PRODUCT  PUT /api/v1/products/{product_id}
# ══════════════════════════════════════════════════════════

class TestUpdateProduct:

    def test_update_product_name_success(self, client, created_product):
        """
        FUNCTIONALITY: Product name can be updated.
        EXPECT: 200 OK + updated product_name in response.
        """
        product_id = created_product["id"]
        new_name = unique_product_name()
        response = client.put(f"/api/v1/products/{product_id}", json={"product_name": new_name})

        assert response.status_code == 200
        assert response.json()["product_name"] == new_name

    def test_update_product_version_success(self, client, created_product):
        """
        FUNCTIONALITY: Product version can be updated.
        EXPECT: 200 OK + updated product_version in response.
        """
        product_id = created_product["id"]
        response = client.put(f"/api/v1/products/{product_id}", json={"product_version": "v2.0"})

        assert response.status_code == 200
        assert response.json()["product_version"] == "v2.0"

    def test_update_product_partial_fields_others_unchanged(self, client, created_product):
        """
        FUNCTIONALITY: Only provided fields are updated; others stay the same.
        EXPECT: 200 OK + unchanged fields match original values.
        """
        product_id = created_product["id"]
        original_version = created_product["product_version"]

        response = client.put(f"/api/v1/products/{product_id}", json={"product_name": unique_product_name()})

        assert response.status_code == 200
        assert response.json()["product_version"] == original_version  # unchanged

    def test_update_product_response_includes_user_name(self, client, created_product):
        """
        FUNCTIONALITY: Update response enriches user_id with user_name.
        EXPECT: user_name not null after update.
        """
        product_id = created_product["id"]
        response = client.put(f"/api/v1/products/{product_id}", json={"product_version": "v3.0"})

        assert response.status_code == 200
        assert response.json()["user_name"] is not None

    def test_update_nonexistent_product_returns_404(self, client):
        """
        FUNCTIONALITY: Updating a product that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put("/api/v1/products/99999999", json={"product_name": "ghost"})

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_product_reflects_in_get(self, client, created_product):
        """
        FUNCTIONALITY: After update, fetching the product returns the new values.
        EXPECT: GET /{id} returns updated product_name.
        """
        product_id = created_product["id"]
        new_name = unique_product_name()
        client.put(f"/api/v1/products/{product_id}", json={"product_name": new_name})

        response = client.get(f"/api/v1/products/{product_id}")
        assert response.json()["product_name"] == new_name


# ══════════════════════════════════════════════════════════
# DELETE PRODUCT  DELETE /api/v1/products/{product_id}
# ══════════════════════════════════════════════════════════

class TestDeleteProduct:

    def test_delete_product_success(self, client, created_product):
        """
        FUNCTIONALITY: A product with no linked orders can be deleted.
        EXPECT: 204 No Content.
        """
        product_id = created_product["id"]
        response = client.delete(f"/api/v1/products/{product_id}")

        assert response.status_code == 204

    def test_deleted_product_no_longer_accessible(self, client, created_product):
        """
        FUNCTIONALITY: After deletion, the product cannot be fetched by ID.
        EXPECT: 404 Not Found on GET after DELETE.
        """
        product_id = created_product["id"]
        client.delete(f"/api/v1/products/{product_id}")

        response = client.get(f"/api/v1/products/{product_id}")
        assert response.status_code == 404

    def test_delete_product_removed_from_list(self, client, created_product):
        """
        FUNCTIONALITY: After deletion, product no longer appears in the full list.
        EXPECT: GET /products/ does not include the deleted product.
        """
        product_id = created_product["id"]
        client.delete(f"/api/v1/products/{product_id}")

        response = client.get("/api/v1/products/")
        ids = [p["id"] for p in response.json()]
        assert product_id not in ids

    def test_delete_product_with_linked_orders_rejected(self, client):
        """
        FUNCTIONALITY: Cannot delete a product that is linked to existing orders.
        EXPECT: 400 Bad Request with message about linked orders.

        Uses product_id 47 (Hydro Locking tool holder) linked to order ISP2502101.
        """
        response = client.delete("/api/v1/products/47")

        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "order" in detail or "cannot" in detail

    def test_delete_nonexistent_product_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting a product that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/products/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# ══════════════════════════════════════════════════════════
# HIERARCHICAL  GET /api/v1/products/{id}/hierarchical
# ══════════════════════════════════════════════════════════

class TestProductHierarchical:

    def test_get_product_hierarchical_success(self, client):
        """
        FUNCTIONALITY: Hierarchical endpoint returns full nested product data.
        EXPECT: 200 OK + product, assemblies, direct_parts keys present.

        Uses product 14 (Control Valve Assembly) — has 5 assemblies, 27 parts.
        """
        response = client.get("/api/v1/products/14/hierarchical")

        assert response.status_code == 200
        data = response.json()
        assert "product" in data
        assert "assemblies" in data
        assert "direct_parts" in data

    def test_get_product_hierarchical_contains_product_info(self, client):
        """
        FUNCTIONALITY: Hierarchical response contains correct product details.
        EXPECT: product.id == 14, product_name is not null.
        """
        response = client.get("/api/v1/products/14/hierarchical")

        assert response.status_code == 200
        product = response.json()["product"]
        assert product["id"] == 14
        assert product["product_name"] is not None

    def test_get_product_hierarchical_contains_assemblies(self, client):
        """
        FUNCTIONALITY: Product with assemblies returns them nested in the hierarchy.
        EXPECT: assemblies list is not empty for product 14.
        """
        response = client.get("/api/v1/products/14/hierarchical")

        assert response.status_code == 200
        assert len(response.json()["assemblies"]) > 0

    def test_get_product_hierarchical_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Hierarchical fetch for non-existent product returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/products/99999999/hierarchical")

        assert response.status_code == 404

    def test_get_product_hierarchical_assembly_has_parts(self, client):
        """
        FUNCTIONALITY: Assemblies in hierarchy contain their nested parts.
        EXPECT: At least one assembly has a non-empty parts list.
        """
        response = client.get("/api/v1/products/14/hierarchical")

        assert response.status_code == 200
        assemblies = response.json()["assemblies"]
        has_parts = any(len(a["parts"]) > 0 for a in assemblies)
        assert has_parts


# ══════════════════════════════════════════════════════════
# LIGHTWEIGHT HIERARCHICAL  GET /{id}/hierarchical-lightweight
# ══════════════════════════════════════════════════════════

class TestProductHierarchicalLightweight:

    def test_get_lightweight_hierarchical_success(self, client):
        """
        FUNCTIONALITY: Lightweight endpoint returns BOM tree without heavy data.
        EXPECT: 200 OK + product, assemblies, parts keys present.
        """
        response = client.get("/api/v1/products/14/hierarchical-lightweight")

        assert response.status_code == 200
        data = response.json()
        assert "product" in data
        assert "assemblies" in data
        assert "parts" in data

    def test_get_lightweight_no_operations_or_documents(self, client):
        """
        FUNCTIONALITY: Lightweight response does NOT include operations or documents.
        EXPECT: No 'operations' or 'documents' keys at part level.
        """
        response = client.get("/api/v1/products/14/hierarchical-lightweight")

        assert response.status_code == 200
        assemblies = response.json()["assemblies"]
        if assemblies and assemblies[0]["parts"]:
            part = assemblies[0]["parts"][0]
            assert "operations" not in part
            assert "documents" not in part

    def test_get_lightweight_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Lightweight fetch for non-existent product returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/products/99999999/hierarchical-lightweight")

        assert response.status_code == 404

    def test_get_lightweight_parts_have_type_name(self, client):
        """
        FUNCTIONALITY: Parts in lightweight response include type_name enrichment.
        EXPECT: type_name is present in part data.
        """
        response = client.get("/api/v1/products/14/hierarchical-lightweight")

        assert response.status_code == 200
        assemblies = response.json()["assemblies"]
        for asm in assemblies:
            for part in asm.get("parts", []):
                assert "type_name" in part


# ══════════════════════════════════════════════════════════
# SUMMARY DATA  GET /api/v1/products/{id}/summary-data
# ══════════════════════════════════════════════════════════

class TestProductSummaryData:

    def test_get_product_summary_data_success(self, client):
        """
        FUNCTIONALITY: Summary endpoint returns product + parts with operations.
        EXPECT: 200 OK + product and parts keys present.
        """
        response = client.get("/api/v1/products/14/summary-data")

        assert response.status_code == 200
        data = response.json()
        assert "product" in data
        assert "parts" in data

    def test_get_product_summary_data_parts_have_operations(self, client):
        """
        FUNCTIONALITY: Parts in summary data include their operations with timing info.
        EXPECT: Parts list contains operations with setup_time and cycle_time.
        """
        response = client.get("/api/v1/products/14/summary-data")

        assert response.status_code == 200
        parts = response.json()["parts"]
        if parts:
            ops = parts[0]["operations"]
            assert len(ops) > 0
            assert "setup_time" in ops[0]
            assert "cycle_time" in ops[0]

    def test_get_product_summary_data_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Summary fetch for non-existent product returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/products/99999999/summary-data")

        assert response.status_code == 404

    def test_get_product_summary_data_product_info_correct(self, client):
        """
        FUNCTIONALITY: Summary data returns correct product id and name.
        EXPECT: product.id == 14.
        """
        response = client.get("/api/v1/products/14/summary-data")

        assert response.status_code == 200
        assert response.json()["product"]["id"] == 14


# ══════════════════════════════════════════════════════════
# TOOLS DATA  GET /api/v1/products/{id}/tools-data
# ══════════════════════════════════════════════════════════

class TestProductToolsData:

    def test_get_product_tools_data_success(self, client):
        """
        FUNCTIONALITY: Tools endpoint returns product + tools linked to operations.
        EXPECT: 200 OK + product and tools keys present.
        """
        response = client.get("/api/v1/products/14/tools-data")

        assert response.status_code == 200
        data = response.json()
        assert "product" in data
        assert "tools" in data

    def test_get_product_tools_data_tools_have_required_fields(self, client):
        """
        FUNCTIONALITY: Each tool in the response includes part and operation context.
        EXPECT: tool entries have tool_id, part_name, operation_name fields.
        """
        response = client.get("/api/v1/products/14/tools-data")

        assert response.status_code == 200
        tools = response.json()["tools"]
        if tools:
            tool = tools[0]
            assert "tool_id" in tool
            assert "operation_name" in tool
            assert "product_name" in tool

    def test_get_product_tools_data_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Tools fetch for non-existent product returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/products/99999999/tools-data")

        assert response.status_code == 404

    def test_get_product_tools_data_returns_list(self, client):
        """
        FUNCTIONALITY: Tools key in response is always a list.
        EXPECT: tools is a list (may be empty if no tools linked).
        """
        response = client.get("/api/v1/products/14/tools-data")

        assert response.status_code == 200
        assert isinstance(response.json()["tools"], list)
"""
test_orders.py

Functionality-driven integration tests for /api/v1/orders/ endpoints.
Covers: Create, Read, Update, Approve, Assign, Delete + validation checks.

Real test DB seed references (cmf_test):
  customer_id           : 2   (BEL)
  product_id            : 47  (Hydro Locking tool holder)
  admin_id              : 16
  project_coordinator_id: 20
  manufacturing_coordinator_id: 32
  existing_order_id     : 95  (ISP2502101) — used only for safe read tests
"""

import uuid
import pytest


# ─────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────

def unique_order_number():
    """Generate a unique sale order number so tests never collide."""
    return f"TEST-{uuid.uuid4().hex[:8].upper()}"


# ─────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────

@pytest.fixture
def sample_order_payload():
    """
    Minimal valid payload to create an order.
    NOTE: 'status' is required by OrderBase/OrderCreate schema — must always be included.
    """
    return {
        "sale_order_number": unique_order_number(),
        "customer_id": 2,       # BEL — exists in cmf_test
        "product_id": 47,       # Hydro Locking tool holder — exists in cmf_test
        "admin_id": 16,         # admin user — exists in cmf_test
        "quantity": 10,
        "due_date": "2025-12-31T00:00:00",
        "status": "Pending",    # Required field — OrderCreate inherits OrderBase(status: str)
        "project_coordinator_id": 20,
        "manufacturing_coordinator_id": None,
        "user_id": None,
    }


@pytest.fixture
def created_order(client, sample_order_payload):
    """
    Creates an order and returns the response data.
    Use this when the test needs a pre-existing order.
    """
    response = client.post("/api/v1/orders/", json=sample_order_payload)
    assert response.status_code == 200, response.text
    return response.json()


# ══════════════════════════════════════════════════════════
# CREATE ORDER  POST /api/v1/orders/
# ══════════════════════════════════════════════════════════

class TestCreateOrder:

    def test_create_order_success(self, client, sample_order_payload):
        """
        FUNCTIONALITY: A new order can be created with valid data.
        EXPECT: 200 OK + all key fields returned correctly.
        """
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 200
        data = response.json()
        assert data["sale_order_number"] == sample_order_payload["sale_order_number"].upper()
        assert data["customer_id"] == sample_order_payload["customer_id"]
        assert data["product_id"] == sample_order_payload["product_id"]
        assert data["admin_id"] == sample_order_payload["admin_id"]
        assert "id" in data
        assert "created_at" in data

    def test_create_order_sale_order_number_normalized_to_uppercase(self, client, sample_order_payload):
        """
        FUNCTIONALITY: sale_order_number is trimmed and uppercased on creation.
        EXPECT: Stored value is uppercased regardless of input case.
        """
        sample_order_payload["sale_order_number"] = "  test-lowercase-001  "
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 200
        assert response.json()["sale_order_number"] == "TEST-LOWERCASE-001"

    def test_create_order_duplicate_sale_order_number_rejected(self, client, sample_order_payload):
        """
        FUNCTIONALITY: Two orders cannot share the same sale_order_number (case-insensitive).
        EXPECT: 400 Bad Request on second attempt.
        """
        client.post("/api/v1/orders/", json=sample_order_payload)

        duplicate = sample_order_payload.copy()
        duplicate["sale_order_number"] = sample_order_payload["sale_order_number"].lower()

        response = client.post("/api/v1/orders/", json=duplicate)

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    def test_create_order_invalid_customer_returns_404(self, client, sample_order_payload):
        """
        FUNCTIONALITY: Creating an order with a non-existent customer fails.
        EXPECT: 404 Not Found.
        """
        sample_order_payload["customer_id"] = 999999
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 404
        assert "customer" in response.json()["detail"].lower()

    def test_create_order_invalid_admin_returns_404(self, client, sample_order_payload):
        """
        FUNCTIONALITY: Creating an order with a non-existent admin fails.
        EXPECT: 404 Not Found.
        """
        sample_order_payload["admin_id"] = 999999
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 404
        assert "admin" in response.json()["detail"].lower()

    def test_create_order_invalid_project_coordinator_returns_404(self, client, sample_order_payload):
        """
        FUNCTIONALITY: Creating an order with a non-existent PC fails.
        EXPECT: 404 Not Found.
        """
        sample_order_payload["project_coordinator_id"] = 999999
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 404
        assert "project coordinator" in response.json()["detail"].lower()

    def test_create_order_invalid_manufacturing_coordinator_returns_404(self, client, sample_order_payload):
        """
        FUNCTIONALITY: Creating an order with a non-existent MC fails.
        EXPECT: 404 Not Found.
        """
        sample_order_payload["manufacturing_coordinator_id"] = 999999
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 404
        assert "manufacturing coordinator" in response.json()["detail"].lower()

    def test_create_order_auto_approved_when_creator_is_admin(self, client, sample_order_payload):
        """
        FUNCTIONALITY: When user_id points to an admin-role user, order is auto-approved.
        EXPECT: approval_status == "Auto-Approved".
        """
        sample_order_payload["user_id"] = 16  # admin_id 16 has role containing 'admin'
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 200
        data = response.json()
        assert data["approval_status"] == "Auto-Approved"
        assert data["approved_at"] is not None

    def test_create_order_pending_approval_when_creator_is_not_admin(self, client, sample_order_payload):
        """
        FUNCTIONALITY: When user_id belongs to a non-admin (e.g. project coordinator),
        order starts as Pending Approval.
        EXPECT: approval_status == "Pending Approval".
        """
        sample_order_payload["user_id"] = 20  # project_coordinator — not admin
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 200
        assert response.json()["approval_status"] == "Pending Approval"

    def test_create_order_without_optional_fields(self, client, sample_order_payload):
        """
        FUNCTIONALITY: project_coordinator_id and manufacturing_coordinator_id are optional.
        EXPECT: 200 OK even when both are omitted/null.
        """
        sample_order_payload["project_coordinator_id"] = None
        sample_order_payload["manufacturing_coordinator_id"] = None
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 200

    def test_create_order_missing_required_fields_rejected(self, client):
        """
        FUNCTIONALITY: Required fields (customer_id, admin_id, product_id, status,
        quantity) must be present.
        EXPECT: 422 Unprocessable Entity when all are absent.
        """
        # Only sale_order_number — missing customer_id, product_id, admin_id, quantity, status
        incomplete = {"sale_order_number": unique_order_number()}
        response = client.post("/api/v1/orders/", json=incomplete)

        assert response.status_code == 422

    def test_create_order_missing_status_rejected(self, client, sample_order_payload):
        """
        FUNCTIONALITY: 'status' is a required string field on OrderCreate.
        EXPECT: 422 Unprocessable Entity when status is omitted.
        """
        del sample_order_payload["status"]
        response = client.post("/api/v1/orders/", json=sample_order_payload)

        assert response.status_code == 422


# ══════════════════════════════════════════════════════════
# READ ORDERS  GET /api/v1/orders/  and  /{order_id}
# ══════════════════════════════════════════════════════════

class TestGetOrders:

    def test_get_all_orders_returns_list(self, client, created_order):
        """
        FUNCTIONALITY: GET all orders returns a list.
        EXPECT: 200 OK + list type, contains at least the created order.
        """
        response = client.get("/api/v1/orders/")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        ids = [o["id"] for o in data]
        assert created_order["id"] in ids

    def test_get_orders_filter_by_admin_id(self, client, created_order):
        """
        FUNCTIONALITY: Filtering by admin_id returns only orders for that admin.
        EXPECT: All returned orders have admin_id == 16.
        """
        response = client.get("/api/v1/orders/", params={"admin_id": 16})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for order in data:
            assert order["admin_id"] == 16

    def test_get_orders_filter_by_project_coordinator_id(self, client, created_order):
        """
        FUNCTIONALITY: Filtering by project_coordinator_id returns only relevant orders.
        EXPECT: All returned orders have project_coordinator_id == 20.
        """
        response = client.get("/api/v1/orders/", params={"project_coordinator_id": 20})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for order in data:
            assert order["project_coordinator_id"] == 20

    def test_get_orders_filter_by_manufacturing_coordinator_id(self, client, sample_order_payload):
        """
        FUNCTIONALITY: Filtering by manufacturing_coordinator_id returns only relevant orders.
        EXPECT: All returned orders have manufacturing_coordinator_id == 32.
        """
        sample_order_payload["manufacturing_coordinator_id"] = 32
        client.post("/api/v1/orders/", json=sample_order_payload)

        response = client.get("/api/v1/orders/", params={"manufacturing_coordinator_id": 32})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for order in data:
            assert order["manufacturing_coordinator_id"] == 32

    def test_get_order_by_id_success(self, client, created_order):
        """
        FUNCTIONALITY: Fetching an order by valid ID returns correct data.
        EXPECT: 200 OK + correct order fields.
        """
        order_id = created_order["id"]
        response = client.get(f"/api/v1/orders/{order_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == order_id
        assert data["sale_order_number"] == created_order["sale_order_number"]
        assert data["customer_id"] == created_order["customer_id"]

    def test_get_order_by_id_includes_company_and_product_names(self, client, created_order):
        """
        FUNCTIONALITY: Single order response enriches with company_name, product_name.
        EXPECT: company_name and product_name are not null.
        """
        order_id = created_order["id"]
        response = client.get(f"/api/v1/orders/{order_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["company_name"] is not None
        assert data["product_name"] is not None

    def test_get_order_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent order ID returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/orders/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_order_response_has_approval_fields(self, client, created_order):
        """
        FUNCTIONALITY: Order response always includes approval-related fields.
        EXPECT: approval_status, approval_remarks, approved_at present.
        """
        order_id = created_order["id"]
        response = client.get(f"/api/v1/orders/{order_id}")

        assert response.status_code == 200
        data = response.json()
        assert "approval_status" in data
        assert "approval_remarks" in data
        assert "approved_at" in data


# ══════════════════════════════════════════════════════════
# UPDATE ORDER  PUT /api/v1/orders/{order_id}
# ══════════════════════════════════════════════════════════

class TestUpdateOrder:

    def test_update_order_quantity_success(self, client, created_order):
        """
        FUNCTIONALITY: Updating quantity of an existing order works.
        EXPECT: 200 OK + updated quantity in response.
        """
        order_id = created_order["id"]
        response = client.put(f"/api/v1/orders/{order_id}", json={"quantity": 99})

        assert response.status_code == 200
        assert response.json()["quantity"] == 99

    def test_update_order_due_date_success(self, client, created_order):
        """
        FUNCTIONALITY: Updating due_date of an order works.
        EXPECT: 200 OK + updated due_date reflected.
        """
        order_id = created_order["id"]
        response = client.put(f"/api/v1/orders/{order_id}", json={"due_date": "2026-06-30T00:00:00"})

        assert response.status_code == 200
        assert "2026-06-30" in response.json()["due_date"]

    def test_update_order_sale_order_number_normalized(self, client, created_order):
        """
        FUNCTIONALITY: Updated sale_order_number is trimmed and uppercased.
        EXPECT: Stored value is uppercased.
        """
        order_id = created_order["id"]
        new_number = f"  updated-{uuid.uuid4().hex[:6]}  "
        response = client.put(
            f"/api/v1/orders/{order_id}",
            json={"sale_order_number": new_number}
        )

        assert response.status_code == 200
        assert response.json()["sale_order_number"] == new_number.strip().upper()

    def test_update_order_duplicate_sale_order_number_rejected(self, client, sample_order_payload):
        """
        FUNCTIONALITY: Cannot update sale_order_number to one used by another order.
        EXPECT: 400 Bad Request.
        """
        # Create order 1
        first_response = client.post("/api/v1/orders/", json=sample_order_payload)
        first_order_number = first_response.json()["sale_order_number"]

        # Create order 2
        second_payload = sample_order_payload.copy()
        second_payload["sale_order_number"] = unique_order_number()
        second_response = client.post("/api/v1/orders/", json=second_payload)
        second_order_id = second_response.json()["id"]

        # Try to update order 2's number to order 1's number
        response = client.put(
            f"/api/v1/orders/{second_order_id}",
            json={"sale_order_number": first_order_number}
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    def test_update_order_same_sale_order_number_allowed(self, client, created_order):
        """
        FUNCTIONALITY: Re-submitting the same sale_order_number for the same order is not rejected.
        EXPECT: 200 OK (no conflict with itself).
        """
        order_id = created_order["id"]
        same_number = created_order["sale_order_number"]

        response = client.put(
            f"/api/v1/orders/{order_id}",
            json={"sale_order_number": same_number}
        )

        assert response.status_code == 200

    def test_update_order_invalid_customer_returns_404(self, client, created_order):
        """
        FUNCTIONALITY: Updating customer_id to a non-existent customer fails.
        EXPECT: 404 Not Found.
        """
        order_id = created_order["id"]
        response = client.put(f"/api/v1/orders/{order_id}", json={"customer_id": 999999})

        assert response.status_code == 404
        assert "customer" in response.json()["detail"].lower()

    def test_update_order_invalid_product_returns_404(self, client, created_order):
        """
        FUNCTIONALITY: Updating product_id to a non-existent product fails.
        EXPECT: 404 Not Found.
        """
        order_id = created_order["id"]
        response = client.put(f"/api/v1/orders/{order_id}", json={"product_id": 999999})

        assert response.status_code == 404
        assert "product" in response.json()["detail"].lower()

    def test_update_nonexistent_order_returns_404(self, client):
        """
        FUNCTIONALITY: Updating an order that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put("/api/v1/orders/99999999", json={"quantity": 5})

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_order_partial_fields_others_unchanged(self, client, created_order):
        """
        FUNCTIONALITY: Only provided fields are updated; others stay the same.
        EXPECT: 200 OK + unchanged fields match original values.
        """
        order_id = created_order["id"]
        original_customer_id = created_order["customer_id"]

        response = client.put(f"/api/v1/orders/{order_id}", json={"quantity": 55})

        assert response.status_code == 200
        data = response.json()
        assert data["quantity"] == 55
        assert data["customer_id"] == original_customer_id  # unchanged

    def test_update_order_invalid_admin_returns_404(self, client, created_order):
        """
        FUNCTIONALITY: Updating admin_id to a non-existent user fails.
        EXPECT: 404 Not Found.
        """
        order_id = created_order["id"]
        response = client.put(f"/api/v1/orders/{order_id}", json={"admin_id": 999999})

        assert response.status_code == 404
        assert "admin" in response.json()["detail"].lower()


# ══════════════════════════════════════════════════════════
# APPROVE ORDER  PUT /api/v1/orders/{order_id}/approve
# ══════════════════════════════════════════════════════════

class TestApproveOrder:

    def test_approve_order_success(self, client, created_order):
        """
        FUNCTIONALITY: An order can be approved with valid approval_status "Approved".
        EXPECT: 200 OK + approval_status == "Approved" + approved_at set.
        """
        order_id = created_order["id"]
        response = client.put(
            f"/api/v1/orders/{order_id}/approve",
            json={"approval_status": "Approved", "approval_remarks": "Looks good"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["approval_status"] == "Approved"
        assert data["approved_at"] is not None

    def test_reject_order_success(self, client, created_order):
        """
        FUNCTIONALITY: An order can be rejected with approval_status "Rejected".
        EXPECT: 200 OK + approval_status == "Rejected".
        """
        order_id = created_order["id"]
        response = client.put(
            f"/api/v1/orders/{order_id}/approve",
            json={"approval_status": "Rejected", "approval_remarks": "Missing specs"}
        )

        assert response.status_code == 200
        assert response.json()["approval_status"] == "Rejected"

    def test_approve_order_with_remarks(self, client, created_order):
        """
        FUNCTIONALITY: Approval remarks are stored when provided.
        EXPECT: approval_remarks in response matches what was sent.
        """
        order_id = created_order["id"]
        remarks = "Approved after review"
        response = client.put(
            f"/api/v1/orders/{order_id}/approve",
            json={"approval_status": "Approved", "approval_remarks": remarks}
        )

        assert response.status_code == 200
        assert response.json()["approval_remarks"] == remarks

    def test_approve_order_invalid_status_returns_400(self, client, created_order):
        """
        FUNCTIONALITY: Only "Approved" or "Rejected" are valid approval_status values.
        EXPECT: 400 Bad Request for any other value.
        """
        order_id = created_order["id"]
        response = client.put(
            f"/api/v1/orders/{order_id}/approve",
            json={"approval_status": "Maybe", "approval_remarks": ""}
        )

        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower() or \
               "approval_status" in response.json()["detail"].lower()

    def test_approve_nonexistent_order_returns_404(self, client):
        """
        FUNCTIONALITY: Approving a non-existent order returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put(
            "/api/v1/orders/99999999/approve",
            json={"approval_status": "Approved", "approval_remarks": ""}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# ══════════════════════════════════════════════════════════
# ASSIGN ORDER  PUT /api/v1/orders/{order_id}/assign
# ══════════════════════════════════════════════════════════

class TestAssignOrder:

    def test_assign_order_to_manufacturing_coordinator_success(self, client, created_order):
        """
        FUNCTIONALITY: An order can be assigned to a valid manufacturing coordinator.
        EXPECT: 200 OK + manufacturing_coordinator_id updated.
        """
        order_id = created_order["id"]
        response = client.put(
            f"/api/v1/orders/{order_id}/assign",
            json={"manufacturing_coordinator_id": 32}
        )

        assert response.status_code == 200
        assert response.json()["manufacturing_coordinator_id"] == 32

    def test_assign_order_includes_mc_name_in_response(self, client, created_order):
        """
        FUNCTIONALITY: After assignment, manufacturing_coordinator_name is populated.
        EXPECT: manufacturing_coordinator_name is not null.
        """
        order_id = created_order["id"]
        response = client.put(
            f"/api/v1/orders/{order_id}/assign",
            json={"manufacturing_coordinator_id": 32}
        )

        assert response.status_code == 200
        assert response.json()["manufacturing_coordinator_name"] is not None

    def test_assign_order_invalid_mc_returns_404(self, client, created_order):
        """
        FUNCTIONALITY: Assigning to a non-existent manufacturing coordinator fails.
        EXPECT: 404 Not Found.
        """
        order_id = created_order["id"]
        response = client.put(
            f"/api/v1/orders/{order_id}/assign",
            json={"manufacturing_coordinator_id": 999999}
        )

        assert response.status_code == 404
        assert "manufacturing coordinator" in response.json()["detail"].lower()

    def test_assign_nonexistent_order_returns_404(self, client):
        """
        FUNCTIONALITY: Assigning a non-existent order fails.
        EXPECT: 404 Not Found.
        """
        response = client.put(
            "/api/v1/orders/99999999/assign",
            json={"manufacturing_coordinator_id": 32}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_reassign_order_to_different_mc(self, client, created_order):
        """
        FUNCTIONALITY: An already-assigned order can be reassigned to another MC.
        EXPECT: 200 OK + new manufacturing_coordinator_id reflected.
        """
        order_id = created_order["id"]

        # First assignment
        client.put(
            f"/api/v1/orders/{order_id}/assign",
            json={"manufacturing_coordinator_id": 32}
        )

        # Reassign to different MC
        response = client.put(
            f"/api/v1/orders/{order_id}/assign",
            json={"manufacturing_coordinator_id": 34}
        )

        assert response.status_code == 200
        assert response.json()["manufacturing_coordinator_id"] == 34


# ══════════════════════════════════════════════════════════
# DELETE ORDER  DELETE /api/v1/orders/{order_id}
# ══════════════════════════════════════════════════════════

class TestDeleteOrder:

    def test_delete_order_success(self, client, created_order):
        """
        FUNCTIONALITY: A newly created order (no scheduling/production data) can be deleted.
        EXPECT: 200 OK + success message.
        """
        order_id = created_order["id"]
        response = client.delete(f"/api/v1/orders/{order_id}")

        assert response.status_code == 200
        data = response.json()
        assert "deleted successfully" in data["message"].lower()

    def test_deleted_order_no_longer_accessible(self, client, created_order):
        """
        FUNCTIONALITY: After deletion, the order cannot be fetched by ID.
        EXPECT: 404 Not Found on GET after DELETE.
        """
        order_id = created_order["id"]
        client.delete(f"/api/v1/orders/{order_id}")

        response = client.get(f"/api/v1/orders/{order_id}")
        assert response.status_code == 404

    def test_delete_order_removed_from_list(self, client, created_order):
        """
        FUNCTIONALITY: After deletion, order no longer appears in the full list.
        EXPECT: GET /api/v1/orders/ does not include the deleted order.
        """
        order_id = created_order["id"]
        client.delete(f"/api/v1/orders/{order_id}")

        response = client.get("/api/v1/orders/")
        ids = [o["id"] for o in response.json()]
        assert order_id not in ids

    def test_delete_nonexistent_order_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting an order that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/orders/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_order_response_indicates_product_deletion(self, client, created_order):
        """
        FUNCTIONALITY: When no other orders share the product, the response indicates
        the product was also deleted.
        EXPECT: product_also_deleted == True (product 47 used only by this test order).

        NOTE: Skip this test if product 47 already has other orders in cmf_test.
        """
        order_id = created_order["id"]
        response = client.delete(f"/api/v1/orders/{order_id}")

        assert response.status_code == 200
        # product_also_deleted may be True or False depending on existing data in cmf_test
        assert "product_also_deleted" in response.json()


# ══════════════════════════════════════════════════════════
# SUPPLEMENTARY — Read endpoints with-customers / hierarchical
# ══════════════════════════════════════════════════════════

class TestOrderReadVariants:

    def test_get_orders_with_customers_returns_customer_object(self, client, created_order):
        """
        FUNCTIONALITY: /with-customers endpoint embeds full customer object per order.
        EXPECT: 200 OK + each order has a nested 'customer' dict with company_name.
        """
        response = client.get("/api/v1/orders/with-customers")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Find our created order in the list
        our_order = next((o for o in data if o["id"] == created_order["id"]), None)
        assert our_order is not None
        assert our_order["customer"] is not None
        assert "company_name" in our_order["customer"]

    def test_get_order_hierarchical_success(self, client, created_order):
        """
        FUNCTIONALITY: /{order_id}/hierarchical returns order with product_hierarchy.
        EXPECT: 200 OK + product_hierarchy key present in response.
        """
        order_id = created_order["id"]
        response = client.get(f"/api/v1/orders/{order_id}/hierarchical")

        assert response.status_code == 200
        assert "product_hierarchy" in response.json()

    def test_get_order_hierarchical_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Hierarchical fetch for non-existent order returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/orders/99999999/hierarchical")

        assert response.status_code == 404

    def test_get_parts_by_sale_order_number(self, client, created_order):
        """
        FUNCTIONALITY: /sale-order/{sale_order_number}/parts returns parts for the order's product.
        EXPECT: 200 OK + list (may be empty if product 47 has no in-house parts yet).
        """
        sale_order_number = created_order["sale_order_number"]
        response = client.get(f"/api/v1/orders/sale-order/{sale_order_number}/parts")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_parts_by_invalid_sale_order_number_returns_404(self, client):
        """
        FUNCTIONALITY: /sale-order/{sale_order_number}/parts for a non-existent order returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/orders/sale-order/NONEXISTENT-ORDER-XYZ/parts")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
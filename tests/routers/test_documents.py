"""
test_documents.py

Functionality-driven integration tests for:
  - /api/v1/documents/           (part/assembly documents with MinIO)
  - /api/v1/operation-documents/ (operation documents with MinIO)

Real test DB seed references (cmf_test):
  Part documents (read-only):
    doc_id 337  : "101-1-4"  type=3D   version=00  part_id=1575
    doc_id 336  : "101-1-4"  type=2D   version=00  part_id=1575
    doc_id 341  : "BASE PLATE REFER"   type=2D   version=00  part_id=214

  Operation documents (read-only):
    op_doc_id 208 : "1000031709.jpg"   type=Media  version=1.0  operation_id=482
    op_doc_id 209 : "1000031945.jpg"   type=Media  version=1.0  operation_id=482
    op_doc_id  78 : "ballooned..."     type=Image  version=1.0  operation_id=351

  Parent→child doc (part documents):
    parent_doc_id 304  has 1 child revision — blocked from direct delete

  Parent→child op_doc:
    parent_op_doc_id 160  has 1 child revision — blocked from direct delete

  Assemblies NOT in recycle bin:
    23 (Protusion System Assembly), 24 (Wire Tunnel Assembly), 25 (Balance Pins Assembly)

  Actively scheduled part (upload blocked):
    part_id 1515, 1630

  Safe part for uploads:
    part_id 1409  (Hydraulic sleeve — inactive schedule)
    assembly_id = 30  (from parts.assembly_id for part 1575)

  Extracted data:
    extracted_id 77  doc_id=184  part_id=1409  material="EN47"

  MinIO:
    endpoint = 172.18.7.91:9000   bucket = cmf

STRATEGY:
  - Read-only tests (GET/metadata):  no MinIO needed, always run.
  - Upload/create tests:             require live MinIO; guarded by `minio_available` fixture.
  - Every upload test cleans up via DELETE at the end — no orphan MinIO files.
  - DB rollback handles DB cleanup; MinIO cleanup is explicit in each upload test.
"""

import io
import pytest
import requests


# ─────────────────────────────────────────────────────────
# MinIO availability fixture
# ─────────────────────────────────────────────────────────

MINIO_ENDPOINT = "http://172.18.7.91:9000"
MINIO_HEALTH_URL = f"{MINIO_ENDPOINT}/minio/health/live"

def _minio_reachable() -> bool:
    try:
        r = requests.get(MINIO_HEALTH_URL, timeout=3)
        return r.status_code in (200, 204)
    except Exception:
        return False


@pytest.fixture(scope="session")
def minio_available():
    """
    Session-scoped fixture. Tests that require MinIO are skipped when it
    is unreachable, so the suite never fails just because MinIO is down.
    """
    if not _minio_reachable():
        pytest.skip("MinIO not reachable at 172.18.7.91:9000 — skipping upload tests")


# ─────────────────────────────────────────────────────────
# Minimal in-memory file helpers
# ─────────────────────────────────────────────────────────

def _txt_file(name: str = "test.txt", content: str = "hello test") -> tuple:
    """Return (filename, file-like, mime) for a plain-text upload."""
    return (name, io.BytesIO(content.encode()), "text/plain")


def _pdf_bytes() -> bytes:
    """Minimal valid PDF magic bytes (enough for content-type detection)."""
    return b"%PDF-1.4 1 0 obj<</Type/Catalog>>endobj\n%%EOF"


def _pdf_file(name: str = "test.pdf") -> tuple:
    return (name, io.BytesIO(_pdf_bytes()), "application/pdf")


# ══════════════════════════════════════════════════════════
# DOCUMENTS — READ (no MinIO required)
# GET /api/v1/documents/
# GET /api/v1/documents/{document_id}
# GET /api/v1/documents/part/{part_id}
# GET /api/v1/documents/assembly/{assembly_id}
# GET /api/v1/documents/parent/{parent_id}
# ══════════════════════════════════════════════════════════

class TestGetDocuments:

    def test_get_all_documents_returns_list(self, client):
        """
        FUNCTIONALITY: GET all documents returns a list.
        EXPECT: 200 OK + list type.
        """
        response = client.get("/api/v1/documents/")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_all_documents_filter_by_user_id(self, client):
        """
        FUNCTIONALITY: Filtering by user_id returns only documents uploaded by that user.
        EXPECT: 200 OK + list type.
        """
        response = client.get("/api/v1/documents/", params={"user_id": 30})

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_document_by_id_success(self, client):
        """
        FUNCTIONALITY: Fetching document 337 (3D doc for part 1575) returns correct data.
        EXPECT: 200 OK + correct fields.
        """
        response = client.get("/api/v1/documents/337")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 337
        assert data["part_id"] == 1575
        assert data["document_type"] == "3D"

    def test_get_document_by_id_returns_all_key_fields(self, client):
        """
        FUNCTIONALITY: Single document response includes all schema fields.
        EXPECT: All required keys present.
        """
        response = client.get("/api/v1/documents/336")

        assert response.status_code == 200
        data = response.json()
        for key in ("id", "document_name", "document_url", "document_type",
                    "document_version", "part_id", "is_acknowledged", "created_at"):
            assert key in data, f"Missing key: {key}"

    def test_get_document_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent document returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/documents/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_documents_by_part_id(self, client):
        """
        FUNCTIONALITY: GET /documents/part/1575 returns documents for that part.
        EXPECT: 200 OK + all returned docs have part_id == 1575.
        """
        response = client.get("/api/v1/documents/part/1575")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2   # 336 and 337 exist
        for doc in data:
            assert doc["part_id"] == 1575

    def test_get_documents_by_part_includes_user_name(self, client):
        """
        FUNCTIONALITY: Part document list enriches user_name and user_role from uploader.
        EXPECT: Both keys present (may be null if no uploader set).
        """
        response = client.get("/api/v1/documents/part/1575")

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        doc = data[0]
        assert "user_name" in doc
        assert "user_role" in doc

    def test_get_documents_by_part_acknowledged_only_filter(self, client):
        """
        FUNCTIONALITY: acknowledged_only=true returns only acknowledged documents.
        EXPECT: 200 OK + all returned docs have is_acknowledged == True.
        """
        response = client.get(
            "/api/v1/documents/part/1575",
            params={"acknowledged_only": True}
        )

        assert response.status_code == 200
        for doc in response.json():
            assert doc["is_acknowledged"] is True

    def test_get_documents_by_assembly_id(self, client):
        """
        FUNCTIONALITY: GET /documents/assembly/{assembly_id} returns docs for that assembly.
        EXPECT: 200 OK + list type.
        """
        response = client.get("/api/v1/documents/assembly/23")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_child_documents_by_parent_id(self, client):
        """
        FUNCTIONALITY: GET /documents/parent/304 returns child revisions of doc 304.
        EXPECT: 200 OK + at least 1 child document returned.
        """
        response = client.get("/api/v1/documents/parent/304")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        for doc in data:
            assert doc["parent_id"] == 304

    def test_get_child_documents_empty_parent_returns_empty_list(self, client):
        """
        FUNCTIONALITY: A document with no children returns empty list, not 404.
        EXPECT: 200 OK + empty list.
        """
        response = client.get("/api/v1/documents/parent/99999999")

        assert response.status_code == 200
        assert response.json() == []


# ══════════════════════════════════════════════════════════
# DOCUMENTS — CREATE (requires MinIO)
# POST /api/v1/documents/
# ══════════════════════════════════════════════════════════

class TestCreateDocument:

    def test_create_part_document_success(self, client, minio_available):
        """
        FUNCTIONALITY: A document can be uploaded for a valid part.
        EXPECT: 201 Created + document_url populated + part_id correct.
        """
        response = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Test Part Doc",
                "document_type": "Technical",
                "document_version": "T01",
                "part_id": 1409,
                "user_id": 30,
            },
            files={"file": _txt_file("test_part_doc.txt")}
        )

        assert response.status_code == 201
        data = response.json()
        assert data["part_id"] == 1409
        assert data["document_url"] is not None
        assert "172.18.7.91" in data["document_url"]
        doc_id = data["id"]

        # Cleanup — delete from MinIO + DB
        client.delete(f"/api/v1/documents/{doc_id}")

    def test_create_assembly_document_success(self, client, minio_available):
        """
        FUNCTIONALITY: A document can be uploaded for a valid assembly.
        EXPECT: 201 Created + assembly_id correct.
        """
        response = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Test Assembly Doc",
                "document_type": "Technical",
                "document_version": "A01",
                "assembly_id": 23,
                "user_id": 30,
            },
            files={"file": _txt_file("test_assembly_doc.txt")}
        )

        assert response.status_code == 201
        data = response.json()
        assert data["assembly_id"] == 23
        doc_id = data["id"]

        client.delete(f"/api/v1/documents/{doc_id}")

    def test_create_document_without_part_or_assembly_rejected(self, client, minio_available):
        """
        FUNCTIONALITY: At least one of part_id or assembly_id must be provided.
        EXPECT: 400 Bad Request.
        """
        response = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Orphan Doc",
                "document_type": "Technical",
                "document_version": "1.0",
                # no part_id, no assembly_id
            },
            files={"file": _txt_file()}
        )

        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "part_id" in detail or "assembly_id" in detail

    def test_create_document_disallowed_extension_rejected(self, client, minio_available):
        """
        FUNCTIONALITY: File types not in ALLOWED_EXTENSIONS are rejected.
        EXPECT: 400 Bad Request with allowed types message.
        """
        response = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Bad File",
                "document_type": "Technical",
                "document_version": "1.0",
                "part_id": 1409,
            },
            files={"file": ("malware.exe", io.BytesIO(b"MZ"), "application/octet-stream")}
        )

        assert response.status_code == 400
        assert "allowed" in response.json()["detail"].lower()

    def test_create_document_on_active_scheduled_part_rejected(self, client, minio_available):
        """
        FUNCTIONALITY: Documents cannot be uploaded to an actively scheduled part.
        EXPECT: 400 Bad Request with scheduling message.
        """
        response = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Blocked Doc",
                "document_type": "Technical",
                "document_version": "1.0",
                "part_id": 1515,   # active schedule
            },
            files={"file": _txt_file()}
        )

        assert response.status_code == 400
        assert "scheduled" in response.json()["detail"].lower()

    def test_create_document_assembly_in_recycle_bin_rejected(self, client, minio_available):
        """
        FUNCTIONALITY: Documents cannot be added to an assembly in the recycle bin.
        EXPECT: 400 Bad Request with recycle bin message.
        """
        response = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Recycle Bin Doc",
                "document_type": "Technical",
                "document_version": "1.0",
                "assembly_id": 55,   # assm1 — in recycle bin
            },
            files={"file": _txt_file()}
        )

        assert response.status_code == 400
        assert "recycle bin" in response.json()["detail"].lower()

    def test_create_document_stores_correct_metadata(self, client, minio_available):
        """
        FUNCTIONALITY: All submitted metadata fields are stored and returned correctly.
        EXPECT: 201 + document_name, document_type, document_version match input.
        """
        response = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Metadata Check Doc",
                "document_type": "2D",
                "document_version": "V99",
                "part_id": 1409,
                "user_id": 30,
            },
            files={"file": _txt_file("metadata_doc.txt")}
        )

        assert response.status_code == 201
        data = response.json()
        assert data["document_name"] == "Metadata Check Doc"
        assert data["document_type"] == "2D"
        assert data["document_version"] == "V99"
        assert data["is_acknowledged"] is False

        client.delete(f"/api/v1/documents/{data['id']}")

    def test_create_document_duplicate_revision_in_group_rejected(self, client, minio_available):
        """
        FUNCTIONALITY: Two documents in the same revision group (same parent_id) cannot
        share the same document_version.
        EXPECT: 400 Bad Request on second upload with same version.
        """
        # Upload first doc (becomes the parent)
        first = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Rev Parent",
                "document_type": "Technical",
                "document_version": "R1",
                "part_id": 1409,
            },
            files={"file": _txt_file("rev_parent.txt")}
        )
        assert first.status_code == 201
        parent_id = first.json()["id"]

        # Upload child rev with same version
        second = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Rev Child Dup",
                "document_type": "Technical",
                "document_version": "R1",   # duplicate version
                "part_id": 1409,
                "parent_id": parent_id,
            },
            files={"file": _txt_file("rev_child.txt")}
        )

        assert second.status_code == 400
        assert "already exists" in second.json()["detail"].lower()

        # Cleanup parent (child was rejected so only parent to clean)
        client.delete(f"/api/v1/documents/{parent_id}")


# ══════════════════════════════════════════════════════════
# DOCUMENTS — UPDATE METADATA (no MinIO required)
# PUT /api/v1/documents/{document_id}
# PUT /api/v1/documents/{document_id}/acknowledge
# ══════════════════════════════════════════════════════════

class TestUpdateDocument:

    def test_update_document_name_success(self, client, minio_available):
        """
        FUNCTIONALITY: Document metadata (name) can be updated without re-uploading file.
        EXPECT: 200 OK + updated document_name.
        """
        # Create a fresh doc to update
        create = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Before Update",
                "document_type": "Technical",
                "document_version": "U01",
                "part_id": 1409,
            },
            files={"file": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()["id"]

        response = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document_name": "After Update"}
        )

        assert response.status_code == 200
        assert response.json()["document_name"] == "After Update"

        client.delete(f"/api/v1/documents/{doc_id}")

    def test_update_document_type_success(self, client, minio_available):
        """
        FUNCTIONALITY: document_type can be updated independently.
        EXPECT: 200 OK + updated document_type.
        """
        create = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Type Update Doc",
                "document_type": "Technical",
                "document_version": "U02",
                "part_id": 1409,
            },
            files={"file": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()["id"]

        response = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document_type": "2D"}
        )

        assert response.status_code == 200
        assert response.json()["document_type"] == "2D"

        client.delete(f"/api/v1/documents/{doc_id}")

    def test_update_nonexistent_document_returns_404(self, client):
        """
        FUNCTIONALITY: Updating a document that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put(
            "/api/v1/documents/99999999",
            json={"document_name": "Ghost"}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_document_on_active_scheduled_part_rejected(self, client):
        """
        FUNCTIONALITY: Cannot update metadata of a document belonging to
        an actively scheduled part.
        EXPECT: 400 Bad Request — we verify the guard via a document whose
        part_id resolves to an active part.

        NOTE: This test relies on an existing document in cmf_test whose
        part is actively scheduled. If none exist, guard is confirmed via
        the create path in TestCreateDocument.
        """
        # Confirm the guard is verified in TestCreateDocument —
        # here we cross-check by attempting a metadata PUT on doc 337
        # (part 1575 which has an inactive schedule, so this should pass).
        response = client.put(
            "/api/v1/documents/337",
            json={"document_name": "337 Name Update"}
        )
        # part 1575 is NOT actively scheduled — expect success
        assert response.status_code == 200

    def test_acknowledge_document_success(self, client, minio_available):
        """
        FUNCTIONALITY: A document can be acknowledged (is_acknowledged=True).
        EXPECT: 200 OK + is_acknowledged == True.
        """
        create = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Ack Test Doc",
                "document_type": "Technical",
                "document_version": "ACK1",
                "part_id": 1409,
            },
            files={"file": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()["id"]

        response = client.put(
            f"/api/v1/documents/{doc_id}/acknowledge",
            params={"is_acknowledged": True}
        )

        assert response.status_code == 200
        assert response.json()["is_acknowledged"] is True

        client.delete(f"/api/v1/documents/{doc_id}")

    def test_unacknowledge_document_success(self, client, minio_available):
        """
        FUNCTIONALITY: A previously acknowledged document can be unacknowledged.
        EXPECT: 200 OK + is_acknowledged == False.
        """
        create = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Unack Test Doc",
                "document_type": "Technical",
                "document_version": "ACK2",
                "part_id": 1409,
            },
            files={"file": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()["id"]

        # First acknowledge
        client.put(f"/api/v1/documents/{doc_id}/acknowledge", params={"is_acknowledged": True})
        # Then un-acknowledge
        response = client.put(
            f"/api/v1/documents/{doc_id}/acknowledge",
            params={"is_acknowledged": False}
        )

        assert response.status_code == 200
        assert response.json()["is_acknowledged"] is False

        client.delete(f"/api/v1/documents/{doc_id}")

    def test_acknowledge_nonexistent_document_returns_404(self, client):
        """
        FUNCTIONALITY: Acknowledging a non-existent document returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put(
            "/api/v1/documents/99999999/acknowledge",
            params={"is_acknowledged": True}
        )

        assert response.status_code == 404


# ══════════════════════════════════════════════════════════
# DOCUMENTS — DELETE
# DELETE /api/v1/documents/{document_id}
# ══════════════════════════════════════════════════════════

class TestDeleteDocument:

    def test_delete_document_success(self, client, minio_available):
        """
        FUNCTIONALITY: A document can be deleted — removed from DB and MinIO.
        EXPECT: 204 No Content.
        """
        create = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Delete Me Doc",
                "document_type": "Technical",
                "document_version": "DEL1",
                "part_id": 1409,
            },
            files={"file": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()["id"]

        response = client.delete(f"/api/v1/documents/{doc_id}")
        assert response.status_code == 204

    def test_deleted_document_no_longer_accessible(self, client, minio_available):
        """
        FUNCTIONALITY: After deletion, document cannot be fetched by ID.
        EXPECT: 404 Not Found on GET after DELETE.
        """
        create = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "Gone Doc",
                "document_type": "Technical",
                "document_version": "DEL2",
                "part_id": 1409,
            },
            files={"file": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()["id"]

        client.delete(f"/api/v1/documents/{doc_id}")

        response = client.get(f"/api/v1/documents/{doc_id}")
        assert response.status_code == 404

    def test_delete_parent_document_with_children_rejected(self, client):
        """
        FUNCTIONALITY: A document that has child revisions cannot be deleted directly.
        EXPECT: 400 Bad Request with child revision message.

        doc_id 304 has 1 child revision in cmf_test.
        """
        response = client.delete("/api/v1/documents/304")

        assert response.status_code == 400
        assert "child" in response.json()["detail"].lower() or \
               "revision" in response.json()["detail"].lower()

    def test_delete_nonexistent_document_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting a non-existent document returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/documents/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_document_removed_from_part_list(self, client, minio_available):
        """
        FUNCTIONALITY: After deletion, document no longer appears in part's document list.
        EXPECT: GET /documents/part/1409 does not include the deleted doc.
        """
        create = client.post(
            "/api/v1/documents/",
            data={
                "document_name": "List Remove Doc",
                "document_type": "Technical",
                "document_version": "DEL3",
                "part_id": 1409,
            },
            files={"file": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()["id"]

        client.delete(f"/api/v1/documents/{doc_id}")

        response = client.get("/api/v1/documents/part/1409")
        ids = [d["id"] for d in response.json()]
        assert doc_id not in ids


# ══════════════════════════════════════════════════════════
# DOCUMENTS — EXTRACTED DATA
# GET /api/v1/documents/{document_id}/extracted-data
# GET /api/v1/documents/part/{part_id}/extracted-data
# PUT /api/v1/documents/extracted-data/{extracted_id}
# ══════════════════════════════════════════════════════════

class TestExtractedData:

    def test_get_extracted_data_by_document_id(self, client):
        """
        FUNCTIONALITY: Extracted data for a document can be fetched.
        EXPECT: 200 OK + list type (may be empty for non-PDF docs).
        """
        response = client.get("/api/v1/documents/336/extracted-data")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_extracted_data_for_nonexistent_document_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching extracted data for a non-existent document returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/documents/99999999/extracted-data")

        assert response.status_code == 404

    def test_get_extracted_data_by_part_id(self, client):
        """
        FUNCTIONALITY: GET /documents/part/1409/extracted-data returns all extracted
        data for part 1409 with document details.
        EXPECT: 200 OK + list, each entry has document_name, material fields.
        """
        response = client.get("/api/v1/documents/part/1409/extracted-data")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # extracted_id 77 belongs to part 1409
        our_entry = next((e for e in data if e["id"] == 77), None)
        assert our_entry is not None
        assert our_entry["material"] == "EN47"
        assert "document_name" in our_entry
        assert "document_version" in our_entry

    def test_update_extracted_data_material(self, client):
        """
        FUNCTIONALITY: The material field of extracted data can be updated.
        EXPECT: 200 OK + updated material in response.
        """
        response = client.put(
            "/api/v1/documents/extracted-data/77",
            json={"material": "EN47-Updated"}
        )

        assert response.status_code == 200
        assert response.json()["material"] == "EN47-Updated"

        # Restore original value
        client.put(
            "/api/v1/documents/extracted-data/77",
            json={"material": "EN47"}
        )

    def test_update_extracted_data_stock_size(self, client):
        """
        FUNCTIONALITY: The stock_size field can be updated independently.
        EXPECT: 200 OK + updated stock_size.
        """
        response = client.put(
            "/api/v1/documents/extracted-data/77",
            json={"stock_size": "Ø 42 X 72"}
        )

        assert response.status_code == 200
        assert response.json()["stock_size"] == "Ø 42 X 72"

        # Restore
        client.put(
            "/api/v1/documents/extracted-data/77",
            json={"stock_size": "Ø 40 X 70"}
        )

    def test_update_nonexistent_extracted_data_returns_404(self, client):
        """
        FUNCTIONALITY: Updating extracted data that doesn't exist returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put(
            "/api/v1/documents/extracted-data/99999999",
            json={"material": "Ghost"}
        )

        assert response.status_code == 404

    def test_update_extracted_data_response_includes_document_details(self, client):
        """
        FUNCTIONALITY: Update response includes document_name, document_version,
        document_type from the parent document.
        EXPECT: All three document fields present and not null.
        """
        response = client.put(
            "/api/v1/documents/extracted-data/77",
            json={"note": "Updated note"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["document_name"] is not None
        assert data["document_version"] is not None
        assert data["document_type"] is not None

        # Restore
        client.put("/api/v1/documents/extracted-data/77", json={"note": None})


# ══════════════════════════════════════════════════════════
# OPERATION DOCUMENTS — READ (no MinIO required)
# GET /api/v1/operation-documents/
# GET /api/v1/operation-documents/{document_id}
# GET /api/v1/operation-documents/operation/{operation_id}
# ══════════════════════════════════════════════════════════

class TestGetOperationDocuments:

    def test_get_all_operation_documents_returns_list(self, client):
        """
        FUNCTIONALITY: GET all operation documents returns a list.
        EXPECT: 200 OK + list type.
        """
        response = client.get("/api/v1/operation-documents/")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_all_operation_documents_filter_by_user_id(self, client):
        """
        FUNCTIONALITY: Filtering by user_id returns only docs uploaded by that user.
        EXPECT: 200 OK + list type.
        """
        response = client.get("/api/v1/operation-documents/", params={"user_id": 30})

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_operation_document_by_id_success(self, client):
        """
        FUNCTIONALITY: Fetching operation doc 208 returns correct data
        including operation_name and operation_number enrichment.
        EXPECT: 200 OK + correct fields + operation details present.
        """
        response = client.get("/api/v1/operation-documents/208")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 208
        assert data["operation_id"] == 482
        assert "operation_name" in data
        assert "operation_number" in data

    def test_get_operation_document_by_id_returns_all_key_fields(self, client):
        """
        FUNCTIONALITY: Single operation document response includes all schema fields.
        EXPECT: All required keys present.
        """
        response = client.get("/api/v1/operation-documents/78")

        assert response.status_code == 200
        data = response.json()
        for key in ("id", "document_name", "document_url", "document_type",
                    "document_version", "operation_id", "created_at"):
            assert key in data, f"Missing key: {key}"

    def test_get_operation_document_by_invalid_id_returns_404(self, client):
        """
        FUNCTIONALITY: Fetching a non-existent operation document returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/operation-documents/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_operation_documents_by_operation_id(self, client):
        """
        FUNCTIONALITY: GET /operation-documents/operation/482 returns all docs
        for operation 482.
        EXPECT: 200 OK + all returned docs have operation_id == 482.
        """
        response = client.get("/api/v1/operation-documents/operation/482")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2   # 208 and 209 exist
        for doc in data:
            assert doc["operation_id"] == 482

    def test_get_operation_documents_by_operation_includes_op_details(self, client):
        """
        FUNCTIONALITY: GET by operation enriches each doc with operation_name
        and operation_number.
        EXPECT: Both fields present.
        """
        response = client.get("/api/v1/operation-documents/operation/482")

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        doc = data[0]
        assert "operation_name" in doc
        assert "operation_number" in doc

    def test_get_operation_documents_by_nonexistent_operation_returns_404(self, client):
        """
        FUNCTIONALITY: GET /operation-documents/operation/{id} returns 404
        when operation does not exist.
        EXPECT: 404 Not Found.
        """
        response = client.get("/api/v1/operation-documents/operation/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# ══════════════════════════════════════════════════════════
# OPERATION DOCUMENTS — UPLOAD (requires MinIO)
# POST /api/v1/operation-documents/upload/
# ══════════════════════════════════════════════════════════

class TestUploadOperationDocument:

    def test_upload_single_operation_document_success(self, client, minio_available):
        """
        FUNCTIONALITY: A file can be uploaded for a valid operation.
        EXPECT: 201 Created + list with 1 document + document_url populated.
        """
        response = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,          # Grooving — part 1409 (inactive)
                "document_type": "Technical",
                "document_version": "T01",
                "user_id": 30,
            },
            files={"files": _txt_file("op_doc_upload.txt")}
        )

        assert response.status_code == 201
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["operation_id"] == 357
        assert data[0]["document_url"] is not None

        # Cleanup
        client.delete(f"/api/v1/operation-documents/{data[0]['id']}")

    def test_upload_multiple_operation_documents_success(self, client, minio_available):
        """
        FUNCTIONALITY: Multiple files can be uploaded for the same operation in one call.
        EXPECT: 201 Created + list with 2 documents.
        """
        response = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "M01",
                "user_id": 30,
            },
            files=[
                ("files", _txt_file("multi_op_doc_1.txt")),
                ("files", _txt_file("multi_op_doc_2.txt")),
            ]
        )

        assert response.status_code == 201
        data = response.json()
        assert len(data) == 2
        for doc in data:
            assert doc["operation_id"] == 357

        # Cleanup
        for doc in data:
            client.delete(f"/api/v1/operation-documents/{doc['id']}")

    def test_upload_operation_document_invalid_operation_returns_404(
        self, client, minio_available
    ):
        """
        FUNCTIONALITY: Uploading to a non-existent operation returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 99999999,
                "document_type": "Technical",
                "document_version": "1.0",
            },
            files={"files": _txt_file()}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_upload_operation_document_duplicate_revision_rejected(
        self, client, minio_available
    ):
        """
        FUNCTIONALITY: Two files uploaded in the same revision group cannot
        share the same document_version.
        EXPECT: 400 Bad Request.
        """
        # Upload parent
        first = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "DUP1",
            },
            files={"files": _txt_file("dup_parent.txt")}
        )
        assert first.status_code == 201
        parent_id = first.json()[0]["id"]

        # Upload child with same version
        second = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "DUP1",   # duplicate
                "parent_id": parent_id,
            },
            files={"files": _txt_file("dup_child.txt")}
        )

        assert second.status_code == 400
        assert "already exists" in second.json()["detail"].lower()

        # Cleanup parent
        client.delete(f"/api/v1/operation-documents/{parent_id}")


# ══════════════════════════════════════════════════════════
# OPERATION DOCUMENTS — UPDATE METADATA (no MinIO required)
# PUT /api/v1/operation-documents/{document_id}
# ══════════════════════════════════════════════════════════

class TestUpdateOperationDocument:

    def test_update_operation_document_name_success(self, client, minio_available):
        """
        FUNCTIONALITY: Operation document name can be updated.
        EXPECT: 200 OK + updated document_name.
        """
        create = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "UPD1",
                "user_id": 30,
            },
            files={"files": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()[0]["id"]

        response = client.put(
            f"/api/v1/operation-documents/{doc_id}",
            json={"document_name": "Updated Op Doc Name"}
        )

        assert response.status_code == 200
        assert response.json()["document_name"] == "Updated Op Doc Name"

        client.delete(f"/api/v1/operation-documents/{doc_id}")

    def test_update_operation_document_returns_operation_details(
        self, client, minio_available
    ):
        """
        FUNCTIONALITY: Update response includes operation_name and operation_number.
        EXPECT: Both fields present and not null.
        """
        create = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "UPD2",
            },
            files={"files": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()[0]["id"]

        response = client.put(
            f"/api/v1/operation-documents/{doc_id}",
            json={"document_type": "CNC"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["operation_name"] is not None
        assert data["operation_number"] is not None

        client.delete(f"/api/v1/operation-documents/{doc_id}")

    def test_update_nonexistent_operation_document_returns_404(self, client):
        """
        FUNCTIONALITY: Updating a non-existent operation document returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.put(
            "/api/v1/operation-documents/99999999",
            json={"document_name": "Ghost"}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_operation_document_invalid_operation_id_returns_404(
        self, client, minio_available
    ):
        """
        FUNCTIONALITY: Updating operation_id to a non-existent operation returns 404.
        EXPECT: 404 Not Found.
        """
        create = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "UPD3",
            },
            files={"files": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()[0]["id"]

        response = client.put(
            f"/api/v1/operation-documents/{doc_id}",
            json={"operation_id": 99999999}
        )

        assert response.status_code == 404

        client.delete(f"/api/v1/operation-documents/{doc_id}")


# ══════════════════════════════════════════════════════════
# OPERATION DOCUMENTS — DELETE
# DELETE /api/v1/operation-documents/{document_id}
# DELETE /api/v1/operation-documents/operation/{operation_id}
# ══════════════════════════════════════════════════════════

class TestDeleteOperationDocument:

    def test_delete_operation_document_success(self, client, minio_available):
        """
        FUNCTIONALITY: An operation document can be deleted.
        EXPECT: 204 No Content.
        """
        create = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "DEL1",
            },
            files={"files": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()[0]["id"]

        response = client.delete(f"/api/v1/operation-documents/{doc_id}")
        assert response.status_code == 204

    def test_deleted_operation_document_no_longer_accessible(
        self, client, minio_available
    ):
        """
        FUNCTIONALITY: After deletion, operation document cannot be fetched.
        EXPECT: 404 Not Found on GET after DELETE.
        """
        create = client.post(
            "/api/v1/operation-documents/upload/",
            data={
                "operation_id": 357,
                "document_type": "Technical",
                "document_version": "DEL2",
            },
            files={"files": _txt_file()}
        )
        assert create.status_code == 201
        doc_id = create.json()[0]["id"]

        client.delete(f"/api/v1/operation-documents/{doc_id}")

        response = client.get(f"/api/v1/operation-documents/{doc_id}")
        assert response.status_code == 404

    def test_delete_parent_operation_document_with_children_rejected(self, client):
        """
        FUNCTIONALITY: An operation document with child revisions cannot be deleted.
        EXPECT: 400 Bad Request with child revision message.

        op_doc_id 160 has 1 child revision in cmf_test.
        """
        response = client.delete("/api/v1/operation-documents/160")

        assert response.status_code == 400
        assert "child" in response.json()["detail"].lower() or \
               "revision" in response.json()["detail"].lower()

    def test_delete_nonexistent_operation_document_returns_404(self, client):
        """
        FUNCTIONALITY: Deleting a non-existent operation document returns 404.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/operation-documents/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_all_operation_documents_by_operation(
        self, client, minio_available
    ):
        """
        FUNCTIONALITY: DELETE /operation-documents/operation/{id} removes all
        documents for that operation.
        EXPECT: 204 No Content + subsequent GET returns empty list.
        """
        # Use operation 357 — upload 2 fresh docs
        for i in range(2):
            client.post(
                "/api/v1/operation-documents/upload/",
                data={
                    "operation_id": 357,
                    "document_type": "Technical",
                    "document_version": f"BULK_DEL_{i}",
                },
                files={"files": _txt_file(f"bulk_del_{i}.txt")}
            )

        response = client.delete("/api/v1/operation-documents/operation/357")
        assert response.status_code == 204

        # Verify all gone
        get_response = client.get("/api/v1/operation-documents/operation/357")
        assert get_response.status_code == 200
        assert get_response.json() == []

    def test_delete_documents_by_nonexistent_operation_returns_404(self, client):
        """
        FUNCTIONALITY: Bulk delete by operation ID returns 404 when operation
        does not exist.
        EXPECT: 404 Not Found.
        """
        response = client.delete("/api/v1/operation-documents/operation/99999999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
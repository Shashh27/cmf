"""Unit tests for priority swap authorization helpers."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from shift_assignment_helpers import (
    priority_changed_by_audit,
    validate_priority_changed_by,
)


def test_validate_priority_changed_by_requires_id():
    with pytest.raises(HTTPException) as exc:
        validate_priority_changed_by(MagicMock(), None)
    assert exc.value.status_code == 400
    assert "priority_changed_by_id" in exc.value.detail


def test_validate_priority_changed_by_rejects_wrong_role():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        id=1, role="operator", user_name="Op User"
    )
    with pytest.raises(HTTPException) as exc:
        validate_priority_changed_by(db, 1)
    assert exc.value.status_code == 403


def test_validate_priority_changed_by_accepts_admin():
    db = MagicMock()
    user = SimpleNamespace(id=5, role="admin", user_name="Admin User")
    db.query.return_value.filter.return_value.first.return_value = user
    assert validate_priority_changed_by(db, 5) is user


def test_priority_changed_by_audit():
    user = SimpleNamespace(id=5, role="manufacturing_coordinator", user_name="MC User")
    audit = priority_changed_by_audit(user)
    assert audit["user_id"] == 5
    assert audit["priority_changed_by"] == "manufacturing_coordinator"
    assert audit["name"] == "MC User"
    assert audit["priority_changed_at"]

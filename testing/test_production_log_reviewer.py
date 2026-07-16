import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

from production_log_helpers import (
    REVIEWER_ROLES,
    assert_exclusive_reviewer,
    build_cross_review_alert_message,
)


class _Log:
    user_id = None


class _LogReviewed:
    user_id = 10


def test_reviewer_roles():
    assert "supervisor" in REVIEWER_ROLES
    assert "manufacturing_coordinator" in REVIEWER_ROLES


def test_exclusive_reviewer_allows_first_reviewer():
    assert_exclusive_reviewer(MagicMock(), _Log(), 16)


def test_exclusive_reviewer_allows_same_reviewer():
    assert_exclusive_reviewer(MagicMock(), _LogReviewed(), 10)


def test_exclusive_reviewer_blocks_second_reviewer_with_name():
    existing = MagicMock()
    existing.id = 10
    existing.user_name = "bharath"
    existing.role = "manufacturing_coordinator"

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing

    with pytest.raises(HTTPException) as exc:
        assert_exclusive_reviewer(db, _LogReviewed(), 16)
    assert exc.value.status_code == 403
    assert "bharath" in exc.value.detail
    assert "Manufacturing Coordinator" in exc.value.detail
    assert "user_id" not in exc.value.detail


def test_cross_review_alert_message():
    msg = build_cross_review_alert_message(
        reviewer_name="Raj",
        reviewer_role="manufacturing_coordinator",
        operator_name="Kumar",
        part_number="P-1",
        operation_number="10",
    )
    assert "Manufacturing Coordinator Raj" in msg
    assert "operator Kumar" in msg
    assert "part P-1" in msg

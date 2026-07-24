"""Unit tests for partial-qty operation handoff (upstream release → next op)."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from production_log_helpers import (
    get_operation_handoff,
    prior_operation_blocks_activation,
    validate_operator_submit,
    work_limits_from_breakdown,
)


def _handoff_with(
    *,
    total_qty: int,
    self_approved: int,
    upstream_approved: int | None,
    pending_produced: int = 0,
    pending_rework: int = 0,
    has_predecessor: bool = True,
):
    db = MagicMock()
    predecessor = (
        SimpleNamespace(id=10, operation_number="10", operation_name="Turning")
        if has_predecessor
        else None
    )

    with (
        patch(
            "production_log_helpers.total_approved_for_operation",
            side_effect=lambda _db, op_id: (
                upstream_approved
                if has_predecessor and op_id == 10
                else self_approved
            ),
        ),
        patch(
            "production_log_helpers.get_immediate_predecessor_operation",
            return_value=predecessor,
        ),
        patch(
            "production_log_helpers._pending_operator_quantities",
            return_value={
                "pending_produced": pending_produced,
                "pending_rework": pending_rework,
            },
        ),
    ):
        # When has_predecessor, self op id is 20; upstream is predecessor.id=10
        return get_operation_handoff(db, 20 if has_predecessor else 10, total_qty)


class TestOperationHandoff:
    def test_first_op_available_is_remaining(self):
        h = _handoff_with(
            total_qty=100,
            self_approved=30,
            upstream_approved=None,
            has_predecessor=False,
        )
        assert h["has_predecessor"] is False
        assert h["predecessor_unlocked"] is True
        assert h["available_quantity"] == 70

    def test_unlock_when_upstream_approves_at_least_one(self):
        h = _handoff_with(
            total_qty=100,
            self_approved=0,
            upstream_approved=1,
        )
        assert h["predecessor_unlocked"] is True
        assert h["available_quantity"] == 1

    def test_blocked_when_upstream_has_zero_approved(self):
        h = _handoff_with(
            total_qty=100,
            self_approved=0,
            upstream_approved=0,
        )
        assert h["predecessor_unlocked"] is False
        assert h["available_quantity"] == 0

    def test_available_caps_at_upstream_minus_self_minus_pending_produced(self):
        # Op10 approved 50; Op20 approved 10; 5 new units pending review → 35 left
        h = _handoff_with(
            total_qty=100,
            self_approved=10,
            upstream_approved=50,
            pending_produced=5,
            pending_rework=3,
        )
        assert h["available_quantity"] == 35
        assert h["pending_on_operation"] == 5

    def test_pending_rework_does_not_consume_upstream_release(self):
        h = _handoff_with(
            total_qty=100,
            self_approved=40,
            upstream_approved=50,
            pending_produced=0,
            pending_rework=10,
        )
        assert h["available_quantity"] == 10

    def test_available_never_exceeds_remaining_to_close(self):
        h = _handoff_with(
            total_qty=100,
            self_approved=90,
            upstream_approved=100,
            pending_produced=0,
        )
        assert h["available_quantity"] == 10


class TestPriorBlocksActivation:
    def test_blocks_when_no_upstream_approved(self):
        db = MagicMock()
        predecessor = SimpleNamespace(
            id=10,
            operation_number="10",
            operation_name="Turning",
            part_type_id=1,
        )
        with (
            patch(
                "production_log_helpers.get_immediate_predecessor_operation",
                return_value=predecessor,
            ),
            patch(
                "production_log_helpers.total_approved_for_operation",
                return_value=0,
            ),
        ):
            reason = prior_operation_blocks_activation(db, 20)
        assert reason is not None
        assert "no approved quantity" in reason

    def test_allows_when_upstream_has_approved(self):
        db = MagicMock()
        predecessor = SimpleNamespace(
            id=10,
            operation_number="10",
            operation_name="Turning",
            part_type_id=1,
        )
        with (
            patch(
                "production_log_helpers.get_immediate_predecessor_operation",
                return_value=predecessor,
            ),
            patch(
                "production_log_helpers.total_approved_for_operation",
                return_value=5,
            ),
        ):
            assert prior_operation_blocks_activation(db, 20) is None


class TestSubmitCapByAvailable:
    def test_produced_cannot_exceed_available(self):
        work = work_limits_from_breakdown(
            {
                "remaining_to_close": 50,
                "rework_due": 0,
                "reject_due": 0,
                "fresh_needed": 50,
            }
        )
        work["available_quantity"] = 20
        work["upstream_operation_number"] = "10"
        work["upstream_approved"] = 20

        validate_operator_submit(work, produced_quantity=20, rework_submit_quantity=0)
        with pytest.raises(HTTPException) as exc:
            validate_operator_submit(work, produced_quantity=21, rework_submit_quantity=0)
        assert "released" in exc.value.detail

    def test_rework_submit_not_capped_by_available(self):
        work = work_limits_from_breakdown(
            {
                "remaining_to_close": 10,
                "rework_due": 5,
                "reject_due": 0,
                "fresh_needed": 5,
            }
        )
        work["available_quantity"] = 0
        # Pure rework follow-up does not need new upstream release
        validate_operator_submit(work, produced_quantity=0, rework_submit_quantity=5)

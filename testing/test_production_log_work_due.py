"""Unit tests for production log work-due breakdown and operator submit."""

from datetime import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from production_log_helpers import (
    compute_work_due_breakdown,
    remaining_to_close,
    total_presented_on_log,
    validate_operator_submit,
)
from algorithm import SchedulerEngine


def _operation(setup_min=30, cycle_min=10):
    return SimpleNamespace(
        id=1,
        operation_number="10",
        setup_time=time(0, setup_min, 0),
        cycle_time=time(0, cycle_min, 0),
    )


class TestWorkDueBreakdown:
    def test_partial_approval_split(self):
        latest = SimpleNamespace(rework_quantity=3, rejected_quantity=2)
        result = compute_work_due_breakdown(10, 5, latest)
        assert result["remaining_to_close"] == 5
        assert result["rework_due"] == 3
        assert result["reject_due"] == 2
        assert result["fresh_needed"] == 0


class TestOperatorSubmit:
    def test_rework_and_reject_separate_fields(self):
        work = {"remaining_to_close": 5, "rework_due": 3, "reject_due": 2}
        validate_operator_submit(work, produced_quantity=2, rework_submit_quantity=3)
        assert total_presented_on_log(2, 3) == 5

    def test_reject_only_when_rework_also_due(self):
        """Operator may submit reject replacement without rework in the same log."""
        work = {"remaining_to_close": 5, "rework_due": 3, "reject_due": 2}
        validate_operator_submit(work, produced_quantity=2, rework_submit_quantity=0)

    def test_rework_only_when_reject_also_due(self):
        work = {"remaining_to_close": 5, "rework_due": 3, "reject_due": 2}
        validate_operator_submit(work, produced_quantity=0, rework_submit_quantity=3)

    def test_partial_reject_and_partial_rework(self):
        work = {"remaining_to_close": 5, "rework_due": 3, "reject_due": 2}
        validate_operator_submit(work, produced_quantity=1, rework_submit_quantity=2)

    def test_rework_only(self):
        work = {"remaining_to_close": 1, "rework_due": 1, "reject_due": 0}
        validate_operator_submit(work, produced_quantity=0, rework_submit_quantity=1)

    def test_rework_cannot_go_in_produced(self):
        work = {"remaining_to_close": 5, "rework_due": 3, "reject_due": 2}
        with pytest.raises(HTTPException):
            validate_operator_submit(work, produced_quantity=5, rework_submit_quantity=0)

    def test_qty1_rework_must_use_rework_submit_field(self):
        work = {"remaining_to_close": 1, "rework_due": 1, "reject_due": 0}
        with pytest.raises(HTTPException) as exc:
            validate_operator_submit(work, produced_quantity=1, rework_submit_quantity=0)
        assert "rework_submit_quantity" in exc.value.detail

    def test_first_run_production_only(self):
        work = {"remaining_to_close": 10, "rework_due": 0, "reject_due": 0}
        validate_operator_submit(work, produced_quantity=10, rework_submit_quantity=0)

    def test_fresh_plus_rework_reject_mix(self):
        work = {"remaining_to_close": 7, "rework_due": 2, "reject_due": 1}
        validate_operator_submit(work, produced_quantity=4, rework_submit_quantity=2)

    def test_cannot_exceed_remaining_total(self):
        work = {"remaining_to_close": 3, "rework_due": 2, "reject_due": 2}
        with pytest.raises(HTTPException) as exc:
            validate_operator_submit(work, produced_quantity=2, rework_submit_quantity=2)
        assert "remain to close" in exc.value.detail

    def test_rework_without_prior_review_blocked(self):
        work = {"remaining_to_close": 5, "rework_due": 0, "reject_due": 0}
        with pytest.raises(HTTPException):
            validate_operator_submit(work, produced_quantity=0, rework_submit_quantity=1)


class TestSchedulerDurationSplit:
    def test_rework_duration_skips_setup(self):
        engine = SchedulerEngine(MagicMock())
        op = _operation(setup_min=30, cycle_min=10)
        rework_hours = engine._operation_duration_hours(op, 3, skip_setup=True)
        full_hours = engine._operation_duration_hours(op, 3, skip_setup=False)
        assert rework_hours == pytest.approx(0.5)
        assert full_hours == pytest.approx(1.0)

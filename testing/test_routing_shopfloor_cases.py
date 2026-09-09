"""
Unit tests for shop-floor routing cases on DynamicSchedulerEngine:

  Case 1 / 4 — leftover qty uses remaining-work cursor; machine-pin mismatch
  Case 2 / 3 — newly added pending ops floor at created_at over past cascade
"""
from datetime import datetime, time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from algorithm import DynamicSchedulerEngine


class _FakeEngine(DynamicSchedulerEngine):
    """Minimal engine: skip DB/shift setup, keep helper methods under test."""

    def __init__(self):
        self.db = MagicMock()
        self.machine_end_time = {}
        self.machine_lock_owner = {}

    def adjust_to_shift(self, dt, machine_id=None, operator_id=None):
        return dt


class TestPendingNewRoutingFloor:
    def test_created_after_cascade_wins(self):
        eng = _FakeEngine()
        op = SimpleNamespace(id=99, operation_number="50", created_at=datetime(2026, 9, 8, 10, 0, 0))
        cascade = datetime(2026, 8, 4, 12, 17, 11)
        assert eng._pending_start_cursor(op, cascade) == datetime(2026, 9, 8, 10, 0, 0)

    def test_old_op_keeps_cascade(self):
        eng = _FakeEngine()
        op = SimpleNamespace(id=10, operation_number="10", created_at=datetime(2026, 7, 1, 8, 0, 0))
        cascade = datetime(2026, 8, 4, 12, 17, 11)
        assert eng._pending_start_cursor(op, cascade) == cascade

    def test_missing_created_at_keeps_cascade(self):
        eng = _FakeEngine()
        op = SimpleNamespace(id=11, operation_number="20")
        cascade = datetime(2026, 8, 4, 12, 17, 11)
        assert eng._pending_start_cursor(op, cascade) == cascade

    def test_reactivation_floor_lifts_past_cascade(self):
        eng = _FakeEngine()
        op = SimpleNamespace(id=10, operation_number="10", created_at=datetime(2026, 7, 1, 8, 0, 0))
        cascade = datetime(2026, 8, 11, 11, 30, 0)
        reactivation = datetime(2026, 9, 8, 11, 12, 0)
        assert eng._pending_start_cursor(
            op, cascade, not_before=reactivation
        ) == reactivation


class TestMachinePinMatch:
    def test_preserved_matches_pin(self):
        eng = _FakeEngine()
        op = SimpleNamespace(machine_id=14)
        rows = [SimpleNamespace(machine_id=14), SimpleNamespace(machine_id=14)]
        assert eng._preserved_rows_match_machine_pin(op, rows) is True

    def test_preserved_differs_from_pin(self):
        eng = _FakeEngine()
        op = SimpleNamespace(machine_id=20)
        rows = [SimpleNamespace(machine_id=14)]
        assert eng._preserved_rows_match_machine_pin(op, rows) is False

    def test_no_pin_always_matches(self):
        eng = _FakeEngine()
        op = SimpleNamespace(machine_id=None)
        rows = [SimpleNamespace(machine_id=14)]
        assert eng._preserved_rows_match_machine_pin(op, rows) is True


class TestRemainingWorkCursor:
    def test_uses_actual_end_when_present(self):
        eng = _FakeEngine()
        eng._actual_end = lambda op_id: datetime(2026, 9, 4, 13, 58, 19)
        cursor = eng._remaining_work_cursor(529, datetime(2026, 7, 28, 13, 41, 56))
        assert cursor == datetime(2026, 9, 4, 13, 58, 19)

    def test_cascade_wins_when_later_than_log(self):
        """Op 20 must not start in August if Op 10 remaining ends in September."""
        eng = _FakeEngine()
        eng._actual_end = lambda op_id: datetime(2026, 8, 25, 11, 28, 35)
        cascade = datetime(2026, 9, 9, 15, 39, 26)
        cursor = eng._remaining_work_cursor(533, cascade)
        assert cursor == cascade

    def test_pin_change_forces_not_before_now(self):
        eng = _FakeEngine()
        eng._actual_end = lambda op_id: datetime(2026, 8, 1, 10, 0, 0)
        now = datetime(2026, 9, 8, 11, 0, 0)
        cursor = eng._remaining_work_cursor(
            529,
            datetime(2026, 7, 28, 13, 41, 56),
            force_not_before=now,
        )
        assert cursor == now

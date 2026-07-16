"""Unit tests for machine breakdown activation guards."""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from machine_breakdown_helpers import (
    get_job_card_activation_block_message,
    get_machine_breakdown_block_message,
    get_scheduled_start_block_message,
    is_machine_in_breakdown_window,
)


def _off_row(start, end):
    return SimpleNamespace(
        machine_id=1,
        status_id=2,
        available_from=start,
        available_to=end,
    )


class TestMachineBreakdownWindow:
    def test_inside_breakdown_window(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = _off_row(
            datetime(2026, 7, 7, 8, 50),
            datetime(2026, 7, 8, 13, 0),
        )
        at = datetime(2026, 7, 7, 11, 0)
        assert is_machine_in_breakdown_window(db, 1, at) is True

    def test_after_breakdown_end(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        at = datetime(2026, 7, 8, 13, 1)
        assert is_machine_in_breakdown_window(db, 1, at) is False

    def test_before_scheduled_start(self):
        msg = get_scheduled_start_block_message(
            datetime(2026, 7, 8, 13, 1),
            datetime(2026, 7, 8, 13, 0),
        )
        assert msg is not None
        assert "scheduled start" in msg.lower()

    def test_combined_guard_prefers_breakdown(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = _off_row(
            datetime(2026, 7, 7, 8, 50),
            datetime(2026, 7, 8, 13, 0),
        )
        msg = get_job_card_activation_block_message(
            db,
            1,
            datetime(2026, 7, 8, 13, 1),
            at_time=datetime(2026, 7, 7, 11, 0),
        )
        assert msg is not None
        assert "breakdown" in msg.lower()

    def test_clear_after_breakdown_and_start(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        msg = get_job_card_activation_block_message(
            db,
            1,
            datetime(2026, 7, 8, 13, 1),
            at_time=datetime(2026, 7, 8, 13, 5),
        )
        assert msg is None

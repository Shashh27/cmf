"""Tests for blocking operator until reviewer updates production log status."""

from production_log_helpers import (
    get_pending_reviewer_log_block_reason,
    pending_reviewer_log_block_message,
)


class TestPendingReviewerLogBlock:
    def test_activation_message(self):
        msg = pending_reviewer_log_block_message("activate job card")
        assert "Cannot activate job card" in msg
        assert "supervisor or manufacturing_coordinator" in msg

    def test_submit_message(self):
        msg = pending_reviewer_log_block_message("submit production log")
        assert "Cannot submit production log" in msg
        assert "supervisor or manufacturing_coordinator" in msg

    def test_unreviewed_log_blocks_activation(self):
        class FakeResult:
            def scalar(self):
                return 1

        class FakeDb:
            def execute(self, *_args, **_kwargs):
                return FakeResult()

        reason = get_pending_reviewer_log_block_reason(
            FakeDb(), operation_id=492, action="activate job card"
        )
        assert reason is not None
        assert "activate job card" in reason

    def test_no_unreviewed_log_allows_activation_check_to_continue(self):
        class FakeResult:
            def scalar(self):
                return 0

        class FakeDb:
            def execute(self, *_args, **_kwargs):
                return FakeResult()

        reason = get_pending_reviewer_log_block_reason(
            FakeDb(), operation_id=492, action="activate job card"
        )
        assert reason is None

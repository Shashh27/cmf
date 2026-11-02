"""Unit-wise job-card handoff: prior-op release onto a machine band."""

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from intelligent_scheduler.unit_job_flow import (
    _log_matches_card,
    _rebuild_after_unit_review,
    activation_block_for_card,
    card_for_log,
    shift_remaining_rows_after_machine_free,
    should_drop_reviewed_band,
    upstream_release_for_card,
)


def _card(**kwargs):
    card = {
        "part_id": 1662,
        "order_id": 189,
        "operation_id": 520,
        "machine_id": 22,
        "unit_from": 2,
        "unit_to": 2,
        "quantity": 1,
        "can_activate": True,
    }
    card.update(kwargs)
    return card


def _release(card, *, bands, total_approved, approved_by_machine=None):
    predecessor = SimpleNamespace(id=518, operation_number="20")

    def _totals(_db, operation_id, machine_id, exclude_log_id=None):
        qty = (approved_by_machine or {}).get(int(machine_id), 0)
        return {"approved": qty, "pending_produced": 0, "pending_rework": 0}

    with (
        patch(
            "intelligent_scheduler.unit_job_flow.get_immediate_predecessor_operation",
            return_value=predecessor,
        ),
        patch(
            "intelligent_scheduler.unit_job_flow.predecessor_bands",
            return_value=bands,
        ),
        patch(
            "intelligent_scheduler.unit_job_flow.total_approved_for_operation",
            return_value=total_approved,
        ),
        patch(
            "intelligent_scheduler.unit_job_flow.machine_log_totals",
            side_effect=_totals,
        ),
    ):
        return upstream_release_for_card(MagicMock(), card)


class TestUpstreamReleaseForCard:
    def test_batch_completed_predecessor_without_unit_bands_releases_unit_2(self):
        # Part 1662 op 20: 10 approved as batch, rebuild dropped its unit rows.
        result = _release(_card(), bands=[], total_approved=10)
        assert result["released_for_card"] == 1
        assert result["upstream_approved"] == 10
        assert result["upstream_operation_number"] == "20"

    def test_empty_bands_and_zero_approved_still_blocks(self):
        result = _release(_card(), bands=[], total_approved=0)
        assert result["released_for_card"] == 0

    def test_empty_bands_partial_batch_does_not_release_later_units(self):
        result = _release(_card(unit_from=2, unit_to=2), bands=[], total_approved=1)
        assert result["released_for_card"] == 0
        first = _release(_card(unit_from=1, unit_to=1), bands=[], total_approved=1)
        assert first["released_for_card"] == 1

    def test_unit_wise_bands_still_map_approvals_onto_the_low_end(self):
        bands = [
            {"machine_id": 22, "unit_from": 1, "unit_to": 3},
            {"machine_id": 23, "unit_from": 4, "unit_to": 6},
        ]
        result = _release(
            _card(unit_from=2, unit_to=2),
            bands=bands,
            total_approved=2,
            approved_by_machine={22: 2, 23: 0},
        )
        assert result["released_for_card"] == 1
        later = _release(
            _card(unit_from=4, unit_to=4),
            bands=bands,
            total_approved=2,
            approved_by_machine={22: 2, 23: 0},
        )
        assert later["released_for_card"] == 0

    def test_batch_logs_on_another_machine_still_release_when_bands_miss_them(self):
        bands = [{"machine_id": 22, "unit_from": 1, "unit_to": 10}]
        result = _release(
            _card(unit_from=2, unit_to=2),
            bands=bands,
            total_approved=10,
            approved_by_machine={22: 0},
        )
        assert result["released_for_card"] == 1
        assert result["upstream_approved"] == 10


class TestActivationBlockForCard:
    def test_completed_batch_predecessor_does_not_block_unit_2(self):
        card = _card()
        due = {
            "approved_on_card": 0,
            "card_quantity": 1,
            "has_predecessor": True,
            "released_for_card": 1,
            "available_quantity": 1,
            "rework_due": 0,
            "upstream_operation_number": "20",
        }
        with patch(
            "intelligent_scheduler.unit_job_flow.work_due_for_card",
            return_value=due,
        ):
            assert activation_block_for_card(MagicMock(), card) is None

    def test_zero_release_still_blocks(self):
        card = _card()
        due = {
            "approved_on_card": 0,
            "card_quantity": 1,
            "has_predecessor": True,
            "released_for_card": 0,
            "available_quantity": 0,
            "rework_due": 0,
            "upstream_operation_number": "20",
        }
        with patch(
            "intelligent_scheduler.unit_job_flow.work_due_for_card",
            return_value=due,
        ):
            reason = activation_block_for_card(MagicMock(), card)
        assert reason is not None
        assert "Prior operation 20 has not approved" in reason


class TestCardForLog:
    def test_picks_the_log_unit_band_when_the_machine_has_two_cards(self):
        log = SimpleNamespace(
            id=514,
            machine_id=22,
            operation_id=520,
            unit_from=2,
            unit_to=2,
            notes=None,
        )
        card_2 = _card(unit_from=2, unit_to=2)
        card_6 = _card(unit_from=6, unit_to=6)
        with patch(
            "intelligent_scheduler.job_cards.list_machine_job_cards",
            return_value={
                "machine_found": True,
                "jobs": [card_2, card_6],
            },
        ):
            assert card_for_log(MagicMock(), log)["unit_from"] == 2
            assert card_for_log(MagicMock(), log)["unit_to"] == 2

    def test_still_errors_when_range_is_missing_and_two_cards_exist(self):
        log = SimpleNamespace(
            id=514,
            machine_id=22,
            operation_id=520,
            unit_from=None,
            unit_to=None,
            notes=None,
        )
        with patch(
            "intelligent_scheduler.job_cards.list_machine_job_cards",
            return_value={
                "machine_found": True,
                "jobs": [_card(unit_from=2, unit_to=2), _card(unit_from=6, unit_to=6)],
            },
        ):
            try:
                card_for_log(MagicMock(), log)
            except HTTPException as exc:
                assert exc.status_code == 400
                assert "more than one current card" in str(exc.detail)
            else:
                raise AssertionError("expected HTTPException")


class TestLogMatchesCard:
    def test_unit_2_approval_does_not_match_unit_6_card(self):
        card = _card(unit_from=6, unit_to=6)
        log_2 = SimpleNamespace(unit_from=2, unit_to=2, notes=None)
        log_6 = SimpleNamespace(unit_from=6, unit_to=6, notes=None)
        assert _log_matches_card(log_2, card) is False
        assert _log_matches_card(log_6, card) is True


class TestRebuildAfterUnitReview:
    def test_does_not_call_greedy_rebuild(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.scalar.return_value = 37
        db.query.return_value.filter.return_value.delete.return_value = 1
        with patch("unit_wise_scheduler.rebuild_unit_schedule") as greedy:
            result = _rebuild_after_unit_review(
                db,
                part_id=1662,
                order_id=189,
                operation_id=520,
                unit_from=2,
                unit_to=2,
            )
        greedy.assert_not_called()
        assert result["queued"] is False
        assert result["dropped"] == 1
        assert result["shifted"] == 0
        db.commit.assert_called_once()

    def test_rework_does_not_drop_the_job_card(self):
        assert should_drop_reviewed_band(1) is False
        assert should_drop_reviewed_band(0) is True

    def test_rework_moves_the_same_card_to_log_end(self):
        unit_6 = SimpleNamespace(
            unit_index=6,
            machine_id=22,
            start_time=datetime(2026, 10, 28, 13, 46, 44),
            end_time=datetime(2026, 10, 28, 14, 46, 44),
        )
        free_at = datetime(2026, 10, 28, 14, 52, 31, 981569)
        shifted = shift_remaining_rows_after_machine_free([unit_6], free_at)
        assert shifted == 1
        assert unit_6.start_time == free_at
        assert unit_6.end_time == datetime(2026, 10, 28, 15, 52, 31, 981569)

    def test_reject_moves_the_same_card_to_log_end(self):
        unit_6 = SimpleNamespace(
            unit_index=6,
            machine_id=22,
            start_time=datetime(2026, 10, 28, 14, 52, 31, 981569),
            end_time=datetime(2026, 10, 28, 15, 52, 31, 981569),
        )
        free_at = datetime(2026, 10, 28, 15, 32, 11, 581358)
        shifted = shift_remaining_rows_after_machine_free([unit_6], free_at)
        assert shifted == 1
        assert unit_6.start_time == free_at
        assert unit_6.end_time == datetime(2026, 10, 28, 16, 32, 11, 581358)


class TestShiftRemainingAfterMachineFree:
    def test_stale_same_machine_card_starts_when_machine_frees(self):
        unit_6 = SimpleNamespace(
            unit_index=6,
            machine_id=22,
            start_time=datetime(2026, 7, 27, 15, 3, 32),
            end_time=datetime(2026, 7, 27, 16, 3, 32),
        )
        unit_7 = SimpleNamespace(
            unit_index=7,
            machine_id=22,
            start_time=datetime(2026, 7, 27, 15, 3, 32),
            end_time=datetime(2026, 7, 27, 16, 3, 32),
        )
        free_at = datetime(2026, 10, 28, 13, 46, 44)
        shifted = shift_remaining_rows_after_machine_free([unit_6, unit_7], free_at)
        assert shifted == 2
        assert unit_6.machine_id == 22
        assert unit_6.start_time == free_at
        assert unit_6.end_time == free_at + timedelta(hours=1)
        assert unit_7.start_time == unit_6.end_time
        assert unit_7.end_time == unit_7.start_time + timedelta(hours=1)

    def test_does_not_pull_a_future_card_earlier(self):
        later = SimpleNamespace(
            unit_index=6,
            machine_id=22,
            start_time=datetime(2026, 11, 1, 9, 0),
            end_time=datetime(2026, 11, 1, 10, 0),
        )
        free_at = datetime(2026, 10, 28, 13, 46, 44)
        shifted = shift_remaining_rows_after_machine_free([later], free_at)
        assert shifted == 0
        assert later.start_time == datetime(2026, 11, 1, 9, 0)

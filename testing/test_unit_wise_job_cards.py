"""Grouping tests for unit-wise operator job cards (no DB)."""

from datetime import date, datetime, time
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from intelligent_scheduler.job_activate import start_quantity_for_card
from intelligent_scheduler.job_cards import (
    _actual_start_end_from_logs,
    _card_matches_log_key,
    _latest_log_status,
    freeze_completed_card,
    group_unit_rows_into_job_cards,
)


def _row(**kwargs):
    base = dict(
        order_id=180,
        order_number="PO1",
        part_id=1630,
        part_number="0011-3",
        operation_id=482,
        operation_number="10",
        machine_id=19,
        schedule_version=4,
        source="greedy",
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


class TestGroupUnitRowsIntoJobCards:
    def test_contiguous_units_one_card(self):
        rows = [
            _row(
                unit_index=1,
                start_time=datetime(2026, 9, 21, 10, 0),
                end_time=datetime(2026, 9, 21, 10, 5),
            ),
            _row(
                unit_index=2,
                start_time=datetime(2026, 9, 21, 10, 5),
                end_time=datetime(2026, 9, 21, 10, 10),
            ),
        ]
        cards = group_unit_rows_into_job_cards(rows)
        assert len(cards) == 1
        card = cards[0]
        assert card["unit_from"] == 1
        assert card["unit_to"] == 2
        assert card["quantity"] == 2
        assert card["machine_id"] == 19
        assert card["planned_start"] == datetime(2026, 9, 21, 10, 0)
        assert card["planned_end"] == datetime(2026, 9, 21, 10, 10)
        assert card["schedule_version"] == 4
        assert card["source"] == "greedy"

    def test_gap_starts_a_new_band(self):
        rows = [
            _row(unit_index=1, start_time=datetime(2026, 9, 21, 10, 0), end_time=datetime(2026, 9, 21, 10, 5)),
            _row(unit_index=2, start_time=datetime(2026, 9, 21, 10, 5), end_time=datetime(2026, 9, 21, 10, 10)),
            _row(unit_index=4, start_time=datetime(2026, 9, 21, 11, 0), end_time=datetime(2026, 9, 21, 11, 5)),
        ]
        cards = group_unit_rows_into_job_cards(rows)
        assert [(c["unit_from"], c["unit_to"], c["quantity"]) for c in cards] == [
            (1, 2, 2),
            (4, 4, 1),
        ]

    def test_different_machines_stay_separate(self):
        rows = [
            _row(unit_index=1, machine_id=19, start_time=datetime(2026, 9, 21, 10, 0), end_time=datetime(2026, 9, 21, 10, 5)),
            _row(unit_index=2, machine_id=18, start_time=datetime(2026, 9, 21, 10, 0), end_time=datetime(2026, 9, 21, 10, 5)),
        ]
        cards = group_unit_rows_into_job_cards(rows)
        assert len(cards) == 2
        by_machine = {c["machine_id"]: c for c in cards}
        assert by_machine[19]["unit_from"] == 1 and by_machine[19]["quantity"] == 1
        assert by_machine[18]["unit_from"] == 2 and by_machine[18]["quantity"] == 1

    def test_same_unit_shift_split_stays_one_card(self):
        rows = [
            _row(unit_index=1, start_time=datetime(2026, 9, 21, 16, 0), end_time=datetime(2026, 9, 21, 17, 0)),
            _row(unit_index=1, start_time=datetime(2026, 9, 22, 8, 30), end_time=datetime(2026, 9, 22, 9, 0)),
        ]
        cards = group_unit_rows_into_job_cards(rows)
        assert len(cards) == 1
        assert cards[0]["quantity"] == 1
        assert cards[0]["planned_start"] == datetime(2026, 9, 21, 16, 0)
        assert cards[0]["planned_end"] == datetime(2026, 9, 22, 9, 0)


class TestStartQuantityForCard:
    def test_defaults_to_the_open_band(self):
        assert start_quantity_for_card(None, 3, 0) == 3

    def test_rejects_more_than_the_card(self):
        with pytest.raises(HTTPException) as exc:
            start_quantity_for_card(4, 3, 0)
        assert exc.value.status_code == 400
        assert "more than 3" in str(exc.value.detail)

    def test_rejects_more_than_units_still_open(self):
        with pytest.raises(HTTPException) as exc:
            start_quantity_for_card(3, 3, 1)
        assert exc.value.status_code == 400
        assert "more than 2" in str(exc.value.detail)


class TestFreezeCompletedCard:
    def test_completed_card_cannot_activate(self):
        frozen = freeze_completed_card(
            {
                "operation_id": 520,
                "machine_id": 22,
                "unit_from": 2,
                "unit_to": 2,
                "quantity": 1,
                "can_activate": True,
            },
            approved=1,
        )
        assert frozen["status"] == "completed"
        assert frozen["can_activate"] is False
        assert frozen["remaining_quantity"] == 0
        assert frozen["approved_quantity"] == 1
        assert "completed" in frozen["blocked_reason"].lower()

    def test_log_key_matches_only_that_unit_band(self):
        card_2 = {"operation_id": 520, "machine_id": 22, "unit_from": 2, "unit_to": 2}
        card_6 = {"operation_id": 520, "machine_id": 22, "unit_from": 6, "unit_to": 6}
        key = (520, 22, 2, 2)
        assert _card_matches_log_key(card_2, key) is True
        assert _card_matches_log_key(card_6, key) is False

    def test_completed_card_uses_log_from_and_to_times(self):
        start, end = _actual_start_end_from_logs(
            [
                SimpleNamespace(
                    from_date=date(2026, 10, 28),
                    from_time=time(12, 42, 35),
                    to_date=date(2026, 10, 28),
                    to_time=time(13, 46, 44),
                )
            ]
        )
        assert start == datetime(2026, 10, 28, 12, 42, 35)
        assert end == datetime(2026, 10, 28, 13, 46, 44)

    def test_status_comes_from_matching_production_log(self):
        card_2 = {"operation_id": 520, "machine_id": 22, "unit_from": 2, "unit_to": 2}
        card_6 = {"operation_id": 520, "machine_id": 22, "unit_from": 6, "unit_to": 6}
        logs = [
            SimpleNamespace(
                id=514,
                operation_id=520,
                machine_id=22,
                unit_from=2,
                unit_to=2,
                notes=None,
                status="completed",
            ),
            SimpleNamespace(
                id=515,
                operation_id=520,
                machine_id=22,
                unit_from=6,
                unit_to=6,
                notes=None,
                status="inprogress",
            ),
            SimpleNamespace(
                id=496,
                operation_id=520,
                machine_id=22,
                unit_from=None,
                unit_to=None,
                notes=None,
                status="inprogress",
            ),
        ]
        assert _latest_log_status(card_6, logs) == "inprogress"
        assert _latest_log_status(card_2, logs) == "completed"

    def test_status_is_pending_when_no_log(self):
        card = {"operation_id": 520, "machine_id": 22, "unit_from": 6, "unit_to": 6}
        assert _latest_log_status(card, []) == "pending"

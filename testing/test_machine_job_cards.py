"""Unit tests for collapsing unit_schedule rows into operator job cards."""

from datetime import datetime
from types import SimpleNamespace

from intelligent_scheduler.jobs.service import collapse_unit_rows_to_cards


def _row(**kwargs):
    defaults = dict(
        order_id=180,
        order_number="PO1",
        part_id=1630,
        part_number="0011-3",
        part_name="Pivot fin",
        operation_id=482,
        operation_number="10",
        operation_name="Facing",
        schedule_version=4,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestCollapseUnitRowsToCards:
    def test_two_machines_become_two_cards(self):
        t0 = datetime(2026, 9, 21, 10, 0)
        t1 = datetime(2026, 9, 21, 10, 9)
        t2 = datetime(2026, 9, 21, 10, 18)
        rows = [
            _row(machine_id=19, unit_index=1, start_time=t0, end_time=t1),
            _row(machine_id=19, unit_index=2, start_time=t0, end_time=t1),
            _row(
                machine_id=18,
                unit_index=3,
                start_time=t1,
                end_time=t2,
            ),
            _row(
                machine_id=18,
                unit_index=4,
                start_time=t1,
                end_time=t2,
            ),
        ]
        by_machine = {}
        for mid in (19, 18):
            by_machine[mid] = collapse_unit_rows_to_cards(
                [r for r in rows if r.machine_id == mid]
            )

        card19 = by_machine[19]
        assert len(card19) == 1
        assert card19[0]["unit_from"] == 1
        assert card19[0]["unit_to"] == 2
        assert card19[0]["quantity"] == 2
        assert card19[0]["planned_start"] == t0
        assert card19[0]["planned_end"] == t1
        assert card19[0]["operation_number"] == "10"

        card18 = by_machine[18]
        assert len(card18) == 1
        assert card18[0]["unit_from"] == 3
        assert card18[0]["unit_to"] == 4
        assert card18[0]["quantity"] == 2
        assert card18[0]["planned_start"] == t1
        assert card18[0]["planned_end"] == t2

    def test_gap_in_units_splits_cards(self):
        t = datetime(2026, 9, 21, 11, 0)
        rows = [
            _row(machine_id=19, unit_index=1, start_time=t, end_time=t),
            _row(machine_id=19, unit_index=2, start_time=t, end_time=t),
            _row(machine_id=19, unit_index=5, start_time=t, end_time=t),
        ]
        cards = collapse_unit_rows_to_cards(rows)
        assert [(c["unit_from"], c["unit_to"], c["quantity"]) for c in cards] == [
            (1, 2, 2),
            (5, 5, 1),
        ]

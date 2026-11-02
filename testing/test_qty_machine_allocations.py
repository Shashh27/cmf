"""Unit tests for Intelligent Scheduler qty→machine allocation helpers."""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from intelligent_scheduler.service import (
    is_process_plan_default,
    expand_allocations_to_machine_by_slot,
    process_plan_bands_for_omitted_ops,
    same_allocation_bands,
    summarize_machine_occupancy,
    validate_allocation_bands,
)


class TestSummarizeMachineOccupancy:
    def test_future_other_parts_set_busy_until_and_wip(self):
        now = datetime(2026, 9, 23, 12, 0)
        rows = [
            (7, datetime(2026, 9, 24, 16, 30), 1630, "0011-3", "Pivot fin"),
            (7, datetime(2026, 9, 24, 10, 0), 1630, "0011-3", "Pivot fin"),
            (7, datetime(2026, 9, 23, 9, 0), 999, "OLD", "Already done"),
            (8, datetime(2026, 9, 23, 11, 0), 1515, "PRT-002", "XYZ"),
        ]
        out = summarize_machine_occupancy(rows, now)
        assert out[7]["occupied_until"] == datetime(2026, 9, 24, 16, 30).isoformat()
        assert out[7]["wip_parts"] == [
            {"part_id": 1630, "part_number": "0011-3", "part_name": "Pivot fin"},
        ]
        assert 8 not in out

    def test_empty_when_nothing_is_still_in_the_future(self):
        now = datetime(2026, 9, 23, 12, 0)
        assert summarize_machine_occupancy([], now) == {}


class TestExpandAllocations:
    def test_expand_bands_to_slots(self):
        bands = [
            {"part_id": 10, "operation_id": 20, "unit_from": 1, "unit_to": 5, "machine_id": 101},
            {"part_id": 10, "operation_id": 20, "unit_from": 6, "unit_to": 10, "machine_id": 102},
        ]
        slot = expand_allocations_to_machine_by_slot(bands)
        assert slot[(10, 20, 1)] == 101
        assert slot[(10, 20, 5)] == 101
        assert slot[(10, 20, 6)] == 102
        assert slot[(10, 20, 10)] == 102
        assert (10, 20, 11) not in slot

    def test_expand_uses_part_id_arg(self):
        bands = [
            {"operation_id": 3, "unit_from": 1, "unit_to": 2, "machine_id": 7},
        ]
        slot = expand_allocations_to_machine_by_slot(bands, part_id=99)
        assert slot[(99, 3, 1)] == 7
        assert slot[(99, 3, 2)] == 7

    def test_expand_orm_like_rows(self):
        row = SimpleNamespace(
            part_id=1,
            operation_id=2,
            unit_from=1,
            unit_to=3,
            machine_id=5,
        )
        slot = expand_allocations_to_machine_by_slot([row])
        assert slot[(1, 2, 2)] == 5


class TestValidateAllocationBands:
    def _db_mocks(self, qty=10, op_id=20, wc_id=8, machine_ids=(101, 102)):
        part = SimpleNamespace(id=1, type_id=1, qty=qty)
        pss = SimpleNamespace(part_id=1, status="active", sale_order_id=50)
        op = SimpleNamespace(
            id=op_id,
            part_id=1,
            workcenter_id=wc_id,
            operation_number="20",
            operation_name="Mill",
            machine_id=machine_ids[0],
        )
        machines = [
            SimpleNamespace(id=mid, work_center_id=wc_id, make="M", model=str(mid))
            for mid in machine_ids
        ]

        db = MagicMock()

        def query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if name == "Part":
                q.filter.return_value.first.return_value = part
            elif name == "PartScheduleStatus":
                q.filter.return_value.first.return_value = pss
            elif name == "Operation":
                q.filter.return_value.all.return_value = [op]
            elif name == "Machine":
                q.filter.return_value.order_by.return_value.all.return_value = machines
            else:
                q.filter.return_value.first.return_value = None
                q.filter.return_value.all.return_value = []
            return q

        db.query.side_effect = query_side_effect
        return db, part, op

    @patch("intelligent_scheduler.service.is_schedulable_operation", return_value=True)
    def test_valid_full_partition(self, _sched):
        db, _, _ = self._db_mocks()
        bands = [
            {"operation_id": 20, "unit_from": 1, "unit_to": 5, "machine_id": 101},
            {"operation_id": 20, "unit_from": 6, "unit_to": 10, "machine_id": 102},
        ]
        out = validate_allocation_bands(db, 1, bands)
        assert len(out) == 2

    @patch("intelligent_scheduler.service.is_schedulable_operation", return_value=True)
    def test_gap_raises(self, _sched):
        db, _, _ = self._db_mocks()
        bands = [
            {"operation_id": 20, "unit_from": 1, "unit_to": 4, "machine_id": 101},
            {"operation_id": 20, "unit_from": 6, "unit_to": 10, "machine_id": 102},
        ]
        with pytest.raises(HTTPException) as ei:
            validate_allocation_bands(db, 1, bands)
        assert ei.value.status_code == 400
        assert "Gaps" in str(ei.value.detail) or "missing" in str(ei.value.detail).lower()

    @patch("intelligent_scheduler.service.is_schedulable_operation", return_value=True)
    def test_overlap_raises(self, _sched):
        db, _, _ = self._db_mocks()
        bands = [
            {"operation_id": 20, "unit_from": 1, "unit_to": 6, "machine_id": 101},
            {"operation_id": 20, "unit_from": 5, "unit_to": 10, "machine_id": 102},
        ]
        with pytest.raises(HTTPException) as ei:
            validate_allocation_bands(db, 1, bands)
        assert ei.value.status_code == 400
        assert "Overlap" in str(ei.value.detail)

    @patch("intelligent_scheduler.service.is_schedulable_operation", return_value=True)
    def test_machine_outside_wc_raises(self, _sched):
        db, _, _ = self._db_mocks()
        bands = [
            {"operation_id": 20, "unit_from": 1, "unit_to": 10, "machine_id": 999},
        ]
        with pytest.raises(HTTPException) as ei:
            validate_allocation_bands(db, 1, bands)
        assert ei.value.status_code == 400
        assert "workcenter" in str(ei.value.detail).lower()

    @patch("intelligent_scheduler.service.is_schedulable_operation", return_value=True)
    def test_empty_bands_ok(self, _sched):
        db, _, _ = self._db_mocks()
        out = validate_allocation_bands(db, 1, [])
        assert out == []


class TestProcessPlanBandsForOmittedOps:
    @patch("intelligent_scheduler.service.is_schedulable_operation", return_value=True)
    @patch("intelligent_scheduler.service._machines_for_wc")
    @patch("intelligent_scheduler.service._schedulable_ops")
    def test_omitted_operation_uses_routing_machine(self, sched_ops, machines_for_wc, _sched):
        split_op = SimpleNamespace(id=17, machine_id=26, workcenter_id=2)
        plan_op = SimpleNamespace(id=18, machine_id=13, workcenter_id=3)
        sched_ops.return_value = [split_op, plan_op]
        machines_for_wc.return_value = [SimpleNamespace(id=13)]

        bands = process_plan_bands_for_omitted_ops(
            MagicMock(),
            24,
            10,
            covered_operation_ids=[17],
        )

        assert bands == [
            {"operation_id": 18, "unit_from": 1, "unit_to": 10, "machine_id": 13}
        ]


class TestProcessPlanDefault:
    def test_single_routing_band_is_the_default(self):
        bands = [{"unit_from": 1, "unit_to": 20, "machine_id": 25}]
        assert is_process_plan_default(bands, 25, 20) is True

    def test_a_split_is_not_the_default(self):
        bands = [
            {"unit_from": 1, "unit_to": 7, "machine_id": 30},
            {"unit_from": 8, "unit_to": 14, "machine_id": 31},
            {"unit_from": 15, "unit_to": 20, "machine_id": 32},
        ]
        assert is_process_plan_default(bands, 31, 20) is False

    def test_full_range_on_another_machine_is_not_the_default(self):
        bands = [{"unit_from": 1, "unit_to": 20, "machine_id": 30}]
        assert is_process_plan_default(bands, 25, 20) is False
    def test_same_split_ignores_order(self):
        left = [
            SimpleNamespace(unit_from=4, unit_to=6, machine_id=23),
            SimpleNamespace(unit_from=1, unit_to=3, machine_id=22),
        ]
        right = [
            {"unit_from": 1, "unit_to": 3, "machine_id": 22},
            {"unit_from": 4, "unit_to": 6, "machine_id": 23},
        ]
        assert same_allocation_bands(left, right) is True

    def test_different_machine_is_a_change(self):
        left = [SimpleNamespace(unit_from=1, unit_to=10, machine_id=13)]
        right = [{"unit_from": 1, "unit_to": 10, "machine_id": 14}]
        assert same_allocation_bands(left, right) is False


class TestDetailBands:
    def test_latest_unit_rows_win_over_leftover_allocations(self):
        from intelligent_scheduler.service import _detail_bands

        unit_rows = [
            SimpleNamespace(
                operation_id=17, machine_id=26, unit_index=u,
                start_time=datetime(2026, 10, 28, 9, 0),
                end_time=datetime(2026, 10, 28, 10, 0),
                assignment_mode="process_plan",
            )
            for u in range(1, 11)
        ] + [
            SimpleNamespace(
                operation_id=18, machine_id=mid, unit_index=u,
                start_time=datetime(2026, 10, 28, 13, 0),
                end_time=datetime(2026, 10, 28, 14, 0),
                assignment_mode="manual",
            )
            for mid, units in ((13, (1, 2, 3)), (14, (4, 5, 6)), (15, (7, 8)), (16, (9, 10)))
            for u in units
        ]
        leftover = [
            SimpleNamespace(operation_id=17, machine_id=22, unit_from=1, unit_to=3),
            SimpleNamespace(operation_id=17, machine_id=23, unit_from=4, unit_to=6),
            SimpleNamespace(operation_id=17, machine_id=24, unit_from=7, unit_to=8),
            SimpleNamespace(operation_id=17, machine_id=25, unit_from=9, unit_to=10),
            SimpleNamespace(operation_id=18, machine_id=13, unit_from=1, unit_to=3),
        ]
        bands = _detail_bands(unit_rows, leftover)
        op17 = [b for b in bands if b["operation_id"] == 17]
        op18 = [b for b in bands if b["operation_id"] == 18]
        assert op17 == [
            {
                "operation_id": 17,
                "machine_id": 26,
                "unit_from": 1,
                "unit_to": 10,
                "assignment_mode": "process_plan",
            }
        ]
        assert [(b["machine_id"], b["unit_from"], b["unit_to"], b["assignment_mode"]) for b in op18] == [
            (13, 1, 3, "manual"),
            (14, 4, 6, "manual"),
            (15, 7, 8, "manual"),
            (16, 9, 10, "manual"),
        ]

    def test_allocations_used_only_when_no_unit_rows(self):
        from intelligent_scheduler.service import _detail_bands

        leftover = [
            SimpleNamespace(operation_id=17, machine_id=22, unit_from=1, unit_to=3),
        ]
        bands = _detail_bands([], leftover)
        assert bands == [
            {
                "operation_id": 17,
                "machine_id": 22,
                "unit_from": 1,
                "unit_to": 3,
                "assignment_mode": None,
            }
        ]


def _plog(**kwargs):
    from datetime import date, time

    row = dict(
        operation_id=520,
        machine_id=22,
        unit_from=2,
        unit_to=2,
        from_date=date(2026, 10, 28),
        from_time=time(12, 42, 35),
        to_date=date(2026, 10, 28),
        to_time=time(13, 46, 44),
        operator_status="completed",
        produced_quantity=1,
        status="completed",
    )
    row.update(kwargs)
    return SimpleNamespace(**row)


class TestBandsFromProductionLogs:
    def test_tagged_logs_merge_contiguous_units_on_one_machine(self):
        from intelligent_scheduler.service import _bands_from_production_logs

        logs = [
            _plog(unit_from=2, unit_to=2),
            _plog(unit_from=3, unit_to=3),
        ]
        bands = _bands_from_production_logs(logs, 10)
        assert bands == [
            {
                "operation_id": 520,
                "machine_id": 22,
                "unit_from": 2,
                "unit_to": 3,
                "assignment_mode": None,
                "untagged": False,
            }
        ]

    def test_tagged_logs_win_over_untagged_same_operation(self):
        from intelligent_scheduler.service import _bands_from_production_logs

        logs = [
            _plog(machine_id=26, unit_from=None, unit_to=None, status="inprogress"),
            _plog(machine_id=22, unit_from=2, unit_to=2),
        ]
        bands = _bands_from_production_logs(logs, 10)
        assert [(b["machine_id"], b["unit_from"], b["unit_to"], b["untagged"]) for b in bands] == [
            (22, 2, 2, False),
        ]

    def test_untagged_batch_op_becomes_full_qty_band(self):
        from intelligent_scheduler.service import _bands_from_production_logs

        logs = [
            _plog(
                operation_id=518,
                machine_id=31,
                unit_from=None,
                unit_to=None,
            )
        ]
        bands = _bands_from_production_logs(logs, 10)
        assert bands == [
            {
                "operation_id": 518,
                "machine_id": 31,
                "unit_from": 1,
                "unit_to": 10,
                "assignment_mode": None,
                "untagged": True,
            }
        ]

    def test_history_fills_ops_missing_from_remaining_schedule(self):
        from intelligent_scheduler.service import _merge_live_and_history_bands

        live = [
            {
                "operation_id": 520,
                "machine_id": 22,
                "unit_from": 6,
                "unit_to": 6,
                "assignment_mode": "manual",
            }
        ]
        history = [
            {
                "operation_id": 518,
                "machine_id": 31,
                "unit_from": 1,
                "unit_to": 10,
                "assignment_mode": None,
                "untagged": True,
            },
            {
                "operation_id": 520,
                "machine_id": 22,
                "unit_from": 2,
                "unit_to": 2,
                "assignment_mode": None,
                "untagged": False,
            },
        ]
        merged = _merge_live_and_history_bands(live, history)
        assert [b["operation_id"] for b in merged] == [518, 520]
        assert merged[-1]["unit_from"] == 6

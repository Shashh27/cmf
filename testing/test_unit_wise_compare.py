"""Phase 3 unit-wise vs batch compare helper tests."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from unit_wise_compare import (
    _aggregate_machine_metrics,
    _batch_flow_waiting_metrics,
    _due_metrics,
    _hours,
    _machine_load_metrics,
    _merged_busy_seconds,
    _span_metrics,
    _throughput,
    _unit_flow_waiting_metrics,
    _waiting_between_ops,
)


class TestCompareHelpers:
    def test_hours(self):
        assert _hours(7200) == 2.0

    def test_span_metrics(self):
        t0 = datetime(2026, 7, 24, 8, 30)
        rows = [
            (t0, t0 + timedelta(hours=2)),
            (t0 + timedelta(hours=2), t0 + timedelta(hours=5)),
        ]
        m = _span_metrics(rows)
        assert m["segment_count"] == 2
        assert m["makespan_hours"] == 5.0

    def test_merged_busy_overlaps(self):
        t0 = datetime(2026, 7, 24, 8, 0)
        busy = _merged_busy_seconds(
            [
                (t0, t0 + timedelta(hours=2)),
                (t0 + timedelta(hours=1), t0 + timedelta(hours=3)),
            ]
        )
        assert _hours(busy) == 3.0

    def test_machine_load_utilization_and_idle(self):
        t0 = datetime(2026, 7, 24, 8, 0)
        load = _machine_load_metrics(
            [
                (33, t0, t0 + timedelta(hours=2)),
                (33, t0 + timedelta(hours=3), t0 + timedelta(hours=4)),
                (36, t0, t0 + timedelta(hours=1)),
            ]
        )
        assert load[33]["busy_hours"] == 3.0
        assert load[33]["idle_hours"] == 1.0
        assert load[33]["utilization_pct"] == 75.0
        agg = _aggregate_machine_metrics(load)
        assert agg["idle_hours_total"] == 1.0

    def test_waiting_between_ops(self):
        t0 = datetime(2026, 7, 24, 8, 0)
        # Op10 ends 10:00, Op20 starts 11:00 → 1h wait
        wait = _waiting_between_ops(
            [
                ("10", t0, t0 + timedelta(hours=2)),
                ("20", t0 + timedelta(hours=3), t0 + timedelta(hours=5)),
            ]
        )
        assert _hours(wait) == 1.0

    def test_unit_flow_and_waiting(self):
        t0 = datetime(2026, 7, 24, 8, 0)
        due = t0 + timedelta(hours=10)
        rows = [
            SimpleNamespace(
                unit_index=1,
                operation_number="10",
                start_time=t0,
                end_time=t0 + timedelta(hours=1),
            ),
            SimpleNamespace(
                unit_index=1,
                operation_number="20",
                start_time=t0 + timedelta(hours=2),
                end_time=t0 + timedelta(hours=3),
            ),
            SimpleNamespace(
                unit_index=2,
                operation_number="10",
                start_time=t0 + timedelta(hours=1),
                end_time=t0 + timedelta(hours=2),
            ),
            SimpleNamespace(
                unit_index=2,
                operation_number="20",
                start_time=t0 + timedelta(hours=2),
                end_time=t0 + timedelta(hours=4),
            ),
        ]
        m = _unit_flow_waiting_metrics(rows, due)
        assert m["units_planned"] == 2
        assert m["first_unit_flow_hours"] == 3.0  # 08–11
        assert m["mean_waiting_hours"] == 0.5  # unit1: 1h, unit2: 0h
        assert m["tardiness_hours"] == 0.0
        assert m["earliness_hours"] == 6.0  # due 18:00, finish 12:00

    def test_batch_flow_throughput(self):
        t0 = datetime(2026, 7, 24, 8, 0)
        batch = [
            SimpleNamespace(
                operation_number="20",
                start_time=t0,
                end_time=t0 + timedelta(hours=4),
                remaining_qty=2,
                total_qty=10,
            ),
        ]
        m = _batch_flow_waiting_metrics(batch, 4.0, (t0 + timedelta(hours=4)).isoformat(), None)
        assert m["flow_hours"] == 4.0
        assert m["waiting_hours"] == 0.0
        assert m["units_for_throughput"] == 2
        assert m["throughput_units_per_hour"] == 0.5
        assert m["tardiness_hours"] is None

        # Align to unit-wise unfinished count when remaining_qty is stale/low
        batch_stale = [
            SimpleNamespace(
                operation_number="20",
                start_time=t0,
                end_time=t0 + timedelta(hours=4),
                remaining_qty=1,
                total_qty=10,
            ),
        ]
        m2 = _batch_flow_waiting_metrics(
            batch_stale,
            4.0,
            (t0 + timedelta(hours=4)).isoformat(),
            None,
            unit_planned=2,
        )
        assert m2["units_for_throughput"] == 2
        assert m2["throughput_units_per_hour"] == 0.5

    def test_due_tardiness_earliness(self):
        t0 = datetime(2026, 7, 24, 8, 0)
        due = t0 + timedelta(hours=5)
        early = _due_metrics(t0 + timedelta(hours=3), due)
        assert early["tardiness_hours"] == 0.0
        assert early["earliness_hours"] == 2.0
        late = _due_metrics(t0 + timedelta(hours=8), due)
        assert late["tardiness_hours"] == 3.0
        assert late["earliness_hours"] == 0.0

    def test_throughput(self):
        assert _throughput(2, 4.0) == 0.5
        assert _throughput(0, 4.0) is None

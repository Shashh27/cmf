"""Phase 3 unit-wise vs batch compare helper tests."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from unit_wise_compare import (
    _aggregate_machine_metrics,
    _batch_flow_waiting_metrics,
    _build_compare_summary,
    _due_metrics,
    _hours,
    _machine_load_metrics,
    _merged_busy_seconds,
    _span_metrics,
    _throughput,
    _unit_flow_waiting_metrics,
    _waiting_between_ops,
    _working_hours_between,
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
        # Same-day within default GENERAL → working == calendar
        assert m["makespan_hours"] == 5.0
        assert m["makespan_calendar_hours"] == 5.0

    def test_span_excludes_overnight_closed_shop(self):
        # Fri 10:46 → Sat 15:06 would be wrong calendar; use Mon→Tue
        start = datetime(2026, 7, 27, 10, 46)  # Mon
        end = datetime(2026, 7, 28, 15, 6)  # Tue
        m = _span_metrics([(start, end)])
        # Working: Mon 10:46–17:00 (6.2333) + Tue 08:30–15:06 (6.6) ≈ 12.8333
        assert m["makespan_calendar_hours"] == _hours((end - start).total_seconds())
        assert m["makespan_hours"] == round(6.2333 + 6.6, 4)
        assert m["makespan_hours"] < m["makespan_calendar_hours"]

    def test_working_hours_helper(self):
        start = datetime(2026, 7, 27, 10, 46)
        end = datetime(2026, 7, 28, 10, 57)
        # Mon 10:46–17:00 + Tue 08:30–10:57
        h = _working_hours_between(start, end)
        assert h == round(6.2333 + 2.45, 4)

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
        t0 = datetime(2026, 7, 24, 8, 30)
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
        t0 = datetime(2026, 7, 24, 8, 30)
        # Op10 ends 10:30, Op20 starts 11:30 → 1h wait (same shift day)
        wait = _waiting_between_ops(
            [
                ("10", t0, t0 + timedelta(hours=2)),
                ("20", t0 + timedelta(hours=3), t0 + timedelta(hours=5)),
            ]
        )
        assert _hours(wait) == 1.0

    def test_waiting_between_ops_excludes_overnight(self):
        # Op10 ends 15:16 Mon, Op20 starts 08:37 Tue
        # Working wait = Mon 15:16–17:00 + Tue 08:30–08:37 (overnight excluded)
        wait = _waiting_between_ops(
            [
                ("10", datetime(2026, 7, 27, 14, 0), datetime(2026, 7, 27, 15, 16)),
                ("20", datetime(2026, 7, 28, 8, 37), datetime(2026, 7, 28, 9, 37)),
            ]
        )
        mon = (datetime(2026, 7, 27, 17, 0) - datetime(2026, 7, 27, 15, 16)).total_seconds()
        tue = (datetime(2026, 7, 28, 8, 37) - datetime(2026, 7, 28, 8, 30)).total_seconds()
        assert _hours(wait) == _hours(mon + tue)

    def test_unit_flow_and_waiting(self):
        t0 = datetime(2026, 7, 24, 8, 30)
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
        assert m["first_unit_flow_hours"] == 3.0  # 08:30–11:30
        assert m["mean_waiting_hours"] == 0.5  # unit1: 1h, unit2: 0h
        assert m["tardiness_hours"] == 0.0
        # Finish 12:30, due 18:30 → working earliness only to shift end 17:00 = 4.5h
        assert m["earliness_hours"] == 4.5
        assert m["due_binding"] is True
    def test_batch_flow_throughput(self):
        t0 = datetime(2026, 7, 24, 8, 30)
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
        # Date-only due → normalized to 17:00 same day
        due = datetime(2026, 7, 24, 0, 0)
        early = _due_metrics(t0 + timedelta(hours=3), due)  # finish 11:00, due 17:00
        assert early["tardiness_hours"] == 0.0
        assert early["on_time"] is True
        assert early["earliness_hours"] == 6.0  # 11:00→17:00 same GENERAL day
        assert early["due_binding"] is True

        late = _due_metrics(t0 + timedelta(hours=12), due)  # finish 20:00 after 17:00
        assert late["on_time"] is False
        assert late["tardiness_hours"] == 3.0  # 17:00→20:00 after-hours credited
        assert late["earliness_hours"] == 0.0
        # Distant due → not binding
        far = _due_metrics(t0, datetime(2026, 12, 31, 0, 0))
        assert far["on_time"] is True
        assert far["due_binding"] is False
        assert far["earliness_days"] and far["earliness_days"] > 30
    def test_throughput(self):
        assert _throughput(2, 4.0) == 0.5
        assert _throughput(0, 4.0) is None


class TestCompareSummary:
    def test_pipeline_win_when_makespan_same_first_unit_faster(self):
        batch = {"makespan_hours": 48.0, "flow_hours": 48.0, "mean_waiting_hours": 18.0}
        unit = {
            "makespan_hours": 48.0,
            "first_unit_flow_hours": 24.0,
            "mean_waiting_hours": 2.0,
        }
        delta = {
            "makespan_delta": 0.0,
            "makespan_improved": False,
            "first_piece_hours_saved": 24.0,
            "first_unit_flow_improved": True,
            "waiting_time_delta": 16.0,
            "waiting_time_improved": True,
        }
        s = _build_compare_summary(2, batch, unit, delta)
        assert s["verdict"] == "pipeline_win"
        assert s["makespan_unchanged"] is True
        assert "first_unit_flow" in s["unit_wise_wins"]
        assert "24.00" in s["headline"]

    def test_metric_winner_and_scoreboard_excludes_insight(self):
        from unit_wise_compare import _metric_winner

        win = _metric_winner(10.0, 12.0, 8.0)
        assert win["winner"] == "unit_wise"
        # Insight rows must not invent a winner when values differ in grain
        insight = _metric_winner(None, 48.0, 24.0)  # batch span vs U1
        assert insight["winner"] == "unit_wise"  # raw helper still picks min
        # Fairness is enforced by in_scoreboard=False at row build time
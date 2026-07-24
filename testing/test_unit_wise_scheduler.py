"""Unit tests for unit-wise greedy helpers (no DB)."""

from datetime import datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from unit_wise_scheduler import (
    _duration,
    _op_number_key,
    _pick_machine,
    _place_within_shifts,
    _snap_to_shift_start,
    unit_wise_enabled,
)


class TestUnitWiseHelpers:
    def test_duration_includes_setup_once(self):
        op = SimpleNamespace(
            setup_time=time(0, 30, 0),
            cycle_time=time(1, 0, 0),
        )
        assert _duration(op, skip_setup=False) == timedelta(hours=1, minutes=30)
        assert _duration(op, skip_setup=True) == timedelta(hours=1)

    def test_op_number_sort_key(self):
        assert _op_number_key("10") < _op_number_key("20")
        assert _op_number_key(10) < _op_number_key("20")

    def test_snap_before_shift(self):
        dt = datetime(2026, 7, 24, 7, 0, 0)
        assert _snap_to_shift_start(dt) == datetime(2026, 7, 24, 8, 30, 0)

    def test_place_splits_across_shift(self):
        # Start near end of shift so 2h work must spill
        start = datetime(2026, 7, 24, 16, 0, 0)
        segs = _place_within_shifts(start, timedelta(hours=2))
        assert len(segs) >= 2
        total = sum((e - s).total_seconds() for s, e in segs)
        assert total == timedelta(hours=2).total_seconds()

    def test_pick_earliest_machine(self):
        m1 = SimpleNamespace(id=1)
        m2 = SimpleNamespace(id=2)
        ready = datetime(2026, 7, 24, 10, 0, 0)
        free = {
            1: datetime(2026, 7, 24, 12, 0, 0),
            2: datetime(2026, 7, 24, 9, 0, 0),
        }
        picked = _pick_machine([m1, m2], free, ready)
        assert picked.id == 2  # free earlier → start at ready 10:00

    def test_pick_preferred_machine_wins(self):
        m1 = SimpleNamespace(id=1)
        m2 = SimpleNamespace(id=2)
        ready = datetime(2026, 7, 24, 10, 0, 0)
        free = {
            1: datetime(2026, 7, 24, 12, 0, 0),
            2: datetime(2026, 7, 24, 9, 0, 0),
        }
        # Prefer machine 1 even though 2 is free earlier
        picked = _pick_machine([m1, m2], free, ready, preferred_id=1)
        assert picked.id == 1

    def test_feature_flag_default_true(self):
        with patch.dict("os.environ", {}, clear=False):
            # Ensure key absent or true
            import os

            os.environ.pop("UNIT_WISE_SCHEDULE_ENABLED", None)
            assert unit_wise_enabled() is True
        with patch.dict("os.environ", {"UNIT_WISE_SCHEDULE_ENABLED": "false"}):
            assert unit_wise_enabled() is False


class TestUnitWisePipelineLogic:
    """Conceptual: Unit1 Op20 can start before Unit2 Op10 finishes."""

    def test_pipeline_ready_times(self):
        # Simulate greedy ready times without DB
        setup = timedelta(minutes=30)
        cycle = timedelta(hours=1)
        t0 = datetime(2026, 7, 24, 8, 30, 0)

        # Op10 continuous run
        m1_free = t0
        unit_ready = {1: t0, 2: t0, 3: t0}
        op10_end = {}
        for u in (1, 2, 3):
            skip = u > 1
            dur = cycle if skip else setup + cycle
            start = max(unit_ready[u], m1_free)
            end = start + dur
            op10_end[u] = end
            m1_free = end
            unit_ready[u] = end

        # Op20 for unit 1 starts at op10_end[1], while unit 2 still on op10
        assert op10_end[1] == t0 + setup + cycle  # 10:00
        assert op10_end[2] == op10_end[1] + cycle  # 11:00
        assert op10_end[1] < op10_end[2]
        # Unit 1 ready for Op20 before Unit 2 finishes Op10
        assert unit_ready[1] < op10_end[2]

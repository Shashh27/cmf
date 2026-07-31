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


class TestListUnitScheduleMultiVersion:
    def test_latest_only_per_part(self):
        from DB.database import Base
        from DB.models.scheduling import UnitScheduleItem
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from unit_wise_scheduler import list_unit_schedule

        from sqlalchemy import event

        engine = create_engine("sqlite:///:memory:")
        @event.listens_for(engine, "connect")
        def db_connect(dbapi_con, con_record):
            dbapi_con.execute("ATTACH DATABASE ':memory:' AS scheduling")

        UnitScheduleItem.__table__.create(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()

        # Insert Part 1660 at version 1
        item1 = UnitScheduleItem(
            order_id=189, order_number="17218ILP004", part_id=1660, part_number="TP-32",
            unit_index=1, operation_id=532, operation_number="10", machine_id=35,
            start_time=datetime(2026, 7, 29, 14, 36), end_time=datetime(2026, 7, 29, 17, 0),
            schedule_version=1, source="greedy"
        )
        # Insert Part 1666 at version 2 (and an old version 1)
        item2_old = UnitScheduleItem(
            order_id=189, order_number="17218ILP004", part_id=1666, part_number="BR-6205",
            unit_index=3, operation_id=521, operation_number="10", machine_id=35,
            start_time=datetime(2026, 7, 29, 9, 0), end_time=datetime(2026, 7, 29, 10, 0),
            schedule_version=1, source="greedy"
        )
        item2_new = UnitScheduleItem(
            order_id=189, order_number="17218ILP004", part_id=1666, part_number="BR-6205",
            unit_index=3, operation_id=521, operation_number="10", machine_id=35,
            start_time=datetime(2026, 7, 29, 10, 21), end_time=datetime(2026, 7, 29, 13, 21),
            schedule_version=2, source="greedy"
        )
        db.add_all([item1, item2_old, item2_new])
        db.commit()

        # Query machine 35
        results = list_unit_schedule(db, machine_id=35, latest_only=True)
        # Both TP-32 (v1) and BR-6205 (v2) should be returned, but NOT item2_old (v1)
        assert len(results) == 2
        part_ids = {r.part_id for r in results}
        assert part_ids == {1660, 1666}
        versions = {r.part_id: r.schedule_version for r in results}
        assert versions == {1660: 1, 1666: 2}

    def test_populate_other_parts_machine_free(self):
        from DB.models.scheduling import UnitScheduleItem
        from sqlalchemy import create_engine, event
        from sqlalchemy.orm import sessionmaker
        from unit_wise_scheduler import _populate_other_parts_machine_free

        engine = create_engine("sqlite:///:memory:")
        @event.listens_for(engine, "connect")
        def db_connect(dbapi_con, con_record):
            dbapi_con.execute("ATTACH DATABASE ':memory:' AS scheduling")

        UnitScheduleItem.__table__.create(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()

        # Part 1660 has an item ending at 17:00 on machine 35
        item1 = UnitScheduleItem(
            order_id=189, order_number="17218ILP004", part_id=1660, part_number="TP-32",
            unit_index=1, operation_id=532, operation_number="10", machine_id=35,
            start_time=datetime(2026, 7, 29, 14, 36), end_time=datetime(2026, 7, 29, 17, 0),
            schedule_version=1, source="greedy"
        )
        db.add(item1)
        db.commit()

        machine_free = {}
        # Rebuilding part 1666 (so scope_part_ids = {1666})
        _populate_other_parts_machine_free(db, machine_free, {1666})

        # Machine 35 should be occupied until 17:00 due to Part 1660
        assert 35 in machine_free
        assert machine_free[35] == datetime(2026, 7, 29, 17, 0)



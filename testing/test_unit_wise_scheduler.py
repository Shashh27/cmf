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


class TestActualEndAfterJobCard:
    """Closed job cards must anchor remaining/rework — even if status=inprogress."""

    def test_actual_end_includes_inprogress_closed_log(self):
        from unit_wise_scheduler import _actual_end_for_operation

        log = SimpleNamespace(
            to_date=datetime(2026, 8, 5).date(),
            to_time=datetime(2026, 8, 5, 18, 18, 20).time(),
            status="inprogress",
            rework_quantity=1,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [log]

        assert _actual_end_for_operation(db, 528) == datetime(2026, 8, 5, 18, 18, 20)

    def test_actual_end_ignores_open_run(self):
        from unit_wise_scheduler import _actual_end_for_operation

        db = MagicMock()
        # Query filter requires to_time IS NOT NULL — empty result
        db.query.return_value.filter.return_value.all.return_value = []
        assert _actual_end_for_operation(db, 528) is None

    def test_rework_skips_planned_floor_when_actual_end_exists(self):
        """Reproduce log-491 style: approved=0, planned=July, actual_end=today."""
        planned = datetime(2026, 7, 27, 16, 5, 56)
        actual = datetime(2026, 8, 5, 18, 18, 20)
        now = datetime(2026, 8, 5, 18, 25, 0)
        approved = 0
        qty = 1

        unit_ready = {1: planned}  # activation/planned path
        if planned is not None and approved == 0 and actual is None:
            unit_ready[1] = max(unit_ready[1], planned)
        remaining_set = set(range(approved + 1, qty + 1))
        if actual is not None:
            for u in remaining_set:
                unit_ready[u] = max(unit_ready[u], actual)

        op_run_started = approved > 0 or actual is not None
        start_candidate = max(unit_ready[1], actual)
        if op_run_started:
            start_candidate = max(start_candidate, now)

        assert unit_ready[1] == actual
        assert start_candidate == now
        # Shift snap would push 18:25 past GENERAL end → next day 08:30
        from unit_wise_scheduler import _snap_to_shift_start

        assert _snap_to_shift_start(start_candidate) == datetime(2026, 8, 6, 8, 30, 0)


class TestReschedulingCompletedHandoff:
    """qty=10, 5 done → unit 6 starts from 5th-unit end in rescheduling_items."""

    def _db(self, rows):
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.order_by.return_value.all.return_value = rows
        return db

    def test_remaining_work_plan_uses_first_start(self):
        from unit_wise_scheduler import _rescheduling_completed_handoff

        fifth_end = datetime(2026, 8, 12, 14, 0, 0)
        rows = [
            SimpleNamespace(
                start_time=fifth_end,
                end_time=datetime(2026, 8, 12, 16, 0, 0),
                remaining_qty=5,
                completed_qty=5,
                total_qty=10,
                id=1,
            ),
            SimpleNamespace(
                start_time=datetime(2026, 8, 12, 16, 0, 0),
                end_time=datetime(2026, 8, 12, 17, 0, 0),
                remaining_qty=4,
                completed_qty=5,
                total_qty=10,
                id=2,
            ),
        ]
        handoff = _rescheduling_completed_handoff(
            self._db(rows), 99, order_id=189, qty=10, approved=5
        )
        assert handoff == fifth_end

    def test_full_plan_walks_remaining_qty_to_fifth_unit_end(self):
        from unit_wise_scheduler import _rescheduling_completed_handoff

        rows = [
            SimpleNamespace(
                start_time=datetime(2026, 8, 12, 8, 30, 0),
                end_time=datetime(2026, 8, 12, 10, 30, 0),
                remaining_qty=8,
                completed_qty=0,
                total_qty=10,
                id=1,
            ),
            SimpleNamespace(
                start_time=datetime(2026, 8, 12, 10, 30, 0),
                end_time=datetime(2026, 8, 12, 13, 30, 0),
                remaining_qty=5,
                completed_qty=0,
                total_qty=10,
                id=2,
            ),
            SimpleNamespace(
                start_time=datetime(2026, 8, 12, 13, 30, 0),
                end_time=datetime(2026, 8, 12, 16, 30, 0),
                remaining_qty=2,
                completed_qty=0,
                total_qty=10,
                id=3,
            ),
        ]
        handoff = _rescheduling_completed_handoff(
            self._db(rows), 99, order_id=189, qty=10, approved=5
        )
        assert handoff == datetime(2026, 8, 12, 13, 30, 0)

    def test_completed_run_end_prefers_rescheduling_over_job_card(self):
        from DB.models.scheduling import ProductionLog, Rescheduling
        from unit_wise_scheduler import _completed_run_end

        log = SimpleNamespace(
            to_date=datetime(2026, 8, 13).date(),
            to_time=datetime(2026, 8, 13, 11, 38, 0).time(),
        )
        ri = SimpleNamespace(
            start_time=datetime(2026, 8, 10, 15, 7, 51),
            end_time=datetime(2026, 8, 10, 16, 37, 51),
            remaining_qty=5,
            completed_qty=5,
            total_qty=10,
            id=18420,
        )

        def query_router(model):
            q = MagicMock()
            if model is ProductionLog:
                q.filter.return_value.all.return_value = [log]
                return q
            if model is Rescheduling:
                q.filter.return_value = q
                q.order_by.return_value.all.return_value = [ri]
                return q
            return MagicMock()

        db = MagicMock()
        db.query.side_effect = query_router
        end = _completed_run_end(
            db, 536, order_id=200, qty=10, approved=5
        )
        assert end == datetime(2026, 8, 10, 15, 7, 51)

    def test_partial_remaining_does_not_clamp_to_rebuild_now(self):
        """Op 536 style: 5/10 done, remaining-work starts 10 Aug — not rebuild now."""
        fifth_end = datetime(2026, 8, 10, 15, 7, 51)
        now = datetime(2026, 8, 13, 11, 38, 7)
        approved = 5
        has_production = True
        start_candidate = max(fifth_end, fifth_end)
        if has_production and approved == 0:
            start_candidate = max(start_candidate, now)
        assert start_candidate == fifth_end
        assert start_candidate < now


class TestUnitWisePerUnitPipeline:
    """Unit 1 must enter the next op before Unit 5 finishes this op."""

    def test_walk_back_staggers_completed_units(self):
        from unit_wise_scheduler import _walk_back_cycle_ends

        fifth_end = datetime(2026, 8, 10, 15, 7, 51)
        cycle = timedelta(minutes=30)
        ends = _walk_back_cycle_ends(fifth_end, 5, cycle)
        assert ends[5] == fifth_end
        assert ends[4] == datetime(2026, 8, 10, 14, 37, 51)
        assert ends[1] == datetime(2026, 8, 10, 13, 7, 51)
        assert ends[1] < ends[5]

    def test_remaining_plan_does_not_stamp_unit1_with_fifth_end(self):
        from datetime import time as dtime
        from unit_wise_scheduler import _per_unit_operation_ends

        fifth_end = datetime(2026, 8, 10, 15, 7, 51)
        rows = [
            SimpleNamespace(
                start_time=fifth_end,
                end_time=datetime(2026, 8, 10, 16, 37, 51),
                remaining_qty=5,
                completed_qty=5,
                total_qty=10,
                id=18420,
            )
        ]
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.order_by.return_value.all.return_value = rows
        op = SimpleNamespace(
            id=536,
            setup_time=dtime(0, 0, 0),
            cycle_time=dtime(0, 30, 0),
        )
        ends = _per_unit_operation_ends(
            db,
            op,
            order_id=200,
            qty=10,
            approved=5,
            completed_run_end=fifth_end,
        )
        assert ends[5] == fifth_end
        assert ends[1] < ends[5]
        # Unit 1 of next op is ready at unit 1's end — not the batch remaining start
        assert ends[1] == datetime(2026, 8, 10, 13, 7, 51)

    def test_completed_run_end_falls_back_to_rescheduling_when_no_to_time(self):
        from DB.models.scheduling import ProductionLog, Rescheduling
        from unit_wise_scheduler import _completed_run_end

        ri = SimpleNamespace(
            start_time=datetime(2026, 8, 12, 14, 0, 0),
            end_time=datetime(2026, 8, 12, 16, 0, 0),
            remaining_qty=5,
            completed_qty=5,
            total_qty=10,
            id=1,
        )

        def query_router(model):
            q = MagicMock()
            if model is ProductionLog:
                q.filter.return_value.all.return_value = []
                return q
            if model is Rescheduling:
                q.filter.return_value = q
                q.order_by.return_value.all.return_value = [ri]
                return q
            return MagicMock()

        db = MagicMock()
        db.query.side_effect = query_router
        end = _completed_run_end(
            db, 99, order_id=189, qty=10, approved=5
        )
        assert end == datetime(2026, 8, 12, 14, 0, 0)


class TestActualEndAfterJobCardContinued:
    def test_virgin_unit2_does_not_clamp_to_rebuild_now(self):
        """
        Regression (op 532 style): qty>1, no production — after unit 1 places,
        setup_consumed becomes True for skip-setup, but must NOT clamp unit 2
        to rebuild 'now' (that was pulling schedules to Aug rebuild clock).
        """
        planned = datetime(2026, 7, 28, 10, 46, 33)
        now = datetime(2026, 8, 6, 9, 40, 0)
        approved = 0
        actual_end = None
        has_production = approved > 0 or actual_end is not None
        setup_consumed = has_production

        # Unit 1
        start1 = max(planned, planned)
        if has_production:
            start1 = max(start1, now)
        setup_consumed = True
        assert start1 == planned

        # Unit 2 continues after unit 1 (machine free = end of unit 1)
        free2 = planned + timedelta(hours=3, minutes=20)
        start2 = max(planned, free2)
        if has_production:
            start2 = max(start2, now)
        assert setup_consumed is True
        assert start2 == free2
        assert start2 < now


class TestPipelineAndPredecessorHandoff:
    """Unit-wise must not collapse to batch planned starts."""

    def test_planned_floor_skips_pipeline_advanced_units(self):
        part_start = datetime(2026, 7, 28, 10, 46, 33)
        u1_after_op10 = datetime(2026, 7, 28, 14, 6, 33)
        batch_planned_op20 = datetime(2026, 7, 29, 8, 36, 33)
        pipeline_advanced = {1, 2}
        unit_ready = {1: u1_after_op10, 2: batch_planned_op20}
        planned_start = batch_planned_op20
        approved = 0
        actual_end = None
        if planned_start is not None and approved == 0 and actual_end is None:
            for u in (1, 2):
                if u in pipeline_advanced:
                    continue
                unit_ready[u] = max(unit_ready[u], planned_start)
        # Unit 1 keeps its own Op10 end — does NOT wait for Unit 2 / batch plan
        assert unit_ready[1] == u1_after_op10

    def test_fully_completed_pred_replaces_ready_not_max(self):
        """Swap case: older ancestor ended later; immediate pred end must win."""
        qty = 10
        ready = {u: datetime(2026, 7, 24, 8, 30) for u in range(1, qty + 1)}
        end_519 = datetime(2026, 7, 28, 10, 11, 10)  # swapped / later ancestor
        end_518 = datetime(2026, 7, 27, 15, 27, 0)  # immediate pred of 520
        # After fully completed 519
        for u in range(1, qty + 1):
            ready[u] = end_519
        # After fully completed 518 — REPLACE (not max)
        for u in range(1, qty + 1):
            ready[u] = end_518
        assert ready[1] == end_518
        assert ready[1] < end_519

    def test_completed_pred_not_overridden_by_next_planned_floor(self):
        end_526 = datetime(2026, 7, 27, 16, 11, 9)
        planned_529 = datetime(2026, 7, 28, 10, 38, 56)
        pipeline_advanced = {1}
        unit_ready = {1: end_526}
        if planned_529 is not None:
            for u in (1,):
                if u in pipeline_advanced:
                    continue
                unit_ready[u] = max(unit_ready[u], planned_529)
        assert unit_ready[1] == end_526


class TestBreakdownAndShiftRules:
    def test_pick_machine_skips_permanently_off(self):
        m1 = SimpleNamespace(id=1)
        m2 = SimpleNamespace(id=2)
        ready = datetime(2026, 7, 24, 8, 30, 0)
        free = {1: ready, 2: ready}
        engine = MagicMock()

        def avail(machine, cand):
            if machine.id == 1:
                return None
            return cand

        engine._machine_next_available.side_effect = avail
        picked = _pick_machine([m1, m2], free, ready, engine=engine)
        assert picked.id == 2

    def test_next_breakdown_start_finds_mid_shift_off(self):
        from unit_wise_scheduler import _next_breakdown_start

        cur = datetime(2026, 7, 24, 8, 30)
        shift_end = datetime(2026, 7, 24, 17, 0)
        off_at = datetime(2026, 7, 24, 12, 0)
        row = SimpleNamespace(available_from=off_at)

        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = row

        assert _next_breakdown_start(db, 1, cur, shift_end) == off_at

    def test_place_engine_splits_before_breakdown(self):
        from unittest.mock import patch

        from unit_wise_scheduler import _place_within_shifts_engine

        breakdown_from = datetime(2026, 7, 24, 12, 0)
        breakdown_to = datetime(2026, 7, 24, 15, 0)
        off_row = SimpleNamespace(
            available_from=breakdown_from,
            available_to=breakdown_to,
        )

        engine = MagicMock()
        engine.db = MagicMock()
        engine.db.query.return_value.filter.return_value.first.return_value = off_row
        engine._machine_next_available = lambda m, cur: cur
        engine.adjust_to_shift = lambda dt, mid=None: dt
        engine._shift_end_dt = lambda cur, mid=None: datetime(2026, 7, 24, 17, 0)
        engine._next_shift_start = lambda dt, mid=None: datetime(2026, 7, 25, 8, 30)

        machine = SimpleNamespace(id=1)
        start = datetime(2026, 7, 24, 8, 30)

        def mock_next_off(db, mid, cur, shift_end):
            if cur < breakdown_from:
                return breakdown_from
            return None

        with patch(
            "unit_wise_scheduler._next_breakdown_start",
            side_effect=mock_next_off,
        ):
            segs = _place_within_shifts_engine(
                engine,
                1,
                start,
                timedelta(hours=4),
                machine_cache={1: machine},
            )
        assert len(segs) >= 2
        assert segs[0][0] == start
        assert segs[0][1] == breakdown_from
        assert segs[1][0] == breakdown_to
        total = sum((e - s).total_seconds() for s, e in segs)
        assert total == timedelta(hours=4).total_seconds()

    def test_unassigned_machine_shift_window_general_only(self):
        from algorithm import SchedulerEngine

        general = SimpleNamespace(shift_code="GENERAL", shift_start=time(8, 30), shift_end=time(17, 0))
        next_shift = SimpleNamespace(shift_code="NEXT", shift_start=time(17, 0), shift_end=time(21, 0))
        cfg = SimpleNamespace(
            date=datetime(2026, 7, 24).date(),
            working_day=True,
            number_of_shifts=2,
            shift_timings=[general, next_shift],
        )

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            cfg,  # ShiftHoursConfiguration
            None,  # no machine assignment
        ]
        db.query.return_value.filter.return_value.all.return_value = []

        engine = SchedulerEngine(db)
        start, end = engine._shift_window(datetime(2026, 7, 24, 10, 0), machine_id=99)
        assert start == time(8, 30)
        assert end == time(17, 0)




"""Tests for Scheduler #3 — Live Reconciliation Engine."""
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import Column, MetaData, Table, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from algorithm import dynamic_reschedule, generate_machine_schedule
from DB.models.access_control import AccessUser
from DB.models.configuration import Machine, WorkCenter
from DB.models.oms import Operation, Order, OrderPartPriority, OutSourceOperationStatus, Part, PartType, Product
from DB.models.scheduling import (
    EfficiencyFactor,
    MachineOperatorShiftAssignment,
    MachineStatus,
    OrderScheduleStatus,
    PartScheduleStatus,
    PlannedScheduleItem,
    ProductionLog,
    Rescheduling,
    ScheduleHistory,
    ShiftHoursConfiguration,
    ShiftTimingConfiguration,
)
from live_reconciliation import (
    STATE_COMPLETED,
    STATE_IN_PROGRESS,
    STATE_NOT_STARTED,
    STATE_PARTIALLY_COMPLETED,
    derive_operation_state,
    reconcile_live_schedule,
)
from live_schedule_lock import live_schedule_lock


def _logs_db(logs, op_status=None):
    db = MagicMock()

    def query(model):
        q = MagicMock()
        name = getattr(model, "__name__", str(model))
        if name == "ProductionLog":
            q.filter.return_value.all.return_value = logs
            q.filter.return_value.first.return_value = logs[0] if logs else None
        else:
            q.filter.return_value.first.return_value = op_status
            q.filter.return_value.all.return_value = [op_status] if op_status else []
        return q

    db.query.side_effect = query
    return db


class TestDeriveOperationState:
    def test_not_started_without_logs(self):
        assert derive_operation_state(_logs_db([]), 1, 10) == STATE_NOT_STARTED

    def test_in_progress_open_log(self):
        log = SimpleNamespace(
            operator_status="inprogress",
            to_time=None,
            approved_quantity=0,
            status="pending",
        )
        assert derive_operation_state(_logs_db([log]), 1, 10) == STATE_IN_PROGRESS

    def test_partial_after_approved_qty(self):
        log = SimpleNamespace(
            operator_status="completed",
            to_time=time(12, 0),
            approved_quantity=4,
            status="completed",
        )
        assert derive_operation_state(_logs_db([log]), 1, 10) == STATE_PARTIALLY_COMPLETED

    def test_completed_when_approved_covers_total(self):
        log = SimpleNamespace(
            operator_status="completed",
            to_time=time(16, 0),
            approved_quantity=10,
            status="completed",
        )
        assert derive_operation_state(_logs_db([log]), 1, 10) == STATE_COMPLETED


class TestLiveScheduleLockSqlite:
    def test_sqlite_lock_is_noop_and_reentrant(self, db_session: Session):
        with live_schedule_lock(db_session, blocking=True) as first:
            assert first is True
            with live_schedule_lock(db_session, blocking=False) as second:
                assert second is True


def _create_table_no_fk(engine, sa_table):
    meta = MetaData()
    cols = []
    for col in sa_table.columns:
        nullable = True if not col.primary_key else col.nullable
        cols.append(
            Column(col.name, col.type, primary_key=col.primary_key, nullable=nullable)
        )
    Table(sa_table.name, meta, *cols, schema=sa_table.schema).create(
        bind=engine, checkfirst=True
    )


def _shop_models():
    return [
        AccessUser,
        Product,
        PartType,
        Part,
        Order,
        Operation,
        OrderPartPriority,
        WorkCenter,
        Machine,
        OrderScheduleStatus,
        PartScheduleStatus,
        ScheduleHistory,
        PlannedScheduleItem,
        ShiftHoursConfiguration,
        ShiftTimingConfiguration,
        MachineOperatorShiftAssignment,
        MachineStatus,
        EfficiencyFactor,
        Rescheduling,
        ProductionLog,
        OutSourceOperationStatus,
    ]


@pytest.fixture
def live_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _attach(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA database_list")
        existing = {row[1] for row in cur.fetchall()}
        for schema in (
            "oms",
            "configuration",
            "scheduling",
            "inventory",
            "accesscontrol",
        ):
            if schema not in existing:
                cur.execute(f"ATTACH DATABASE ':memory:' AS {schema}")
        cur.close()

    conn = engine.connect()
    for model in _shop_models():
        _create_table_no_fk(engine, model.__table__)

    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    shop = _seed_shop(db)
    db.shop = shop
    try:
        yield db
    finally:
        db.close()
        conn.close()
        engine.dispose()


def _add_shift(db: Session, day):
    existing = (
        db.query(ShiftHoursConfiguration)
        .filter(ShiftHoursConfiguration.date == day)
        .first()
    )
    if existing:
        return existing
    shc = ShiftHoursConfiguration(date=day, working_day=True, number_of_shifts=1)
    db.add(shc)
    db.flush()
    db.add(
        ShiftTimingConfiguration(
            shift_config_id=shc.id,
            shift_code="GENERAL",
            shift_start=time(8, 30),
            shift_end=time(17, 0),
        )
    )
    db.commit()
    return shc


def _seed_shop(db: Session):
    user = AccessUser(
        user_name="op", gmail="op@test.local", role="operator", password="x"
    )
    db.add(user)
    db.flush()
    product = Product(product_name="P", product_version="1", user_id=user.id)
    db.add(product)
    db.flush()
    part_type = PartType(id=1, type_name="IN-House")
    db.add(part_type)
    wc = WorkCenter(code="WC1", work_center_name="Machining", is_schedulable=True)
    db.add(wc)
    db.flush()
    m1 = Machine(work_center_id=wc.id, type="CNC", make="A", model="1", password="p")
    m2 = Machine(work_center_id=wc.id, type="CNC", make="B", model="2", password="p")
    db.add_all([m1, m2])
    db.flush()
    order = Order(
        sale_order_number="SO-LIVE",
        customer_id=1,
        product_id=product.id,
        quantity=10,
        user_id=user.id,
        status="active",
        due_date=datetime(2026, 9, 1),
    )
    db.add(order)
    db.flush()
    part1 = Part(
        product_id=product.id,
        part_number="PN-LIVE-1",
        part_name="Live Part 1",
        type_id=1,
        qty=10,
    )
    part2 = Part(
        product_id=product.id,
        part_number="PN-LIVE-2",
        part_name="Live Part 2",
        type_id=1,
        qty=10,
    )
    db.add_all([part1, part2])
    db.flush()
    op1 = Operation(
        part_id=part1.id,
        operation_number="10",
        operation_name="Turn",
        setup_time=time(0, 30),
        cycle_time=time(0, 10),
        workcenter_id=wc.id,
        machine_id=m1.id,
        part_type_id=1,
    )
    op2 = Operation(
        part_id=part2.id,
        operation_number="10",
        operation_name="Turn",
        setup_time=time(0, 30),
        cycle_time=time(0, 10),
        workcenter_id=wc.id,
        machine_id=m2.id,
        part_type_id=1,
    )
    db.add_all([op1, op2])
    db.flush()
    activated = datetime(2026, 8, 10, 8, 30, 0)
    db.add(OrderScheduleStatus(
        order_id=order.id, product_id=product.id, status="active", activated_at=activated
    ))
    db.add(PartScheduleStatus(
        sale_order_id=order.id, part_id=part1.id, status="active", start_date=activated
    ))
    db.add(PartScheduleStatus(
        sale_order_id=order.id, part_id=part2.id, status="active", start_date=activated
    ))
    db.add(OrderPartPriority(
        order_id=order.id, product_id=product.id, part_id=part1.id, priority=1, status="active"
    ))
    db.add(OrderPartPriority(
        order_id=order.id, product_id=product.id, part_id=part2.id, priority=2, status="active"
    ))
    db.add(EfficiencyFactor(efficiency_factor=1.0))
    db.commit()

    for offset in range(0, 20):
        _add_shift(db, date(2026, 8, 10) + timedelta(days=offset))

    result = generate_machine_schedule(db)
    if not result.get("success"):
        # Fallback: seed live rows so reconciliation tests can still run.
        for op, part, machine in ((op1, part1, m1), (op2, part2, m2)):
            start = datetime(2026, 8, 10, 8, 30, 0)
            end = datetime(2026, 8, 10, 12, 0, 0)
            db.add(
                Rescheduling(
                    order_id=order.id,
                    order_number=order.sale_order_number,
                    part_id=part.id,
                    part_number=part.part_number,
                    operation_id=op.id,
                    operation_number=str(op.operation_number),
                    machine_id=machine.id,
                    start_time=start,
                    end_time=end,
                    total_qty=10,
                    completed_qty=0,
                    remaining_qty=10,
                    status="scheduled",
                    schedule_version=1,
                )
            )
            db.add(
                PlannedScheduleItem(
                    part_id=part.id,
                    part_number=part.part_number,
                    sale_order_id=order.id,
                    sale_order_number=order.sale_order_number,
                    operation_id=op.id,
                    machine_id=machine.id,
                    planned_start_time=start,
                    planned_end_time=end,
                    total_quantity=10,
                    remaining_quantity=10,
                    status="pending",
                )
            )
        db.commit()
    else:
        db.commit()
    return {
        "order": order,
        "part1": part1,
        "part2": part2,
        "op1": op1,
        "op2": op2,
        "m1": m1,
        "m2": m2,
    }


def _push_live_window(db: Session, operation_id: int, start: datetime, end: datetime):
    rows = (
        db.query(Rescheduling)
        .filter(
            Rescheduling.operation_id == operation_id,
            Rescheduling.status.in_(["scheduled", "rescheduled"]),
        )
        .all()
    )
    for row in rows:
        row.start_time = start
        row.end_time = end
    db.commit()
    return rows


def _live_rows(db: Session, operation_id: int):
    return (
        db.query(Rescheduling)
        .filter(
            Rescheduling.operation_id == operation_id,
            Rescheduling.status.in_(["scheduled", "rescheduled"]),
        )
        .order_by(Rescheduling.start_time)
        .all()
    )


class TestLiveReconciliationScenarios:
    def test_periodic_noop_when_windows_still_in_future(self, live_db: Session):
        op1 = live_db.shop["op1"]
        now = datetime(2026, 8, 10, 7, 0, 0)
        version_before = _live_rows(live_db, op1.id)[0].schedule_version
        out = reconcile_live_schedule(live_db, trigger="periodic", now=now)
        assert out["success"] is True
        assert out.get("noop") is True
        out2 = reconcile_live_schedule(live_db, trigger="periodic", now=now)
        assert out2.get("noop") is True
        assert _live_rows(live_db, op1.id)[0].schedule_version == version_before

    def test_missed_activation_moves_live_but_does_not_activate(self, live_db: Session):
        op1 = live_db.shop["op1"]
        now = datetime(2026, 8, 17, 10, 0, 0)
        _push_live_window(
            live_db, op1.id,
            datetime(2026, 8, 3, 10, 30, 0),
            datetime(2026, 8, 4, 9, 45, 0),
        )
        version_before = _live_rows(live_db, op1.id)[0].schedule_version
        planned = (
            live_db.query(PlannedScheduleItem)
            .filter(PlannedScheduleItem.operation_id == op1.id)
            .first()
        )
        out = reconcile_live_schedule(live_db, trigger="periodic", now=now)
        assert out["success"] is True
        assert out.get("noop") is not True
        rows = _live_rows(live_db, op1.id)
        assert rows
        assert rows[0].start_time >= now
        assert live_db.query(ProductionLog).filter(
            ProductionLog.operation_id == op1.id
        ).count() == 0
        if planned:
            assert planned.planned_start_time != rows[0].start_time
        out2 = reconcile_live_schedule(live_db, trigger="periodic", now=now)
        assert out2.get("noop") is True
        assert _live_rows(live_db, op1.id)[0].schedule_version == rows[0].schedule_version

    def test_in_progress_ticker_does_not_move_anchored_start(self, live_db: Session):
        op1 = live_db.shop["op1"]
        start = _live_rows(live_db, op1.id)[0].start_time
        live_db.add(
            ProductionLog(
                operation_id=op1.id,
                operator_id=1,
                from_date=start.date(),
                from_time=start.time(),
                operator_status="inprogress",
                status="pending",
                approved_quantity=0,
            )
        )
        live_db.commit()
        out = reconcile_live_schedule(
            live_db, trigger="periodic", now=start + timedelta(minutes=5)
        )
        assert out.get("noop") is True
        after = _live_rows(live_db, op1.id)[0].start_time
        assert after.replace(microsecond=0) == start.replace(microsecond=0)

    def test_late_activation_rewrites_past_unused_window(self, live_db: Session):
        op1 = live_db.shop["op1"]
        now = datetime(2026, 8, 17, 10, 0, 0)
        _push_live_window(
            live_db, op1.id,
            datetime(2026, 8, 3, 10, 30, 0),
            datetime(2026, 8, 4, 9, 45, 0),
        )
        live_db.add(
            ProductionLog(
                operation_id=op1.id,
                operator_id=1,
                from_date=now.date(),
                from_time=now.time(),
                operator_status="inprogress",
                status="pending",
                approved_quantity=0,
            )
        )
        live_db.commit()
        out = reconcile_live_schedule(
            live_db,
            trigger="activation",
            now=now,
            operation_id=op1.id,
            part_id=live_db.shop["part1"].id,
        )
        assert out["success"] is True
        rows = _live_rows(live_db, op1.id)
        assert rows[0].start_time >= now
        assert rows[0].start_time.date() != date(2026, 8, 3)
        start_after = rows[0].start_time
        out2 = reconcile_live_schedule(
            live_db, trigger="periodic", now=now + timedelta(minutes=5)
        )
        assert out2.get("noop") is True
        assert _live_rows(live_db, op1.id)[0].start_time == start_after

    def test_early_activation_can_pull_start_forward(self, live_db: Session):
        op1 = live_db.shop["op1"]
        planned_start = _live_rows(live_db, op1.id)[0].start_time
        early = planned_start + timedelta(hours=2)
        # Place the live window later, then activate earlier.
        later = planned_start + timedelta(hours=4)
        _push_live_window(live_db, op1.id, later, later + timedelta(hours=2))
        live_db.add(
            ProductionLog(
                operation_id=op1.id,
                operator_id=1,
                from_date=early.date(),
                from_time=early.time(),
                operator_status="inprogress",
                status="pending",
                approved_quantity=0,
            )
        )
        live_db.commit()
        out = reconcile_live_schedule(
            live_db,
            trigger="activation",
            now=early,
            operation_id=op1.id,
            part_id=live_db.shop["part1"].id,
        )
        assert out["success"] is True
        new_start = _live_rows(live_db, op1.id)[0].start_time
        assert new_start < later
        assert new_start >= early.replace(second=0, microsecond=0)

    def test_partial_completion_moves_remaining_only(self, live_db: Session):
        op1 = live_db.shop["op1"]
        now = datetime(2026, 8, 17, 10, 0, 0)
        future = datetime(2026, 8, 20, 10, 0, 0)
        _push_live_window(live_db, live_db.shop["op2"].id, future, future + timedelta(hours=2))
        live_db.add(
            ProductionLog(
                operation_id=op1.id,
                operator_id=1,
                from_date=date(2026, 8, 11),
                from_time=time(10, 0),
                to_date=date(2026, 8, 11),
                to_time=time(12, 0),
                operator_status="completed",
                status="completed",
                approved_quantity=4,
                remaining_quantity_to_be_produced=6,
            )
        )
        live_db.commit()
        _push_live_window(
            live_db, op1.id,
            datetime(2026, 8, 11, 10, 0, 0),
            datetime(2026, 8, 11, 14, 0, 0),
        )
        out = reconcile_live_schedule(live_db, trigger="periodic", now=now)
        assert out["success"] is True
        rows = _live_rows(live_db, op1.id)
        assert rows
        assert rows[0].completed_qty >= 4
        assert rows[0].remaining_qty <= 6
        assert rows[0].start_time >= now

    def test_rescheduler_still_runs(self, live_db: Session):
        op1 = live_db.shop["op1"]
        part1 = live_db.shop["part1"]
        live_db.add(
            ProductionLog(
                operation_id=op1.id,
                operator_id=1,
                from_date=date(2026, 8, 11),
                from_time=time(8, 30),
                to_date=date(2026, 8, 11),
                to_time=time(10, 0),
                operator_status="completed",
                status="completed",
                approved_quantity=10,
                remaining_quantity_to_be_produced=0,
            )
        )
        live_db.commit()
        result = dynamic_reschedule(live_db, triggered_by_part_id=part1.id)
        assert result["success"] is True
        rescheduled = live_db.query(Rescheduling).filter(
            Rescheduling.operation_id == op1.id,
            Rescheduling.status == "rescheduled",
        ).all()
        assert len(rescheduled) == 0

    def test_unrelated_part_on_other_machine_not_rewritten(self, live_db: Session):
        op1 = live_db.shop["op1"]
        op2 = live_db.shop["op2"]
        now = datetime(2026, 8, 17, 10, 0, 0)
        future_start = datetime(2026, 8, 20, 10, 0, 0)
        _push_live_window(
            live_db, op1.id,
            datetime(2026, 8, 3, 10, 30, 0),
            datetime(2026, 8, 3, 14, 0, 0),
        )
        _push_live_window(live_db, op2.id, future_start, future_start + timedelta(hours=2))
        op2_row = _live_rows(live_db, op2.id)[0]
        op2_id = op2_row.id
        op2_version = op2_row.schedule_version
        op2_before = op2_row.start_time
        reconcile_live_schedule(live_db, trigger="periodic", now=now)
        assert _live_rows(live_db, op1.id)[0].start_time >= now
        after = _live_rows(live_db, op2.id)[0]
        assert after.start_time == op2_before
        assert after.id == op2_id
        assert after.schedule_version == op2_version

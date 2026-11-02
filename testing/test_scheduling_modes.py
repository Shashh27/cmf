"""Dual operator schedule flags. Defaults on; 403 when a mode is off."""

import os
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from scheduling_modes import (
    batch_scheduling_enabled,
    chosen_engine,
    get_scheduling_modes,
    live_engine_for_part_logs,
    log_engine,
    part_started_engine_from_logs,
    require_activate_engine,
    require_batch_scheduling,
    require_shop_plan_editor,
    require_unit_wise_scheduling,
    set_shop_plan,
    shop_plan_switch_block,
    unit_range_from_log,
    unit_range_from_notes,
    unit_wise_scheduling_enabled,
)
from unit_wise_scheduler import unit_wise_enabled


def test_flags_default_true():
    with patch.dict("os.environ", {}, clear=False):
        os.environ.pop("ENABLE_BATCH_SCHEDULING", None)
        os.environ.pop("ENABLE_UNIT_WISE_SCHEDULING", None)
        os.environ.pop("UNIT_WISE_SCHEDULE_ENABLED", None)
        assert batch_scheduling_enabled() is True
        assert unit_wise_scheduling_enabled() is True
        assert get_scheduling_modes() == {
            "batch_scheduling": True,
            "unit_wise_scheduling": True,
        }


def test_batch_flag_false_raises_403():
    with patch.dict("os.environ", {"ENABLE_BATCH_SCHEDULING": "false"}):
        assert batch_scheduling_enabled() is False
        with pytest.raises(HTTPException) as exc:
            require_batch_scheduling()
        assert exc.value.status_code == 403
        assert "Batch" in str(exc.value.detail)


def test_unit_wise_flag_false_raises_403():
    with patch.dict("os.environ", {"ENABLE_UNIT_WISE_SCHEDULING": "false"}):
        assert unit_wise_scheduling_enabled() is False
        with pytest.raises(HTTPException) as exc:
            require_unit_wise_scheduling()
        assert exc.value.status_code == 403
        assert "Unit-wise" in str(exc.value.detail)


def test_legacy_unit_wise_alias_when_new_flag_absent():
    with patch.dict("os.environ", {}, clear=False):
        os.environ.pop("ENABLE_UNIT_WISE_SCHEDULING", None)
        with patch.dict("os.environ", {"UNIT_WISE_SCHEDULE_ENABLED": "false"}):
            assert unit_wise_enabled() is False
            assert unit_wise_scheduling_enabled() is False


def test_new_unit_wise_flag_overrides_legacy_alias():
    with patch.dict(
        "os.environ",
        {
            "ENABLE_UNIT_WISE_SCHEDULING": "true",
            "UNIT_WISE_SCHEDULE_ENABLED": "false",
        },
    ):
        assert unit_wise_enabled() is False
        assert unit_wise_scheduling_enabled() is True


def test_log_engine_from_unit_wise_notes():
    assert log_engine(SimpleNamespace(notes="unit-wise units 1-3")) == "unit_wise"
    assert log_engine(SimpleNamespace(notes="unit-wise units 4-6. operator note")) == "unit_wise"
    assert log_engine(SimpleNamespace(notes="ok")) == "batch"
    assert log_engine(SimpleNamespace(notes=None)) == "batch"


def test_log_engine_from_unit_columns_without_notes():
    assert log_engine(SimpleNamespace(notes=None, unit_from=2, unit_to=2)) == "unit_wise"
    assert log_engine(SimpleNamespace(notes="setup ok", unit_from=1, unit_to=3)) == "unit_wise"


def test_unit_range_from_notes():
    assert unit_range_from_notes("unit-wise units 2-2") == (2, 2)
    assert unit_range_from_notes("unit-wise units 1-3. operator note") == (1, 3)
    assert unit_range_from_notes("all completed") is None
    assert unit_range_from_notes(None) is None


def test_unit_range_from_log_prefers_columns():
    assert unit_range_from_log(SimpleNamespace(unit_from=2, unit_to=2, notes=None)) == (2, 2)
    assert unit_range_from_log(
        SimpleNamespace(unit_from=None, unit_to=None, notes="unit-wise units 4-6")
    ) == (4, 6)
    assert unit_range_from_log(SimpleNamespace(notes="ok")) is None


def test_part_started_inprogress_wins_over_completed():
    logs = [
        SimpleNamespace(
            operator_status="completed",
            notes="unit-wise units 1-3",
            created_at=1,
        ),
        SimpleNamespace(operator_status="inprogress", notes="", created_at=2),
    ]
    assert part_started_engine_from_logs(logs) == "batch"


def test_part_started_latest_completed_when_no_open():
    logs = [
        SimpleNamespace(operator_status="completed", notes="", created_at=1),
        SimpleNamespace(
            operator_status="completed",
            notes="unit-wise units 1-3",
            created_at=2,
        ),
    ]
    assert part_started_engine_from_logs(logs) == "unit_wise"


def test_part_started_empty():
    assert part_started_engine_from_logs([]) is None
    assert part_started_engine_from_logs(None) is None


def test_finished_logs_do_not_lock_when_no_remaining():
    logs = [SimpleNamespace(operator_status="completed", notes="", created_at=1)]
    assert live_engine_for_part_logs(logs, has_remaining=False) is None
    assert live_engine_for_part_logs(logs, has_remaining=True) == "batch"


def test_inprogress_locks_even_without_remaining():
    logs = [
        SimpleNamespace(
            operator_status="inprogress",
            notes="unit-wise units 1-3",
            created_at=1,
        )
    ]
    assert live_engine_for_part_logs(logs, has_remaining=False) == "unit_wise"


def test_remaining_unit_schedule_beats_leftover_batch_logs():
    logs = [SimpleNamespace(operator_status="completed", notes="", created_at=1)]
    assert live_engine_for_part_logs(logs, True, True) == "unit_wise"
    assert live_engine_for_part_logs([], True, True) == "unit_wise"


def test_inprogress_batch_wins_over_remaining_unit_schedule():
    logs = [SimpleNamespace(operator_status="inprogress", notes="", created_at=1)]
    assert live_engine_for_part_logs(logs, True, True) == "batch"


def test_batch_shop_ignores_leftover_unit_schedule():
    logs = [
        SimpleNamespace(
            operator_status="completed",
            notes="unit-wise units 1-3",
            created_at=1,
        )
    ]
    assert live_engine_for_part_logs(logs, True, True, shop_plan="batch") == "batch"
    assert live_engine_for_part_logs([], True, True, shop_plan="batch") is None


def test_inprogress_unit_card_still_locks_on_batch_shop():
    logs = [
        SimpleNamespace(
            operator_status="inprogress",
            notes="unit-wise units 1-3",
            created_at=1,
        )
    ]
    assert live_engine_for_part_logs(logs, True, True, shop_plan="batch") == "unit_wise"


def test_unit_wise_shop_still_prefers_remaining_unit_schedule():
    logs = [SimpleNamespace(operator_status="completed", notes="", created_at=1)]
    assert live_engine_for_part_logs(logs, True, True, shop_plan="unit_wise") == "unit_wise"


def test_no_remaining_does_not_lock_even_with_unit_schedule():
    logs = [SimpleNamespace(operator_status="completed", notes="", created_at=1)]
    assert live_engine_for_part_logs(logs, False, True) is None


@patch("scheduling_modes._in_progress_on_machine", return_value=None)
@patch("scheduling_modes._in_progress_on_operation", return_value=None)
@patch("scheduling_modes._part_id_for_operation", return_value=1662)
@patch("scheduling_modes.part_started_engine", return_value="unit_wise")
def test_require_activate_batch_403s_on_other_machine(
    _started, _part, _open_op, _open_machine
):
    with pytest.raises(HTTPException) as exc:
        require_activate_engine(
            MagicMock(), "batch", operation_id=520, machine_id=26
        )
    assert exc.value.status_code == 403
    assert "unit-wise" in str(exc.value.detail)


@patch("scheduling_modes.get_shop_plan", return_value="unit_wise")
@patch("scheduling_modes._in_progress_on_machine", return_value=None)
@patch("scheduling_modes._in_progress_on_operation", return_value=None)
@patch("scheduling_modes._part_id_for_operation", return_value=1662)
@patch("scheduling_modes.part_started_engine", return_value="unit_wise")
def test_require_activate_unit_wise_allowed_when_live_unit_wise(
    _started, _part, _open_op, _open_machine, _plan
):
    require_activate_engine(
        MagicMock(), "unit_wise", operation_id=520, machine_id=22
    )


def test_shop_plan_batch_locks_unit_wise_cards():
    db = MagicMock()
    with patch("scheduling_modes.get_shop_plan", return_value="batch"):
        modes = get_scheduling_modes(db)
        assert modes["shop_plan"] == "batch"
        assert modes["batch_scheduling"] is True
        assert modes["unit_wise_scheduling"] is False
        with pytest.raises(HTTPException) as exc:
            require_unit_wise_scheduling(db)
    assert exc.value.status_code == 403
    assert "batch" in str(exc.value.detail).lower()


def test_shop_plan_unit_wise_locks_batch_cards():
    db = MagicMock()
    with patch("scheduling_modes.get_shop_plan", return_value="unit_wise"):
        modes = get_scheduling_modes(db)
        assert modes["batch_scheduling"] is False
        assert modes["unit_wise_scheduling"] is True
        with pytest.raises(HTTPException) as exc:
            require_batch_scheduling(db)
    assert exc.value.status_code == 403


def test_shop_switch_uses_log_status_not_operator_status():
    open_batch = SimpleNamespace(
        id=9,
        status="inprogress",
        operator_status="completed",
        unit_from=None,
        unit_to=None,
        notes=None,
    )
    submitted_only = SimpleNamespace(
        id=10,
        status="completed",
        operator_status="inprogress",
        unit_from=None,
        unit_to=None,
        notes=None,
    )
    db = MagicMock()
    with patch("scheduling_modes.get_shop_plan", return_value="batch"):
        db.query.return_value.filter.return_value.all.return_value = [open_batch]
        reason = shop_plan_switch_block(db, "unit_wise")
        assert reason is not None
        assert "batch" in reason.lower()
        assert "in progress" in reason.lower()

        db.query.return_value.filter.return_value.all.return_value = [submitted_only]
        assert shop_plan_switch_block(db, "unit_wise") is None


def test_switch_shop_plan_409_when_current_engine_is_open():
    db = MagicMock()
    with (
        patch("scheduling_modes.get_shop_plan", return_value="batch"),
        patch("scheduling_modes._open_in_progress_on_engine", return_value=SimpleNamespace(id=1)),
    ):
        with pytest.raises(HTTPException) as exc:
            set_shop_plan(db, "unit_wise")
    assert exc.value.status_code == 409
    db.commit.assert_not_called()


def test_batch_shop_does_not_block_planned_update_for_leftover_unit_history():
    from scheduling_modes import pps_batch_update_block

    blocked, message = pps_batch_update_block("batch")
    assert blocked is False
    assert message is None


def test_unit_wise_shop_blocks_batch_update():
    from scheduling_modes import pps_batch_update_block

    blocked, message = pps_batch_update_block("unit_wise")
    assert blocked is True
    assert "Unit Scheduling" in message


def test_chosen_engine_follows_shop_plan():
    assert chosen_engine("batch") == "batch"
    assert chosen_engine("unit_wise") == "unit_wise"
    assert chosen_engine(None) == "batch"


def _editor_db(user):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user
    return db


def test_supervisor_cannot_update_shop_plan():
    db = _editor_db(SimpleNamespace(id=9, role="supervisor"))
    with pytest.raises(HTTPException) as exc:
        require_shop_plan_editor(db, 9)
    assert exc.value.status_code == 403
    assert "manufacturing_coordinator" in str(exc.value.detail)


def test_admin_and_manufacturing_coordinator_can_update_shop_plan():
    admin = SimpleNamespace(id=1, role="admin")
    coordinator = SimpleNamespace(id=2, role="manufacturing_coordinator")
    assert require_shop_plan_editor(_editor_db(admin), 1) is admin
    assert require_shop_plan_editor(_editor_db(coordinator), 2) is coordinator


def _review_db():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(part_id=1652)
    return db


@patch("routers.production_logs.mark_part_completed_if_all_operations_approved")
@patch("unit_wise_scheduler.rebuild_unit_schedule")
@patch("algorithm.dynamic_reschedule")
@patch("scheduling_modes.get_shop_plan", return_value="batch")
@patch("routers.production_logs.SessionLocal")
def test_batch_review_does_not_rebuild_unit_schedule(
    session_local, _plan, dynamic, rebuild, _close
):
    session_local.return_value = _review_db()
    from routers.production_logs import _reschedule_after_production_review

    _reschedule_after_production_review(1, 530)
    dynamic.assert_called_once()
    rebuild.assert_not_called()


@patch("routers.production_logs.mark_part_completed_if_all_operations_approved")
@patch("unit_wise_scheduler.unit_wise_enabled", return_value=True)
@patch("unit_wise_scheduler.rebuild_unit_schedule", return_value={"rows_inserted": 1, "schedule_version": 2})
@patch("algorithm.dynamic_reschedule")
@patch("scheduling_modes.get_shop_plan", return_value="unit_wise")
@patch("routers.production_logs.SessionLocal")
def test_unit_wise_review_still_rebuilds_unit_schedule(
    session_local, _plan, _dynamic, rebuild, _enabled, _close
):
    session_local.return_value = _review_db()
    from routers.production_logs import _reschedule_after_production_review

    _reschedule_after_production_review(1, 530)
    rebuild.assert_called_once()


def test_pps_planned_times_fall_back_to_rescheduling_not_logs():
    from routers import machine_scheduling as ms

    op = SimpleNamespace(
        id=530,
        operation_number="30",
        operation_name="DIESINKING",
        machine_id=14,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [op]
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    db.query.return_value.filter.return_value.first.return_value = None
    live_start = datetime(2026, 10, 30, 8, 30)
    live_end = datetime(2026, 10, 30, 17, 0)
    logged = datetime(2026, 10, 29, 13, 53)
    logged_end = datetime(2026, 10, 29, 13, 56)
    with (
        patch.object(ms, "_get_baseline_planned_times_for_part", return_value={}),
        patch.object(
            ms,
            "_get_live_schedule_times_for_part",
            return_value={
                530: {
                    "current_start_time": live_start,
                    "current_end_time": live_end,
                    "machine_id": 14,
                }
            },
        ),
        patch.object(ms, "_get_operation_actual_times", return_value=(logged, logged_end)),
        patch.object(ms, "_machine_display_name", return_value="ACE"),
    ):
        rows = ms._build_part_operations_for_pps(db, 113, 1652)
    assert rows[0]["planned_start_time"] == live_start
    assert rows[0]["planned_end_time"] == live_end
    assert rows[0]["actual_start_time"] == logged
    assert rows[0]["actual_end_time"] == logged_end


def test_pps_planned_schedule_items_win_over_rescheduling():
    from routers import machine_scheduling as ms

    op = SimpleNamespace(
        id=25,
        operation_number="10",
        operation_name="Rough Turning",
        machine_id=25,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [op]
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    db.query.return_value.filter.return_value.first.return_value = None
    planned_start = datetime(2026, 7, 27, 16, 11)
    planned_end = datetime(2026, 7, 27, 18, 0)
    live_start = datetime(2026, 10, 30, 8, 30)
    live_end = datetime(2026, 10, 30, 17, 0)
    with (
        patch.object(
            ms,
            "_get_baseline_planned_times_for_part",
            return_value={
                25: {
                    "planned_start_time": planned_start,
                    "planned_end_time": planned_end,
                }
            },
        ),
        patch.object(
            ms,
            "_get_live_schedule_times_for_part",
            return_value={
                25: {
                    "current_start_time": live_start,
                    "current_end_time": live_end,
                    "machine_id": 25,
                }
            },
        ),
        patch.object(ms, "_get_operation_actual_times", return_value=(None, None)),
        patch.object(ms, "_machine_display_name", return_value="Tekcel"),
    ):
        rows = ms._build_part_operations_for_pps(db, 32, 26)
    assert rows[0]["planned_start_time"] == planned_start
    assert rows[0]["planned_end_time"] == planned_end


def test_unit_wise_details_do_not_copy_log_times_into_planned():
    from intelligent_scheduler.service import get_unit_wise_part_operation_details

    logged = datetime(2026, 10, 29, 13, 53)
    logged_end = datetime(2026, 10, 29, 13, 56)
    order = SimpleNamespace(id=113, product_id=1)
    part = SimpleNamespace(id=1652, product_id=1, qty=1)
    op = SimpleNamespace(id=530, operation_number="30", operation_name="DIESINKING")
    log = SimpleNamespace(
        operation_id=530,
        machine_id=14,
        operator_status="completed",
        produced_quantity=1,
        from_date=logged.date(),
        from_time=logged.time(),
        to_date=logged_end.date(),
        to_time=logged_end.time(),
        unit_from=None,
        unit_to=None,
        status="completed",
    )
    machine = SimpleNamespace(id=14, make="ACE", model="MICROMATIC")

    def query(model):
        name = getattr(model, "__name__", "")
        chain = MagicMock()
        if name == "Order":
            chain.filter.return_value.first.return_value = order
        elif name == "Part":
            chain.filter.return_value.first.return_value = part
        elif name == "Operation":
            chain.filter.return_value.order_by.return_value.all.return_value = [op]
        elif name == "ProductionLog":
            chain.filter.return_value.order_by.return_value.all.return_value = [log]
        elif name == "Machine":
            chain.filter.return_value.all.return_value = [machine]
        else:
            chain.filter.return_value.all.return_value = []
        return chain

    db = MagicMock()
    db.query.side_effect = query
    with patch(
        "intelligent_scheduler.service._latest_unit_schedule_rows",
        return_value=[],
    ), patch(
        "intelligent_scheduler.service._baseline_planned_by_operation",
        return_value={},
    ):
        payload = get_unit_wise_part_operation_details(db, 113, 1652)
    assert payload["operations"]
    assert payload["operations"][0]["planned_start_time"] is None
    assert payload["operations"][0]["planned_end_time"] is None
    assert payload["operations"][0]["actual_start_time"] == logged
    assert payload["planned_start_time"] is None

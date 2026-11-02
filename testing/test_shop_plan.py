"""Shop-wide plan: only the chosen engine is queued, and capacity follows it."""

from datetime import datetime
from unittest.mock import MagicMock, patch


def test_batch_shop_queues_dynamic_reschedule_only():
    with patch("routers.machine_scheduling.Thread") as thread:
        from routers.machine_scheduling import queue_chosen_schedule

        assert queue_chosen_schedule(part_id=1662, shop_plan="batch") == "batch"
    target = thread.call_args.kwargs["target"]
    assert target.__name__ == "_run_dynamic_reschedule_job"
    assert thread.call_args.kwargs["args"][0] == 1662


def test_unit_wise_shop_queues_unit_rebuild_only():
    with patch("routers.machine_scheduling.Thread") as thread:
        from routers.machine_scheduling import queue_chosen_schedule

        assert queue_chosen_schedule(part_id=1662, order_id=189, shop_plan="unit_wise") == "unit_wise"
    target = thread.call_args.kwargs["target"]
    assert target.__name__ == "_run_unit_wise_rebuild_job"
    assert thread.call_args.kwargs["args"] == (1662, 189)


def test_capacity_unit_wise_shop_reads_unit_schedule():
    from routers.capacity_planning import _load_utilized_hours_by_machine

    with (
        patch("routers.capacity_planning.get_shop_plan", return_value="unit_wise"),
        patch(
            "routers.capacity_planning._unit_wise_utilized_hours",
            return_value={22: 2.5},
        ) as unit_hours,
    ):
        hours, source = _load_utilized_hours_by_machine(
            MagicMock(),
            datetime(2026, 10, 1),
            datetime(2026, 10, 31),
        )
    assert source == "unit_wise"
    assert hours == {22: 2.5}
    unit_hours.assert_called_once()


def test_capacity_batch_shop_does_not_read_unit_schedule():
    from routers.capacity_planning import _load_utilized_hours_by_machine

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    with (
        patch("routers.capacity_planning.get_shop_plan", return_value="batch"),
        patch(
            "routers.capacity_planning._planned_utilized_hours",
            return_value={7: 1.0},
        ) as planned,
        patch("routers.capacity_planning._unit_wise_utilized_hours") as unit_hours,
    ):
        hours, source = _load_utilized_hours_by_machine(
            db,
            datetime(2026, 10, 1),
            datetime(2026, 10, 31),
        )
    assert source == "planned"
    assert hours == {7: 1.0}
    unit_hours.assert_not_called()
    planned.assert_called_once()

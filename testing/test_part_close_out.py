"""Part close-out after the last schedulable operation is fully approved."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from DB.models.oms import Operation, Part
from production_log_helpers import (
    all_schedulable_operations_fully_approved,
    mark_part_completed_if_all_operations_approved,
)


def _db_with_part(part, ops):
    def query(model):
        q = MagicMock()
        if model is Part:
            q.filter.return_value.first.return_value = part
            return q
        if model is Operation:
            q.filter.return_value.all.return_value = ops
            return q
        return q

    db = MagicMock()
    db.query.side_effect = query
    return db


class TestAllSchedulableOperationsFullyApproved:
    def test_true_when_every_schedulable_op_is_fully_approved(self):
        part = SimpleNamespace(id=1662, qty=10)
        ops = [
            SimpleNamespace(id=518),
            SimpleNamespace(id=519),
            SimpleNamespace(id=520),
        ]
        db = _db_with_part(part, ops)
        with (
            patch(
                "production_log_helpers.is_schedulable_operation",
                return_value=True,
            ),
            patch(
                "production_log_helpers.total_approved_for_operation",
                return_value=10,
            ),
        ):
            assert all_schedulable_operations_fully_approved(db, 1662) is True

    def test_false_when_one_op_still_has_remaining(self):
        part = SimpleNamespace(id=1662, qty=10)
        ops = [SimpleNamespace(id=518), SimpleNamespace(id=520)]
        db = _db_with_part(part, ops)

        def approved(_db, operation_id):
            return 10 if operation_id == 518 else 9

        with (
            patch(
                "production_log_helpers.is_schedulable_operation",
                return_value=True,
            ),
            patch(
                "production_log_helpers.total_approved_for_operation",
                side_effect=approved,
            ),
        ):
            assert all_schedulable_operations_fully_approved(db, 1662) is False

    def test_skips_non_schedulable_operations(self):
        part = SimpleNamespace(id=1662, qty=10)
        ops = [SimpleNamespace(id=518), SimpleNamespace(id=999)]
        db = _db_with_part(part, ops)

        def schedulable(_db, op):
            return op.id != 999

        with (
            patch(
                "production_log_helpers.is_schedulable_operation",
                side_effect=schedulable,
            ),
            patch(
                "production_log_helpers.total_approved_for_operation",
                return_value=10,
            ),
        ):
            assert all_schedulable_operations_fully_approved(db, 1662) is True


class TestMarkPartCompletedIfAllOperationsApproved:
    def test_noop_when_remaining_work_exists(self):
        db = MagicMock()
        with patch(
            "production_log_helpers.all_schedulable_operations_fully_approved",
            return_value=False,
        ) as check:
            assert mark_part_completed_if_all_operations_approved(db, 1662) is False
            check.assert_called_once_with(db, 1662)
            db.commit.assert_not_called()

    def test_closes_active_priority_and_part_schedule_status(self):
        from DB.models.oms import OrderPartPriority
        from DB.models.scheduling import PartScheduleStatus

        priority = SimpleNamespace(
            part_id=1662, order_id=189, status="active", priority=3
        )
        other = SimpleNamespace(
            part_id=1630, order_id=189, status="active", priority=4
        )
        pps = SimpleNamespace(
            sale_order_id=189,
            part_id=1662,
            status="active",
            start_date="keep-me",
            updated_at=None,
        )

        def query(model):
            q = MagicMock()
            if model is OrderPartPriority:
                q.filter.return_value.all.return_value = [priority]
                q.filter.return_value.order_by.return_value.all.return_value = [other]
                return q
            if model is PartScheduleStatus:
                q.filter.return_value.filter.return_value.all.return_value = [pps]
                q.filter.return_value.all.return_value = [pps]
                return q
            return q

        db = MagicMock()
        db.query.side_effect = query
        with patch(
            "production_log_helpers.all_schedulable_operations_fully_approved",
            return_value=True,
        ):
            assert mark_part_completed_if_all_operations_approved(db, 1662) is True

        assert priority.status == "completed"
        assert priority.priority == 0
        assert other.priority == 1
        assert pps.status == "completed"
        assert pps.start_date is None
        db.commit.assert_called_once()

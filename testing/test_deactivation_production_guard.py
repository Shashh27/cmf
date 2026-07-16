"""Unit tests for deactivation guard helpers."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from routers.machine_scheduling import (
    _get_part_production_blockers,
    _is_part_fully_completed_by_logs,
    _operation_production_is_complete,
    _part_is_schedule_completed,
    _production_logs_indicate_in_progress,
)


def _log(**kwargs):
    defaults = {
        "operator_status": "inprogress",
        "status": "pending",
        "to_time": None,
        "remaining_quantity_to_be_produced": None,
        "id": 1,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestProductionLogsIndicateInProgress:
    def test_operator_actively_working(self):
        logs = [_log(operator_status="inprogress", to_time=None)]
        assert _production_logs_indicate_in_progress(logs) is True

    def test_awaiting_supervisor(self):
        logs = [_log(operator_status="completed", status="pending", to_time="17:00:00")]
        assert _production_logs_indicate_in_progress(logs) is True

    def test_rework_or_rejected_status(self):
        logs = [_log(operator_status="completed", status="rework", to_time="17:00:00")]
        assert _production_logs_indicate_in_progress(logs) is True
        logs = [_log(operator_status="completed", status="rejected", to_time="17:00:00")]
        assert _production_logs_indicate_in_progress(logs) is True

    def test_fully_approved_not_in_progress(self):
        logs = [_log(operator_status="completed", status="completed", to_time="17:00:00")]
        assert _production_logs_indicate_in_progress(logs) is False

    def test_empty_logs(self):
        assert _production_logs_indicate_in_progress([]) is False


class TestOperationProductionIsComplete:
    def test_completed_with_zero_remaining(self):
        logs = [
            _log(
                id=1,
                status="completed",
                remaining_quantity_to_be_produced=0,
                operator_status="completed",
            )
        ]
        assert _operation_production_is_complete(logs) is True

    def test_incomplete_remaining_qty(self):
        logs = [
            _log(
                id=1,
                status="completed",
                remaining_quantity_to_be_produced=5,
                operator_status="completed",
            )
        ]
        assert _operation_production_is_complete(logs) is False

    def test_older_completed_zero_but_latest_incomplete(self):
        logs = [
            _log(
                id=1,
                status="completed",
                remaining_quantity_to_be_produced=0,
                operator_status="completed",
            ),
            _log(
                id=2,
                status="inprogress",
                remaining_quantity_to_be_produced=5,
                operator_status="completed",
            ),
        ]
        assert _operation_production_is_complete(logs) is False

    def test_no_logs(self):
        assert _operation_production_is_complete([]) is False


class TestPartIsScheduleCompleted:
    def test_completed_schedule_status(self, monkeypatch):
        db = MagicMock()
        schedule_record = SimpleNamespace(status="completed")
        db.query.return_value.filter.return_value.first.side_effect = [
            schedule_record,
        ]
        monkeypatch.setattr(
            "production_log_helpers.part_has_production_log_history",
            lambda _db, _part_id: True,
        )
        assert _part_is_schedule_completed(db, sale_order_id=32, part_id=34) is True

    def test_completed_priority_row(self, monkeypatch):
        db = MagicMock()
        schedule_record = SimpleNamespace(status="inactive")
        priority_row = SimpleNamespace(status="completed")
        db.query.return_value.filter.return_value.first.side_effect = [
            schedule_record,
            priority_row,
        ]
        monkeypatch.setattr(
            "production_log_helpers.part_has_production_log_history",
            lambda _db, _part_id: True,
        )
        assert _part_is_schedule_completed(db, sale_order_id=32, part_id=34) is True

    def test_active_part_not_completed(self):
        db = MagicMock()
        schedule_record = SimpleNamespace(status="active")
        priority_row = SimpleNamespace(status="active")
        db.query.return_value.filter.return_value.first.side_effect = [
            schedule_record,
            priority_row,
        ]
        db.query.return_value.filter.return_value.all.return_value = []
        assert _part_is_schedule_completed(db, sale_order_id=32, part_id=34) is False

    def test_completed_flags_ignored_when_logs_cleared(self, monkeypatch):
        db = MagicMock()
        schedule_record = SimpleNamespace(status="completed")
        priority_row = SimpleNamespace(status="completed")
        db.query.return_value.filter.return_value.first.side_effect = [
            schedule_record,
            priority_row,
        ]
        monkeypatch.setattr(
            "production_log_helpers.part_has_production_log_history",
            lambda _db, _part_id: False,
        )
        assert _part_is_schedule_completed(db, sale_order_id=32, part_id=1515) is False


class TestIsPartFullyCompletedByLogs:
    def test_all_ops_completed(self, monkeypatch):
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [(59,)]
        db.execute.return_value.scalar.return_value = 1
        assert _is_part_fully_completed_by_logs(db, part_id=34) is True

    def test_no_operations(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        assert _is_part_fully_completed_by_logs(db, part_id=34) is False


class TestGetPartProductionBlockers:
    def _blockers_for_single_op(self, logs, op_status=None):
        from DB.models.oms import Operation
        from DB.models.scheduling import OperationStatus, ProductionLog

        op = SimpleNamespace(
            id=59,
            operation_number=10,
            operation_name="Milling",
            part_id=1647,
        )

        op_query = MagicMock()
        op_query.filter.return_value.order_by.return_value.all.return_value = [op]

        pl_query = MagicMock()
        pl_query.filter.return_value.order_by.return_value.all.return_value = logs

        os_query = MagicMock()
        os_query.filter.return_value.first.return_value = op_status

        def query_router(model):
            if model is Operation:
                return op_query
            if model is ProductionLog:
                return pl_query
            if model is OperationStatus:
                return os_query
            return MagicMock()

        db = MagicMock()
        db.query.side_effect = query_router
        return _get_part_production_blockers(db, part_id=1647)

    def test_blocks_when_stale_completed_log_masks_open_work(self):
        logs = [
            _log(
                id=1,
                status="completed",
                remaining_quantity_to_be_produced=0,
                operator_status="completed",
            ),
            _log(
                id=2,
                status="completed",
                remaining_quantity_to_be_produced=18,
                operator_status="completed",
            ),
        ]
        blockers = self._blockers_for_single_op(logs)
        assert len(blockers) == 1
        assert "Production incomplete" in blockers[0]["block_reason"] or "incomplete" in blockers[0]["production_stage"]

    def test_blocks_between_operator_cycles(self):
        logs = [
            _log(
                id=3,
                status="inprogress",
                remaining_quantity_to_be_produced=12,
                operator_status="completed",
                to_time="17:00:00",
            ),
        ]
        blockers = self._blockers_for_single_op(logs)
        assert len(blockers) == 1

    def test_blocks_when_only_first_of_three_ops_complete(self, monkeypatch):
        """Part 1646 scenario: op1 done, op2/op3 not started — must block."""
        from DB.models.oms import Operation
        from DB.models.scheduling import OperationStatus, ProductionLog

        ops = [
            SimpleNamespace(
                id=101, operation_number=10, operation_name="Op1", part_id=1646
            ),
            SimpleNamespace(
                id=102, operation_number=20, operation_name="Op2", part_id=1646
            ),
            SimpleNamespace(
                id=103, operation_number=30, operation_name="Op3", part_id=1646
            ),
        ]
        op1_logs = [
            _log(
                id=1,
                status="completed",
                remaining_quantity_to_be_produced=0,
                operator_status="completed",
            ),
        ]
        logs_by_op = {101: op1_logs, 102: [], 103: []}

        op_query = MagicMock()
        op_query.filter.return_value.order_by.return_value.all.return_value = ops

        call_index = {"n": 0}

        def query_router(model):
            mock_q = MagicMock()
            if model is Operation:
                return op_query
            if model is ProductionLog:
                op = ops[call_index["n"]]
                call_index["n"] += 1
                mock_q.filter.return_value.order_by.return_value.all.return_value = (
                    logs_by_op.get(op.id, [])
                )
                return mock_q
            if model is OperationStatus:
                mock_q.filter.return_value.first.return_value = None
                return mock_q
            return MagicMock()

        db = MagicMock()
        db.query.side_effect = query_router
        monkeypatch.setattr(
            "production_log_helpers.part_has_production_log_history",
            lambda _db, _part_id: True,
        )

        blockers = _get_part_production_blockers(db, part_id=1646)
        assert len(blockers) == 2
        assert all(not b["operation_started"] for b in blockers)
        assert all(b["production_stage"] == "not_started" for b in blockers)
        assert all("Not started" in b["block_reason"] for b in blockers)

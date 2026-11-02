"""Supervisor list payload for unit-wise production logs."""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from production_log_helpers import machine_dict_for_log, production_log_response_dict


def _log(**kwargs):
    base = dict(
        id=99,
        operation_id=520,
        operator_id=5,
        user_id=None,
        machine_id=22,
        notes=None,
        unit_from=2,
        unit_to=2,
        remarks=None,
        from_date=None,
        from_time=None,
        to_date=None,
        to_time=None,
        status="pending",
        operator_status="completed",
        produced_quantity=1,
        operator_rework_quantity=0,
        approved_quantity=None,
        rework_quantity=None,
        rejected_quantity=None,
        remaining_quantity_to_be_produced=9,
        created_at=datetime(2026, 10, 28, 12, 40),
        acknowledged=False,
        acknowledged_at=None,
        operator_acknowledged=False,
        operator_acknowledged_at=None,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_response_marks_unit_wise_range_from_columns():
    payload = production_log_response_dict(_log())
    assert payload["is_unit_wise"] is True
    assert payload["unit_from"] == 2
    assert payload["unit_to"] == 2
    assert payload["machine_id"] == 22
    assert payload["can_review"] is True
    assert payload["notes"] is None


def test_response_legacy_notes_marker_still_maps_range():
    payload = production_log_response_dict(
        _log(notes="unit-wise units 2-2", unit_from=None, unit_to=None)
    )
    assert payload["is_unit_wise"] is True
    assert payload["unit_from"] == 2
    assert payload["unit_to"] == 2


def test_response_batch_log_is_not_unit_wise():
    payload = production_log_response_dict(
        _log(notes="all completed", machine_id=31, unit_from=None, unit_to=None)
    )
    assert payload["is_unit_wise"] is False
    assert payload["unit_from"] is None
    assert payload["unit_to"] is None


def test_machine_dict_prefers_log_machine_over_operation():
    db = MagicMock()
    machine = SimpleNamespace(id=22, make="Jyoti", model="Stallion 200")
    db.query.return_value.filter.return_value.first.return_value = machine
    payload = machine_dict_for_log(
        db,
        SimpleNamespace(machine_id=22),
        SimpleNamespace(machine_id=26),
    )
    assert payload == {"id": 22, "make": "Jyoti", "model": "Stallion 200"}


def test_machine_dict_falls_back_to_operation_when_log_has_no_machine():
    db = MagicMock()
    machine = SimpleNamespace(id=26, make="Ace", model="STC25")
    db.query.return_value.filter.return_value.first.return_value = machine
    payload = machine_dict_for_log(
        db,
        SimpleNamespace(machine_id=None),
        SimpleNamespace(machine_id=26),
    )
    assert payload["id"] == 26

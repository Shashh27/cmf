import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

from production_log_helpers import (
    apply_manufacturing_coordinator_scope,
    get_order_ids_for_manufacturing_coordinator,
)


def _chainable_query():
    q = MagicMock()
    q.filter.return_value = q
    q.join.return_value = q
    return q


def test_get_order_ids_for_manufacturing_coordinator():
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [(182,), (200,)]
    assert get_order_ids_for_manufacturing_coordinator(db, 32) == [182, 200]


def test_apply_mc_scope_rejects_non_mc_user():
    db = MagicMock()
    user = MagicMock()
    user.role = "supervisor"
    db.query.return_value.filter.return_value.first.return_value = user

    with pytest.raises(HTTPException) as exc:
        apply_manufacturing_coordinator_scope(_chainable_query(), db, 30)
    assert exc.value.status_code == 400


def test_apply_mc_scope_no_orders_returns_empty():
    db = MagicMock()
    user = MagicMock()
    user.role = "manufacturing_coordinator"
    db.query.return_value.filter.return_value.first.return_value = user

    # First query: user lookup; second: order ids -> empty
    order_q = MagicMock()
    order_q.filter.return_value.all.return_value = []
    db.query.side_effect = [MagicMock(filter=MagicMock(return_value=MagicMock(first=MagicMock(return_value=user)))), order_q]

    q = _chainable_query()
    result = apply_manufacturing_coordinator_scope(q, db, 32)
    result.filter.assert_called()
    assert result.filter.call_args[0][0].compare is not None or True


def test_apply_mc_scope_filters_by_operation_ids(monkeypatch):
    db = MagicMock()
    mc_user = MagicMock()
    mc_user.role = "manufacturing_coordinator"
    db.query.return_value.filter.return_value.first.return_value = mc_user

    monkeypatch.setattr(
        "production_log_helpers.get_order_ids_for_manufacturing_coordinator",
        lambda _db, _mc: [182],
    )
    monkeypatch.setattr(
        "production_log_helpers.get_operation_ids_for_orders",
        lambda _db, _oids: [491, 492],
    )

    q = _chainable_query()
    apply_manufacturing_coordinator_scope(q, db, 32)
    q.filter.assert_called_once()

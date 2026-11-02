"""
Operator job cards derived from unit_schedule_items.

Read-only. Groups the latest unit-wise plan into one card per contiguous
unit band on a machine. Does not write production logs or call activate.
"""

from __future__ import annotations

from datetime import datetime, time
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy.orm import Session

from DB.models.configuration import Machine
from DB.models.oms import Operation, OrderPartPriority, Part
from DB.models.scheduling import ProductionLog
from production_log_helpers import get_operator_activation_block_reason
from unit_wise_scheduler import list_unit_schedule


def _iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _combine_log_datetime(day, clock) -> Optional[datetime]:
    if day is None and clock is None:
        return None
    if isinstance(day, datetime) and clock is None:
        return day
    if day is None:
        return None
    day_part = day.date() if isinstance(day, datetime) else day
    if clock is None:
        return datetime.combine(day_part, time.min)
    clock_part = clock.time() if isinstance(clock, datetime) else clock
    return datetime.combine(day_part, clock_part)


def _actual_start_end_from_logs(logs: Sequence) -> tuple:
    starts = [
        _combine_log_datetime(getattr(log, "from_date", None), getattr(log, "from_time", None))
        for log in logs
    ]
    ends = [
        _combine_log_datetime(getattr(log, "to_date", None), getattr(log, "to_time", None))
        for log in logs
    ]
    starts = [value for value in starts if value is not None]
    ends = [value for value in ends if value is not None]
    start = min(starts) if starts else None
    end = max(ends) if ends else start
    return start, end


def group_unit_rows_into_job_cards(rows: Sequence[Any]) -> List[Dict[str, Any]]:
    """
    Collapse unit rows into contiguous bands.

    A new card starts when part, operation, or machine changes, or when
    unit_index is not the previous unit or the same unit (shift-split segment).
    A gap (1, 2, then 4) is two cards. Different machines are never merged.
    """
    # Handle both tuple format (row, part_name, operation_name) and row objects
    def _get_row_attr(row, attr):
        if isinstance(row, tuple) and len(row) >= 1:
            return getattr(row[0], attr, None)
        return getattr(row, attr, None)

    sortable = [r for r in rows if _get_row_attr(r, "machine_id") is not None]
    sortable.sort(
        key=lambda r: (
            int(_get_row_attr(r, "part_id")),
            int(_get_row_attr(r, "operation_id")),
            int(_get_row_attr(r, "machine_id")),
            int(_get_row_attr(r, "unit_index")),
            _get_row_attr(r, "start_time") or datetime.min,
        )
    )

    cards: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    last_unit: Optional[int] = None

    def _close() -> None:
        nonlocal current, last_unit
        if current is None:
            return
        current["quantity"] = int(current["unit_to"]) - int(current["unit_from"]) + 1
        current.pop("_sources", None)
        cards.append(current)
        current = None
        last_unit = None

    for row in sortable:
        part_id = int(_get_row_attr(row, "part_id"))
        operation_id = int(_get_row_attr(row, "operation_id"))
        machine_id = int(_get_row_attr(row, "machine_id"))
        unit_index = int(_get_row_attr(row, "unit_index"))
        same_band = (
            current is not None
            and current["part_id"] == part_id
            and current["operation_id"] == operation_id
            and current["machine_id"] == machine_id
            and last_unit is not None
            and unit_index <= last_unit + 1
        )
        if not same_band:
            _close()
            current = {
                "order_id": int(_get_row_attr(row, "order_id")),
                "order_number": _get_row_attr(row, "order_number"),
                "part_id": part_id,
                "part_number": _get_row_attr(row, "part_number"),
                "part_name": _get_row_attr(row, "part_name"),
                "priority": None,
                "operation_id": operation_id,
                "operation_number": _get_row_attr(row, "operation_number"),
                "operation_name": _get_row_attr(row, "operation_name"),
                "machine_id": machine_id,
                "unit_from": unit_index,
                "unit_to": unit_index,
                "quantity": 1,
                "planned_start": _get_row_attr(row, "start_time"),
                "planned_end": _get_row_attr(row, "end_time"),
                "schedule_version": _get_row_attr(row, "schedule_version"),
                "source": _get_row_attr(row, "source"),
                "assignment_mode": _get_row_attr(row, "assignment_mode"),
                "_sources": {_get_row_attr(row, "source")},
            }
            last_unit = unit_index
            continue

        current["unit_to"] = max(int(current["unit_to"]), unit_index)
        row_start = _get_row_attr(row, "start_time")
        row_end = _get_row_attr(row, "end_time")
        if row_start is not None and (
            current["planned_start"] is None or row_start < current["planned_start"]
        ):
            current["planned_start"] = row_start
        if row_end is not None and (
            current["planned_end"] is None or row_end > current["planned_end"]
        ):
            current["planned_end"] = row_end
        src = _get_row_attr(row, "source")
        current["_sources"].add(src)
        if len(current["_sources"]) > 1:
            current["source"] = ",".join(sorted(str(s) for s in current["_sources"] if s))
        ver = _get_row_attr(row, "schedule_version")
        if ver is not None:
            prev = current.get("schedule_version")
            current["schedule_version"] = ver if prev is None else max(int(prev), int(ver))
        last_unit = max(last_unit or unit_index, unit_index)

    _close()

    cards.sort(
        key=lambda c: (
            c["planned_start"] or datetime.min,
            c["part_id"],
            c["operation_id"],
            c["unit_from"],
        )
    )
    return cards


def freeze_completed_card(card: Dict[str, Any], approved: int) -> Dict[str, Any]:
    """Completed unit card stays visible but cannot be activated or selected."""
    frozen = dict(card)
    frozen["status"] = "completed"
    frozen["can_activate"] = False
    frozen.pop("operator_status", None)
    frozen["blocked_reason"] = "This job card is completed."
    frozen["approved_quantity"] = int(approved)
    frozen["completed_quantity"] = int(approved)
    frozen["remaining_quantity"] = 0
    frozen.pop("source", None)
    return frozen


def _latest_log_status(card: Dict[str, Any], logs: Sequence) -> str:
    """Reviewer status from production_logs for this unit band."""
    from scheduling_modes import unit_range_from_log

    matching = []
    for log in logs:
        unit_range = unit_range_from_log(log)
        if unit_range is None or log.machine_id is None:
            continue
        key = (
            int(log.operation_id),
            int(log.machine_id),
            int(unit_range[0]),
            int(unit_range[1]),
        )
        if _card_matches_log_key(card, key):
            matching.append(log)
    if not matching:
        return "pending"
    latest = max(matching, key=lambda row: int(getattr(row, "id", 0) or 0))
    return str(getattr(latest, "status", None) or "pending").lower()


def _apply_order_part_priorities(db: Session, cards: Sequence[Dict[str, Any]]) -> None:
    priority_keys = {
        (int(card["order_id"]), int(card["part_id"]))
        for card in cards
        if card.get("order_id") and card.get("part_id")
    }
    if not priority_keys:
        return
    order_ids = {order_id for order_id, _ in priority_keys}
    part_ids = {part_id for _, part_id in priority_keys}
    priorities: Dict[tuple, OrderPartPriority] = {}
    for row in (
        db.query(OrderPartPriority)
        .filter(
            OrderPartPriority.order_id.in_(order_ids),
            OrderPartPriority.part_id.in_(part_ids),
        )
        .all()
    ):
        key = (int(row.order_id), int(row.part_id))
        if key not in priority_keys:
            continue
        current = priorities.get(key)
        if current is None or (
            getattr(row, "status", None) == "active"
            and getattr(current, "status", None) != "active"
        ):
            priorities[key] = row
    for card in cards:
        if card.get("order_id") is None or card.get("part_id") is None:
            continue
        priority_row = priorities.get((int(card["order_id"]), int(card["part_id"])))
        if priority_row is not None:
            card["priority"] = priority_row.priority


def _log_band_key(log) -> tuple:
    from scheduling_modes import unit_range_from_log

    unit_range = unit_range_from_log(log)
    machine_id = int(log.machine_id) if log.machine_id is not None else None
    if unit_range is None:
        return (int(log.operation_id), machine_id, None, None)
    return (int(log.operation_id), machine_id, int(unit_range[0]), int(unit_range[1]))


def _card_matches_log_key(card: Dict[str, Any], key: tuple) -> bool:
    op_id, machine_id, unit_from, unit_to = key
    if int(card["operation_id"]) != int(op_id):
        return False
    if int(card["machine_id"]) != int(machine_id):
        return False
    if unit_from is None:
        return True
    return int(card["unit_from"]) == int(unit_from) and int(card["unit_to"]) == int(unit_to)


def _completed_cards_from_logs(
    db: Session,
    machine_id: int,
    existing_cards: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Unit bands that rebuild dropped after approval still show as frozen cards."""
    from production_log_helpers import resolve_order_for_operation_part
    from scheduling_modes import unit_range_from_log

    existing = {
        (int(card["operation_id"]), int(card["unit_from"]), int(card["unit_to"]))
        for card in existing_cards
    }
    logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.machine_id == int(machine_id))
        .all()
    )
    grouped: Dict[tuple, List[ProductionLog]] = {}
    for log in logs:
        unit_range = unit_range_from_log(log)
        if unit_range is None:
            continue
        key = (int(log.operation_id), int(unit_range[0]), int(unit_range[1]))
        grouped.setdefault(key, []).append(log)

    extra_op_ids = {op_id for op_id, _, _ in grouped if op_id not in {
        int(card["operation_id"]) for card in existing_cards
    }}
    ops = {
        o.id: o
        for o in (
            db.query(Operation).filter(Operation.id.in_(list(extra_op_ids))).all()
            if extra_op_ids
            else []
        )
    }
    extra_part_ids = {op.part_id for op in ops.values() if op.part_id is not None}
    parts = {
        p.id: p
        for p in (
            db.query(Part).filter(Part.id.in_(list(extra_part_ids))).all()
            if extra_part_ids
            else []
        )
    }

    completed: List[Dict[str, Any]] = []
    for (op_id, unit_from, unit_to), group in grouped.items():
        if (op_id, unit_from, unit_to) in existing:
            continue
        qty = int(unit_to) - int(unit_from) + 1
        approved = sum(int(log.approved_quantity or 0) for log in group)
        if approved < qty:
            continue
        op = ops.get(op_id) or db.query(Operation).filter(Operation.id == op_id).first()
        if op is None:
            continue
        part = parts.get(op.part_id) or db.query(Part).filter(Part.id == op.part_id).first()
        order = resolve_order_for_operation_part(db, op)
        start, end = _actual_start_end_from_logs(group)
        card = {
            "order_id": int(order.id) if order is not None else 0,
            "order_number": getattr(order, "sale_order_number", None) if order is not None else None,
            "part_id": int(op.part_id),
            "part_number": part.part_number if part is not None else None,
            "part_name": part.part_name if part is not None else None,
            "priority": None,
            "operation_id": op_id,
            "operation_number": op.operation_number,
            "operation_name": op.operation_name,
            "machine_id": int(machine_id),
            "unit_from": unit_from,
            "unit_to": unit_to,
            "quantity": qty,
            "planned_start": _iso(start),
            "planned_end": _iso(end),
            "schedule_version": None,
            "assignment_mode": None,
        }
        completed.append(freeze_completed_card(card, approved))
    return completed


def list_machine_job_cards(db: Session, machine_id: int) -> Dict[str, Any]:
    """
    Latest unit-wise rows for this machine (same version rule as list_unit_schedule),
    grouped into operator job cards.
    """
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if machine is None:
        return {"machine_id": machine_id, "machine_found": False, "jobs": []}

    rows = list_unit_schedule(db, machine_id=machine_id, latest_only=True)
    # Extract row objects from tuples (row, part_name, operation_name)
    row_objects = [r[0] for r in rows] if rows else []
    cards = group_unit_rows_into_job_cards(row_objects)

    part_ids = {c["part_id"] for c in cards}
    op_ids = {c["operation_id"] for c in cards}
    parts = {
        p.id: p
        for p in (db.query(Part).filter(Part.id.in_(part_ids)).all() if part_ids else [])
    }
    ops = {
        o.id: o
        for o in (
            db.query(Operation).filter(Operation.id.in_(op_ids)).all() if op_ids else []
        )
    }
    for card in cards:
        part = parts.get(card["part_id"])
        op = ops.get(card["operation_id"])
        if part is not None and not card.get("part_name"):
            card["part_name"] = part.part_name
        if op is not None and not card.get("operation_name"):
            card["operation_name"] = op.operation_name
        card["planned_start"] = _iso(card.get("planned_start"))
        card["planned_end"] = _iso(card.get("planned_end"))

    started_keys = set()
    awaiting_review_keys = set()
    machine_logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.machine_id == int(machine_id))
        .all()
    )
    for log in machine_logs:
        key = _log_band_key(log)
        if log.operator_status == "inprogress":
            started_keys.add(key)
        elif log.operator_status == "completed" and log.user_id is None:
            awaiting_review_keys.add(key)

    from intelligent_scheduler.unit_job_flow import work_due_for_card

    block_by_op: Dict[int, Optional[str]] = {}
    for card in cards:
        op_id = int(card["operation_id"])
        due = work_due_for_card(db, card)
        card["approved_quantity"] = int(due.get("approved_on_card") or 0)
        card["completed_quantity"] = int(due.get("approved_on_card") or 0)
        card["remaining_quantity"] = int(due.get("remaining_to_close") or 0)
        card["status"] = _latest_log_status(card, machine_logs)
        started = any(_card_matches_log_key(card, key) for key in started_keys)
        awaiting_review = any(_card_matches_log_key(card, key) for key in awaiting_review_keys)
        if int(card["remaining_quantity"]) <= 0:
            frozen = freeze_completed_card(card, card["approved_quantity"])
            card.clear()
            card.update(frozen)
            continue
        if started:
            card["can_activate"] = False
            card["blocked_reason"] = (
                "Job card already activated. Production log is yet to be sent."
            )
            continue
        if awaiting_review:
            card["can_activate"] = False
            card["blocked_reason"] = (
                "Cannot activate job card because log status is yet to be updated "
                "by a reviewer (supervisor or manufacturing_coordinator). "
                "Please wait until the reviewer has reviewed and updated the production log."
            )
            continue
        if op_id not in block_by_op:
            part = parts.get(card["part_id"])
            qty = int(part.qty or 0) if part is not None else 0
            block_by_op[op_id] = get_operator_activation_block_reason(db, op_id, qty)
        reason = block_by_op[op_id]
        card["can_activate"] = reason is None
        card["blocked_reason"] = reason

    cards.extend(_completed_cards_from_logs(db, machine_id, cards))
    _apply_order_part_priorities(db, cards)
    for card in cards:
        card.pop("source", None)
        card.pop("_sources", None)
        card.pop("operator_status", None)
        if not card.get("status"):
            card["status"] = "pending"

    return {
        "machine_id": machine_id,
        "machine_found": True,
        "total": len(cards),
        "jobs": cards,
    }

"""
Operator job cards from the latest unit-wise plan.

Reads scheduling.unit_schedule_items only. Does not touch production logs
or rescheduling_items.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from DB.models.configuration import Machine
from DB.models.oms import Operation, Part
from DB.models.scheduling import UnitScheduleItem


def _row_value(row: Any, name: str, default=None):
    if isinstance(row, dict):
        return row.get(name, default)
    return getattr(row, name, default)


def collapse_unit_rows_to_cards(rows: Sequence[Any]) -> List[Dict[str, Any]]:
    """
    Group unit rows into one card per consecutive unit band.

    Group key: (order_id, part_id, operation_id). A gap in unit_index starts
    a new card. planned_start / planned_end span the band.
    """
    grouped: Dict[tuple, List[Dict[str, Any]]] = defaultdict(list)
    for raw in rows or []:
        unit_index = _row_value(raw, "unit_index")
        if unit_index is None:
            continue
        item = {
            "order_id": _row_value(raw, "order_id"),
            "order_number": _row_value(raw, "order_number"),
            "part_id": int(_row_value(raw, "part_id")),
            "part_number": _row_value(raw, "part_number"),
            "part_name": _row_value(raw, "part_name"),
            "operation_id": int(_row_value(raw, "operation_id")),
            "operation_number": _row_value(raw, "operation_number"),
            "operation_name": _row_value(raw, "operation_name"),
            "machine_id": _row_value(raw, "machine_id"),
            "unit_index": int(unit_index),
            "start_time": _row_value(raw, "start_time"),
            "end_time": _row_value(raw, "end_time"),
            "schedule_version": _row_value(raw, "schedule_version"),
        }
        key = (item["order_id"], item["part_id"], item["operation_id"])
        grouped[key].append(item)

    cards: List[Dict[str, Any]] = []
    for items in grouped.values():
        items.sort(key=lambda r: r["unit_index"])
        band: Optional[Dict[str, Any]] = None

        def flush(current: Dict[str, Any]) -> None:
            qty = int(current["unit_to"]) - int(current["unit_from"]) + 1
            cards.append({**current, "quantity": qty})

        for item in items:
            if band is None:
                band = _start_band(item)
                continue
            if item["unit_index"] == band["unit_to"] + 1:
                band["unit_to"] = item["unit_index"]
                band["planned_start"] = _min_dt(band["planned_start"], item["start_time"])
                band["planned_end"] = _max_dt(band["planned_end"], item["end_time"])
                continue
            flush(band)
            band = _start_band(item)
        if band is not None:
            flush(band)

    cards.sort(
        key=lambda c: (
            c["planned_start"] or datetime.min,
            c["operation_id"],
            c["unit_from"],
        )
    )
    return cards


def _start_band(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "order_id": item["order_id"],
        "order_number": item["order_number"],
        "part_id": item["part_id"],
        "part_number": item["part_number"],
        "part_name": item["part_name"],
        "operation_id": item["operation_id"],
        "operation_number": item["operation_number"],
        "operation_name": item["operation_name"],
        "machine_id": item["machine_id"],
        "unit_from": item["unit_index"],
        "unit_to": item["unit_index"],
        "planned_start": item["start_time"],
        "planned_end": item["end_time"],
        "schedule_version": item["schedule_version"],
    }


def _min_dt(a: Optional[datetime], b: Optional[datetime]) -> Optional[datetime]:
    if a is None:
        return b
    if b is None:
        return a
    return a if a <= b else b


def _max_dt(a: Optional[datetime], b: Optional[datetime]) -> Optional[datetime]:
    if a is None:
        return b
    if b is None:
        return a
    return a if a >= b else b


def list_machine_job_cards(
    db: Session,
    machine_id: int,
    part_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Latest unit-wise bands scheduled on one machine.

    Uses the max schedule_version per part, then keeps rows for machine_id.
    """
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(404, f"Machine {machine_id} not found")

    latest = (
        db.query(
            UnitScheduleItem.part_id.label("part_id"),
            func.max(UnitScheduleItem.schedule_version).label("ver"),
        )
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )

    q = (
        db.query(
            UnitScheduleItem,
            Part.part_name,
            Operation.operation_name,
        )
        .join(
            latest,
            and_(
                UnitScheduleItem.part_id == latest.c.part_id,
                UnitScheduleItem.schedule_version == latest.c.ver,
            ),
        )
        .outerjoin(Part, Part.id == UnitScheduleItem.part_id)
        .outerjoin(Operation, Operation.id == UnitScheduleItem.operation_id)
        .filter(UnitScheduleItem.machine_id == machine_id)
    )
    if part_id is not None:
        q = q.filter(UnitScheduleItem.part_id == part_id)

    loaded = []
    for row, part_name, operation_name in q.all():
        loaded.append(
            {
                "order_id": row.order_id,
                "order_number": row.order_number,
                "part_id": row.part_id,
                "part_number": row.part_number,
                "part_name": part_name,
                "operation_id": row.operation_id,
                "operation_number": row.operation_number,
                "operation_name": operation_name,
                "machine_id": row.machine_id,
                "unit_index": row.unit_index,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "schedule_version": row.schedule_version,
            }
        )

    cards = collapse_unit_rows_to_cards(loaded)
    return {
        "machine_id": machine_id,
        "total": len(cards),
        "cards": cards,
    }

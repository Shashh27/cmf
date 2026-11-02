"""
Qty→machine allocation service for Intelligent Scheduler (manual WC split).

Validates bands, persists replace-all, expands to machine_by_slot for greedy rebuild.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from DB.models.configuration import Machine, WorkCenter
from DB.models.oms import Operation, Order, Part
from DB.models.scheduling import (
    PartOperationQtyMachineAllocation,
    PartScheduleStatus,
    ProductionLog,
    UnitScheduleItem,
)
from production_log_helpers import is_schedulable_operation, total_approved_for_operation
from time_utils import now_ist

IN_HOUSE_TYPE_ID = 1

SlotKey = Tuple[int, int, int]  # (part_id, operation_id, unit_index)


def _op_number_key(op_number: Optional[str]) -> Tuple:
    if op_number is None:
        return (999999,)
    digits = "".join(ch for ch in str(op_number) if ch.isdigit())
    try:
        return (int(digits),) if digits else (999999, str(op_number))
    except ValueError:
        return (999999, str(op_number))


def _require_active_inhouse_part(db: Session, part_id: int) -> Tuple[Part, PartScheduleStatus]:
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(404, f"Part {part_id} not found")
    if int(part.type_id or 0) != IN_HOUSE_TYPE_ID:
        raise HTTPException(400, f"Part {part_id} is not IN-House (type_id=1)")
    pss = (
        db.query(PartScheduleStatus)
        .filter(
            PartScheduleStatus.part_id == part_id,
            PartScheduleStatus.status == "active",
        )
        .first()
    )
    if not pss:
        raise HTTPException(400, f"Part {part_id} is not active in part_schedule_status")
    return part, pss


def _schedulable_ops(db: Session, part_id: int) -> List[Operation]:
    ops = db.query(Operation).filter(Operation.part_id == part_id).all()
    ops = [op for op in ops if is_schedulable_operation(db, op)]
    ops.sort(key=lambda o: _op_number_key(o.operation_number))
    return ops


def _machine_label(machine: Machine) -> str:
    name = getattr(machine, "name", None)
    if name:
        return str(name)
    composed = f"{getattr(machine, 'make', '')} {getattr(machine, 'model', '')}".strip()
    return composed or f"Machine {machine.id}"


def summarize_machine_occupancy(
    rows: Iterable[Any],
    now: datetime,
) -> Dict[int, Dict[str, Any]]:
    """
    Collapse latest-plan rows into per-machine occupancy.

    Each row is (machine_id, end_time, part_id, part_number, part_name).
    Only end times still in the future count. The caller excludes the part
    being allocated so its own plan is not listed as someone else's WIP.
    """
    by_machine: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        machine_id, end_time, part_id, part_number, part_name = row
        if machine_id is None or end_time is None or end_time <= now:
            continue
        bucket = by_machine.setdefault(
            int(machine_id),
            {"occupied_until": None, "parts": {}},
        )
        if bucket["occupied_until"] is None or end_time > bucket["occupied_until"]:
            bucket["occupied_until"] = end_time
        pid = int(part_id)
        if pid not in bucket["parts"]:
            bucket["parts"][pid] = {
                "part_id": pid,
                "part_number": part_number or "",
                "part_name": part_name or "",
            }

    out: Dict[int, Dict[str, Any]] = {}
    for machine_id, bucket in by_machine.items():
        wip = sorted(
            bucket["parts"].values(),
            key=lambda p: (
                (p["part_name"] or p["part_number"] or "").lower(),
                p["part_number"] or "",
            ),
        )
        occupied = bucket["occupied_until"]
        out[machine_id] = {
            "occupied_until": occupied.isoformat() if occupied else None,
            "wip_parts": wip,
        }
    return out


def _occupancy_by_machine(
    db: Session,
    machine_ids: Sequence[int],
    exclude_part_id: int,
    now: Optional[datetime] = None,
) -> Dict[int, Dict[str, Any]]:
    """Latest unit-wise plan: future occupancy on these machines, excluding one part."""
    ids = sorted({int(mid) for mid in machine_ids if mid is not None})
    if not ids:
        return {}
    as_of = now or now_ist()
    latest = (
        db.query(
            UnitScheduleItem.part_id.label("part_id"),
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )
    rows = (
        db.query(
            UnitScheduleItem.machine_id,
            UnitScheduleItem.end_time,
            UnitScheduleItem.part_id,
            UnitScheduleItem.part_number,
            Part.part_name,
        )
        .join(Part, Part.id == UnitScheduleItem.part_id)
        .join(
            latest,
            and_(
                UnitScheduleItem.part_id == latest.c.part_id,
                UnitScheduleItem.schedule_version == latest.c.max_version,
            ),
        )
        .filter(
            UnitScheduleItem.machine_id.in_(ids),
            UnitScheduleItem.end_time > as_of,
            UnitScheduleItem.part_id != int(exclude_part_id),
        )
        .all()
    )
    return summarize_machine_occupancy(rows, as_of)


def _machines_for_wc(db: Session, workcenter_id: Optional[int]) -> List[Machine]:
    if workcenter_id is None:
        return []
    return (
        db.query(Machine)
        .filter(Machine.work_center_id == workcenter_id)
        .order_by(Machine.id.asc())
        .all()
    )


def validate_allocation_bands(
    db: Session,
    part_id: int,
    bands: Sequence[Any],
    *,
    quantity: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Validate allocation bands for a part.

    - Part must be active IN-House
    - For each operation that has any bands: bands must partition 1..qty
      (no gaps, no overlaps). Ops with zero bands are allowed (auto fallback).
    - machine_id must belong to the operation's work center
    """
    part, _ = _require_active_inhouse_part(db, part_id)
    qty = int(quantity if quantity is not None else (part.qty or 0))
    if qty <= 0:
        raise HTTPException(400, f"Part {part_id} has invalid qty={qty}")

    ops = {op.id: op for op in _schedulable_ops(db, part_id)}
    if not ops:
        raise HTTPException(400, f"Part {part_id} has no schedulable operations")

    by_op: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    normalized: List[Dict[str, Any]] = []

    for raw in bands or []:
        if hasattr(raw, "model_dump"):
            raw = raw.model_dump()
        elif hasattr(raw, "dict"):
            raw = raw.dict()
        op_id = int(raw["operation_id"])
        unit_from = int(raw["unit_from"])
        unit_to = int(raw["unit_to"])
        machine_id = int(raw["machine_id"])

        if op_id not in ops:
            raise HTTPException(
                400,
                f"operation_id={op_id} is not a schedulable operation for part {part_id}",
            )
        if unit_from < 1 or unit_to < unit_from or unit_to > qty:
            raise HTTPException(
                400,
                f"Invalid range [{unit_from}, {unit_to}] for operation {op_id} "
                f"(must be within 1..{qty})",
            )

        op = ops[op_id]
        wc_machines = _machines_for_wc(db, op.workcenter_id)
        wc_ids = {m.id for m in wc_machines}
        if machine_id not in wc_ids:
            raise HTTPException(
                400,
                f"machine_id={machine_id} is not in workcenter {op.workcenter_id} "
                f"for operation {op_id}",
            )

        band = {
            "operation_id": op_id,
            "unit_from": unit_from,
            "unit_to": unit_to,
            "machine_id": machine_id,
        }
        by_op[op_id].append(band)
        normalized.append(band)

    for op_id, op_bands in by_op.items():
        covered = [False] * (qty + 1)  # 1-based
        for b in sorted(op_bands, key=lambda x: x["unit_from"]):
            for u in range(b["unit_from"], b["unit_to"] + 1):
                if covered[u]:
                    raise HTTPException(
                        400,
                        f"Overlapping unit {u} for operation {op_id}",
                    )
                covered[u] = True
        missing = [u for u in range(1, qty + 1) if not covered[u]]
        if missing:
            raise HTTPException(
                400,
                f"Gaps in coverage for operation {op_id}: missing units {missing[:20]}"
                + ("…" if len(missing) > 20 else ""),
            )

    return normalized


def allocation_band_key(band: Any) -> Tuple[int, int, int]:
    """Comparable identity of one band: unit range and machine."""
    if isinstance(band, dict):
        return (int(band["unit_from"]), int(band["unit_to"]), int(band["machine_id"]))
    return (int(band.unit_from), int(band.unit_to), int(band.machine_id))


def same_allocation_bands(left: Sequence[Any], right: Sequence[Any]) -> bool:
    """True when both sides describe the same splits, ignoring row order and timestamps."""
    return tuple(sorted(allocation_band_key(b) for b in left)) == tuple(
        sorted(allocation_band_key(b) for b in right)
    )


def is_process_plan_default(bands: Sequence[Any], machine_id: Optional[int], quantity: int) -> bool:
    """One band covering units 1..quantity on the routing machine."""
    if machine_id is None or len(list(bands)) != 1:
        return False
    unit_from, unit_to, band_machine = allocation_band_key(list(bands)[0])
    return unit_from == 1 and unit_to == int(quantity) and band_machine == int(machine_id)


def process_plan_bands_for_omitted_ops(
    db: Session,
    part_id: int,
    quantity: int,
    covered_operation_ids: Iterable[int],
) -> List[Dict[str, Any]]:
    """
    Operations the caller did not split stay on the routing machine.

    One band covers units 1..quantity on operation.machine_id (process plan).
    """
    covered = {int(op_id) for op_id in covered_operation_ids}
    qty = int(quantity)
    bands: List[Dict[str, Any]] = []
    for op in _schedulable_ops(db, part_id):
        if int(op.id) in covered:
            continue
        machine_id = getattr(op, "machine_id", None)
        if not machine_id:
            raise HTTPException(
                400,
                f"Operation {op.id} was not split and has no process-plan machine",
            )
        wc_ids = {m.id for m in _machines_for_wc(db, op.workcenter_id)}
        if int(machine_id) not in wc_ids:
            raise HTTPException(
                400,
                f"Process-plan machine {machine_id} for operation {op.id} "
                f"is not in workcenter {op.workcenter_id}",
            )
        bands.append(
            {
                "operation_id": int(op.id),
                "unit_from": 1,
                "unit_to": qty,
                "machine_id": int(machine_id),
            }
        )
    return bands


def expand_allocations_to_machine_by_slot(
    bands: Sequence[Any],
    *,
    part_id: Optional[int] = None,
) -> Dict[SlotKey, int]:
    """
    Expand inclusive unit bands into (part_id, operation_id, unit_index) → machine_id.
    Each band may carry part_id; otherwise use the part_id argument.
    """
    out: Dict[SlotKey, int] = {}
    for raw in bands or []:
        if hasattr(raw, "model_dump"):
            raw = raw.model_dump()
        elif hasattr(raw, "dict"):
            raw = raw.dict()
        elif hasattr(raw, "__dict__") and not isinstance(raw, dict):
            raw = {
                "part_id": getattr(raw, "part_id", None),
                "operation_id": raw.operation_id,
                "unit_from": raw.unit_from,
                "unit_to": raw.unit_to,
                "machine_id": raw.machine_id,
            }
        pid = int(raw.get("part_id") or part_id or 0)
        if pid <= 0:
            continue
        op_id = int(raw["operation_id"])
        mid = int(raw["machine_id"])
        for u in range(int(raw["unit_from"]), int(raw["unit_to"]) + 1):
            out[(pid, op_id, u)] = mid
    return out


def list_active_inhouse_parts(db: Session) -> List[Dict[str, Any]]:
    rows = (
        db.query(PartScheduleStatus, Part)
        .join(Part, Part.id == PartScheduleStatus.part_id)
        .filter(
            PartScheduleStatus.status == "active",
            Part.type_id == IN_HOUSE_TYPE_ID,
        )
        .order_by(Part.id.asc())
        .all()
    )
    out = []
    for pss, part in rows:
        out.append(
            {
                "part_id": part.id,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "qty": int(part.qty or 0),
                "order_id": pss.sale_order_id,
            }
        )
    return out


def get_allocations_for_part(
    db: Session,
    part_id: int,
    order_id: Optional[int] = None,
) -> Dict[str, Any]:
    part, pss = _require_active_inhouse_part(db, part_id)
    qty = int(part.qty or 0)
    ops = _schedulable_ops(db, part_id)

    machines_by_op = [(op, _machines_for_wc(db, op.workcenter_id)) for op in ops]
    occupancy = _occupancy_by_machine(
        db,
        [m.id for _, machines in machines_by_op for m in machines],
        part_id,
    )

    # Load workcenter names for all unique workcenters
    wc_ids = {op.workcenter_id for op in ops if op.workcenter_id}
    workcenters = {
        wc.id: wc
        for wc in (
            db.query(WorkCenter).filter(WorkCenter.id.in_(list(wc_ids))).all()
            if wc_ids
            else []
        )
    }

    stored_modes: Dict[int, str] = {}
    max_ver = (
        db.query(func.max(UnitScheduleItem.schedule_version))
        .filter(UnitScheduleItem.part_id == part_id)
        .scalar()
    )
    if max_ver is not None:
        mode_rows = (
            db.query(UnitScheduleItem.operation_id, UnitScheduleItem.assignment_mode)
            .filter(
                UnitScheduleItem.part_id == part_id,
                UnitScheduleItem.schedule_version == max_ver,
            )
            .all()
        )
        for op_id, mode in mode_rows:
            if op_id in stored_modes or not mode:
                continue
            raw = str(mode).lower().strip()
            if raw in ("auto", "process_plan", "manual"):
                stored_modes[int(op_id)] = raw

    operations_ctx = []
    for op, machines in machines_by_op:
        approved = int(total_approved_for_operation(db, op.id) or 0)
        wc = workcenters.get(op.workcenter_id)
        operations_ctx.append(
            {
                "operation_id": op.id,
                "operation_number": op.operation_number,
                "operation_name": op.operation_name,
                "workcenter_id": op.workcenter_id,
                "workcenter_name": wc.work_center_name if wc else None,
                "default_machine_id": op.machine_id,
                "assignment_mode": stored_modes.get(int(op.id), "process_plan"),
                "approved_quantity": approved,
                "machines": [
                    {
                        "id": m.id,
                        "name": _machine_label(m),
                        "workcenter_id": m.work_center_id,
                        "workcenter_name": wc.work_center_name if wc else None,
                        "occupied_until": occupancy.get(m.id, {}).get("occupied_until"),
                        "wip_parts": occupancy.get(m.id, {}).get("wip_parts", []),
                    }
                    for m in machines
                ],
            }
        )

    q = (
        db.query(
            PartOperationQtyMachineAllocation,
            Machine,
            WorkCenter,
        )
        .join(Machine, PartOperationQtyMachineAllocation.machine_id == Machine.id)
        .join(WorkCenter, Machine.work_center_id == WorkCenter.id)
        .filter(PartOperationQtyMachineAllocation.part_id == part_id)
    )
    if order_id is not None:
        q = q.filter(
            (PartOperationQtyMachineAllocation.order_id == order_id)
            | (PartOperationQtyMachineAllocation.order_id.is_(None))
        )
    rows = q.order_by(
        PartOperationQtyMachineAllocation.operation_id.asc(),
        PartOperationQtyMachineAllocation.unit_from.asc(),
    ).all()

    return {
        "part_id": part_id,
        "order_id": order_id if order_id is not None else pss.sale_order_id,
        "quantity": qty,
        "part_number": part.part_number,
        "part_name": part.part_name,
        "operations": operations_ctx,
        "allocations": [
            {
                "id": r[0].id,
                "part_id": r[0].part_id,
                "order_id": r[0].order_id,
                "operation_id": r[0].operation_id,
                "unit_from": r[0].unit_from,
                "unit_to": r[0].unit_to,
                "machine_id": r[0].machine_id,
                "workcenter_id": r[1].work_center_id,
                "workcenter_name": r[2].work_center_name,
                "created_by": r[0].created_by,
            }
            for r in rows
        ],
    }


def replace_allocations_for_part(
    db: Session,
    part_id: int,
    bands: Sequence[Any],
    *,
    order_id: Optional[int] = None,
    created_by: Optional[int] = None,
    commit: bool = True,
) -> Dict[str, Any]:
    """
    Replace qty→machine bands for a part.

    An operation is rewritten only when its bands changed. Unchanged
    operations keep their existing rows, including created_at and updated_at.
    A schedulable operation with no saved bands yet is stored as one
    process-plan band: units 1..qty on the routing machine.
    """
    part, pss = _require_active_inhouse_part(db, part_id)
    effective_order_id = order_id if order_id is not None else pss.sale_order_id
    qty = int(part.qty or 0)
    normalized = validate_allocation_bands(db, part_id, bands, quantity=qty)

    existing_rows = (
        db.query(PartOperationQtyMachineAllocation)
        .filter(PartOperationQtyMachineAllocation.part_id == part_id)
        .all()
    )
    existing_by_op: Dict[int, List[PartOperationQtyMachineAllocation]] = defaultdict(list)
    for row in existing_rows:
        existing_by_op[int(row.operation_id)].append(row)

    requested_by_op: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for band in normalized:
        requested_by_op[int(band["operation_id"])].append(band)

    routing_machine = {
        int(op.id): op.machine_id for op in _schedulable_ops(db, part_id)
    }
    to_write: List[Dict[str, Any]] = []
    for op_id, new_bands in requested_by_op.items():
        previous = existing_by_op.get(op_id, [])
        if previous and same_allocation_bands(previous, new_bands):
            continue
        # A later save of another operation often resends units 1..qty on the
        # routing machine. That default must not wipe a split already stored.
        if (
            previous
            and is_process_plan_default(new_bands, routing_machine.get(op_id), qty)
            and not is_process_plan_default(previous, routing_machine.get(op_id), qty)
        ):
            continue
        to_write.extend(new_bands)

    already_saved = set(existing_by_op)
    for band in process_plan_bands_for_omitted_ops(
        db,
        part_id,
        qty,
        set(requested_by_op) | already_saved,
    ):
        to_write.append(band)

    op_ids_to_replace = {int(b["operation_id"]) for b in to_write}
    if op_ids_to_replace:
        (
            db.query(PartOperationQtyMachineAllocation)
            .filter(
                PartOperationQtyMachineAllocation.part_id == part_id,
                PartOperationQtyMachineAllocation.operation_id.in_(list(op_ids_to_replace)),
            )
            .delete(synchronize_session=False)
        )

    for b in to_write:
        db.add(
            PartOperationQtyMachineAllocation(
                part_id=part_id,
                order_id=effective_order_id,
                operation_id=b["operation_id"],
                unit_from=b["unit_from"],
                unit_to=b["unit_to"],
                machine_id=b["machine_id"],
                created_by=created_by,
            )
        )

    if commit:
        db.commit()
    else:
        db.flush()

    return get_allocations_for_part(db, part_id, order_id=effective_order_id)


def load_machine_by_slot_for_parts(
    db: Session,
    part_ids: Sequence[int],
) -> Dict[SlotKey, int]:
    """Load persisted allocations for the given parts and expand to machine_by_slot."""
    if not part_ids:
        return {}
    rows = (
        db.query(PartOperationQtyMachineAllocation)
        .filter(PartOperationQtyMachineAllocation.part_id.in_(list(part_ids)))
        .all()
    )
    return expand_allocations_to_machine_by_slot(rows)


def build_machine_by_slot_for_rebuild(
    db: Session,
    part_ids: Sequence[int],
    *,
    assignment_mode: str = "manual",
) -> Dict[SlotKey, int]:
    """Thin helper used by rebuild when assignment_mode=manual."""
    mode = (assignment_mode or "auto").lower().strip()
    if mode != "manual":
        return {}
    return load_machine_by_slot_for_parts(db, part_ids)


def _machine_display_name(machine: Optional[Machine]) -> Optional[str]:
    if machine is None:
        return None
    return f"{machine.make or ''} {machine.model or ''}".strip() or None


def _combine_date_time(day, clock) -> Optional[datetime]:
    if day is None:
        return None
    day_part = day.date() if isinstance(day, datetime) else day
    if clock is None:
        return datetime.combine(day_part, datetime.min.time())
    clock_part = clock.time() if isinstance(clock, datetime) else clock
    return datetime.combine(day_part, clock_part)


def _is_activation_only(log: ProductionLog) -> bool:
    return (
        getattr(log, "operator_status", None) == "inprogress"
        and getattr(log, "produced_quantity", None) is None
        and getattr(log, "to_date", None) is None
    )


def _machine_actual_times(logs: Sequence[ProductionLog]) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Start and end from submitted logs on one machine. An open activation is neither."""
    actual_start = None
    actual_end = None
    for log in logs:
        activation_only = (
            log.operator_status == "inprogress"
            and log.produced_quantity is None
            and log.to_date is None
        )
        if activation_only:
            continue
        submitted = (
            log.operator_status == "completed"
            or log.produced_quantity is not None
            or log.to_date is not None
        )
        if not submitted:
            continue
        if log.from_date and log.from_time:
            candidate = datetime.combine(log.from_date, log.from_time)
            if actual_start is None or candidate < actual_start:
                actual_start = candidate
        if log.to_date and log.to_time and log.status == "completed":
            candidate = datetime.combine(log.to_date, log.to_time)
            if actual_end is None or candidate > actual_end:
                actual_end = candidate
    return actual_start, actual_end


def _band_status(actual_start: Optional[datetime], actual_end: Optional[datetime]) -> str:
    if actual_end is not None:
        return "completed"
    if actual_start is not None:
        return "inprogress"
    return "pending"


def _latest_unit_schedule_rows(
    db: Session, sale_order_id: int, part_id: int
) -> List[UnitScheduleItem]:
    latest = (
        db.query(func.max(UnitScheduleItem.schedule_version))
        .filter(
            UnitScheduleItem.part_id == part_id,
            UnitScheduleItem.order_id == sale_order_id,
        )
        .scalar()
    )
    if latest is None:
        return []
    return (
        db.query(UnitScheduleItem)
        .filter(
            UnitScheduleItem.part_id == part_id,
            UnitScheduleItem.order_id == sale_order_id,
            UnitScheduleItem.schedule_version == latest,
        )
        .all()
    )


def _bands_from_unit_rows(rows: Sequence[UnitScheduleItem]) -> List[Dict[str, Any]]:
    """One band per (operation, machine, contiguous unit run)."""
    per_unit: Dict[Tuple[int, Optional[int], int], Dict[str, Any]] = {}
    for row in rows:
        machine_id = int(row.machine_id) if row.machine_id is not None else None
        operation_id = int(row.operation_id)
        unit_index = int(row.unit_index)
        key = (operation_id, machine_id, unit_index)
        item = per_unit.get(key)
        if item is None:
            per_unit[key] = {
                "operation_id": operation_id,
                "machine_id": machine_id,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "unit_from": unit_index,
                "unit_to": unit_index,
                "assignment_mode": row.assignment_mode,
            }
            continue
        if row.start_time is not None and (
            item["start_time"] is None or row.start_time < item["start_time"]
        ):
            item["start_time"] = row.start_time
        if row.end_time is not None and (
            item["end_time"] is None or row.end_time > item["end_time"]
        ):
            item["end_time"] = row.end_time
        if not item.get("assignment_mode") and row.assignment_mode:
            item["assignment_mode"] = row.assignment_mode

    ordered = sorted(
        per_unit.values(),
        key=lambda item: (
            item["operation_id"],
            item["machine_id"] if item["machine_id"] is not None else -1,
            item["unit_from"],
        ),
    )
    bands: List[Dict[str, Any]] = []
    for item in ordered:
        if (
            bands
            and bands[-1]["operation_id"] == item["operation_id"]
            and bands[-1]["machine_id"] == item["machine_id"]
            and int(bands[-1]["unit_to"]) + 1 == int(item["unit_from"])
        ):
            prev = bands[-1]
            prev["unit_to"] = item["unit_to"]
            if item["start_time"] is not None and (
                prev["start_time"] is None or item["start_time"] < prev["start_time"]
            ):
                prev["start_time"] = item["start_time"]
            if item["end_time"] is not None and (
                prev["end_time"] is None or item["end_time"] > prev["end_time"]
            ):
                prev["end_time"] = item["end_time"]
            continue
        bands.append(dict(item))
    bands.sort(key=lambda b: (b["operation_id"], b["unit_from"], b["machine_id"] or 0))
    return bands


def _baseline_planned_by_operation(
    db: Session,
    sale_order_id: int,
    part_id: int,
) -> Dict[int, Dict[str, Optional[datetime]]]:
    """Frozen planned_schedule_items window per operation. Missing ops stay empty."""
    from DB.models.scheduling import PlannedScheduleItem, ScheduleHistory

    latest = (
        db.query(ScheduleHistory)
        .order_by(ScheduleHistory.generated_at.desc())
        .first()
    )
    if latest is None:
        return {}
    items = (
        db.query(PlannedScheduleItem)
        .filter(
            PlannedScheduleItem.schedule_history_id == latest.id,
            PlannedScheduleItem.sale_order_id == sale_order_id,
            PlannedScheduleItem.part_id == part_id,
        )
        .all()
    )
    planned: Dict[int, Dict[str, Optional[datetime]]] = {}
    for item in items:
        entry = planned.get(item.operation_id)
        if entry is None:
            planned[item.operation_id] = {
                "planned_start_time": item.planned_start_time,
                "planned_end_time": item.planned_end_time,
            }
            continue
        if item.planned_start_time < entry["planned_start_time"]:
            entry["planned_start_time"] = item.planned_start_time
        if item.planned_end_time > entry["planned_end_time"]:
            entry["planned_end_time"] = item.planned_end_time
    return planned


def _bands_from_production_logs(
    logs: Sequence[ProductionLog], qty: int
) -> List[Dict[str, Any]]:
    """Completed (or in-progress) unit bands from production_logs.

    Tagged unit-range logs win for that operation. Untagged batch logs fill
    operations that never ran unit-wise. Leftover allocations are not used.
    """
    qty = max(int(qty or 0), 1)
    tagged_ops = set()
    per_unit: Dict[Tuple[int, int, int], Dict[str, Optional[datetime]]] = {}
    untagged: Dict[Tuple[int, int], Dict[str, Optional[datetime]]] = {}

    for log in logs:
        if getattr(log, "machine_id", None) is None:
            continue
        if _is_activation_only(log):
            continue
        op_id = int(log.operation_id)
        machine_id = int(log.machine_id)
        start = _combine_date_time(
            getattr(log, "from_date", None), getattr(log, "from_time", None)
        )
        end = _combine_date_time(
            getattr(log, "to_date", None), getattr(log, "to_time", None)
        )
        unit_from = getattr(log, "unit_from", None)
        unit_to = getattr(log, "unit_to", None)
        if unit_from is not None and unit_to is not None:
            tagged_ops.add(op_id)
            for unit_index in range(int(unit_from), int(unit_to) + 1):
                key = (op_id, machine_id, unit_index)
                item = per_unit.get(key)
                if item is None:
                    per_unit[key] = {"start_time": start, "end_time": end}
                    continue
                if start is not None and (
                    item["start_time"] is None or start < item["start_time"]
                ):
                    item["start_time"] = start
                if end is not None and (
                    item["end_time"] is None or end > item["end_time"]
                ):
                    item["end_time"] = end
            continue
        key = (op_id, machine_id)
        item = untagged.get(key)
        if item is None:
            untagged[key] = {"start_time": start, "end_time": end}
            continue
        if start is not None and (
            item["start_time"] is None or start < item["start_time"]
        ):
            item["start_time"] = start
        if end is not None and (item["end_time"] is None or end > item["end_time"]):
            item["end_time"] = end

    fake_rows = [
        SimpleNamespace(
            operation_id=op_id,
            machine_id=machine_id,
            unit_index=unit_index,
            start_time=times["start_time"],
            end_time=times["end_time"],
            assignment_mode=None,
        )
        for (op_id, machine_id, unit_index), times in per_unit.items()
    ]
    bands = [
        {
            "operation_id": band["operation_id"],
            "machine_id": band["machine_id"],
            "unit_from": band["unit_from"],
            "unit_to": band["unit_to"],
            "assignment_mode": None,
            "untagged": False,
        }
        for band in _bands_from_unit_rows(fake_rows)
    ]
    for (op_id, machine_id), _times in sorted(untagged.items()):
        if op_id in tagged_ops:
            continue
        bands.append(
            {
                "operation_id": op_id,
                "machine_id": machine_id,
                "unit_from": 1,
                "unit_to": qty,
                "assignment_mode": None,
                "untagged": True,
            }
        )
    bands.sort(
        key=lambda band: (
            band["operation_id"],
            band["unit_from"],
            band["machine_id"] or 0,
        )
    )
    return bands


def _logs_for_band(
    logs: Sequence[ProductionLog], band: Dict[str, Any]
) -> List[ProductionLog]:
    if band.get("machine_id") is None:
        return []
    op_id = int(band["operation_id"])
    machine_id = int(band["machine_id"])
    unit_from = int(band["unit_from"])
    unit_to = int(band["unit_to"])
    tagged_only = not band.get("untagged")
    matched: List[ProductionLog] = []
    for log in logs:
        if int(log.operation_id) != op_id:
            continue
        if log.machine_id is None or int(log.machine_id) != machine_id:
            continue
        log_from = getattr(log, "unit_from", None)
        log_to = getattr(log, "unit_to", None)
        if log_from is None or log_to is None:
            if not tagged_only:
                matched.append(log)
            continue
        if int(log_to) < unit_from or int(log_from) > unit_to:
            continue
        matched.append(log)
    return matched


def _merge_live_and_history_bands(
    live: Sequence[Dict[str, Any]], history: Sequence[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    live_ops = {int(band["operation_id"]) for band in live}
    extra = [band for band in history if int(band["operation_id"]) not in live_ops]
    merged = list(live) + extra
    merged.sort(
        key=lambda band: (
            band["operation_id"],
            band["unit_from"],
            band["machine_id"] or 0,
        )
    )
    return merged


def _detail_bands(
    rows: Sequence[UnitScheduleItem], allocations: Sequence[PartOperationQtyMachineAllocation]
) -> List[Dict[str, Any]]:
    """Latest unit-schedule bands. Allocations only when there is no unit plan."""
    if rows:
        scheduled = _bands_from_unit_rows(rows)
        return [
            {
                "operation_id": band["operation_id"],
                "machine_id": band["machine_id"],
                "unit_from": band["unit_from"],
                "unit_to": band["unit_to"],
                "assignment_mode": band["assignment_mode"],
            }
            for band in scheduled
        ]
    bands = [
        {
            "operation_id": int(row.operation_id),
            "machine_id": int(row.machine_id),
            "unit_from": int(row.unit_from),
            "unit_to": int(row.unit_to),
            "assignment_mode": None,
        }
        for row in allocations
    ]
    bands.sort(key=lambda band: (band["operation_id"], band["unit_from"], band["machine_id"] or 0))
    return bands


def get_unit_wise_part_operation_details(
    db: Session,
    sale_order_id: int,
    part_id: int,
) -> Dict[str, Any]:
    """
    Unit-wise part details for Intelligent Scheduler.

    Each row's planned_* comes from planned_schedule_items for that operation.
    A missing planned window stays empty. It is not copied from unit schedule
    times, rescheduling_items, or production logs.
    actual_* comes from production logs.
    Bands come from the latest unit_schedule_items, not leftover allocations.
    schedule_version is the latest unit_schedule_items version.
    """
    order = db.query(Order).filter(Order.id == sale_order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    part = (
        db.query(Part)
        .filter(Part.id == part_id, Part.product_id == order.product_id)
        .first()
    )
    if not part:
        raise HTTPException(404, "Part not found for this order")

    rows = _latest_unit_schedule_rows(db, sale_order_id, part_id)
    allocations = (
        db.query(PartOperationQtyMachineAllocation)
        .filter(
            PartOperationQtyMachineAllocation.part_id == part_id,
            PartOperationQtyMachineAllocation.order_id == sale_order_id,
        )
        .all()
    )
    ops = (
        db.query(Operation)
        .filter(Operation.part_id == part_id)
        .order_by(Operation.operation_number.asc(), Operation.id.asc())
        .all()
    )
    op_by_id = {op.id: op for op in ops}
    logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.operation_id.in_(list(op_by_id)))
        .order_by(ProductionLog.created_at.asc())
        .all()
        if op_by_id
        else []
    )
    live_bands = _detail_bands(rows, allocations) if rows else []
    history_bands = _bands_from_production_logs(logs, int(part.qty or 0))
    if live_bands:
        bands = _merge_live_and_history_bands(live_bands, history_bands)
    else:
        bands = history_bands or _detail_bands([], allocations)
    if not bands:
        return {
            "sale_order_id": sale_order_id,
            "part_id": part_id,
            "schedule_version": None,
            "planned_start_time": None,
            "planned_end_time": None,
            "operations": [],
        }

    schedule_version = max((int(row.schedule_version) for row in rows), default=None)
    baseline = _baseline_planned_by_operation(db, sale_order_id, part_id)

    machine_ids = {band["machine_id"] for band in bands if band["machine_id"] is not None}
    machines = {
        machine.id: machine
        for machine in (
            db.query(Machine).filter(Machine.id.in_(list(machine_ids))).all()
            if machine_ids
            else []
        )
    }

    operations_out: List[Dict[str, Any]] = []
    for band in bands:
        op = op_by_id.get(band["operation_id"])
        if op is None:
            continue
        window = baseline.get(op.id) or {}
        planned_start = window.get("planned_start_time")
        planned_end = window.get("planned_end_time")
        band_logs = _logs_for_band(logs, band)
        actual_start, actual_end = _machine_actual_times(band_logs)
        operations_out.append(
            {
                "operation_id": op.id,
                "operation": f"{op.operation_number} - {op.operation_name}",
                "machine": _machine_display_name(machines.get(band["machine_id"])),
                "assignment_mode": band.get("assignment_mode"),
                "planned_start_time": planned_start,
                "planned_end_time": planned_end,
                "actual_start_time": actual_start,
                "actual_end_time": actual_end,
                "operation_status": _band_status(actual_start, actual_end),
                "machine_id": band["machine_id"],
                "unit_from": band["unit_from"],
                "unit_to": band["unit_to"],
            }
        )

    op_order = {op.id: index for index, op in enumerate(ops)}
    operations_out.sort(
        key=lambda row: (
            op_order.get(row["operation_id"], 10**9),
            row["unit_from"],
            row["machine_id"] or 0,
        )
    )

    starts = [
        row["planned_start_time"]
        for row in operations_out
        if row.get("planned_start_time")
    ]
    ends = [
        row["planned_end_time"]
        for row in operations_out
        if row.get("planned_end_time")
    ]
    planned_start_time = min(starts) if starts else None
    planned_end_time = max(ends) if ends else None

    return {
        "sale_order_id": sale_order_id,
        "part_id": part_id,
        "schedule_version": schedule_version,
        "planned_start_time": planned_start_time,
        "planned_end_time": planned_end_time,
        "operations": operations_out,
    }

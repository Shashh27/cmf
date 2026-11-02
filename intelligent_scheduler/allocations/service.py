"""
Qty→machine allocation service for Intelligent Scheduler (manual WC split).

Validates bands, persists replace-all, expands to machine_by_slot for greedy rebuild.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from DB.models.configuration import Machine
from DB.models.oms import Operation, Part
from DB.models.scheduling import (
    PartOperationQtyMachineAllocation,
    PartScheduleStatus,
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

    operations_ctx = []
    for op, machines in machines_by_op:
        approved = int(total_approved_for_operation(db, op.id) or 0)
        operations_ctx.append(
            {
                "operation_id": op.id,
                "operation_number": op.operation_number,
                "operation_name": op.operation_name,
                "workcenter_id": op.workcenter_id,
                "default_machine_id": op.machine_id,
                "approved_quantity": approved,
                "machines": [
                    {
                        "id": m.id,
                        "name": _machine_label(m),
                        "workcenter_id": m.work_center_id,
                        "occupied_until": occupancy.get(m.id, {}).get("occupied_until"),
                        "wip_parts": occupancy.get(m.id, {}).get("wip_parts", []),
                    }
                    for m in machines
                ],
            }
        )

    q = db.query(PartOperationQtyMachineAllocation).filter(
        PartOperationQtyMachineAllocation.part_id == part_id
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
                "id": r.id,
                "part_id": r.part_id,
                "order_id": r.order_id,
                "operation_id": r.operation_id,
                "unit_from": r.unit_from,
                "unit_to": r.unit_to,
                "machine_id": r.machine_id,
                "created_by": r.created_by,
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
    part, pss = _require_active_inhouse_part(db, part_id)
    effective_order_id = order_id if order_id is not None else pss.sale_order_id
    normalized = validate_allocation_bands(db, part_id, bands)

    (
        db.query(PartOperationQtyMachineAllocation)
        .filter(PartOperationQtyMachineAllocation.part_id == part_id)
        .delete(synchronize_session=False)
    )

    for b in normalized:
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

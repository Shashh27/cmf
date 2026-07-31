"""
Unit-wise greedy scheduler + NSGA-II optimizer entry via rebuild(optimizer=...).

Architecture
------------
Greedy → NSGA-II → Pareto Front → Policy Engine → Selected Production Schedule

Baseline: after parts are activated, rebuild plans every unit through
schedulable ops with pipeline overlap (Unit 1 can enter Op20 while Unit 2
is still on Op10).

After production: units 1..approved on an op are treated as done (no new
rows); remaining units are re-planned from actual/ready times.

Phase 2:
  - Shift placement uses ShiftHoursConfiguration via SchedulerEngine
  - Prefer machine from active job / rescheduling / operation.machine_id
  - Freeze machines with in-progress job cards (no start before now)
  - Rework slots after review use cycle-only (no re-setup)

Phase 4:
  - optimizer=nsga2 runs NSGA-II multi-objective optimization
  - Policy Engine selects the best schedule from the Pareto front
  - Best of greedy vs NSGA-II is persisted (source=greedy|nsga2)

Batch rescheduling_items are never modified here.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, time, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from DB.models.configuration import Machine, WorkCenter
from DB.models.oms import Operation, Order, OrderPartPriority, Part
from DB.models.scheduling import (
    PartScheduleStatus,
    ProductionLog,
    Rescheduling,
    UnitScheduleItem,
)
from production_log_helpers import (
    get_latest_reviewed_log,
    is_schedulable_operation,
    total_approved_for_operation,
)

logger = logging.getLogger(__name__)

IN_HOUSE_TYPE_ID = 1
DEFAULT_SHIFT_START = time(8, 30)
DEFAULT_SHIFT_END = time(17, 0)


def unit_wise_enabled() -> bool:
    return os.getenv("UNIT_WISE_SCHEDULE_ENABLED", "true").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _secs(t: Optional[time]) -> int:
    if t is None:
        return 0
    return t.hour * 3600 + t.minute * 60 + t.second


def _op_number_key(operation_number: Any) -> Tuple:
    try:
        return (0, int(operation_number))
    except (TypeError, ValueError):
        return (1, str(operation_number or ""))


def _duration(operation: Operation, skip_setup: bool) -> timedelta:
    setup = 0 if skip_setup else _secs(operation.setup_time)
    cycle = _secs(operation.cycle_time)
    total = setup + cycle
    if total <= 0:
        # Avoid zero-width segments
        total = 60
    return timedelta(seconds=total)


def _snap_to_shift_start(dt: datetime) -> datetime:
    """If outside default shift, move to next shift start (simple Phase-1 calendar)."""
    dt = _strip_tz(dt) or datetime.now()
    d = dt.date()
    start = datetime.combine(d, DEFAULT_SHIFT_START)
    end = datetime.combine(d, DEFAULT_SHIFT_END)
    if dt < start:
        return start
    if dt >= end:
        next_day = d + timedelta(days=1)
        # skip Sunday lightly
        while next_day.weekday() == 6:
            next_day += timedelta(days=1)
        return datetime.combine(next_day, DEFAULT_SHIFT_START)
    return dt


def _place_within_shifts(
    start: datetime, duration: timedelta
) -> List[Tuple[datetime, datetime]]:
    """
    Split a unit placement across default daily shifts if it overruns shift end.
    Fallback when SchedulerEngine is not used (tests / no DB calendar).
    """
    remaining = duration.total_seconds()
    cur = _snap_to_shift_start(start)
    segments: List[Tuple[datetime, datetime]] = []

    while remaining > 1e-6:
        day_end = datetime.combine(cur.date(), DEFAULT_SHIFT_END)
        if cur >= day_end:
            cur = _snap_to_shift_start(cur + timedelta(minutes=1))
            continue
        available = (day_end - cur).total_seconds()
        take = min(remaining, available)
        seg_end = cur + timedelta(seconds=take)
        segments.append((cur, seg_end))
        remaining -= take
        if remaining > 1e-6:
            cur = _snap_to_shift_start(seg_end + timedelta(minutes=1))
        else:
            cur = seg_end
    return segments


def _place_within_shifts_engine(
    engine,
    machine_id: Optional[int],
    start: datetime,
    duration: timedelta,
) -> List[Tuple[datetime, datetime]]:
    """
    Place duration using real ShiftHoursConfiguration via SchedulerEngine.
    Falls back to default windows if engine shift helpers fail.
    """
    try:
        remaining = duration.total_seconds()
        cur = _strip_tz(engine.adjust_to_shift(start, machine_id)) or start
        segments: List[Tuple[datetime, datetime]] = []
        for _ in range(500):
            if remaining <= 1e-6:
                break
            # Honour machine OFF windows
            machine = engine.db.query(Machine).filter(Machine.id == machine_id).first()
            if machine is not None:
                nxt = engine._machine_next_available(machine, cur)
                if nxt is None:
                    break
                cur = _strip_tz(nxt) or cur

            shift_end = _strip_tz(engine._shift_end_dt(cur, machine_id))
            if shift_end is None:
                return _place_within_shifts(cur, timedelta(seconds=remaining))
            if cur >= shift_end:
                cur = _strip_tz(engine._next_shift_start(cur, machine_id)) or (
                    cur + timedelta(days=1)
                )
                continue
            available = (shift_end - cur).total_seconds()
            if available <= 0:
                cur = _strip_tz(engine._next_shift_start(cur, machine_id)) or (
                    cur + timedelta(hours=1)
                )
                continue
            take = min(remaining, available)
            seg_end = cur + timedelta(seconds=take)
            segments.append((cur, seg_end))
            remaining -= take
            if remaining > 1e-6:
                cur = _strip_tz(engine._next_shift_start(seg_end, machine_id)) or (
                    seg_end + timedelta(minutes=1)
                )
            else:
                cur = seg_end
        return segments or _place_within_shifts(start, duration)
    except Exception:
        logger.exception(
            "Unit-wise shift placement via engine failed; using default shifts",
            extra={"event": "unit_wise_shift_fallback", "machine_id": machine_id},
        )
        return _place_within_shifts(start, duration)


def _preferred_machine_id(
    db: Session, operation: Operation, order_id: Optional[int] = None
) -> Optional[int]:
    """
    Prefer the machine already assigned in live schedule / active job / routing.
    Keeps unit-wise aligned with batch dynamic instead of jumping WC siblings.
    """
    active = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation.id,
            ProductionLog.operator_status == "inprogress",
        )
        .order_by(ProductionLog.id.desc())
        .first()
    )
    if active and active.machine_id:
        return int(active.machine_id)

    q = db.query(Rescheduling).filter(Rescheduling.operation_id == operation.id)
    if order_id is not None:
        q = q.filter(Rescheduling.order_id == order_id)
    ri = (
        q.filter(Rescheduling.machine_id.isnot(None))
        .order_by(Rescheduling.end_time.desc())
        .first()
    )
    if ri and ri.machine_id:
        return int(ri.machine_id)

    if getattr(operation, "machine_id", None):
        return int(operation.machine_id)
    return None


def _freeze_active_machines(
    db: Session, machine_free: Dict[int, datetime], now: datetime
) -> None:
    """Do not schedule other unit work before 'now' on machines with an active job."""
    active_logs = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operator_status == "inprogress",
            ProductionLog.machine_id.isnot(None),
        )
        .all()
    )
    for log in active_logs:
        mid = int(log.machine_id)
        machine_free[mid] = max(machine_free.get(mid, now), now)


def _populate_other_parts_machine_free(
    db: Session, machine_free: Dict[int, datetime], scope_part_ids: Set[int]
) -> None:
    """
    Ensure machines respect end times of existing scheduled items for parts
    outside the current rebuild scope.
    """
    if not scope_part_ids:
        return

    subq = (
        db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .filter(UnitScheduleItem.part_id.notin_(scope_part_ids))
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )

    rows = (
        db.query(
            UnitScheduleItem.machine_id,
            func.max(UnitScheduleItem.end_time).label("max_end"),
        )
        .join(
            subq,
            and_(
                UnitScheduleItem.part_id == subq.c.part_id,
                UnitScheduleItem.schedule_version == subq.c.max_version,
            ),
        )
        .filter(UnitScheduleItem.machine_id.isnot(None))
        .group_by(UnitScheduleItem.machine_id)
        .all()
    )

    for mid, max_end in rows:
        if mid and max_end:
            dt = _strip_tz(max_end)
            if dt:
                machine_free[int(mid)] = max(machine_free.get(int(mid), dt), dt)


def _rework_due_for_operation(db: Session, operation_id: int) -> int:
    latest = get_latest_reviewed_log(db, operation_id)
    if not latest:
        return 0
    return max(0, int(latest.rework_quantity or 0))


def _actual_end_for_operation(db: Session, operation_id: int) -> Optional[datetime]:
    logs = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.to_date.isnot(None),
            ProductionLog.to_time.isnot(None),
        )
        .all()
    )
    best = None
    for log in logs:
        try:
            end = datetime.combine(log.to_date, log.to_time)
        except Exception:
            continue
        end = _strip_tz(end)
        if best is None or end > best:
            best = end
    return best


def _schedulable_operations(db: Session, part_id: int) -> List[Operation]:
    ops = (
        db.query(Operation)
        .filter(Operation.part_id == part_id)
        .all()
    )
    ops = [op for op in ops if is_schedulable_operation(db, op)]
    ops.sort(key=lambda o: _op_number_key(o.operation_number))
    return ops


def _machines_for_workcenter(db: Session, workcenter_id: Optional[int]) -> List[Machine]:
    if workcenter_id is None:
        return []
    return (
        db.query(Machine)
        .filter(Machine.work_center_id == workcenter_id)
        .order_by(Machine.id.asc())
        .all()
    )


def _pick_machine(
    machines: List[Machine],
    machine_free: Dict[int, datetime],
    ready: datetime,
    preferred_id: Optional[int] = None,
) -> Optional[Machine]:
    if not machines:
        return None
    if preferred_id is not None:
        for m in machines:
            if m.id == preferred_id:
                return m
    best = None
    best_start = None
    for m in machines:
        free = machine_free.get(m.id, ready)
        cand = max(free, ready)
        if best_start is None or cand < best_start:
            best = m
            best_start = cand
    return best


def _load_active_scope(
    db: Session, part_id: Optional[int] = None, order_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Active IN-House parts with order + priority.
    """
    q = (
        db.query(PartScheduleStatus, Part, Order, OrderPartPriority)
        .join(Part, Part.id == PartScheduleStatus.part_id)
        .join(Order, Order.id == PartScheduleStatus.sale_order_id)
        .outerjoin(
            OrderPartPriority,
            (OrderPartPriority.part_id == Part.id)
            & (OrderPartPriority.order_id == Order.id),
        )
        .filter(
            PartScheduleStatus.status == "active",
            Part.type_id == IN_HOUSE_TYPE_ID,
        )
    )
    if part_id is not None and part_id > 0:
        q = q.filter(Part.id == part_id)
    if order_id is not None and order_id > 0:
        q = q.filter(Order.id == order_id)

    rows = q.all()
    scope: List[Dict[str, Any]] = []
    for pss, part, order, opp in rows:
        qty = int(part.qty or 0)
        if qty <= 0:
            continue
        scope.append(
            {
                "part": part,
                "order": order,
                "priority": int(opp.priority) if opp and opp.priority else 999,
                "activation": _strip_tz(pss.start_date) or _strip_tz(datetime.now()),
                "qty": qty,
            }
        )
    scope.sort(key=lambda x: (x["priority"], x["part"].id))
    return scope


def _default_unit_order(qty: int) -> List[int]:
    return list(range(1, qty + 1))


def simulate_unit_plan(
    db: Session,
    scope: List[Dict[str, Any]],
    *,
    engine,
    now: Optional[datetime] = None,
    unit_order_by_part: Optional[Dict[int, List[int]]] = None,
    machine_by_slot: Optional[Dict[Tuple[int, int, int], int]] = None,
    source: str = "greedy",
) -> Dict[str, Any]:
    """
    Build in-memory unit segments for scope without writing to DB.

    unit_order_by_part: optional per-part processing order of unit indexes.
    machine_by_slot: optional (part_id, operation_id, unit_index) -> machine_id.
      When set, overrides earliest/preferred picker for that slot.
      Preferred pin still wins when UNIT_WISE_PIN_PREFERRED is on (default)
      unless the slot override equals an allowed WC machine and pin is off.
    """
    unit_order_by_part = unit_order_by_part or {}
    machine_by_slot = machine_by_slot or {}
    pin_preferred = os.getenv("UNIT_WISE_PIN_PREFERRED", "true").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )

    now = _strip_tz(now) or _strip_tz(datetime.now()) or datetime.now()
    machine_free: Dict[int, datetime] = {}
    machine_last_ctx: Dict[int, Tuple[int, int]] = {}
    _freeze_active_machines(db, machine_free, now)
    scope_part_ids = {item["part"].id for item in scope if item.get("part")}
    _populate_other_parts_machine_free(db, machine_free, scope_part_ids)

    segments_out: List[Dict[str, Any]] = []

    for item in scope:
        part: Part = item["part"]
        order: Order = item["order"]
        qty = item["qty"]
        try:
            part_start = engine.adjust_to_shift(max(item["activation"] or now, now))
            part_start = _strip_tz(part_start) or now
        except Exception:
            part_start = max(item["activation"] or now, now)
            part_start = _snap_to_shift_start(part_start)

        ops = _schedulable_operations(db, part.id)
        if not ops:
            continue

        order_units = unit_order_by_part.get(part.id) or _default_unit_order(qty)
        # Ensure all unit indexes present exactly once
        missing = [u for u in range(1, qty + 1) if u not in order_units]
        order_units = [u for u in order_units if 1 <= u <= qty] + missing

        unit_ready: Dict[int, datetime] = {u: part_start for u in range(1, qty + 1)}

        for operation in ops:
            approved = int(total_approved_for_operation(db, operation.id) or 0)
            actual_end = _actual_end_for_operation(db, operation.id)
            rework_due = _rework_due_for_operation(db, operation.id)
            machines = _machines_for_workcenter(db, operation.workcenter_id)
            preferred_id = _preferred_machine_id(db, operation, order.id)

            if preferred_id and not any(m.id == preferred_id for m in machines):
                pref_m = db.query(Machine).filter(Machine.id == preferred_id).first()
                if pref_m:
                    machines = [pref_m] + list(machines)

            if not machines:
                logger.warning(
                    "Unit-wise: no machines for workcenter",
                    extra={
                        "event": "unit_wise_no_machine",
                        "part_id": part.id,
                        "operation_id": operation.id,
                        "workcenter_id": operation.workcenter_id,
                    },
                )
                continue

            for u in range(1, min(approved, qty) + 1):
                done_at = actual_end or unit_ready[u]
                unit_ready[u] = max(unit_ready[u], done_at)

            op_run_started = approved > 0
            remaining_set = set(range(approved + 1, qty + 1))
            remaining_units = [u for u in order_units if u in remaining_set]

            for rem_i, u in enumerate(remaining_units):
                slot_key = (part.id, operation.id, u)
                override_mid = machine_by_slot.get(slot_key)

                machine = None
                if pin_preferred and preferred_id is not None:
                    machine = _pick_machine(
                        machines, machine_free, unit_ready[u], preferred_id=preferred_id
                    )
                elif override_mid is not None:
                    machine = next((m for m in machines if m.id == override_mid), None)
                    if machine is None:
                        machine = _pick_machine(
                            machines,
                            machine_free,
                            unit_ready[u],
                            preferred_id=preferred_id,
                        )
                else:
                    machine = _pick_machine(
                        machines, machine_free, unit_ready[u], preferred_id=preferred_id
                    )
                if machine is None:
                    continue

                ready = unit_ready[u]
                free = machine_free.get(machine.id, ready)
                start_candidate = max(ready, free, now)

                prev_ctx = machine_last_ctx.get(machine.id)
                same_run = prev_ctx == (part.id, operation.id)
                is_rework_slot = rem_i < rework_due
                skip_setup = same_run or op_run_started or is_rework_slot
                duration = _duration(operation, skip_setup=skip_setup)
                op_run_started = True

                placed = _place_within_shifts_engine(
                    engine, machine.id, start_candidate, duration
                )
                if not placed:
                    continue

                for seg_start, seg_end in placed:
                    segments_out.append(
                        {
                            "order_id": order.id,
                            "order_number": order.sale_order_number,
                            "part_id": part.id,
                            "part_number": part.part_number,
                            "unit_index": u,
                            "operation_id": operation.id,
                            "operation_number": str(operation.operation_number),
                            "machine_id": machine.id,
                            "start_time": seg_start,
                            "end_time": seg_end,
                            "status": "unit_scheduled",
                            "source": source,
                        }
                    )

                last_end = placed[-1][1]
                machine_free[machine.id] = last_end
                machine_last_ctx[machine.id] = (part.id, operation.id)
                unit_ready[u] = last_end

    makespan_h = None
    if segments_out:
        starts = [s["start_time"] for s in segments_out]
        ends = [s["end_time"] for s in segments_out]
        makespan_h = round((max(ends) - min(starts)).total_seconds() / 3600.0, 4)

    return {
        "segments": segments_out,
        "makespan_hours": makespan_h,
        "segment_count": len(segments_out),
        "source": source,
    }


def rebuild_unit_schedule(
    db: Session,
    part_id: Optional[int] = None,
    order_id: Optional[int] = None,
    commit: bool = True,
    optimizer: Optional[str] = None,
    policy: str = "balanced",
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Delete existing unit rows for scope and insert a fresh plan.

    Single optimization path: Greedy → NSGA-II → Policy Engine → Final Schedule

    optimizer: "greedy" (default) | "nsga2" | "ga" | "ga_research" (all GA variants
               use NSGA-II internally)
    policy: Policy Engine selection policy (default "balanced").
            Options: balanced, throughput, minimum_setup, minimum_makespan,
                     rush_order, energy_efficient
    debug: if True, include profiling metrics in the ga metadata (dev mode only).
    Env UNIT_WISE_OPTIMIZER overrides default when optimizer is None.
    """
    if not unit_wise_enabled():
        return {
            "success": False,
            "message": "Unit-wise scheduling is disabled (UNIT_WISE_SCHEDULE_ENABLED).",
            "rows_inserted": 0,
            "schedule_version": None,
            "parts": 0,
        }

    opt = (optimizer or os.getenv("UNIT_WISE_OPTIMIZER", "greedy") or "greedy").lower()
    # All GA-mode aliases use NSGA-II
    if opt not in ("greedy", "nsga2", "ga", "ga_research"):
        opt = "greedy"
    use_nsga2 = opt in ("nsga2", "ga", "ga_research")

    scope = _load_active_scope(db, part_id=part_id, order_id=order_id)
    if not scope:
        return {
            "success": True,
            "message": "No active parts in scope.",
            "rows_inserted": 0,
            "schedule_version": None,
            "parts": 0,
            "optimizer": "nsga2" if use_nsga2 else "greedy",
        }

    part_ids = [item["part"].id for item in scope]
    deleted = (
        db.query(UnitScheduleItem)
        .filter(UnitScheduleItem.part_id.in_(part_ids))
        .delete(synchronize_session=False)
    )

    max_ver = db.query(func.max(UnitScheduleItem.schedule_version)).scalar() or 0
    version = int(max_ver) + 1

    from algorithm import SchedulerEngine

    engine = SchedulerEngine(db)
    now = _strip_tz(datetime.now()) or datetime.now()

    ga_meta: Dict[str, Any] = {}
    if use_nsga2:
        from unit_wise_ga_research import optimize_unit_plan_research

        plan = optimize_unit_plan_research(
            db,
            scope,
            engine=engine,
            now=now,
            policy=policy,
            debug=debug,
        )
        ga_meta = plan.get("ga") or {}
    else:
        plan = simulate_unit_plan(
            db, scope, engine=engine, now=now, source="greedy"
        )

    new_rows: List[UnitScheduleItem] = []
    for seg in plan.get("segments") or []:
        new_rows.append(
            UnitScheduleItem(
                order_id=seg["order_id"],
                order_number=seg["order_number"],
                part_id=seg["part_id"],
                part_number=seg["part_number"],
                unit_index=seg["unit_index"],
                operation_id=seg["operation_id"],
                operation_number=seg["operation_number"],
                machine_id=seg["machine_id"],
                start_time=seg["start_time"],
                end_time=seg["end_time"],
                status=seg.get("status") or "unit_scheduled",
                schedule_version=version,
                source=seg.get("source") or opt,
            )
        )

    if new_rows:
        db.add_all(new_rows)
    if commit:
        db.commit()
    else:
        db.flush()

    source = plan.get("source") or ("nsga2" if use_nsga2 else "greedy")
    objectives = plan.get("objectives") or {}

    logger.info(
        "Unit-wise rebuild completed",
        extra={
            "event": "unit_wise_rebuild_completed",
            "parts": len(scope),
            "rows_inserted": len(new_rows),
            "rows_deleted": deleted,
            "schedule_version": version,
            "part_id": part_id,
            "order_id": order_id,
            "optimizer": "nsga2" if use_nsga2 else "greedy",
            "policy": policy if use_nsga2 else None,
            "source": source,
            "makespan_hours": plan.get("makespan_hours"),
        },
    )

    # ── Production API response ─────────────────────────────────────
    # Business-relevant fields only. Debug/profiling data is behind debug=True.
    response: Dict[str, Any] = {
        "success": True,
        "message": (
            f"Unit-wise ({source}) schedule built for {len(scope)} part(s), "
            f"{len(new_rows)} segment(s), version {version}."
        ),
        "optimizer": "nsga2" if use_nsga2 else "greedy",
        "policy": policy if use_nsga2 else None,
        "selected": ga_meta.get("selected", source),
        "improved": ga_meta.get("improved", False),
        "lead_time_met": ga_meta.get("lead_time_met", None),
        "makespan_hours": plan.get("makespan_hours"),
        "machine_utilization": objectives.get("avg_utilization_pct"),
        "setup_count": objectives.get("setup_count"),
        "priority_adherence": (
            objectives.get("priority_inversions") == 0
            if objectives.get("priority_inversions") is not None
            else None
        ),
        "rows_inserted": len(new_rows),
        "rows_deleted": deleted,
        "schedule_version": version,
        "parts": len(scope),
        "part_ids": part_ids,
        "source": source,
    }

    # Expose debug data only in dev mode
    if debug and ga_meta:
        response["_debug"] = {
            "ga_meta": ga_meta,
            "performance": ga_meta.get("_debug_performance"),
        }

    return response


def list_unit_schedule(
    db: Session,
    part_id: Optional[int] = None,
    order_id: Optional[int] = None,
    machine_id: Optional[int] = None,
    latest_only: bool = True,
) -> List[UnitScheduleItem]:
    q = db.query(UnitScheduleItem)
    if part_id is not None and part_id > 0:
        q = q.filter(UnitScheduleItem.part_id == part_id)
    if order_id is not None and order_id > 0:
        q = q.filter(UnitScheduleItem.order_id == order_id)
    if machine_id is not None and machine_id > 0:
        q = q.filter(UnitScheduleItem.machine_id == machine_id)

    if latest_only:
        subq = (
            db.query(
                UnitScheduleItem.part_id,
                func.max(UnitScheduleItem.schedule_version).label("max_version"),
            )
            .group_by(UnitScheduleItem.part_id)
            .subquery()
        )
        q = q.join(
            subq,
            and_(
                UnitScheduleItem.part_id == subq.c.part_id,
                UnitScheduleItem.schedule_version == subq.c.max_version,
            ),
        )

    return (
        q.order_by(
            UnitScheduleItem.start_time.asc(),
            UnitScheduleItem.part_id.asc(),
            UnitScheduleItem.unit_index.asc(),
            UnitScheduleItem.operation_number.asc(),
        ).all()
    )


def unit_item_to_dict(row: UnitScheduleItem) -> Dict[str, Any]:
    return {
        "id": row.id,
        "order_id": row.order_id,
        "order_number": row.order_number,
        "part_id": row.part_id,
        "part_number": row.part_number,
        "unit_index": row.unit_index,
        "operation_id": row.operation_id,
        "operation_number": row.operation_number,
        "machine_id": row.machine_id,
        "start_time": row.start_time.isoformat() if row.start_time else None,
        "end_time": row.end_time.isoformat() if row.end_time else None,
        "status": row.status,
        "schedule_version": row.schedule_version,
        "source": row.source,
        "label": f"{row.part_number} #{row.unit_index} Op{row.operation_number}",
    }

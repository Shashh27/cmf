"""
Unit-wise greedy scheduler + NSGA-II optimizer entry via rebuild(optimizer=...).

TEST BED for shop-floor utilization (manager: implicit WC pick + qty-wise
split + unit pipelining). Does NOT write scheduling.rescheduling_items —
batch dynamic / shop-floor Gantt stays production-safe and unchanged.

Architecture
------------
Greedy → NSGA-II → Pareto Front → Policy Engine → Selected Production Schedule

Baseline: after parts are activated, rebuild plans every unit through
schedulable ops with pipeline overlap (Unit 1 can enter Op20 while Unit 2
is still on Op10).

After production: units 1..approved on an op are treated as done (no new
rows). Each finished unit keeps its own end time so it can enter the next
op immediately (Unit 1 Op20 while Unit 2+ still on Op10). Remaining units
on the same op start from the last completed unit's **actual / continuity**
end (qty 10, 5 done → unit 6 from 5th-unit end). Prefer production-log
actual_end over batch rescheduling_items remaining-row start — the latter
embeds upstream batch cascade and collapses pipelining (e.g. Op30 waiting
for Op20's full remaining block).

Scheduling rules (greedy):
  - Part order: oms.order_part_priorities (active, priority > 0)
  - Part earliest start: scheduling.part_schedule_status.start_date (activation)
  - No closed production yet: the live rescheduling_items start floors op
    starts, and planned_schedule_items is used only when that live row is
    missing. The floor applies only to units not yet advanced by an upstream
    op (never before activation).
  - Fully completed / partial upstream op: each unit's ready time is THAT
    unit's end on the predecessor.
  - After partial complete: a closed job card holds only the machine that
    closed it. The next remaining unit on that machine starts at or after
    that card's to_time. A unit on another machine starts from its predecessor
    ready time and that machine's own free time. With no per-machine card,
    the rescheduling handoff still floors the first remaining unit.
  - Setup: charge setup on a machine the first time that (part, op) lands on
    it in this plan. Skip setup only for the same machine continuing the same
    (part, op) run, or for rework slots. Do NOT skip setup for unit 2+ merely
    because unit 1 already ran the op on a different WC sibling.
  - Machine pick: per (part, operation) assignment_mode stored on
    unit_schedule_items. Default process_plan (hard-pin routing machine).
    auto = earliest-free in the work centre. manual = saved qty bands.
  - Rework with approved=0 and a closed job card: remaining starts at
    max(ready, machine free, actual_end, now)
  - Shifts / OFF: SchedulerEngine + ShiftHoursConfiguration

Phase 2:
  - Shift placement uses ShiftHoursConfiguration via SchedulerEngine
  - OT: no machine assignments → whole shop uses the day's full window (incl. NEXT);
    any assignment → only those machines get OT, others stay on GENERAL
  - Mid-shift breakdown splits segments (resume at MachineStatus.available_to)
  - Prefer machine from active job / rescheduling / operation.machine_id
    only when UNIT_WISE_PIN_PREFERRED=true
  - Freeze machines with in-progress job cards (no start before now)
  - Rework slots after review use cycle-only (no re-setup)

Batch rescheduling_items are never modified here.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, time
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import and_, func
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from time_utils import now_ist, to_naive_ist

from DB.models.configuration import Machine, WorkCenter
from DB.models.oms import Operation, Order, OrderPartPriority, Part
from DB.models.scheduling import (
    MachineStatus,
    PartScheduleStatus,
    ProductionLog,
    Rescheduling,
    UnitScheduleItem,
    PartOperationQtyMachineAllocation,
    PlannedScheduleItem,
)
from production_log_helpers import (
    compute_work_due_breakdown,
    get_latest_reviewed_log,
    is_schedulable_operation,
    total_approved_for_operation,
)

logger = logging.getLogger(__name__)

IN_HOUSE_TYPE_ID = 1
STATUS_OFF = 2  # MachineStatus.status_id when machine is OFF / breakdown
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
    """Naive IST clock. Aware UTC values are shifted +05:30, not dropped to UTC."""
    return to_naive_ist(dt)


def _secs(t) -> int:
    from algorithm import _duration_to_seconds
    return _duration_to_seconds(t)


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
    dt = _strip_tz(dt) or now_ist()
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


def _next_breakdown_start(
    db: Session, machine_id: int, cur: datetime, shift_end: datetime
) -> Optional[datetime]:
    """Earliest breakdown OFF window starting after cur and before shift_end."""
    row = (
        db.query(MachineStatus)
        .filter(
            and_(
                MachineStatus.machine_id == machine_id,
                MachineStatus.status_id == STATUS_OFF,
                MachineStatus.available_from > cur,
                MachineStatus.available_from < shift_end,
            )
        )
        .order_by(MachineStatus.available_from.asc())
        .first()
    )
    if row and row.available_from:
        return _strip_tz(row.available_from)
    return None


def _breakdown_covering(
    db: Session, machine_id: int, at: datetime
) -> Optional[MachineStatus]:
    """OFF/breakdown row covering at (available_from <= at < available_to)."""
    return (
        db.query(MachineStatus)
        .filter(
            and_(
                MachineStatus.machine_id == machine_id,
                MachineStatus.status_id == STATUS_OFF,
                MachineStatus.available_from <= at,
                (
                    (MachineStatus.available_to.is_(None))
                    | (MachineStatus.available_to > at)
                ),
            )
        )
        .first()
    )


def _place_within_shifts_engine(
    engine,
    machine_id: Optional[int],
    start: datetime,
    duration: timedelta,
    *,
    machine_cache: Optional[Dict[int, Machine]] = None,
) -> List[Tuple[datetime, datetime]]:
    """
    Place duration using real ShiftHoursConfiguration via SchedulerEngine.

    Mirrors dynamic scheduling: splits around mid-shift breakdown windows
    (resume at available_to) and respects per-machine shift / OT rules.

    Fail-closed: returns [] when placement cannot complete (never silently
    substitutes the hardcoded 08:30–17:00 fallback calendar).
    """
    try:
        remaining = duration.total_seconds()
        needed = remaining
        cur = _strip_tz(engine.adjust_to_shift(start, machine_id)) or start
        segments: List[Tuple[datetime, datetime]] = []
        machine = None
        if machine_id is not None:
            if machine_cache is not None and machine_id in machine_cache:
                machine = machine_cache[machine_id]
            else:
                machine = engine.db.query(Machine).filter(Machine.id == machine_id).first()
                if machine_cache is not None and machine is not None:
                    machine_cache[machine_id] = machine

        for _ in range(500):
            if remaining <= 1e-6:
                break
            if machine is not None:
                nxt = engine._machine_next_available(machine, cur)
                if nxt is None:
                    logger.warning(
                        "Unit-wise: machine permanently OFF during placement",
                        extra={
                            "event": "unit_wise_machine_permanently_off",
                            "machine_id": machine_id,
                            "remaining_seconds": remaining,
                        },
                    )
                    return []
                cur = _strip_tz(nxt) or cur

            shift_end = _strip_tz(engine._shift_end_dt(cur, machine_id))
            if shift_end is None:
                logger.error(
                    "Unit-wise: no shift end for placement",
                    extra={"event": "unit_wise_shift_end_missing", "machine_id": machine_id},
                )
                return []
            if cur >= shift_end:
                cur = _strip_tz(engine._next_shift_start(cur, machine_id)) or (
                    cur + timedelta(days=1)
                )
                continue

            off_start = None
            if machine_id is not None:
                off_start = _next_breakdown_start(engine.db, machine_id, cur, shift_end)

            window_end = min(shift_end, off_start) if off_start else shift_end
            available = (window_end - cur).total_seconds()
            if available <= 1e-6:
                if off_start and window_end == off_start:
                    off = _breakdown_covering(engine.db, machine_id, cur) or (
                        engine.db.query(MachineStatus)
                        .filter(
                            and_(
                                MachineStatus.machine_id == machine_id,
                                MachineStatus.status_id == STATUS_OFF,
                                MachineStatus.available_from == off_start,
                            )
                        )
                        .first()
                    )
                    if off and off.available_to:
                        cur = _strip_tz(
                            engine.adjust_to_shift(off.available_to, machine_id)
                        ) or cur
                    else:
                        return []
                else:
                    cur = _strip_tz(engine._next_shift_start(cur, machine_id)) or (
                        cur + timedelta(hours=1)
                    )
                continue

            take = min(remaining, available)
            seg_end = cur + timedelta(seconds=take)
            segments.append((cur, seg_end))
            remaining -= take

            if remaining <= 1e-6:
                break

            # More duration left — advance past breakdown or shift boundary
            if off_start and seg_end >= off_start:
                off = (
                    engine.db.query(MachineStatus)
                    .filter(
                        and_(
                            MachineStatus.machine_id == machine_id,
                            MachineStatus.status_id == STATUS_OFF,
                            MachineStatus.available_from == off_start,
                        )
                    )
                    .first()
                )
                if off and off.available_to:
                    cur = _strip_tz(
                        engine.adjust_to_shift(off.available_to, machine_id)
                    ) or cur
                else:
                    return []
            elif seg_end >= shift_end:
                cur = _strip_tz(engine._next_shift_start(seg_end, machine_id)) or (
                    seg_end + timedelta(minutes=1)
                )
            else:
                cur = seg_end

        if remaining > 1e-6:
            logger.warning(
                "Unit-wise shift placement incomplete",
                extra={
                    "event": "unit_wise_shift_incomplete",
                    "machine_id": machine_id,
                    "remaining_seconds": remaining,
                    "needed_seconds": needed,
                },
            )
            return []
        return segments
    except Exception:
        logger.exception(
            "Unit-wise shift placement via engine failed",
            extra={"event": "unit_wise_shift_fallback", "machine_id": machine_id},
        )
        return []


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


def _estimate_inprogress_end(db: Session, log: ProductionLog, now: datetime) -> datetime:
    """
    Estimate when an in-progress job card frees the machine.
    Prefer live rescheduling end_time; else from_date/time + one cycle; else now.
    """
    free_at = now
    if log.from_date and log.from_time:
        try:
            free_at = max(
                free_at,
                datetime.combine(log.from_date, log.from_time),
            )
        except Exception:
            pass

    if log.operation_id:
        ri = (
            db.query(Rescheduling)
            .filter(
                Rescheduling.operation_id == log.operation_id,
                Rescheduling.machine_id == log.machine_id,
            )
            .order_by(Rescheduling.end_time.desc())
            .first()
        )
        if ri and ri.end_time:
            et = _strip_tz(ri.end_time)
            if et and et > free_at:
                return et

        op = db.query(Operation).filter(Operation.id == log.operation_id).first()
        if op:
            cycle = _secs(op.cycle_time)
            if cycle > 0:
                return free_at + timedelta(seconds=cycle)
    return free_at


def _freeze_active_machines(
    db: Session, machine_free: Dict[int, datetime], now: datetime
) -> None:
    """
    Do not schedule other unit work on a machine until the active job is expected
    to finish (not merely 'now' — that double-books with the live job card).
    """
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
        free_at = _estimate_inprogress_end(db, log, now)
        machine_free[mid] = max(machine_free.get(mid, free_at), free_at)


def _populate_other_parts_machine_free(
    db: Session,
    machine_free: Dict[int, datetime],
    scope_part_ids: Set[int],
    ignore_part_ids: Optional[Set[int]] = None,
) -> None:
    """
    Ensure machines respect end times of existing scheduled items for parts
    outside the current rebuild scope.

    ignore_part_ids are lower-priority parts this rebuild is allowed to
    place ahead of. Their old bars must not block the part being planned.
    """
    if not scope_part_ids:
        return

    outside = [UnitScheduleItem.part_id.notin_(scope_part_ids)]
    if ignore_part_ids:
        outside.append(UnitScheduleItem.part_id.notin_(ignore_part_ids))
    subq = (
        db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .filter(*outside)
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )

    rows = (
        db.query(
            UnitScheduleItem.operation_id,
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
        .group_by(UnitScheduleItem.operation_id, UnitScheduleItem.machine_id)
        .all()
    )

    closed_ops = _closed_operation_ids(
        db, {int(op_id) for op_id, _, _ in rows if op_id is not None}
    )
    for op_id, mid, max_end in rows:
        if op_id is not None and int(op_id) in closed_ops:
            continue
        if mid and max_end:
            dt = _strip_tz(max_end)
            if dt:
                machine_free[int(mid)] = max(machine_free.get(int(mid), dt), dt)


def _rework_due_for_operation(db: Session, operation_id: int, part_qty: int, approved: int) -> int:
    """Rework slots still due, capped to remaining-to-close (same as production ledger)."""
    latest = get_latest_reviewed_log(db, operation_id)
    breakdown = compute_work_due_breakdown(part_qty, approved, latest)
    return int(breakdown.get("rework_due") or 0)


def _actual_end_for_operation(db: Session, operation_id: int) -> Optional[datetime]:
    """
    Latest closed job-card end (operator submitted to_date + to_time).

    Matches dynamic scheduling: any finished run counts, including supervisor
    review still sitting as status=inprogress with rework_quantity set.
    Open runs (to_time NULL) are ignored — those freeze the machine separately.
    """
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
            dt = datetime.combine(log.to_date, log.to_time)
            dt = _strip_tz(dt)
            if dt and (best is None or dt > best):
                best = dt
        except Exception:
            continue
    return best


def _closed_end_by_machine(db: Session, operation_id: int) -> Dict[int, datetime]:
    """Latest closed to_time on this operation, one entry per machine.

    A card with no machine_id is omitted here. The operation-wide latest end
    still comes from _actual_end_for_operation.
    """
    logs = (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == operation_id,
            ProductionLog.to_date.isnot(None),
            ProductionLog.to_time.isnot(None),
            ProductionLog.machine_id.isnot(None),
        )
        .all()
    )
    ends: Dict[int, datetime] = {}
    for log in logs:
        try:
            dt = _strip_tz(datetime.combine(log.to_date, log.to_time))
        except Exception:
            continue
        if dt is None or log.machine_id is None:
            continue
        machine_id = int(log.machine_id)
        current = ends.get(machine_id)
        if current is None or dt > current:
            ends[machine_id] = dt
    return ends


def _apply_closed_card_continuity(
    *,
    machine_free: Dict[int, datetime],
    unit_ready: Dict[int, datetime],
    remaining_set: Set[int],
    closed_by_machine: Dict[int, datetime],
    completed_run_end: Optional[datetime],
    part_pin: bool,
    preferred_id: Optional[int],
) -> None:
    """Hold each closed card on the machine that finished it.

    When at least one card names a machine, do not push that end onto the
    lowest remaining unit index. A unit on another machine keeps its
    predecessor ready time. With no per-machine card, the batch handoff
    still floors the first remaining unit, and a hard pin holds the
    preferred machine.
    """
    for machine_id, end in closed_by_machine.items():
        existing = machine_free.get(int(machine_id))
        if existing is None or end > existing:
            machine_free[int(machine_id)] = end
    if closed_by_machine:
        return
    if completed_run_end is None or not remaining_set:
        return
    first_remaining = min(remaining_set)
    unit_ready[first_remaining] = max(unit_ready[first_remaining], completed_run_end)
    if part_pin and preferred_id is not None:
        existing = machine_free.get(preferred_id)
        if existing is None or completed_run_end > existing:
            machine_free[preferred_id] = completed_run_end


def _rescheduling_completed_handoff(
    db: Session,
    operation_id: int,
    *,
    order_id: Optional[int],
    qty: int,
    approved: int,
) -> Optional[datetime]:
    """
    End time of the last completed unit from scheduling.rescheduling_items.

    Example: part qty=10, approved=5 → time the 5th unit finished, which is
    when unit 6 may start on this operation.

    Two live-table shapes:
      - Remaining-work plan after partial complete (completed_qty > 0, or
        remaining_qty already at leftover scale) → first row start_time.
      - Original full-qty plan still present → end_time of the first row
        whose remaining_qty has dropped to leftover (qty - approved).
    """
    if approved <= 0 or qty <= 0:
        return None

    leftover = max(0, qty - approved)
    q = db.query(Rescheduling).filter(
        Rescheduling.operation_id == operation_id,
        Rescheduling.start_time.isnot(None),
        Rescheduling.end_time.isnot(None),
    )
    if order_id is not None:
        q = q.filter(Rescheduling.order_id == order_id)
    rows = q.order_by(Rescheduling.start_time.asc(), Rescheduling.id.asc()).all()
    if not rows:
        return None

    rem_values = [r.remaining_qty for r in rows if r.remaining_qty is not None]
    max_rem = max(rem_values) if rem_values else None
    any_completed_flag = any((r.completed_qty or 0) > 0 for r in rows)

    # Remaining-work rows only: unit 6 starts when those rows start.
    if leftover < qty and (
        any_completed_flag
        or (max_rem is not None and max_rem <= leftover)
    ):
        return _strip_tz(rows[0].start_time)

    if leftover == 0:
        return _strip_tz(max(r.end_time for r in rows if r.end_time))

    for row in rows:
        if row.remaining_qty is not None and row.remaining_qty <= leftover:
            return _strip_tz(row.end_time)
    return None


def _completed_run_end(
    db: Session,
    operation_id: int,
    *,
    order_id: Optional[int],
    qty: int,
    approved: int,
    actual_end: Optional[datetime] = None,
) -> Optional[datetime]:
    """
    When remaining units may start after completed qty on THIS operation.

    Prefer production-log actual_end (same-op continuity). Batch
    rescheduling_items remaining-row start often embeds upstream cascade
    (Op30 waiting for Op20's full remaining block) and collapses unit
    pipelining — use it only when there is no actual end.
    """
    if actual_end is None:
        actual_end = _actual_end_for_operation(db, operation_id)
    if actual_end is not None:
        return actual_end
    return _rescheduling_completed_handoff(
        db,
        operation_id,
        order_id=order_id,
        qty=qty,
        approved=approved,
    )


def _walk_back_cycle_ends(
    last_end: datetime, count: int, cycle: timedelta
) -> Dict[int, datetime]:
    """Unit `count` ended at last_end; earlier units ended one cycle earlier."""
    if count <= 0 or last_end is None:
        return {}
    if cycle.total_seconds() <= 0:
        cycle = timedelta(seconds=60)
    ends: Dict[int, datetime] = {}
    t = last_end
    for u in range(count, 0, -1):
        ends[u] = t
        t = t - cycle
    return ends


def _unit_ends_from_full_plan_rows(
    rows: List[Any], qty: int
) -> Dict[int, datetime]:
    """Map remaining_qty step-down on a full-qty plan to per-unit end times."""
    ends: Dict[int, datetime] = {}
    prev_done = 0
    for row in rows:
        rem = row.remaining_qty
        if rem is None:
            continue
        done = max(0, min(qty, qty - int(rem)))
        if done <= prev_done:
            continue
        n = done - prev_done
        start = _strip_tz(row.start_time)
        end = _strip_tz(row.end_time)
        if start is None or end is None:
            continue
        span = (end - start).total_seconds()
        for i, u in enumerate(range(prev_done + 1, done + 1), start=1):
            frac = i / n
            ends[u] = start + timedelta(seconds=span * frac)
        prev_done = done
    return ends


def _log_approved_finish(log) -> Optional[datetime]:
    """Finish time of one reviewed log. Unreviewed or open logs do not hand off."""
    approved = getattr(log, "approved_quantity", None)
    if approved is None or int(approved) <= 0:
        return None
    if getattr(log, "user_id", None) is None:
        return None
    to_date = getattr(log, "to_date", None)
    to_time = getattr(log, "to_time", None)
    if to_date is None or to_time is None:
        return None
    try:
        return _strip_tz(datetime.combine(to_date, to_time))
    except Exception:
        return None


def _stamp_approved_units(logs, bands, qty: int) -> Dict[int, datetime]:
    """
    Map each reviewed log onto unit indexes.

    One log has one to_time, so every unit it approves is ready at that time.
    An earlier log keeps the low end of its machine band. A later log on the
    same machine takes only the next free units and does not move the earlier ones.
    """
    by_machine: Dict[int, List[int]] = {}
    for band in sorted(bands, key=lambda item: (int(item["machine_id"]), int(item["unit_from"]))):
        machine_id = int(band["machine_id"])
        by_machine.setdefault(machine_id, [])
        for unit in range(int(band["unit_from"]), int(band["unit_to"]) + 1):
            if 1 <= unit <= qty and unit not in by_machine[machine_id]:
                by_machine[machine_id].append(unit)

    ends: Dict[int, datetime] = {}
    used: Set[int] = set()
    ordered = sorted(logs, key=lambda log: int(getattr(log, "id", 0) or 0))
    for log in ordered:
        finish = _log_approved_finish(log)
        if finish is None:
            continue
        approved = int(log.approved_quantity)
        machine_id = getattr(log, "machine_id", None)
        if machine_id is not None and int(machine_id) in by_machine:
            source = by_machine[int(machine_id)]
        elif not by_machine:
            source = list(range(1, qty + 1))
        else:
            continue
        taken = [unit for unit in source if unit not in used][:approved]
        for unit in taken:
            ends[unit] = finish
            used.add(unit)
    return ends


def _approved_unit_ready_times(
    db: Session, operation_id: int, order_id: Optional[int], qty: int
) -> Dict[int, datetime]:
    """Next-op ready time per unit from the production log that approved it."""
    raw_logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.operation_id == operation_id)
        .order_by(ProductionLog.id.asc())
        .all()
    )
    logs = [log for log in raw_logs if _log_approved_finish(log) is not None]
    if not logs:
        return {}

    query = db.query(PartOperationQtyMachineAllocation).filter(
        PartOperationQtyMachineAllocation.operation_id == operation_id
    )
    if order_id is not None:
        query = query.filter(PartOperationQtyMachineAllocation.order_id == order_id)
    bands = [
        {"machine_id": row.machine_id, "unit_from": row.unit_from, "unit_to": row.unit_to}
        for row in query.all()
        if getattr(row, "machine_id", None) is not None
        and getattr(row, "unit_from", None) is not None
        and getattr(row, "unit_to", None) is not None
    ]
    return _stamp_approved_units(logs, bands, qty)


def _per_unit_operation_ends(
    db: Session,
    operation: Operation,
    *,
    order_id: Optional[int],
    qty: int,
    approved: int,
    completed_run_end: Optional[datetime],
) -> Dict[int, datetime]:
    """
    Per-unit end times on this operation for pipelining into the next op.

    Unit 1's next-op ready time is Unit 1's end here — not the 5th/last unit.
    """
    ends: Dict[int, datetime] = {}
    if qty <= 0:
        return ends

    q = db.query(Rescheduling).filter(
        Rescheduling.operation_id == operation.id,
        Rescheduling.start_time.isnot(None),
        Rescheduling.end_time.isnot(None),
    )
    if order_id is not None:
        q = q.filter(Rescheduling.order_id == order_id)
    rows = q.order_by(Rescheduling.start_time.asc(), Rescheduling.id.asc()).all()

    leftover = max(0, qty - approved) if approved > 0 else qty
    rem_values = [r.remaining_qty for r in rows if r.remaining_qty is not None]
    max_rem = max(rem_values) if rem_values else None
    any_completed_flag = any((r.completed_qty or 0) > 0 for r in rows)
    is_remaining_plan = (
        approved > 0
        and leftover < qty
        and leftover > 0
        and (
            any_completed_flag
            or (max_rem is not None and max_rem <= leftover)
        )
    )
    cycle = _duration(operation, skip_setup=True)

    if rows and not is_remaining_plan:
        ends.update(_unit_ends_from_full_plan_rows(rows, qty))

    if is_remaining_plan and rows:
        # Continuity end for approved units: prefer completed_run_end (actual)
        # over batch remaining-row start (may be upstream cascade).
        fifth_end = completed_run_end or _strip_tz(rows[0].start_time)
        if fifth_end and approved > 0:
            ends.update(_walk_back_cycle_ends(fifth_end, approved, cycle))

    if approved > 0 and completed_run_end is not None:
        n = qty if approved >= qty else approved
        if n not in ends:
            walked = _walk_back_cycle_ends(completed_run_end, n, cycle)
            for u, t in walked.items():
                ends.setdefault(u, t)
        ends[n] = completed_run_end

    # A reviewed production log replaces the batch plan for the units it approved.
    # Every unit on that log shares its to_time. Later logs do not move earlier units.
    for unit, finish in _approved_unit_ready_times(db, operation.id, order_id, qty).items():
        ends[unit] = finish
    return ends


def _planned_start_for_operation(db: Session, operation_id: int) -> Optional[datetime]:
    """Earliest planned start for this operation (deterministic order)."""
    row = (
        db.query(PlannedScheduleItem)
        .filter(
            PlannedScheduleItem.operation_id == operation_id,
            PlannedScheduleItem.planned_start_time.isnot(None),
        )
        .order_by(PlannedScheduleItem.planned_start_time.asc())
        .first()
    )
    return _strip_tz(row.planned_start_time) if row else None


def _virgin_op_floor(
    db: Session, operation_id: int, order_id: Optional[int] = None
) -> Optional[datetime]:
    """
    Earliest start for an operation that has not been produced yet.

    The live rescheduling_items start wins. planned_schedule_items is only
    the fallback when the live plan has no row for this operation.
    """
    query = db.query(Rescheduling).filter(
        Rescheduling.operation_id == operation_id,
        Rescheduling.start_time.isnot(None),
        Rescheduling.status.in_(("scheduled", "rescheduled")),
    )
    if order_id is not None:
        query = query.filter(Rescheduling.order_id == order_id)
    row = query.order_by(Rescheduling.start_time.asc(), Rescheduling.id.asc()).first()
    if row is not None and row.start_time is not None:
        return _strip_tz(row.start_time)
    return _planned_start_for_operation(db, operation_id)


def _closed_operation_ids(db: Session, operation_ids: Set[int]) -> Set[int]:
    """Operations whose approved quantity already covers the part quantity."""
    if not operation_ids:
        return set()
    try:
        approved = (
            db.query(
                ProductionLog.operation_id.label("operation_id"),
                func.coalesce(func.sum(ProductionLog.approved_quantity), 0).label("approved"),
            )
            .filter(
                ProductionLog.operation_id.in_(list(operation_ids)),
                ProductionLog.approved_quantity.isnot(None),
            )
            .group_by(ProductionLog.operation_id)
            .subquery()
        )
        rows = (
            db.query(Operation.id)
            .join(Part, Part.id == Operation.part_id)
            .outerjoin(approved, approved.c.operation_id == Operation.id)
            .filter(
                Operation.id.in_(list(operation_ids)),
                Part.qty.isnot(None),
                Part.qty > 0,
                func.coalesce(approved.c.approved, 0) >= Part.qty,
            )
            .all()
        )
    except OperationalError:
        logger.warning(
            "Could not read approved quantities while checking closed operations",
            extra={"event": "unit_wise_closed_ops_unavailable"},
        )
        return set()
    return {int(operation_id) for (operation_id,) in rows}


def drop_closed_operation_unit_rows(db: Session, operation_id: int) -> int:
    """
    Remove unit bars for an operation that is already fully approved.

    Partial work stays. A later unit rebuild still plans any remaining units.
    """
    if int(operation_id) not in _closed_operation_ids(db, {int(operation_id)}):
        return 0
    deleted = (
        db.query(UnitScheduleItem)
        .filter(UnitScheduleItem.operation_id == operation_id)
        .delete(synchronize_session=False)
    )
    return int(deleted or 0)


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
    engine=None,
    *,
    hard_pin: bool = False,
) -> Optional[Machine]:
    """
    Pick a workcenter machine for one unit.

    hard_pin=True  → always use preferred when present (explicit / shop pin).
    hard_pin=False → earliest available in the WC (implicit / qty-wise split);
                     preferred_id is only a tie-break when start times equal.
    """
    if not machines:
        return None
    if hard_pin and preferred_id is not None:
        for m in machines:
            if m.id == preferred_id:
                return m
    best = None
    best_start = None
    for m in machines:
        free = machine_free.get(m.id, ready)
        cand = max(free, ready)
        if engine is not None:
            avail = engine._machine_next_available(m, cand)
            if avail is None:
                continue
            cand = _strip_tz(avail) or cand
        if best_start is None or cand < best_start:
            best = m
            best_start = cand
        elif (
            preferred_id is not None
            and m.id == preferred_id
            and best_start is not None
            and cand == best_start
        ):
            best = m
    return best


def _load_active_scope(
    db: Session, part_id: Optional[int] = None, order_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Active IN-House parts with order + priority.

    - Priority from oms.order_part_priorities (active, priority > 0 only)
    - Activation from scheduling.part_schedule_status.start_date
      (fallback: created_at, then now) — NOT rebuild clock time
    """
    q = (
        db.query(PartScheduleStatus, Part, Order, OrderPartPriority)
        .join(Part, Part.id == PartScheduleStatus.part_id)
        .join(Order, Order.id == PartScheduleStatus.sale_order_id)
        .outerjoin(
            OrderPartPriority,
            (OrderPartPriority.part_id == Part.id)
            & (OrderPartPriority.order_id == Order.id)
            & (OrderPartPriority.status == "active")
            & (OrderPartPriority.priority > 0),
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
        activation = (
            _strip_tz(pss.start_date)
            or _strip_tz(getattr(pss, "created_at", None))
            or _strip_tz(now_ist())
        )
        scope.append(
            {
                "part": part,
                "order": order,
                "priority": int(opp.priority) if opp and opp.priority else 999,
                "activation": activation,
                "qty": qty,
            }
        )
    # Lower priority number = higher urgency (same as batch / order_part_priorities)
    scope.sort(key=lambda x: (x["priority"], x["part"].id))
    return scope


def _default_unit_order(qty: int) -> List[int]:
    return list(range(1, qty + 1))


def _part_activation_start(engine, activation: Optional[datetime], now: datetime) -> datetime:
    """
    Earliest unit-ready time for a part = part_schedule_status activation,
    snapped onto configured shifts. Does not force rebuild 'now'.
    """
    base = _strip_tz(activation) or _strip_tz(now) or now_ist()
    try:
        snapped = engine.adjust_to_shift(base)
        return _strip_tz(snapped) or base
    except Exception:
        return _snap_to_shift_start(base)


def _priority_by_part(db: Session) -> Dict[int, int]:
    """Active order_part_priorities. A lower number is more urgent. Missing parts are not listed."""
    rows = (
        db.query(OrderPartPriority.part_id, OrderPartPriority.priority)
        .filter(
            OrderPartPriority.status == "active",
            OrderPartPriority.priority > 0,
        )
        .all()
    )
    return {int(part_id): int(priority) for part_id, priority in rows}


def _part_ids_to_displace(
    focal_priority: int,
    priority_by_part: Dict[int, int],
    booked_part_ids: Set[int],
    focal_ids: Set[int],
) -> List[int]:
    """
    Lower-priority parts (higher number) that already have bars on a machine
    the part being rebuilt used. More urgent of those parts come first.
    """
    displaced = []
    for part_id in booked_part_ids:
        if part_id in focal_ids:
            continue
        priority = int(priority_by_part.get(part_id, 999))
        if priority > int(focal_priority):
            displaced.append(int(part_id))
    displaced.sort(key=lambda part_id: (int(priority_by_part.get(part_id, 999)), part_id))
    return displaced


def _parts_with_rows_on_machines(
    db: Session, machine_ids: Set[int], exclude_part_ids: Set[int]
) -> Set[int]:
    """Parts whose latest unit schedule uses one of these machines."""
    if not machine_ids:
        return set()
    subq = (
        db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )
    query = (
        db.query(UnitScheduleItem.part_id)
        .join(
            subq,
            and_(
                UnitScheduleItem.part_id == subq.c.part_id,
                UnitScheduleItem.schedule_version == subq.c.max_version,
            ),
        )
        .filter(UnitScheduleItem.machine_id.in_(list(machine_ids)))
    )
    if exclude_part_ids:
        query = query.filter(UnitScheduleItem.part_id.notin_(list(exclude_part_ids)))
    return {int(part_id) for (part_id,) in query.distinct().all()}


VALID_ASSIGNMENT_MODES = ("auto", "process_plan", "manual")
DEFAULT_ASSIGNMENT_MODE = "process_plan"


def _normalize_assignment_mode(
    raw: Optional[str], default: str = DEFAULT_ASSIGNMENT_MODE
) -> str:
    mode = (raw or "").lower().strip()
    if mode in VALID_ASSIGNMENT_MODES:
        return mode
    fallback = (default or DEFAULT_ASSIGNMENT_MODE).lower().strip()
    return fallback if fallback in VALID_ASSIGNMENT_MODES else DEFAULT_ASSIGNMENT_MODE


def _normalize_operation_assignment_modes(
    raw: Optional[Dict[Any, Any]],
) -> Dict[int, str]:
    """Coerce {operation_id: mode} keys to int. Invalid modes are dropped."""
    if not raw:
        return {}
    out: Dict[int, str] = {}
    for key, value in raw.items():
        try:
            op_id = int(key)
        except (TypeError, ValueError):
            continue
        mode = (value or "").lower().strip() if isinstance(value, str) else ""
        if mode in VALID_ASSIGNMENT_MODES:
            out[op_id] = mode
    return out


def _resolve_part_plan(
    part_id: int,
    assignment_mode: Optional[str],
    assignment_mode_by_part: Optional[Dict[int, str]],
    pin_preferred: bool,
) -> Tuple[str, bool]:
    """
    Mode and hard-pin for one part.

    Kept for callers that still pass a part-wide map. New planning uses
    _resolve_operation_plan. A per-part map keeps manual / process_plan / auto.
    Without that map, the rebuild default is process_plan (not auto).
    """
    if assignment_mode_by_part is not None:
        raw = (assignment_mode_by_part.get(part_id) or DEFAULT_ASSIGNMENT_MODE)
        mode = _normalize_assignment_mode(raw)
        return mode, mode == "process_plan"
    if assignment_mode:
        mode = _normalize_assignment_mode(assignment_mode)
        return mode, bool(pin_preferred)
    return (assignment_mode or "auto"), bool(pin_preferred)


def _resolve_operation_plan(
    part_id: int,
    operation_id: int,
    *,
    stored_by_operation: Optional[Dict[Tuple[int, int], str]] = None,
    overrides: Optional[Dict[int, str]] = None,
    assignment_mode_by_part: Optional[Dict[int, str]] = None,
    default_mode: Optional[str] = None,
) -> Tuple[str, bool]:
    """
    Mode and hard-pin for one operation.

    override > stored (part, op) > part-wide map > part-level default > process_plan.
    process_plan hard-pins the routing machine; auto/manual do not.
    """
    raw = None
    if overrides and operation_id in overrides:
        raw = overrides[operation_id]
    elif stored_by_operation and (part_id, operation_id) in stored_by_operation:
        raw = stored_by_operation[(part_id, operation_id)]
    elif assignment_mode_by_part and part_id in assignment_mode_by_part:
        raw = assignment_mode_by_part[part_id]
    elif default_mode:
        raw = default_mode
    mode = _normalize_assignment_mode(raw)
    return mode, mode == "process_plan"


def _latest_assignment_mode_by_part(db: Session, part_ids: List[int]) -> Dict[int, str]:
    """Mode stored on each part's latest unit_schedule_items rows. Missing parts are omitted."""
    if not part_ids:
        return {}
    subq = (
        db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .filter(UnitScheduleItem.part_id.in_(part_ids))
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )
    rows = (
        db.query(UnitScheduleItem.part_id, UnitScheduleItem.assignment_mode)
        .join(
            subq,
            and_(
                UnitScheduleItem.part_id == subq.c.part_id,
                UnitScheduleItem.schedule_version == subq.c.max_version,
            ),
        )
        .all()
    )
    modes: Dict[int, str] = {}
    for part_id, mode in rows:
        if part_id in modes or not mode:
            continue
        raw = str(mode).lower().strip()
        if raw in VALID_ASSIGNMENT_MODES:
            modes[int(part_id)] = raw
    return modes


def _latest_assignment_mode_by_operation(
    db: Session, part_ids: List[int]
) -> Dict[Tuple[int, int], str]:
    """Latest assignment_mode per (part_id, operation_id). Missing ops are omitted."""
    if not part_ids:
        return {}
    subq = (
        db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .filter(UnitScheduleItem.part_id.in_(part_ids))
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )
    rows = (
        db.query(
            UnitScheduleItem.part_id,
            UnitScheduleItem.operation_id,
            UnitScheduleItem.assignment_mode,
        )
        .join(
            subq,
            and_(
                UnitScheduleItem.part_id == subq.c.part_id,
                UnitScheduleItem.schedule_version == subq.c.max_version,
            ),
        )
        .all()
    )
    modes: Dict[Tuple[int, int], str] = {}
    for part_id, operation_id, mode in rows:
        key = (int(part_id), int(operation_id))
        if key in modes or not mode:
            continue
        raw = str(mode).lower().strip()
        if raw in VALID_ASSIGNMENT_MODES:
            modes[key] = raw
    return modes


def simulate_unit_plan(
    db: Session,
    scope: List[Dict[str, Any]],
    *,
    engine,
    now: Optional[datetime] = None,
    unit_order_by_part: Optional[Dict[int, List[int]]] = None,
    machine_by_slot: Optional[Dict[Tuple[int, int, int], int]] = None,
    source: str = "greedy",
    pin_preferred: Optional[bool] = None,
    preferred_machine_id: Optional[int] = None,
    assignment_mode: Optional[str] = None,
    assignment_mode_by_part: Optional[Dict[int, str]] = None,
    assignment_mode_by_operation: Optional[Dict[Tuple[int, int], str]] = None,
    operation_assignment_modes: Optional[Dict[int, str]] = None,
    suppress_other_part_ids: Optional[Set[int]] = None,
) -> Dict[str, Any]:
    """
    Build in-memory unit segments for scope without writing to DB.

    unit_order_by_part: optional per-part processing order of unit indexes.
    machine_by_slot: optional (part_id, operation_id, unit_index) -> machine_id.
    pin_preferred: when True, hard-pin preferred machine (no WC qty split).
      When False, earliest-free WC (qty-wise split). None → server default false.
    preferred_machine_id: when pin_preferred, force this machine for ops whose
      workcenter contains it (batch all remaining units onto that spindle).
    assignment_mode: part-level default only for ops with no stored mode and
      no override. Per-operation mode is stored on unit_schedule_items.
    assignment_mode_by_operation: latest stored mode keyed (part_id, operation_id).
    operation_assignment_modes: rebuild overrides keyed by operation_id.
    """
    unit_order_by_part = unit_order_by_part or {}
    machine_by_slot = machine_by_slot or {}
    operation_assignment_modes = _normalize_operation_assignment_modes(
        operation_assignment_modes
    )
    assignment_mode_by_operation = assignment_mode_by_operation or {}
    if pin_preferred is None:
        pin_preferred = os.getenv("UNIT_WISE_PIN_PREFERRED", "true").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
    else:
        pin_preferred = bool(pin_preferred)

    now = _strip_tz(now) or now_ist()
    machine_free: Dict[int, datetime] = {}
    machine_last_ctx: Dict[int, Tuple[int, int]] = {}
    machine_cache: Dict[int, Machine] = {}
    _freeze_active_machines(db, machine_free, now)
    scope_part_ids = {item["part"].id for item in scope if item.get("part")}
    _populate_other_parts_machine_free(
        db,
        machine_free,
        scope_part_ids,
        ignore_part_ids=suppress_other_part_ids,
    )

    segments_out: List[Dict[str, Any]] = []

    for item in scope:
        part: Part = item["part"]
        order: Order = item["order"]
        qty = item["qty"]
        # Activation = part_schedule_status.start_date (not rebuild clock)
        part_start = _part_activation_start(engine, item.get("activation"), now)

        ops = _schedulable_operations(db, part.id)
        if not ops:
            continue

        order_units = unit_order_by_part.get(part.id) or _default_unit_order(qty)
        # Ensure all unit indexes present exactly once
        missing = [u for u in range(1, qty + 1) if u not in order_units]
        order_units = [u for u in order_units if 1 <= u <= qty] + missing
        unit_ready: Dict[int, datetime] = {u: part_start for u in range(1, qty + 1)}
        # Units that failed placement on an upstream op must not appear downstream
        blocked_units: Set[int] = set()
        # Units whose ready time already comes from an upstream placement or a
        # completed predecessor — must not be re-floored by batch planned_start.
        pipeline_advanced: Set[int] = set()

        for operation in ops:
            approved = int(total_approved_for_operation(db, operation.id) or 0)
            approved = max(0, min(approved, qty))
            actual_end = _actual_end_for_operation(db, operation.id)
            completed_run_end = _completed_run_end(
                db,
                operation.id,
                order_id=order.id,
                qty=qty,
                approved=approved,
                actual_end=actual_end,
            )
            floor_start = _virgin_op_floor(db, operation.id, order_id=order.id)
            rework_due = _rework_due_for_operation(db, operation.id, qty, approved)
            machines = _machines_for_workcenter(db, operation.workcenter_id)
            op_mode, op_pin = _resolve_operation_plan(
                part.id,
                operation.id,
                stored_by_operation=assignment_mode_by_operation,
                overrides=operation_assignment_modes,
                assignment_mode_by_part=assignment_mode_by_part,
                default_mode=assignment_mode,
            )
            preferred_id = _preferred_machine_id(db, operation, order.id)
            # Frontend Intelligent Scheduler: explicit machine pin for this WC
            if (
                op_pin
                and preferred_machine_id is not None
                and any(m.id == preferred_machine_id for m in machines)
            ):
                preferred_id = preferred_machine_id

            # Preferred pin only if the machine belongs to this work center
            # (do not inject foreign-WC machines into the eligible set).
            if preferred_id and not any(m.id == preferred_id for m in machines):
                logger.info(
                    "Unit-wise: preferred machine outside work center — ignored",
                    extra={
                        "event": "unit_wise_preferred_outside_wc",
                        "part_id": part.id,
                        "operation_id": operation.id,
                        "preferred_id": preferred_id,
                        "workcenter_id": operation.workcenter_id,
                    },
                )
                preferred_id = None

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
                # Block all remaining units for this and later ops
                for u in range(1, qty + 1):
                    if u > approved:
                        blocked_units.add(u)
                continue

            # Per-unit predecessor ends — Unit 1 of the next op starts when
            # Unit 1 finished THIS op, not when Unit 5/N finished (batch).
            unit_ends = _per_unit_operation_ends(
                db,
                operation,
                order_id=order.id,
                qty=qty,
                approved=approved,
                completed_run_end=completed_run_end,
            )
            if approved > 0:
                last_done = qty if approved >= qty else approved
                for u in range(1, last_done + 1):
                    if u in unit_ends:
                        unit_ready[u] = unit_ends[u]
                        pipeline_advanced.add(u)
                    elif completed_run_end is not None and u == last_done:
                        unit_ready[u] = completed_run_end
                        pipeline_advanced.add(u)

            # Virgin floor ONLY for units not yet advanced by upstream
            # placement/completion. The floor is the live reschedule start
            # (planned_schedule_items only when that row is missing). Applying
            # it to every unit forces Op N+1 unit 1 to wait for Op N unit N.
            if floor_start is not None and approved == 0 and completed_run_end is None:
                for u in range(1, qty + 1):
                    if u in pipeline_advanced:
                        continue
                    unit_ready[u] = max(unit_ready[u], floor_start)

            remaining_to_close = max(0, qty - approved)
            # Remaining units approved+1..qty. With soft WC pick they may run
            # in parallel on different machines (qty-wise split).
            remaining_set = set(range(approved + 1, qty + 1))
            if remaining_to_close > len(remaining_set) and rework_due > 0:
                # Fully approved but rework still due — re-queue last rework_due units
                for u in range(max(1, qty - rework_due + 1), qty + 1):
                    remaining_set.add(u)

            # A closed card holds only its own machine. The batch handoff
            # still floors the first remaining unit when no card names a machine.
            _apply_closed_card_continuity(
                machine_free=machine_free,
                unit_ready=unit_ready,
                remaining_set=remaining_set,
                closed_by_machine=_closed_end_by_machine(db, operation.id),
                completed_run_end=completed_run_end,
                part_pin=op_pin,
                preferred_id=preferred_id,
            )

            remaining_units = [
                u for u in order_units if u in remaining_set and u not in blocked_units
            ]

            # Closed production on this op (approve / job-card to_time /
            # rescheduling handoff). Must NOT clamp virgin unit starts to
            # rebuild clock — only rework (approved=0 + closed card) uses now.
            has_production = approved > 0 or completed_run_end is not None
            # Shop-floor: machine that already produced this op is already set up.
            # Seed machine_last_ctx so the first remaining unit on that spindle
            # skips setup; a different WC sibling still pays setup.
            if has_production and preferred_id is not None:
                machine_last_ctx[preferred_id] = (part.id, operation.id)

            for rem_i, u in enumerate(remaining_units):
                slot_key = (part.id, operation.id, u)
                override_mid = (
                    machine_by_slot.get(slot_key) if op_mode == "manual" else None
                )

                # Explicit slot map (manual qty→machine) always wins when valid.
                machine = None
                if override_mid is not None:
                    machine = next((m for m in machines if m.id == override_mid), None)
                    if machine is None:
                        logger.warning(
                            "machine_by_slot machine %s not in WC for part=%s op=%s unit=%s",
                            override_mid,
                            part.id,
                            operation.id,
                            u,
                        )
                if machine is None:
                    machine = _pick_machine(
                        machines,
                        machine_free,
                        unit_ready[u],
                        preferred_id=preferred_id,
                        engine=engine,
                        hard_pin=op_pin,
                    )
                if machine is None:
                    blocked_units.add(u)
                    continue

                ready = unit_ready[u]
                free = machine_free.get(machine.id, ready)
                # Virgin plan: activation / planned / machine free (may be in the
                # past — same paper baseline as dynamic/rescheduling_items).
                # Partial remaining (5 of 10 done): start from 5th-unit end in
                # rescheduling_items — do not pull forward to rebuild-now.
                # Rework with approved=0: still do not start before now.
                start_candidate = max(ready, free)
                if has_production and approved == 0:
                    start_candidate = max(start_candidate, now)

                prev_ctx = machine_last_ctx.get(machine.id)
                same_run = prev_ctx == (part.id, operation.id)
                is_rework_slot = rem_i < rework_due
                # Per-machine setup only — never skip just because another
                # unit already ran this op on a different machine.
                skip_setup = same_run or is_rework_slot
                duration = _duration(operation, skip_setup=skip_setup)

                placed = _place_within_shifts_engine(
                    engine,
                    machine.id,
                    start_candidate,
                    duration,
                    machine_cache=machine_cache,
                )
                if not placed:
                    blocked_units.add(u)
                    continue

                for seg_start, seg_end in placed:
                    segments_out.append(
                        {
                            "order_id": order.id,
                            "order_number": order.sale_order_number,
                            "part_id": part.id,
                            "part_number": part.part_number,
                            "part_name": part.part_name,
                            "unit_index": u,
                            "operation_id": operation.id,
                            "operation_number": str(operation.operation_number),
                            "operation_name": operation.operation_name,
                            "machine_id": machine.id,
                            "start_time": seg_start,
                            "end_time": seg_end,
                            "status": "unit_scheduled",
                            "source": source,
                            "assignment_mode": op_mode,
                        }
                    )

                last_end = placed[-1][1]
                machine_free[machine.id] = last_end
                machine_last_ctx[machine.id] = (part.id, operation.id)
                unit_ready[u] = last_end
                pipeline_advanced.add(u)

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


def rebuild_unit_schedule_after_priority_swap(db: Session) -> Dict[str, Any]:
    """
    Replan every active part once, in priority order, keeping each part's mode.

    Called only after the production dynamic_reschedule has already committed.
    Writes unit_schedule_items only.
    """
    return rebuild_unit_schedule(
        db,
        commit=True,
        optimizer="greedy",
        preserve_part_modes=True,
    )


def rebuild_unit_schedule(
    db: Session,
    part_id: Optional[int] = None,
    order_id: Optional[int] = None,
    commit: bool = True,
    optimizer: Optional[str] = None,
    policy: str = "balanced",
    debug: bool = False,
    ga_overrides: Optional[Dict[str, Any]] = None,
    pin_preferred: Optional[bool] = None,
    preferred_machine_id: Optional[int] = None,
    assignment_mode: Optional[str] = None,
    machine_by_slot: Optional[Dict[Tuple[int, int, int], int]] = None,
    preserve_part_modes: bool = False,
    operation_assignment_modes: Optional[Dict[int, str]] = None,
) -> Dict[str, Any]:
    """
    Delete existing unit rows for scope and insert a fresh plan.

    assignment_mode is only the default for operations with no stored mode
    and no override. Per-operation modes live on unit_schedule_items.
    operation_assignment_modes: optional {operation_id: mode} overrides.
    pin_preferred / preferred_machine_id remain for backward compatibility.
    """
    # Always allow rebuild from API / Intelligent Scheduler (env gate removed).
    overrides = _normalize_operation_assignment_modes(operation_assignment_modes)
    mode = (assignment_mode or "").lower().strip() if assignment_mode else None
    if mode and mode not in VALID_ASSIGNMENT_MODES:
        mode = None
    # Part-level mode no longer pins every operation. Per-op resolve does.
    if mode == "manual" or "manual" in overrides.values():
        pin_preferred = False
        preferred_machine_id = None
    elif mode == "process_plan":
        preferred_machine_id = None  # Use routing's machine_id, not UI-selected
    elif mode == "auto":
        pin_preferred = False

    opt = (optimizer or os.getenv("UNIT_WISE_OPTIMIZER", "greedy") or "greedy").lower()
    # All GA-mode aliases use NSGA-II
    if opt not in ("greedy", "nsga2", "ga", "ga_research"):
        opt = "greedy"
    use_nsga2 = opt in ("nsga2", "ga", "ga_research")

    if (mode == "manual" or "manual" in overrides.values()) and use_nsga2:
        raise ValueError(
            'assignment_mode="manual" requires optimizer="greedy" '
            "(GA does not honor qty→machine allocations yet)."
        )

    scope = _load_active_scope(db, part_id=part_id, order_id=order_id)
    if not scope:
        # No active parts to plan — still drop stale unit-wise rows so a full
        # deactivate + rebuild does not leave orphan Gantt bars in the DB.
        clear_q = db.query(UnitScheduleItem)
        if part_id is not None:
            clear_q = clear_q.filter(UnitScheduleItem.part_id == part_id)
        elif order_id is not None:
            clear_q = clear_q.filter(UnitScheduleItem.order_id == order_id)
        cleared = clear_q.delete(synchronize_session=False)
        if commit:
            db.commit()
        else:
            db.flush()
        logger.info(
            "Unit-wise rebuild: empty active scope — cleared stale rows",
            extra={
                "event": "unit_wise_rebuild_empty_scope_cleared",
                "part_id": part_id,
                "order_id": order_id,
                "rows_cleared": cleared,
            },
        )
        return {
            "success": True,
            "message": (
                "No active parts in scope."
                + (f" Cleared {cleared} stale unit_schedule_items." if cleared else "")
            ),
            "rows_inserted": 0,
            "rows_cleared": cleared,
            "schedule_version": None,
            "parts": 0,
            "optimizer": "nsga2" if use_nsga2 else "greedy",
        }

    part_ids = [item["part"].id for item in scope]
    deleted = 0
    version = 0
    new_rows: List[UnitScheduleItem] = []
    plan: Dict[str, Any] = {}
    ga_meta: Dict[str, Any] = {}

    try:
        # Optimize BEFORE delete so long NSGA-II runs do not hold row locks
        # (which blocked concurrent rebuilds and hung the API).
        from algorithm import SchedulerEngine

        engine = SchedulerEngine(db)
        now = now_ist()

        slot_map = machine_by_slot
        stored_by_op = _latest_assignment_mode_by_operation(db, part_ids)
        if preserve_part_modes:
            # Read before delete. Shop-wide plan keeps each operation's mode.
            use_nsga2 = False
            opt = "greedy"
            pin_preferred = False
            preferred_machine_id = None
            overrides = {}
        stored_modes = set(stored_by_op.values())
        override_modes = set(overrides.values())
        mixed_or_manual = (
            "manual" in stored_modes
            or "manual" in override_modes
            or len(stored_modes | override_modes | ({mode} if mode else set())) > 1
        )
        if mixed_or_manual:
            use_nsga2 = False
            opt = "greedy"
        if slot_map is None and (
            mode == "manual"
            or "manual" in stored_modes
            or "manual" in override_modes
        ):
            from intelligent_scheduler.service import load_machine_by_slot_for_parts

            slot_map = load_machine_by_slot_for_parts(db, part_ids)
        slot_map = slot_map or {}

        if use_nsga2:
            from unit_wise_ga_research import optimize_unit_plan_research

            plan = optimize_unit_plan_research(
                db,
                scope,
                engine=engine,
                now=now,
                policy=policy,
                debug=debug,
                config_overrides=ga_overrides,
                pin_preferred=pin_preferred,
                preferred_machine_id=preferred_machine_id,
                assignment_mode=mode or DEFAULT_ASSIGNMENT_MODE,
            )
            ga_meta = plan.get("ga") or {}
        else:
            plan_kwargs = dict(
                engine=engine,
                now=now,
                source="greedy",
                pin_preferred=False,
                preferred_machine_id=preferred_machine_id,
                machine_by_slot=slot_map if slot_map else None,
                assignment_mode=mode,
                assignment_mode_by_part=None,
                assignment_mode_by_operation=stored_by_op,
                operation_assignment_modes=overrides or None,
            )
            if part_id is not None and not preserve_part_modes:
                priorities = _priority_by_part(db)
                focal_ids = {int(item["part"].id) for item in scope}
                focal_priority = min(int(item.get("priority") or 999) for item in scope)
                lower_ids = {
                    pid
                    for pid, pri in priorities.items()
                    if pid not in focal_ids and int(pri) > focal_priority
                }
                probe = simulate_unit_plan(
                    db,
                    scope,
                    suppress_other_part_ids=lower_ids or None,
                    **plan_kwargs,
                )
                machines_used = {
                    int(seg["machine_id"])
                    for seg in (probe.get("segments") or [])
                    if seg.get("machine_id") is not None
                }
                booked = _parts_with_rows_on_machines(db, machines_used, focal_ids)
                for pid in booked:
                    priorities.setdefault(pid, 999)
                displace_ids = _part_ids_to_displace(
                    focal_priority, priorities, booked, focal_ids
                )
                by_id = {
                    int(item["part"].id): item for item in _load_active_scope(db)
                } if displace_ids else {}
                displaced_items = [by_id[pid] for pid in displace_ids if pid in by_id]
                if displaced_items:
                    scope = list(scope) + displaced_items
                    part_ids = [int(item["part"].id) for item in scope]
                    stored_by_op = _latest_assignment_mode_by_operation(db, part_ids)
                    from intelligent_scheduler.service import (
                        load_machine_by_slot_for_parts,
                    )

                    slot_map = {
                        **(slot_map or {}),
                        **load_machine_by_slot_for_parts(db, part_ids),
                    }
                    plan_kwargs["machine_by_slot"] = slot_map if slot_map else None
                    plan_kwargs["assignment_mode_by_operation"] = stored_by_op
                    plan = simulate_unit_plan(db, scope, **plan_kwargs)
                else:
                    plan = probe
            else:
                plan = simulate_unit_plan(db, scope, **plan_kwargs)

        max_ver = db.query(func.max(UnitScheduleItem.schedule_version)).scalar() or 0
        version = int(max_ver) + 1

        deleted = (
            db.query(UnitScheduleItem)
            .filter(UnitScheduleItem.part_id.in_(part_ids))
            .delete(synchronize_session=False)
        )

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
                    assignment_mode=seg.get("assignment_mode") or mode or DEFAULT_ASSIGNMENT_MODE,
                )
            )

        if new_rows:
            db.add_all(new_rows)
        if commit:
            db.commit()
        else:
            db.flush()
    except Exception:
        db.rollback()
        logger.exception(
            "Unit-wise rebuild failed; rolled back pending deletes/inserts",
            extra={
                "event": "unit_wise_rebuild_failed",
                "part_id": part_id,
                "order_id": order_id,
                "optimizer": "nsga2" if use_nsga2 else "greedy",
            },
        )
        raise

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

    # Always expose a lean GA summary when NSGA-II was attempted (for UI toast/badge).
    if use_nsga2 and ga_meta:
        response["ga"] = {
            "selected": ga_meta.get("selected", source),
            "improved": ga_meta.get("improved", False),
            "selected_objectives": ga_meta.get("selected_objectives"),
            "greedy_objectives": ga_meta.get("greedy_objectives"),
            "n_activities": ga_meta.get("n_activities"),
            "scaled_down": ga_meta.get("scaled_down", False),
            "timed_out": ga_meta.get("timed_out", False),
            "population": ga_meta.get("population"),
            "generations": ga_meta.get("generations"),
            "runs": ga_meta.get("runs"),
            "reason": ga_meta.get("reason"),
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
) -> List[Tuple[UnitScheduleItem, Optional[str], Optional[str]]]:
    q = db.query(
        UnitScheduleItem,
        Part.part_name,
        Operation.operation_name,
    ).join(Part, Part.id == UnitScheduleItem.part_id).join(
        Operation, Operation.id == UnitScheduleItem.operation_id
    )
    if part_id is not None and part_id > 0:
        q = q.filter(UnitScheduleItem.part_id == part_id)
    if order_id is not None and order_id > 0:
        q = q.filter(UnitScheduleItem.order_id == order_id)
    if machine_id is not None and machine_id > 0:
        q = q.filter(UnitScheduleItem.machine_id == machine_id)

    if latest_only:
        # Scope version lookup to the same filters — avoid scanning all parts.
        ver_q = db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        if part_id is not None and part_id > 0:
            ver_q = ver_q.filter(UnitScheduleItem.part_id == part_id)
        if order_id is not None and order_id > 0:
            ver_q = ver_q.filter(UnitScheduleItem.order_id == order_id)
        if machine_id is not None and machine_id > 0:
            ver_q = ver_q.filter(UnitScheduleItem.machine_id == machine_id)
        subq = ver_q.group_by(UnitScheduleItem.part_id).subquery()
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


def unit_item_to_dict(row: UnitScheduleItem, part_name: Optional[str] = None, operation_name: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": row.id,
        "order_id": row.order_id,
        "order_number": row.order_number,
        "part_id": row.part_id,
        "part_number": row.part_number,
        "part_name": part_name,
        "unit_index": row.unit_index,
        "operation_id": row.operation_id,
        "operation_number": row.operation_number,
        "operation_name": operation_name,
        "machine_id": row.machine_id,
        "start_time": row.start_time.isoformat() if row.start_time else None,
        "end_time": row.end_time.isoformat() if row.end_time else None,
        "status": row.status,
        "schedule_version": row.schedule_version,
        "source": row.source,
        "label": f"{row.part_number} #{row.unit_index} Op{row.operation_number}",
    }

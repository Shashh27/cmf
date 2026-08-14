"""
Phase 3 — Compare batch dynamic vs unit-wise greedy KPIs.

KPIs (batch vs unit-wise):
  - Makespan            total completion window
  - Flow time           time each job/unit spends in the system
  - Mean flow time      average flow
  - Waiting time        idle gaps between consecutive operations
  - Machine utilization busy / machine-span (this part)
  - Machine idle time   gaps within machine span (this part)
  - Throughput          units completed per hour
  - Tardiness           max(0, finish − due) when due_date set
  - Earliness           max(0, due − finish) when due_date set
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from DB.models.configuration import Machine
from DB.models.oms import Operation, Order, Part
from DB.models.scheduling import (
    PlannedScheduleItem,
    Rescheduling,
    ScheduleHistory,
    UnitScheduleItem,
)
from unit_wise_scheduler import list_unit_schedule

# Fallback GENERAL window when SchedulerEngine is unavailable (tests / no DB calendar)
_DEFAULT_SHIFT_START = time(8, 30)
_DEFAULT_SHIFT_END = time(17, 0)


def _hours(delta_seconds: float) -> float:
    return round(delta_seconds / 3600.0, 4)


def _working_seconds_between(
    start: Optional[datetime],
    end: Optional[datetime],
    *,
    engine: Any = None,
    credit_after_hours: bool = False,
) -> float:
    """
    Count only in-shift working seconds between start and end.

    Overnight / non-working days / outside shift windows are excluded —
    shop floor is closed then, so they must not inflate makespan or flow.
    Uses SchedulerEngine shift calendar when provided; else default 08:30–17:00
    on Mon–Fri.

    credit_after_hours: for due-date gaps, also count time after shift end on
    the end day (e.g. finish 20:00 vs due 17:00 → 3h late).
    """
    if start is None or end is None or end <= start:
        return 0.0

    total = 0.0
    day = start.date()
    last_day = end.date()
    safety = 3650
    while day <= last_day and safety > 0:
        safety -= 1
        probe = datetime.combine(day, time(12, 0))
        if engine is not None:
            try:
                working = engine._is_working_day(probe)
                shift_start_t, shift_end_t = engine._shift_window(probe)
            except Exception:
                working = day.weekday() < 5
                shift_start_t, shift_end_t = _DEFAULT_SHIFT_START, _DEFAULT_SHIFT_END
        else:
            working = day.weekday() < 5
            shift_start_t, shift_end_t = _DEFAULT_SHIFT_START, _DEFAULT_SHIFT_END

        if working:
            day_start = datetime.combine(day, shift_start_t)
            day_end = datetime.combine(day, shift_end_t)
            seg_start = max(day_start, start)
            seg_end = min(day_end, end)
            if seg_end > seg_start:
                total += (seg_end - seg_start).total_seconds()
            if (
                credit_after_hours
                and day == last_day
                and end > day_end
                and start < end
            ):
                after_start = max(day_end, start)
                if end > after_start:
                    total += (end - after_start).total_seconds()
        day = day + timedelta(days=1)
    return total


def _working_hours_between(
    start: Optional[datetime],
    end: Optional[datetime],
    *,
    engine: Any = None,
    credit_after_hours: bool = False,
) -> Optional[float]:
    if start is None or end is None:
        return None
    if end <= start:
        return 0.0
    return _hours(
        _working_seconds_between(
            start, end, engine=engine, credit_after_hours=credit_after_hours
        )
    )


def _pct(numer: float, denom: float) -> Optional[float]:
    if denom <= 0:
        return None
    return round(100.0 * numer / denom, 2)


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _op_sort_key(operation_number: Any) -> Tuple[int, str]:
    s = str(operation_number)
    return (int(s) if s.isdigit() else 999999, s)


def _machine_label(machine: Optional[Machine], machine_id: int) -> str:
    if not machine:
        return f"Machine-{machine_id}"
    make = (machine.make or "").strip()
    model = (machine.model or "").strip()
    if make and model:
        return f"({make}) {model}"
    return make or model or machine.type or f"Machine-{machine_id}"


def _span_metrics(
    rows: List[Tuple[datetime, datetime]],
    *,
    engine: Any = None,
) -> Dict[str, Any]:
    if not rows:
        return {
            "segment_count": 0,
            "makespan_hours": None,
            "makespan_calendar_hours": None,
            "earliest_start": None,
            "latest_end": None,
        }
    starts = [r[0] for r in rows if r[0] is not None]
    ends = [r[1] for r in rows if r[1] is not None]
    if not starts or not ends:
        return {
            "segment_count": len(rows),
            "makespan_hours": None,
            "makespan_calendar_hours": None,
            "earliest_start": None,
            "latest_end": None,
        }
    earliest = min(starts)
    latest = max(ends)
    calendar_h = _hours((latest - earliest).total_seconds())
    working_h = _working_hours_between(earliest, latest, engine=engine)
    return {
        "segment_count": len(rows),
        # Primary KPI: in-shift working hours only (shop closed overnight)
        "makespan_hours": working_h,
        "makespan_calendar_hours": calendar_h,
        "earliest_start": earliest.isoformat(),
        "latest_end": latest.isoformat(),
    }


def _merged_busy_seconds(intervals: Sequence[Tuple[datetime, datetime]]) -> float:
    cleaned = sorted(
        [(a, b) for a, b in intervals if a is not None and b is not None and b > a],
        key=lambda x: x[0],
    )
    if not cleaned:
        return 0.0
    total = 0.0
    cur_s, cur_e = cleaned[0]
    for s, e in cleaned[1:]:
        if s <= cur_e:
            if e > cur_e:
                cur_e = e
        else:
            total += (cur_e - cur_s).total_seconds()
            cur_s, cur_e = s, e
    total += (cur_e - cur_s).total_seconds()
    return total


def _machine_load_metrics(
    segments: Sequence[Tuple[Optional[int], datetime, datetime]],
    *,
    engine: Any = None,
) -> Dict[int, Dict[str, Any]]:
    by_m: Dict[int, List[Tuple[datetime, datetime]]] = {}
    for mid, start, end in segments:
        if mid is None or start is None or end is None:
            continue
        by_m.setdefault(int(mid), []).append((start, end))

    out: Dict[int, Dict[str, Any]] = {}
    for mid, intervals in by_m.items():
        starts = [a for a, _ in intervals]
        ends = [b for _, b in intervals]
        earliest = min(starts)
        latest = max(ends)
        # Span for util/idle = in-shift hours only (exclude overnight closed shop)
        span_s = _working_seconds_between(earliest, latest, engine=engine)
        busy_s = _merged_busy_seconds(intervals)
        idle_s = max(0.0, span_s - busy_s)
        out[mid] = {
            "machine_id": mid,
            "segment_count": len(intervals),
            "span_hours": _hours(span_s),
            "busy_hours": _hours(busy_s),
            "idle_hours": _hours(idle_s),
            "utilization_pct": _pct(busy_s, span_s),
            "earliest_start": earliest.isoformat(),
            "latest_end": latest.isoformat(),
        }
    return out


def _aggregate_machine_metrics(per_machine: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    if not per_machine:
        return {
            "busy_hours_total": 0.0,
            "idle_hours_total": 0.0,
            "avg_utilization_pct": None,
            "machine_count": 0,
        }
    busy = sum(float(m["busy_hours"] or 0) for m in per_machine.values())
    idle = sum(float(m["idle_hours"] or 0) for m in per_machine.values())
    utils = [
        float(m["utilization_pct"])
        for m in per_machine.values()
        if m.get("utilization_pct") is not None
    ]
    return {
        "busy_hours_total": round(busy, 4),
        "idle_hours_total": round(idle, 4),
        "avg_utilization_pct": round(sum(utils) / len(utils), 2) if utils else None,
        "machine_count": len(per_machine),
    }


def _waiting_between_ops(
    segments: Sequence[Tuple[Any, datetime, datetime]],
    *,
    engine: Any = None,
) -> float:
    """
    Waiting = sum of in-shift gaps between consecutive operations
    (next op earliest start − previous op latest end), floored at 0.
    Overnight / closed-shop hours are excluded.
    Segments: (operation_number, start, end).
    """
    by_op: Dict[str, List[Tuple[datetime, datetime]]] = {}
    for op_no, start, end in segments:
        if start is None or end is None:
            continue
        by_op.setdefault(str(op_no), []).append((start, end))
    if len(by_op) < 2:
        return 0.0

    ordered = []
    for op_no in sorted(by_op.keys(), key=_op_sort_key):
        intervals = by_op[op_no]
        ordered.append(
            (
                min(a for a, _ in intervals),
                max(b for _, b in intervals),
            )
        )

    wait_s = 0.0
    for i in range(1, len(ordered)):
        prev_end = ordered[i - 1][1]
        next_start = ordered[i][0]
        if next_start > prev_end:
            wait_s += _working_seconds_between(prev_end, next_start, engine=engine)
    return wait_s


SHIFT_HOURS = 8.5  # GENERAL typical productive hours


def _normalize_due_datetime(due_date: Optional[datetime]) -> Optional[datetime]:
    """
    Date-only due dates (midnight) mean 'end of that shop day', not 00:00.
    Align to typical GENERAL shift end (17:00) so same-day finishes are on time.
    """
    if due_date is None:
        return None
    if (
        due_date.hour == 0
        and due_date.minute == 0
        and due_date.second == 0
        and due_date.microsecond == 0
    ):
        return due_date.replace(hour=17, minute=0, second=0, microsecond=0)
    return due_date


def _due_metrics(
    completion: Optional[datetime],
    due_date: Optional[datetime],
    *,
    engine: Any = None,
) -> Dict[str, Any]:
    """
    Tardiness / earliness in in-shift working hours (same basis as makespan).
    Calendar days are also returned for display when the gap is large.

    Distant dues: skip day-by-day working-hour walks (would hit shift config
    once per day and make part switching feel stuck). Mark as not binding.
    """
    if due_date is None or completion is None:
        return {
            "tardiness_hours": None,
            "earliness_hours": None,
            "tardiness_days": None,
            "earliness_days": None,
            "on_time": None,
            "due_binding": None,
        }
    due = _normalize_due_datetime(due_date)
    assert due is not None
    on_time = completion <= due
    cal_days = abs((completion.date() - due.date()).days)

    # Binding horizon ≈ 2 working weeks. Beyond that, status is simply On time.
    if on_time and cal_days > 14:
        return {
            "tardiness_hours": 0.0,
            "earliness_hours": round(float(cal_days) * SHIFT_HOURS, 4),
            "tardiness_days": 0,
            "earliness_days": cal_days,
            "on_time": True,
            "due_binding": False,
        }
    if (not on_time) and cal_days > 14:
        # Extremely late — still compute working hours but cap walk via calendar
        # only for the overdue side; rare in practice.
        pass

    if on_time:
        tardiness = 0.0
        earliness = (
            _working_hours_between(
                completion, due, engine=engine, credit_after_hours=False
            )
            or 0.0
        )
    else:
        earliness = 0.0
        tardiness = (
            _working_hours_between(
                due, completion, engine=engine, credit_after_hours=True
            )
            or 0.0
        )

    due_binding = (not on_time) or (earliness <= 80.0)

    return {
        "tardiness_hours": round(float(tardiness), 4),
        "earliness_hours": round(float(earliness), 4),
        "tardiness_days": cal_days if not on_time else 0,
        "earliness_days": cal_days if on_time else 0,
        "on_time": on_time,
        "due_binding": due_binding,
    }


def _throughput(
    units: Optional[int], makespan_hours: Optional[float]
) -> Optional[float]:
    if units is None or units <= 0 or not makespan_hours or makespan_hours <= 0:
        return None
    return round(float(units) / float(makespan_hours), 4)


def _throughput_per_shift_day(
    units: Optional[int], makespan_hours: Optional[float]
) -> Optional[float]:
    """Units completed per typical shift-day (makespan ÷ 8.5h)."""
    per_h = _throughput(units, makespan_hours)
    if per_h is None:
        return None
    return round(per_h * SHIFT_HOURS, 4)


def _batch_units_for_throughput(
    batch: List[Rescheduling],
    *,
    unit_planned: Optional[int] = None,
) -> Optional[int]:
    """
    Prefer the unfinished unit count from unit-wise when available so batch vs
    unit throughput use the same numerator. Else max(remaining_qty), else total_qty.
    """
    if unit_planned is not None and int(unit_planned) > 0:
        return int(unit_planned)
    rem = [int(r.remaining_qty) for r in batch if r.remaining_qty is not None]
    if rem:
        return max(rem)
    tot = [int(r.total_qty) for r in batch if r.total_qty is not None]
    return max(tot) if tot else None


def _batch_flow_waiting_metrics(
    batch: List[Rescheduling],
    makespan_hours: Optional[float],
    latest_end: Optional[str],
    due_date: Optional[datetime],
    *,
    unit_planned: Optional[int] = None,
    engine: Any = None,
) -> Dict[str, Any]:
    """
    Batch has no per-unit rows: treat the part batch as one job.
    Flow time ≈ makespan (working hours). Waiting = in-shift gaps between ops.
    """
    wait_s = _waiting_between_ops(
        [(r.operation_number, r.start_time, r.end_time) for r in batch],
        engine=engine,
    )
    wait_h = _hours(wait_s)
    units = _batch_units_for_throughput(batch, unit_planned=unit_planned)

    completion = _parse_dt(latest_end)
    due = _due_metrics(completion, due_date, engine=engine)

    return {
        "flow_hours": makespan_hours,  # single batch job
        "mean_flow_hours": makespan_hours,
        "waiting_hours": wait_h,
        "mean_waiting_hours": wait_h,
        "units_for_throughput": units,
        "throughput_units_per_hour": _throughput(units, makespan_hours),
        "throughput_units_per_shift_day": _throughput_per_shift_day(
            units, makespan_hours
        ),
        **due,
        "mean_tardiness_hours": due["tardiness_hours"],
        "mean_earliness_hours": due["earliness_hours"],
        "job_flows": (
            [
                {
                    "job": "batch",
                    "flow_hours": makespan_hours,
                    "waiting_hours": wait_h,
                    "tardiness_hours": due["tardiness_hours"],
                    "earliness_hours": due["earliness_hours"],
                }
            ]
            if makespan_hours is not None
            else []
        ),
    }


def _unit_flow_waiting_metrics(
    unit_rows: List[UnitScheduleItem],
    due_date: Optional[datetime],
    *,
    engine: Any = None,
) -> Dict[str, Any]:
    """
    Per unit:
      flow    = in-shift hours from first start to last end
      waiting = in-shift gaps between consecutive ops for that unit
    """
    by_unit: Dict[int, List[UnitScheduleItem]] = {}
    for row in unit_rows:
        by_unit.setdefault(int(row.unit_index), []).append(row)

    flows: List[Dict[str, Any]] = []
    first_unit_flow = None
    first_unit_index = None

    for u in sorted(by_unit.keys()):
        segs = by_unit[u]
        starts = [s.start_time for s in segs if s.start_time]
        ends = [s.end_time for s in segs if s.end_time]
        if not starts or not ends:
            continue
        flow_h = _working_hours_between(min(starts), max(ends), engine=engine)
        wait_h = _hours(
            _waiting_between_ops(
                [(s.operation_number, s.start_time, s.end_time) for s in segs],
                engine=engine,
            )
        )
        completion = max(ends)
        due = _due_metrics(completion, due_date, engine=engine)
        flows.append(
            {
                "unit_index": u,
                "flow_hours": flow_h,
                "waiting_hours": wait_h,
                "tardiness_hours": due["tardiness_hours"],
                "earliness_hours": due["earliness_hours"],
                "on_time": due["on_time"],
                "completion": completion.isoformat(),
            }
        )
        if first_unit_flow is None:
            first_unit_flow = flow_h
            first_unit_index = u

    n = len(flows)
    mean_flow = (
        round(sum(float(f["flow_hours"] or 0) for f in flows) / n, 4) if n else None
    )
    mean_wait = (
        round(sum(f["waiting_hours"] for f in flows) / n, 4) if n else None
    )
    total_wait = round(sum(f["waiting_hours"] for f in flows), 4) if n else 0.0

    mean_tard = None
    mean_earl = None
    if n and due_date is not None:
        mean_tard = round(
            sum(float(f["tardiness_hours"] or 0) for f in flows) / n, 4
        )
        mean_earl = round(
            sum(float(f["earliness_hours"] or 0) for f in flows) / n, 4
        )

    # Part-level tardiness/earliness from overall last unit finish
    latest = None
    for f in flows:
        c = _parse_dt(f.get("completion"))
        if c and (latest is None or c > latest):
            latest = c
    part_due = _due_metrics(latest, due_date, engine=engine)

    return {
        "units_planned": n,
        "first_unit_index": first_unit_index,
        "first_unit_flow_hours": first_unit_flow,
        "flow_hours": first_unit_flow,  # representative / first unit
        "mean_flow_hours": mean_flow,
        "waiting_hours": total_wait,
        "mean_waiting_hours": mean_wait,
        "unit_flows": flows,
        "tardiness_hours": part_due["tardiness_hours"],
        "earliness_hours": part_due["earliness_hours"],
        "tardiness_days": part_due.get("tardiness_days"),
        "earliness_days": part_due.get("earliness_days"),
        "on_time": part_due["on_time"],
        "due_binding": part_due.get("due_binding"),
        "mean_tardiness_hours": mean_tard,
        "mean_earliness_hours": mean_earl,
    }


def _batch_rows_for_part(db: Session, part_id: int) -> List[Rescheduling]:
    return (
        db.query(Rescheduling)
        .filter(
            Rescheduling.part_id == part_id,
            Rescheduling.status.in_(["scheduled", "rescheduled"]),
        )
        .order_by(Rescheduling.start_time.asc())
        .all()
    )


def _planned_rows_for_part(db: Session, part_id: int) -> List[PlannedScheduleItem]:
    """Active planned schedule (batch planned) for this part."""
    return (
        db.query(PlannedScheduleItem)
        .join(
            ScheduleHistory,
            PlannedScheduleItem.schedule_history_id == ScheduleHistory.id,
        )
        .filter(
            PlannedScheduleItem.part_id == part_id,
            ScheduleHistory.is_active.is_(True),
        )
        .order_by(PlannedScheduleItem.planned_start_time.asc())
        .all()
    )


def _schedulable_ops(db: Session, part_id: int) -> List[Operation]:
    from DB.models.configuration import WorkCenter

    ops = db.query(Operation).filter(Operation.part_id == part_id).all()
    if not ops:
        return []
    wc_ids = {op.workcenter_id for op in ops if op.workcenter_id is not None}
    schedulable_wcs: set = set()
    if wc_ids:
        rows = (
            db.query(WorkCenter.id)
            .filter(
                WorkCenter.id.in_(wc_ids),
                WorkCenter.is_schedulable.is_(True),
                WorkCenter.work_center_name != "Default",
            )
            .all()
        )
        schedulable_wcs = {int(r[0]) for r in rows}
    out = [
        op
        for op in ops
        if op.workcenter_id is not None and int(op.workcenter_id) in schedulable_wcs
    ]
    out.sort(key=lambda o: _op_sort_key(o.operation_number))
    return out


def _resolve_order(
    db: Session, batch: List[Rescheduling], unit_rows: List[UnitScheduleItem]
) -> Optional[Order]:
    order_id = None
    if batch:
        order_id = batch[0].order_id
    elif unit_rows:
        order_id = unit_rows[0].order_id
    if not order_id:
        return None
    return db.query(Order).filter(Order.id == order_id).first()


def _machines_by_id(db: Session, machine_ids: Iterable[int]) -> Dict[int, Machine]:
    ids = sorted({int(i) for i in machine_ids})
    if not ids:
        return {}
    rows = db.query(Machine).filter(Machine.id.in_(ids)).all()
    return {int(m.id): m for m in rows}


def _build_machines_compare(
    batch_load: Dict[int, Dict[str, Any]],
    unit_load: Dict[int, Dict[str, Any]],
    machines: Dict[int, Machine],
) -> List[Dict[str, Any]]:
    ids = sorted(set(batch_load.keys()) | set(unit_load.keys()))
    rows = []
    for mid in ids:
        b = batch_load.get(mid)
        u = unit_load.get(mid)
        delta: Dict[str, Any] = {}
        if b and u:
            if b.get("utilization_pct") is not None and u.get("utilization_pct") is not None:
                delta["utilization_pct"] = round(
                    float(u["utilization_pct"]) - float(b["utilization_pct"]), 2
                )
            if b.get("idle_hours") is not None and u.get("idle_hours") is not None:
                delta["idle_hours"] = round(
                    float(b["idle_hours"]) - float(u["idle_hours"]), 4
                )
            if b.get("busy_hours") is not None and u.get("busy_hours") is not None:
                delta["busy_hours"] = round(
                    float(u["busy_hours"]) - float(b["busy_hours"]), 4
                )
        rows.append(
            {
                "machine_id": mid,
                "machine_name": _machine_label(machines.get(mid), mid),
                "batch": b,
                "unit_wise": u,
                "delta": delta,
            }
        )
    return rows


def _delta_pair(
    batch_val: Any, unit_val: Any, *, higher_is_better: bool = False
) -> Dict[str, Any]:
    """
    delta = batch − unit by default (positive => unit smaller / often better for time).
    For throughput / util, higher_is_better => delta = unit − batch.
    """
    if batch_val is None or unit_val is None:
        return {}
    b = float(batch_val)
    u = float(unit_val)
    if higher_is_better:
        d = round(u - b, 4)
        return {"delta": d, "improved": d > 0}
    d = round(b - u, 4)
    return {"delta": d, "improved": d > 0}


def _metric_winner(
    planned_v: Any,
    dynamic_v: Any,
    unit_v: Any,
    *,
    higher_is_better: bool = False,
    eps: float = 1e-6,
) -> Dict[str, Any]:
    """
    Pick which scheduler wins this KPI among Planned / Dynamic / Unit-wise.
    Ties are reported explicitly when values are within eps.
    """
    candidates: List[Tuple[str, str, float]] = []
    if planned_v is not None:
        candidates.append(("planned", "Planned", float(planned_v)))
    if dynamic_v is not None:
        candidates.append(("dynamic", "Dynamic", float(dynamic_v)))
    if unit_v is not None:
        candidates.append(("unit_wise", "Unit-wise", float(unit_v)))
    if not candidates:
        return {
            "winner": None,
            "winner_label": None,
            "tie": False,
            "tied_with": [],
            "higher_is_better": higher_is_better,
        }

    if higher_is_better:
        best_val = max(v for _, _, v in candidates)
    else:
        best_val = min(v for _, _, v in candidates)

    winners = [(k, label) for k, label, v in candidates if abs(v - best_val) <= eps]
    if len(winners) == 1:
        return {
            "winner": winners[0][0],
            "winner_label": winners[0][1],
            "tie": False,
            "tied_with": [],
            "best_value": best_val,
            "higher_is_better": higher_is_better,
        }
    return {
        "winner": "tie",
        "winner_label": " / ".join(label for _, label in winners),
        "tie": True,
        "tied_with": [k for k, _ in winners],
        "best_value": best_val,
        "higher_is_better": higher_is_better,
    }


def _build_compare_summary(
    qty: Optional[int],
    batch_metrics: Dict[str, Any],
    unit_metrics: Dict[str, Any],
    delta: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Human-readable headline for the compare panel.

    Unit-wise often matches batch makespan while improving first-unit flow /
    waiting — this makes that explicit for planners.
    """
    makespan_delta = delta.get("makespan_delta")
    makespan_unchanged = (
        makespan_delta is not None and abs(float(makespan_delta)) < 0.05
    )
    first_saved = delta.get("first_piece_hours_saved")
    first_improved = first_saved is not None and float(first_saved) > 0.05
    wait_delta = delta.get("waiting_time_delta")
    wait_improved = wait_delta is not None and float(wait_delta) > 0.05

    wins: List[str] = []
    if delta.get("makespan_improved"):
        wins.append("makespan")
    if first_improved:
        wins.append("first_unit_flow")
    if wait_improved:
        wins.append("waiting_time")
    if delta.get("throughput_improved"):
        wins.append("throughput")
    if delta.get("machine_utilization_improved"):
        wins.append("machine_utilization")

    batch_ms = batch_metrics.get("makespan_hours")
    unit_ms = unit_metrics.get("makespan_hours")
    batch_first_proxy = batch_metrics.get("flow_hours")
    unit_first = unit_metrics.get("first_unit_flow_hours")

    headline = "Compare batch dynamic vs unit-wise for this part."
    if makespan_unchanged and first_improved and first_saved is not None:
        headline = (
            f"Same total completion window (~{fmt_or_dash(unit_ms)}), "
            f"but first unit finishes ~{float(first_saved):.2f} h sooner with unit-wise."
        )
    elif first_improved and first_saved is not None:
        headline = (
            f"Unit-wise finishes the first unit ~{float(first_saved):.2f} h sooner "
            f"(batch proxy {fmt_or_dash(batch_first_proxy)} → "
            f"unit U-1 {fmt_or_dash(unit_first)})."
        )
    elif delta.get("makespan_improved") and makespan_delta is not None:
        headline = (
            f"Unit-wise shortens total makespan by {float(makespan_delta):.2f} h "
            f"({fmt_or_dash(batch_ms)} → {fmt_or_dash(unit_ms)})."
        )

    multi_unit = int(qty or 0) > 1
    verdict = "neutral"
    if first_improved or wait_improved:
        verdict = "pipeline_win" if makespan_unchanged else "mixed_win"
    elif delta.get("makespan_improved"):
        verdict = "makespan_win"
    elif makespan_unchanged and not wins:
        verdict = "equivalent"

    return {
        "headline": headline,
        "verdict": verdict,
        "makespan_unchanged": makespan_unchanged,
        "multi_unit_part": multi_unit,
        "unit_wise_wins": wins,
        "first_unit_flow_hours": {
            "batch_proxy": batch_first_proxy,
            "unit_first": unit_first,
            "saved_hours": first_saved,
            "improved": first_improved,
        },
        "makespan_hours": {
            "batch": batch_ms,
            "unit": unit_ms,
            "delta": makespan_delta,
            "improved": delta.get("makespan_improved"),
        },
        "waiting_hours": {
            "batch_mean": batch_metrics.get("mean_waiting_hours"),
            "unit_mean": unit_metrics.get("mean_waiting_hours"),
            "delta": wait_delta,
            "improved": wait_improved,
        },
    }


def fmt_or_dash(v: Any) -> str:
    if v is None:
        return "—"
    try:
        return f"{float(v):.2f}h"
    except (TypeError, ValueError):
        return str(v)


def compare_part_schedules(db: Session, part_id: int) -> Dict[str, Any]:
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        return {"success": False, "message": f"Part {part_id} not found"}

    # Shift calendar for working-hours KPIs (exclude overnight closed shop)
    try:
        from algorithm import SchedulerEngine

        engine = SchedulerEngine(db)
    except Exception:
        engine = None

    batch = _batch_rows_for_part(db, part_id)
    unit_rows = list_unit_schedule(db, part_id=part_id, latest_only=True)
    ops = _schedulable_ops(db, part_id)
    order = _resolve_order(db, batch, unit_rows)
    due_date = order.due_date if order else None
    order_date = order.order_date if order else None
    qty = part.qty

    unit_span = _span_metrics(
        [(r.start_time, r.end_time) for r in unit_rows], engine=engine
    )
    unit_flow = _unit_flow_waiting_metrics(unit_rows, due_date, engine=engine)
    unit_load = _machine_load_metrics(
        [(r.machine_id, r.start_time, r.end_time) for r in unit_rows],
        engine=engine,
    )
    unit_agg = _aggregate_machine_metrics(unit_load)
    unit_units = int(unit_flow.get("units_planned") or 0)
    unit_metrics = {
        **unit_span,
        **unit_flow,
        **unit_agg,
        "machines": sorted(unit_load.keys()),
        "operations": sorted(
            {str(r.operation_number) for r in unit_rows}, key=_op_sort_key
        ),
        "schedule_version": unit_rows[0].schedule_version if unit_rows else None,
        "source": unit_rows[0].source if unit_rows else None,
        "units_for_throughput": unit_units,
        "throughput_units_per_hour": _throughput(
            unit_units, unit_span.get("makespan_hours")
        ),
        "throughput_units_per_shift_day": _throughput_per_shift_day(
            unit_units, unit_span.get("makespan_hours")
        ),
        "per_machine": list(unit_load.values()),
    }

    batch_span = _span_metrics(
        [(r.start_time, r.end_time) for r in batch], engine=engine
    )
    batch_load = _machine_load_metrics(
        [(r.machine_id, r.start_time, r.end_time) for r in batch],
        engine=engine,
    )
    batch_agg = _aggregate_machine_metrics(batch_load)
    batch_flow = _batch_flow_waiting_metrics(
        batch,
        batch_span.get("makespan_hours"),
        batch_span.get("latest_end"),
        due_date,
        unit_planned=unit_units or None,
        engine=engine,
    )
    batch_metrics = {
        **batch_span,
        **batch_flow,
        **batch_agg,
        "machines": sorted(batch_load.keys()),
        "operations": sorted({str(r.operation_number) for r in batch}, key=_op_sort_key),
        "per_machine": list(batch_load.values()),
    }

    planned = _planned_rows_for_part(db, part_id)
    planned_span = _span_metrics(
        [(r.planned_start_time, r.planned_end_time) for r in planned],
        engine=engine,
    )
    planned_load = _machine_load_metrics(
        [
            (r.machine_id, r.planned_start_time, r.planned_end_time)
            for r in planned
        ],
        engine=engine,
    )
    planned_agg = _aggregate_machine_metrics(planned_load)
    planned_units = None
    rem = [int(r.remaining_quantity) for r in planned if r.remaining_quantity is not None]
    tot = [int(r.total_quantity) for r in planned if r.total_quantity is not None]
    if unit_units:
        planned_units = unit_units
    elif rem:
        planned_units = max(rem)
    elif tot:
        planned_units = max(tot)
    planned_completion = planned_span.get("latest_end")
    planned_due = _due_metrics(_parse_dt(planned_completion), due_date, engine=engine)
    planned_metrics = {
        **planned_span,
        **planned_agg,
        **planned_due,
        "flow_hours": planned_span.get("makespan_hours"),
        "mean_flow_hours": planned_span.get("makespan_hours"),
        "waiting_hours": 0.0,
        "mean_waiting_hours": 0.0,
        "machines": sorted(planned_load.keys()),
        "units_for_throughput": planned_units,
        "throughput_units_per_hour": _throughput(
            planned_units, planned_span.get("makespan_hours")
        ),
        "throughput_units_per_shift_day": _throughput_per_shift_day(
            planned_units, planned_span.get("makespan_hours")
        ),
        "per_machine": list(planned_load.values()),
        "segment_count": planned_span.get("segment_count"),
    }

    all_mids = set(batch_load.keys()) | set(unit_load.keys()) | set(planned_load.keys())
    machines = _machines_by_id(db, all_mids)
    machines_compare = _build_machines_compare(batch_load, unit_load, machines)

    multi_unit = int(qty or 0) > 1

    def _row(
        metric,
        purpose,
        unit,
        planned_v,
        batch_v,
        unit_v,
        *,
        higher_is_better=False,
        note=None,
        scope="part",
        in_scoreboard=True,
    ):
        """
        scope:
          part     — same grain for all schedulers (full part qty)
          insight  — pipelining / first-unit view (not scored as a win)
          mixed    — shown for context; batch is one job, unit-wise is per-unit
        """
        d_dyn = _delta_pair(batch_v, unit_v, higher_is_better=higher_is_better)
        d_pln = _delta_pair(planned_v, unit_v, higher_is_better=higher_is_better)
        win = (
            _metric_winner(
                planned_v, batch_v, unit_v, higher_is_better=higher_is_better
            )
            if in_scoreboard
            else {
                "winner": None,
                "winner_label": None,
                "tie": False,
                "tied_with": [],
                "best_value": None,
            }
        )
        out = {
            "metric": metric,
            "purpose": purpose,
            "unit": unit,
            "scope": scope,
            "in_scoreboard": bool(in_scoreboard),
            "planned": planned_v,
            "batch": batch_v,  # dynamic (compat)
            "batch_dynamic": batch_v,
            "unit_wise": unit_v,
            "delta": d_dyn.get("delta"),
            "improved": d_dyn.get("improved"),
            "delta_vs_dynamic": d_dyn.get("delta"),
            "improved_vs_dynamic": d_dyn.get("improved"),
            "delta_vs_planned": d_pln.get("delta"),
            "improved_vs_planned": d_pln.get("improved"),
            "higher_is_better": higher_is_better,
            "winner": win.get("winner"),
            "winner_label": win.get("winner_label"),
            "tie": win.get("tie"),
            "tied_with": win.get("tied_with") or [],
            "best_value": win.get("best_value"),
        }
        if note:
            out["note"] = note
        return out

    # Fair KPIs = same scope (full part qty). First-unit flow is insight only.
    metrics_compare = [
        _row(
            "makespan",
            "Full part completion (all qty) — same scope",
            "hours",
            planned_metrics.get("makespan_hours"),
            batch_metrics.get("makespan_hours"),
            unit_metrics.get("makespan_hours"),
            scope="part",
            in_scoreboard=True,
            note="Earliest start → latest end across every unit/op of this part.",
        ),
        _row(
            "first_unit_flow",
            "Pipelining insight — U1 only (not scored)",
            "hours",
            None if multi_unit else planned_metrics.get("flow_hours"),
            batch_metrics.get("flow_hours"),
            unit_metrics.get("first_unit_flow_hours"),
            scope="insight",
            in_scoreboard=False,
            note=(
                "Unit-wise = time until unit 1 finishes all ops. "
                "Dynamic/Planned value is batch job span (all qty) — different grain; "
                "shown for context, excluded from winner scoreboard."
            ),
        ),
        _row(
            "mean_flow_time",
            "Avg time in system"
            + (" — mixed grain when qty>1" if multi_unit else ""),
            "hours",
            planned_metrics.get("mean_flow_hours"),
            batch_metrics.get("mean_flow_hours"),
            unit_metrics.get("mean_flow_hours"),
            scope="mixed" if multi_unit else "part",
            in_scoreboard=not multi_unit,
            note=(
                "When qty>1, Planned/Dynamic treat the part as one batch job "
                "(mean ≈ makespan) while Unit-wise averages per-unit flows — "
                "not scored."
                if multi_unit
                else None
            ),
        ),
        _row(
            "waiting_time",
            "Idle gaps between consecutive ops",
            "hours",
            planned_metrics.get("mean_waiting_hours"),
            batch_metrics.get("mean_waiting_hours"),
            unit_metrics.get("mean_waiting_hours"),
            scope="part",
            in_scoreboard=True,
        ),
        _row(
            "machine_utilization",
            "Resource usage on this part's machines",
            "percent",
            planned_metrics.get("avg_utilization_pct"),
            batch_metrics.get("avg_utilization_pct"),
            unit_metrics.get("avg_utilization_pct"),
            higher_is_better=True,
            scope="part",
            in_scoreboard=True,
        ),
        _row(
            "machine_idle_time",
            "Lost capacity on this part's machines",
            "hours",
            planned_metrics.get("idle_hours_total"),
            batch_metrics.get("idle_hours_total"),
            unit_metrics.get("idle_hours_total"),
            scope="part",
            in_scoreboard=True,
        ),
        _row(
            "throughput",
            "Output rate — qty ÷ in-shift makespan",
            "units/hour",
            planned_metrics.get("throughput_units_per_hour"),
            batch_metrics.get("throughput_units_per_hour"),
            unit_metrics.get("throughput_units_per_hour"),
            higher_is_better=True,
            scope="part",
            in_scoreboard=True,
            note=(
                f"Also ≈ "
                f"{planned_metrics.get('throughput_units_per_shift_day')}/"
                f"{batch_metrics.get('throughput_units_per_shift_day')}/"
                f"{unit_metrics.get('throughput_units_per_shift_day')} "
                f"units per {SHIFT_HOURS}h shift-day (Planned/Dynamic/Unit-wise)."
            ),
        ),
        _row(
            "tardiness",
            "Working hours late vs due (end of due day)",
            "hours",
            planned_metrics.get("tardiness_hours"),
            batch_metrics.get("tardiness_hours"),
            unit_metrics.get("tardiness_hours"),
            scope="part",
            in_scoreboard=True,
            note="0 = on time or early. Uses in-shift hours, not calendar overnight.",
        ),
        _row(
            "earliness",
            "Working hours early vs due (near dues only)",
            "hours",
            planned_metrics.get("earliness_hours")
            if (
                planned_metrics.get("due_binding")
                or batch_metrics.get("due_binding")
                or unit_metrics.get("due_binding")
            )
            else None,
            batch_metrics.get("earliness_hours")
            if (
                planned_metrics.get("due_binding")
                or batch_metrics.get("due_binding")
                or unit_metrics.get("due_binding")
            )
            else None,
            unit_metrics.get("earliness_hours")
            if (
                planned_metrics.get("due_binding")
                or batch_metrics.get("due_binding")
                or unit_metrics.get("due_binding")
            )
            else None,
            higher_is_better=True,
            scope="part"
            if (
                planned_metrics.get("due_binding")
                or batch_metrics.get("due_binding")
                or unit_metrics.get("due_binding")
            )
            else "insight",
            in_scoreboard=bool(
                planned_metrics.get("due_binding")
                or batch_metrics.get("due_binding")
                or unit_metrics.get("due_binding")
            ),
            note=(
                "Due date is far beyond completion — part is on time; "
                "large earliness is hidden from comparison (not a meaningful KPI)."
                if not (
                    planned_metrics.get("due_binding")
                    or batch_metrics.get("due_binding")
                    or unit_metrics.get("due_binding")
                )
                else "Uses in-shift hours between completion and due (due midnight → 17:00)."
            ),
        ),
    ]

    delta: Dict[str, Any] = {}
    for row in metrics_compare:
        key = row["metric"]
        if "delta" in row:
            delta[f"{key}_delta"] = row["delta"]
            delta[f"{key}_improved"] = row.get("improved")

    # Keep a few convenience aliases used by older UI bits
    if delta.get("makespan_delta") is not None:
        delta["makespan_hours"] = delta["makespan_delta"]
        delta["makespan_improved"] = delta.get("makespan_improved")
    if (
        batch_metrics.get("flow_hours") is not None
        and unit_metrics.get("first_unit_flow_hours") is not None
    ):
        delta["first_piece_hours_batch_proxy"] = batch_metrics["flow_hours"]
        delta["first_piece_hours_unit"] = unit_metrics["first_unit_flow_hours"]
        delta["first_piece_hours_saved"] = round(
            float(batch_metrics["flow_hours"])
            - float(unit_metrics["first_unit_flow_hours"]),
            4,
        )
        delta["first_unit_flow_improved"] = delta["first_piece_hours_saved"] > 0.05

    summary = _build_compare_summary(qty, batch_metrics, unit_metrics, delta)

    # Scoreboard: only same-scope (fair) KPI rows — exclude first-unit / mixed-grain
    scored_rows = [r for r in metrics_compare if r.get("in_scoreboard")]
    scoreboard = {
        "planned": 0,
        "dynamic": 0,
        "unit_wise": 0,
        "tie": 0,
        "total_metrics": len(scored_rows),
        "scored_metrics": [r["metric"] for r in scored_rows],
        "excluded_from_scoreboard": [
            r["metric"] for r in metrics_compare if not r.get("in_scoreboard")
        ],
        "by_metric": [],
    }
    for row in scored_rows:
        w = row.get("winner")
        label = row.get("winner_label")
        scoreboard["by_metric"].append(
            {
                "metric": row["metric"],
                "winner": w,
                "winner_label": label,
                "tie": bool(row.get("tie")),
            }
        )
        if w in ("planned", "dynamic", "unit_wise"):
            scoreboard[w] += 1
        elif w == "tie" or row.get("tie"):
            scoreboard["tie"] += 1
            for k in row.get("tied_with") or []:
                if k in scoreboard:
                    scoreboard[k] += 1  # credit each tied scheduler
        # Prefer single overall leader by exclusive wins (not counting shared ties twice for leader)
    exclusive = {
        "planned": sum(1 for m in scoreboard["by_metric"] if m["winner"] == "planned"),
        "dynamic": sum(1 for m in scoreboard["by_metric"] if m["winner"] == "dynamic"),
        "unit_wise": sum(1 for m in scoreboard["by_metric"] if m["winner"] == "unit_wise"),
    }
    scoreboard["exclusive_wins"] = exclusive
    # Reset simple counts to exclusive (clearer for UI)
    scoreboard["planned"] = exclusive["planned"]
    scoreboard["dynamic"] = exclusive["dynamic"]
    scoreboard["unit_wise"] = exclusive["unit_wise"]
    if exclusive["unit_wise"] > exclusive["dynamic"] and exclusive["unit_wise"] > exclusive["planned"]:
        scoreboard["leader"] = "unit_wise"
        scoreboard["leader_label"] = "Unit-wise"
    elif exclusive["dynamic"] > exclusive["planned"] and exclusive["dynamic"] > exclusive["unit_wise"]:
        scoreboard["leader"] = "dynamic"
        scoreboard["leader_label"] = "Dynamic"
    elif exclusive["planned"] > exclusive["dynamic"] and exclusive["planned"] > exclusive["unit_wise"]:
        scoreboard["leader"] = "planned"
        scoreboard["leader_label"] = "Planned"
    else:
        scoreboard["leader"] = "tie"
        scoreboard["leader_label"] = "Tie"

    summary["scoreboard"] = scoreboard

    return {
        "success": True,
        "part_id": part_id,
        "part_number": part.part_number,
        "part_qty": qty,
        "order_id": order.id if order else None,
        "order_number": order.sale_order_number if order else None,
        "due_date": due_date.isoformat() if due_date else None,
        "order_date": order_date.isoformat() if order_date else None,
        "schedulable_operations": [
            {"id": op.id, "operation_number": str(op.operation_number)}
            for op in ops
        ],
        "batch_dynamic": batch_metrics,
        "batch_planned": planned_metrics,
        "unit_wise_greedy": unit_metrics,
        "machines_compare": machines_compare,
        "metrics_compare": metrics_compare,
        "delta": delta,
        "summary": summary,
        "scoreboard": scoreboard,
        "notes": [
            "Planned = active planned schedule · Dynamic = batch reschedule · Unit-wise = per-unit schedule.",
            "All duration KPIs use in-shift working hours (shop closed overnight / non-working days excluded).",
            "Makespan compares full part qty on the same scope for all three methods.",
            "First-unit lead time is a pipelining insight (unit-wise U1 vs batch job span) — different grain.",
            "Throughput = scheduled qty ÷ makespan (working hours). Also shown per 8.5h shift-day in the UI.",
            "Tardiness / earliness use working hours vs due date (date-only dues = end of GENERAL day 17:00).",
            "Distant due dates: earliness is not compared — status is simply On time.",
            "Preferred method marks the best same-scope value (lower time is better except util / throughput).",
        ],
    }


def compare_order_schedules(db: Session, order_id: int) -> Dict[str, Any]:
    part_ids = (
        db.query(Rescheduling.part_id)
        .filter(
            Rescheduling.order_id == order_id,
            Rescheduling.status.in_(["scheduled", "rescheduled"]),
        )
        .distinct()
        .all()
    )
    unit_part_ids = (
        db.query(UnitScheduleItem.part_id)
        .filter(UnitScheduleItem.order_id == order_id)
        .distinct()
        .all()
    )
    ids = sorted({p[0] for p in part_ids} | {p[0] for p in unit_part_ids})
    parts = [compare_part_schedules(db, pid) for pid in ids]
    return {
        "success": True,
        "order_id": order_id,
        "parts": parts,
        "part_count": len(parts),
    }

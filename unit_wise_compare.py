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

from datetime import datetime
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
from production_log_helpers import is_schedulable_operation
from unit_wise_scheduler import list_unit_schedule


def _hours(delta_seconds: float) -> float:
    return round(delta_seconds / 3600.0, 4)


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


def _span_metrics(rows: List[Tuple[datetime, datetime]]) -> Dict[str, Any]:
    if not rows:
        return {
            "segment_count": 0,
            "makespan_hours": None,
            "earliest_start": None,
            "latest_end": None,
        }
    starts = [r[0] for r in rows if r[0] is not None]
    ends = [r[1] for r in rows if r[1] is not None]
    if not starts or not ends:
        return {
            "segment_count": len(rows),
            "makespan_hours": None,
            "earliest_start": None,
            "latest_end": None,
        }
    earliest = min(starts)
    latest = max(ends)
    return {
        "segment_count": len(rows),
        "makespan_hours": _hours((latest - earliest).total_seconds()),
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
        span_s = (max(ends) - min(starts)).total_seconds()
        busy_s = _merged_busy_seconds(intervals)
        idle_s = max(0.0, span_s - busy_s)
        out[mid] = {
            "machine_id": mid,
            "segment_count": len(intervals),
            "span_hours": _hours(span_s),
            "busy_hours": _hours(busy_s),
            "idle_hours": _hours(idle_s),
            "utilization_pct": _pct(busy_s, span_s),
            "earliest_start": min(starts).isoformat(),
            "latest_end": max(ends).isoformat(),
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
) -> float:
    """
    Waiting = sum of gaps between consecutive operations
    (next op earliest start − previous op latest end), floored at 0.
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
        gap = (ordered[i][0] - ordered[i - 1][1]).total_seconds()
        if gap > 0:
            wait_s += gap
    return wait_s


def _due_metrics(
    completion: Optional[datetime], due_date: Optional[datetime]
) -> Dict[str, Any]:
    if due_date is None or completion is None:
        return {
            "tardiness_hours": None,
            "earliness_hours": None,
            "on_time": None,
        }
    diff_s = (completion - due_date).total_seconds()
    tardiness = _hours(max(0.0, diff_s))
    earliness = _hours(max(0.0, -diff_s))
    return {
        "tardiness_hours": tardiness,
        "earliness_hours": earliness,
        "on_time": diff_s <= 0,
    }


def _throughput(
    units: Optional[int], makespan_hours: Optional[float]
) -> Optional[float]:
    if units is None or units <= 0 or not makespan_hours or makespan_hours <= 0:
        return None
    return round(float(units) / float(makespan_hours), 4)


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
) -> Dict[str, Any]:
    """
    Batch has no per-unit rows: treat the part batch as one job.
    Flow time ≈ makespan. Waiting = gaps between consecutive ops.
    """
    wait_s = _waiting_between_ops(
        [(r.operation_number, r.start_time, r.end_time) for r in batch]
    )
    wait_h = _hours(wait_s)
    units = _batch_units_for_throughput(batch, unit_planned=unit_planned)

    completion = _parse_dt(latest_end)
    due = _due_metrics(completion, due_date)

    return {
        "flow_hours": makespan_hours,  # single batch job
        "mean_flow_hours": makespan_hours,
        "waiting_hours": wait_h,
        "mean_waiting_hours": wait_h,
        "units_for_throughput": units,
        "throughput_units_per_hour": _throughput(units, makespan_hours),
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
) -> Dict[str, Any]:
    """
    Per unit:
      flow    = last segment end − first segment start
      waiting = gaps between consecutive ops for that unit
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
        flow_h = _hours((max(ends) - min(starts)).total_seconds())
        wait_h = _hours(
            _waiting_between_ops(
                [(s.operation_number, s.start_time, s.end_time) for s in segs]
            )
        )
        completion = max(ends)
        due = _due_metrics(completion, due_date)
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
        round(sum(f["flow_hours"] for f in flows) / n, 4) if n else None
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
    part_due = _due_metrics(latest, due_date)

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
        "on_time": part_due["on_time"],
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
    ops = db.query(Operation).filter(Operation.part_id == part_id).all()
    ops = [op for op in ops if is_schedulable_operation(db, op)]
    ops.sort(key=lambda o: _op_sort_key(o.operation_number))
    return ops


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


def compare_part_schedules(db: Session, part_id: int) -> Dict[str, Any]:
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        return {"success": False, "message": f"Part {part_id} not found"}

    batch = _batch_rows_for_part(db, part_id)
    unit_rows = list_unit_schedule(db, part_id=part_id, latest_only=True)
    ops = _schedulable_ops(db, part_id)
    order = _resolve_order(db, batch, unit_rows)
    due_date = order.due_date if order else None
    order_date = order.order_date if order else None
    qty = part.qty

    unit_span = _span_metrics([(r.start_time, r.end_time) for r in unit_rows])
    unit_flow = _unit_flow_waiting_metrics(unit_rows, due_date)
    unit_load = _machine_load_metrics(
        [(r.machine_id, r.start_time, r.end_time) for r in unit_rows]
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
        "per_machine": list(unit_load.values()),
    }

    batch_span = _span_metrics([(r.start_time, r.end_time) for r in batch])
    batch_load = _machine_load_metrics(
        [(r.machine_id, r.start_time, r.end_time) for r in batch]
    )
    batch_agg = _aggregate_machine_metrics(batch_load)
    batch_flow = _batch_flow_waiting_metrics(
        batch,
        batch_span.get("makespan_hours"),
        batch_span.get("latest_end"),
        due_date,
        unit_planned=unit_units or None,
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
        [(r.planned_start_time, r.planned_end_time) for r in planned]
    )
    planned_load = _machine_load_metrics(
        [
            (r.machine_id, r.planned_start_time, r.planned_end_time)
            for r in planned
        ]
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
    planned_due = _due_metrics(_parse_dt(planned_completion), due_date)
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
        "per_machine": list(planned_load.values()),
        "segment_count": planned_span.get("segment_count"),
    }

    all_mids = set(batch_load.keys()) | set(unit_load.keys()) | set(planned_load.keys())
    machines = _machines_by_id(db, all_mids)
    machines_compare = _build_machines_compare(batch_load, unit_load, machines)

    def _row(metric, purpose, unit, planned_v, batch_v, unit_v, *, higher_is_better=False, note=None):
        d_dyn = _delta_pair(batch_v, unit_v, higher_is_better=higher_is_better)
        d_pln = _delta_pair(planned_v, unit_v, higher_is_better=higher_is_better)
        out = {
            "metric": metric,
            "purpose": purpose,
            "unit": unit,
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
        }
        if note:
            out["note"] = note
        return out

    # Side-by-side: Planned | Dynamic | Unit-wise
    metrics_compare = [
        _row(
            "makespan",
            "Total completion time",
            "hours",
            planned_metrics.get("makespan_hours"),
            batch_metrics.get("makespan_hours"),
            unit_metrics.get("makespan_hours"),
        ),
        _row(
            "flow_time",
            "Time each job spends in the system",
            "hours",
            planned_metrics.get("flow_hours"),
            batch_metrics.get("flow_hours"),
            unit_metrics.get("first_unit_flow_hours"),
            note="Planned/Dynamic ≈ batch job flow; Unit-wise = first unit flow.",
        ),
        _row(
            "mean_flow_time",
            "Average job/unit completion time",
            "hours",
            planned_metrics.get("mean_flow_hours"),
            batch_metrics.get("mean_flow_hours"),
            unit_metrics.get("mean_flow_hours"),
        ),
        _row(
            "waiting_time",
            "Idle waiting between operations",
            "hours",
            planned_metrics.get("mean_waiting_hours"),
            batch_metrics.get("mean_waiting_hours"),
            unit_metrics.get("mean_waiting_hours"),
        ),
        _row(
            "machine_utilization",
            "Resource usage",
            "percent",
            planned_metrics.get("avg_utilization_pct"),
            batch_metrics.get("avg_utilization_pct"),
            unit_metrics.get("avg_utilization_pct"),
            higher_is_better=True,
        ),
        _row(
            "machine_idle_time",
            "Lost capacity",
            "hours",
            planned_metrics.get("idle_hours_total"),
            batch_metrics.get("idle_hours_total"),
            unit_metrics.get("idle_hours_total"),
        ),
        _row(
            "throughput",
            "Units completed per hour",
            "units/hour",
            planned_metrics.get("throughput_units_per_hour"),
            batch_metrics.get("throughput_units_per_hour"),
            unit_metrics.get("throughput_units_per_hour"),
            higher_is_better=True,
        ),
        _row(
            "tardiness",
            "How late jobs finish",
            "hours",
            planned_metrics.get("tardiness_hours"),
            batch_metrics.get("tardiness_hours"),
            unit_metrics.get("tardiness_hours"),
            note="Requires order due_date. 0 = on time or early.",
        ),
        _row(
            "earliness",
            "How early jobs finish",
            "hours",
            planned_metrics.get("earliness_hours"),
            batch_metrics.get("earliness_hours"),
            unit_metrics.get("earliness_hours"),
            higher_is_better=True,
            note="Requires order due_date.",
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
        "notes": [
            "Compare includes Planned (active planned_schedule_items), Dynamic (rescheduling_items), and Unit-wise.",
            "Makespan = latest end − earliest start.",
            "Flow time (unit) = unit last end − first start; (batch) = batch makespan (one job).",
            "Waiting = gaps between consecutive operations (next start − prev end).",
            "Machine utilization = busy ÷ machine span for this part only.",
            "Machine idle = gaps within that machine span (span − busy).",
            "Throughput = units_for_throughput ÷ makespan (aligned unfinished unit count when unit-wise exists).",
            "Tardiness = max(0, finish − due); Earliness = max(0, due − finish). Need due_date.",
            "GA fitness also optimizes setups, util, idle, priority (see unit_wise_ga_research).",
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

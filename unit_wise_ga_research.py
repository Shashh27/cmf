"""
Unit-wise scheduling optimizer — NSGA-II + Policy Engine.

Architecture
------------
Greedy → NSGA-II → Pareto Front → Policy Engine → Selected Production Schedule

Chromosome
----------
π = permutation of all activities (operation-sequence / priority list encoding).
Optional machine genes μ_a ∈ {0..|M_a|-1} when pin is off / no preferred.

Decode (semi-active priority list)
---------------------------------
Repeat: pick first activity in π that is precedence-feasible; place at
earliest feasible start on chosen/preferred machine (shift calendar).

Constraints (hard in decode)
----------------------------
- Active IN-House parts only (scope from PartScheduleStatus=active)
- Shift calendar (SchedulerEngine)
- Machine OFF / breakdown (_machine_next_available)
- Frozen in-progress machines; routing precedence; preferred pin

NSGA-II Objectives (minimise, except utilization which is maximised)
--------------------------------------------------------------------
1. makespan_hours         — schedule span
2. mean_tardiness_hours   — delivery commitment
3. avg_utilization_pct    — machine utilization (inverted so lower=better in norm.)
4. setup_count            — setup changes

Policy Engine
-------------
After NSGA-II generates the Pareto front, the Policy Engine selects ONE
schedule using a deterministic, priority-ordered criterion chain:

    balanced (default):
        1. Delivery commitment  (lead time met)
        2. Priority adherence   (priority inversions)
        3. Machine utilization  (higher util preferred)
        4. Makespan             (smaller preferred)
        5. Setup reduction      (fewer setups preferred)
        Tie-break: stable index for reproducibility

Additional policies can be added without modifying NSGA-II.

Debug / Profiling
-----------------
Instrumentation metrics (cache hits, decode timings, diversity, etc.) are
available only when debug=True is passed to optimize_unit_plan_research.
They are NEVER included in the normal production API response.
"""

from __future__ import annotations

import logging
import math
import os
import random
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy.orm import Session

from DB.models.configuration import Machine
from DB.models.oms import Operation, Order, Part
from production_log_helpers import total_approved_for_operation
from unit_wise_scheduler import (
    _actual_end_for_operation,
    _duration,
    _freeze_active_machines,
    _machines_for_workcenter,
    _pick_machine,
    _place_within_shifts_engine,
    _planned_start_for_operation,
    _preferred_machine_id,
    _rework_due_for_operation,
    _schedulable_operations,
    _snap_to_shift_start,
    _strip_tz,
    simulate_unit_plan,
)

logger = logging.getLogger(__name__)

ActivityId = int

# ---------------------------------------------------------------------------
# Supported policies
# ---------------------------------------------------------------------------
SUPPORTED_POLICIES = frozenset(
    [
        "balanced",
        "throughput",
        "minimum_setup",
        "minimum_makespan",
        "rush_order",
        "energy_efficient",
    ]
)


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------------------
# Core data structures
# ---------------------------------------------------------------------------


@dataclass
class Activity:
    id: ActivityId
    part_id: int
    part_number: str
    unit_index: int
    operation: Operation
    order: Order
    part: Part
    pred_id: Optional[ActivityId]
    machines: List[Machine]
    preferred_id: Optional[int]
    part_priority: int = 999  # lower = more urgent
    rework_slot: bool = False


@dataclass
class Individual:
    perm: List[ActivityId]
    machines: List[int]
    fitness: float = float("-inf")
    objectives: Dict[str, Any] = field(default_factory=dict)
    normalized_objectives: Dict[str, float] = field(default_factory=dict)
    rank: int = 0
    crowding_distance: float = 0.0


@dataclass
class Nsga2Config:
    """
    Configuration for NSGA-II scheduling optimizer.

    All weight parameters from the legacy weighted GA have been removed.
    Objective selection is now performed exclusively by the Policy Engine.
    """

    population: int = 40
    generations: int = 60
    tournament_k: int = 3
    crossover_rate: float = 0.9
    mutation_rate: float = 0.25
    elitism: int = 2
    runs: int = 3
    seed: Optional[int] = None
    pin_preferred: bool = True

    @classmethod
    def from_env(cls, overrides: Optional[Dict[str, Any]] = None) -> "Nsga2Config":
        o = overrides or {}
        return cls(
            population=int(o.get("population", _env_int("UNIT_WISE_GA_POPULATION", 40))),
            generations=int(o.get("generations", _env_int("UNIT_WISE_GA_GENERATIONS", 60))),
            tournament_k=int(o.get("tournament_k", _env_int("UNIT_WISE_GA_TOURNAMENT_K", 3))),
            crossover_rate=float(o.get("crossover_rate", _env_float("UNIT_WISE_GA_CX_RATE", 0.9))),
            mutation_rate=float(o.get("mutation_rate", _env_float("UNIT_WISE_GA_MUT_RATE", 0.25))),
            elitism=int(o.get("elitism", _env_int("UNIT_WISE_GA_ELITISM", 2))),
            runs=int(o.get("runs", _env_int("UNIT_WISE_GA_RUNS", 3))),
            seed=o.get("seed", None),
            pin_preferred=bool(
                o.get("pin_preferred", _env_bool("UNIT_WISE_PIN_PREFERRED", True))
            ),
        )


# ---------------------------------------------------------------------------
# Objective helpers
# ---------------------------------------------------------------------------


def _count_priority_inversions(perm: Sequence[ActivityId], activities: List[Activity]) -> int:
    prio = {a.id: a.part_priority for a in activities}
    inv = 0
    for i in range(len(perm)):
        pi = prio[perm[i]]
        for j in range(i + 1, len(perm)):
            if pi > prio[perm[j]]:
                inv += 1
    return inv


def _merged_busy_local(intervals: Sequence[Tuple[datetime, datetime]]) -> float:
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


def _pct(numer: float, denom: float) -> Optional[float]:
    if denom <= 0:
        return None
    return round(100.0 * numer / denom, 2)


def _hours(delta_seconds: float) -> float:
    return round(delta_seconds / 3600.0, 4)


# ---------------------------------------------------------------------------
# Activity builder
# ---------------------------------------------------------------------------


def build_activities(db: Session, scope: List[Dict[str, Any]]) -> List[Activity]:
    activities: List[Activity] = []
    next_id = 0
    for item in scope:
        part: Part = item["part"]
        order: Order = item["order"]
        qty = int(item["qty"])
        part_priority = int(item.get("priority") or 999)
        ops = _schedulable_operations(db, part.id)
        if not ops:
            continue

        # pred map: (unit, op_index_in_ops) -> activity id
        pred_by_unit_op: Dict[Tuple[int, int], ActivityId] = {}

        for op_i, operation in enumerate(ops):
            approved = int(total_approved_for_operation(db, operation.id) or 0)
            approved = max(0, min(approved, qty))
            rework_due = _rework_due_for_operation(db, operation.id, qty, approved)
            machines = _machines_for_workcenter(db, operation.workcenter_id)
            preferred_id = _preferred_machine_id(db, operation, order.id)
            if preferred_id and not any(m.id == preferred_id for m in machines):
                pref_m = db.query(Machine).filter(Machine.id == preferred_id).first()
                if pref_m:
                    machines = [pref_m] + list(machines)
            if not machines:
                continue

            remaining = list(range(approved + 1, qty + 1))
            for rem_i, u in enumerate(remaining):
                pred_id = None
                if op_i > 0:
                    pred_id = pred_by_unit_op.get((u, op_i - 1))
                act = Activity(
                    id=next_id,
                    part_id=part.id,
                    part_number=part.part_number,
                    unit_index=u,
                    operation=operation,
                    order=order,
                    part=part,
                    pred_id=pred_id,
                    machines=list(machines),
                    preferred_id=preferred_id,
                    part_priority=part_priority,
                    rework_slot=rem_i < rework_due,
                )
                activities.append(act)
                pred_by_unit_op[(u, op_i)] = next_id
                next_id += 1
    return activities


# ---------------------------------------------------------------------------
# Objective evaluator
# ---------------------------------------------------------------------------


def evaluate_segments(
    segments: List[Dict[str, Any]],
    *,
    due_by_order: Dict[int, Optional[datetime]],
    setup_count: int = 0,
    priority_inversions: int = 0,
) -> Dict[str, Any]:
    if not segments:
        return {
            "makespan_hours": None,
            "mean_flow_hours": None,
            "mean_waiting_hours": None,
            "mean_tardiness_hours": None,
            "mean_lateness_hours": None,
            "throughput_units_per_hour": None,
            "units_completed": 0,
            "setup_count": setup_count,
            "priority_inversions": priority_inversions,
            "busy_hours_total": 0.0,
            "idle_hours_total": 0.0,
            "avg_utilization_pct": None,
            "machine_count": 0,
        }

    starts = [s["start_time"] for s in segments]
    ends = [s["end_time"] for s in segments]
    makespan = _hours((max(ends) - min(starts)).total_seconds())

    by_unit: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}
    by_machine: Dict[int, List[Tuple[datetime, datetime]]] = {}
    for s in segments:
        by_unit.setdefault((s["part_id"], s["unit_index"]), []).append(s)
        mid = s.get("machine_id")
        if mid is not None:
            by_machine.setdefault(int(mid), []).append((s["start_time"], s["end_time"]))

    flows = []
    waits = []
    tards = []
    lateness = []
    for (_pid, _u), segs in by_unit.items():
        segs = sorted(segs, key=lambda x: (str(x["operation_number"]), x["start_time"]))
        u_start = min(x["start_time"] for x in segs)
        u_end = max(x["end_time"] for x in segs)
        flows.append(_hours((u_end - u_start).total_seconds()))

        by_op: Dict[str, List[Dict[str, Any]]] = {}
        for x in segs:
            by_op.setdefault(str(x["operation_number"]), []).append(x)
        op_keys = sorted(
            by_op.keys(),
            key=lambda k: (int(k) if k.isdigit() else 999999, k),
        )
        wait_s = 0.0
        prev_end = None
        for k in op_keys:
            block = by_op[k]
            b_start = min(x["start_time"] for x in block)
            b_end = max(x["end_time"] for x in block)
            if prev_end is not None:
                gap = (b_start - prev_end).total_seconds()
                if gap > 0:
                    wait_s += gap
            prev_end = b_end
        waits.append(_hours(wait_s))

        order_id = segs[0].get("order_id")
        due = due_by_order.get(order_id) if order_id is not None else None
        if due is not None:
            late_s = (u_end - due).total_seconds()
            lateness.append(_hours(late_s))
            tards.append(_hours(max(0.0, late_s)))
        else:
            lateness.append(0.0)
            tards.append(0.0)

    n = len(flows)
    mean_flow = round(sum(flows) / n, 4) if n else None
    mean_wait = round(sum(waits) / n, 4) if n else None
    mean_tard = round(sum(tards) / n, 4) if n else None
    mean_late = round(sum(lateness) / n, 4) if n else None
    thr = round(n / makespan, 4) if makespan and makespan > 0 else None

    busy_total = 0.0
    idle_total = 0.0
    utils = []
    for _mid, intervals in by_machine.items():
        span_s = (max(b for _, b in intervals) - min(a for a, _ in intervals)).total_seconds()
        busy_s = _merged_busy_local(intervals)
        idle_s = max(0.0, span_s - busy_s)
        busy_total += busy_s / 3600.0
        idle_total += idle_s / 3600.0
        u = _pct(busy_s, span_s)
        if u is not None:
            utils.append(u)

    # Prefer counted setups; else fall back to flags / changeover heuristic
    if setup_count <= 0:
        setup_count = sum(1 for s in segments if s.get("is_setup"))
    if setup_count <= 0 and segments:
        # Same changeover rule as NSGA decode: first (part, op) on a machine,
        # or a different (part, op) after another job, counts as a setup.
        last_ctx: Dict[Any, Any] = {}
        op_seen: Set[Tuple[Any, Any]] = set()
        for s in sorted(
            segments,
            key=lambda x: (x.get("start_time") or datetime.min, x.get("machine_id") or 0),
        ):
            mid = s.get("machine_id")
            pid = s.get("part_id")
            oid = s.get("operation_id")
            if mid is None or pid is None or oid is None:
                continue
            op_key = (pid, oid)
            same_run = last_ctx.get(mid) == op_key
            skip = same_run or op_key in op_seen or bool(s.get("rework_slot"))
            if not skip:
                setup_count += 1
            op_seen.add(op_key)
            last_ctx[mid] = op_key

    return {
        "makespan_hours": makespan,
        "mean_flow_hours": mean_flow,
        "mean_waiting_hours": mean_wait,
        "mean_tardiness_hours": mean_tard,
        "mean_lateness_hours": mean_late,
        "throughput_units_per_hour": thr,
        "units_completed": n,
        "setup_count": int(setup_count),
        "priority_inversions": int(priority_inversions),
        "busy_hours_total": round(busy_total, 4),
        "idle_hours_total": round(idle_total, 4),
        "avg_utilization_pct": round(sum(utils) / len(utils), 2) if utils else None,
        "machine_count": len(by_machine),
    }


# ---------------------------------------------------------------------------
# Chromosome decoder
# ---------------------------------------------------------------------------


def decode_activity_priority(
    db: Session,
    scope: List[Dict[str, Any]],
    activities: List[Activity],
    perm: Sequence[ActivityId],
    machine_genes: Sequence[int],
    *,
    engine,
    now: datetime,
    pin_preferred: bool,
    source: str = "nsga2",
) -> Dict[str, Any]:
    """
    Priority-list decode: repeatedly schedule the first precedence-feasible
    activity in permutation order (semi-active).
    """
    act_by_id = {a.id: a for a in activities}
    if not activities:
        return {
            "segments": [],
            "makespan_hours": None,
            "segment_count": 0,
            "source": source,
            "objectives": evaluate_segments([], due_by_order={}),
        }

    now = _strip_tz(now) or datetime.now()
    machine_free: Dict[int, datetime] = {}
    machine_last_ctx: Dict[int, Tuple[int, int]] = {}
    _freeze_active_machines(db, machine_free, now)

    # Initial unit ready times + approved advances
    unit_ready: Dict[Tuple[int, int], datetime] = {}
    for item in scope:
        part: Part = item["part"]
        qty = int(item["qty"])
        try:
            part_start = engine.adjust_to_shift(max(item["activation"] or now, now))
            part_start = _strip_tz(part_start) or now
        except Exception:
            part_start = max(item["activation"] or now, now)
            part_start = _snap_to_shift_start(part_start)
        for u in range(1, qty + 1):
            unit_ready[(part.id, u)] = part_start

        for operation in _schedulable_operations(db, part.id):
            approved = int(total_approved_for_operation(db, operation.id) or 0)
            actual_end = _actual_end_for_operation(db, operation.id)
            planned_start = _planned_start_for_operation(db, operation.id)
            # Apply completion time to ALL units:
            # 1. If production logs exist, use actual end time from production logs
            # 2. If no production logs (production not started), use planned start time
            # 3. If neither exists, keep current unit_ready value
            if actual_end is not None:
                # Production has started - cascade from actual completion time
                for u in range(1, qty + 1):
                    unit_ready[(part.id, u)] = actual_end
            elif planned_start is not None:
                # Production not started - use planned start time
                for u in range(1, qty + 1):
                    unit_ready[(part.id, u)] = max(unit_ready[(part.id, u)], planned_start)

    # Track first placement per (part, op) for setup skip
    op_started: Dict[Tuple[int, int], bool] = {}
    for a in activities:
        key = (a.part_id, a.operation.id)
        approved = int(total_approved_for_operation(db, a.operation.id) or 0)
        if approved > 0:
            op_started[key] = True

    completed: set = set()
    remaining = set(perm)
    segments_out: List[Dict[str, Any]] = []
    setup_count = 0

    guard = 0
    max_steps = len(activities) * 3 + 10
    while remaining and guard < max_steps:
        guard += 1
        scheduled = False
        for aid in perm:
            if aid not in remaining:
                continue
            act = act_by_id[aid]
            if act.pred_id is not None and act.pred_id not in completed:
                continue

            # machine choice
            mids = [m.id for m in act.machines]
            machine = None
            if pin_preferred and act.preferred_id is not None:
                machine = _pick_machine(
                    act.machines,
                    machine_free,
                    unit_ready[(act.part_id, act.unit_index)],
                    preferred_id=act.preferred_id,
                )
            else:
                gene = 0
                if aid < len(machine_genes) and mids:
                    gene = int(machine_genes[aid]) % len(mids)
                    machine = next((m for m in act.machines if m.id == mids[gene]), None)
                if machine is None:
                    machine = _pick_machine(
                        act.machines,
                        machine_free,
                        unit_ready[(act.part_id, act.unit_index)],
                        preferred_id=act.preferred_id,
                    )
            if machine is None:
                remaining.remove(aid)
                continue

            ready = unit_ready[(act.part_id, act.unit_index)]
            free = machine_free.get(machine.id, ready)
            # Don't use 'now' when cascading from actual production log completion times
            # This ensures the schedule starts from the actual end time, not current time
            start_candidate = max(ready, free)

            # Honour breakdown / OFF windows explicitly before shift placement
            try:
                avail = engine._machine_next_available(machine, start_candidate)
            except Exception:
                avail = start_candidate
            if avail is None:
                # Permanently OFF — try another machine if free choice
                if pin_preferred and act.preferred_id is not None:
                    remaining.remove(aid)
                    continue
                alt = None
                for m in act.machines:
                    if m.id == machine.id:
                        continue
                    try:
                        a2 = engine._machine_next_available(m, start_candidate)
                    except Exception:
                        a2 = start_candidate
                    if a2 is None:
                        continue
                    alt = m
                    avail = a2
                    break
                if alt is None:
                    remaining.remove(aid)
                    continue
                machine = alt
            start_candidate = _strip_tz(avail) or start_candidate

            prev_ctx = machine_last_ctx.get(machine.id)
            same_run = prev_ctx == (act.part_id, act.operation.id)
            op_key = (act.part_id, act.operation.id)
            skip_setup = same_run or op_started.get(op_key, False) or act.rework_slot
            if not skip_setup:
                setup_count += 1
            duration = _duration(act.operation, skip_setup=skip_setup)
            op_started[op_key] = True

            placed = _place_within_shifts_engine(
                engine, machine.id, start_candidate, duration
            )
            if not placed:
                remaining.remove(aid)
                continue

            first_seg = True
            for seg_start, seg_end in placed:
                segments_out.append(
                    {
                        "order_id": act.order.id,
                        "order_number": act.order.sale_order_number,
                        "part_id": act.part_id,
                        "part_number": act.part_number,
                        "unit_index": act.unit_index,
                        "operation_id": act.operation.id,
                        "operation_number": str(act.operation.operation_number),
                        "machine_id": machine.id,
                        "start_time": seg_start,
                        "end_time": seg_end,
                        "status": "unit_scheduled",
                        "source": source,
                        "is_setup": (not skip_setup) and first_seg,
                        "part_priority": act.part_priority,
                    }
                )
                first_seg = False

            last_end = placed[-1][1]
            machine_free[machine.id] = last_end
            machine_last_ctx[machine.id] = (act.part_id, act.operation.id)
            unit_ready[(act.part_id, act.unit_index)] = last_end
            remaining.remove(aid)
            completed.add(aid)
            scheduled = True
            break

        if not scheduled:
            logger.warning(
                "NSGA-II decode deadlock; dropping remaining activities",
                extra={"event": "unit_wise_nsga2_decode_deadlock", "left": len(remaining)},
            )
            break

    due_by_order = {
        item["order"].id: getattr(item["order"], "due_date", None) for item in scope
    }
    inversions = _count_priority_inversions(list(perm), activities)
    objectives = evaluate_segments(
        segments_out,
        due_by_order=due_by_order,
        setup_count=setup_count,
        priority_inversions=inversions,
    )
    return {
        "segments": segments_out,
        "makespan_hours": objectives.get("makespan_hours"),
        "segment_count": len(segments_out),
        "source": source,
        "objectives": objectives,
    }


# ---------------------------------------------------------------------------
# Genetic operators
# ---------------------------------------------------------------------------


def order_crossover(parent_a: List[int], parent_b: List[int], rng: random.Random) -> List[int]:
    """OX (Davis 1985) — feasibility-preserving for permutations."""
    n = len(parent_a)
    if n <= 2:
        return list(parent_a)
    i, j = sorted(rng.sample(range(n), 2))
    child = [-1] * n
    child[i : j + 1] = parent_a[i : j + 1]
    fill = [g for g in parent_b if g not in child]
    k = 0
    for idx in list(range(j + 1, n)) + list(range(0, i)):
        child[idx] = fill[k]
        k += 1
    return child


def mutate_perm(perm: List[int], rate: float, rng: random.Random) -> List[int]:
    p = list(perm)
    n = len(p)
    if n < 2:
        return p
    if rng.random() < rate:
        # swap
        a, b = rng.sample(range(n), 2)
        p[a], p[b] = p[b], p[a]
    if rng.random() < rate * 0.5 and n >= 3:
        # inversion
        i, j = sorted(rng.sample(range(n), 2))
        p[i : j + 1] = reversed(p[i : j + 1])
    return p


def mutate_machines(
    genes: List[int], n_choices: List[int], rate: float, rng: random.Random
) -> List[int]:
    out = list(genes)
    for i, choices in enumerate(n_choices):
        if choices <= 1:
            out[i] = 0
            continue
        if rng.random() < rate:
            out[i] = rng.randrange(choices)
    return out


# ---------------------------------------------------------------------------
# NSGA-II selection + sorting
# ---------------------------------------------------------------------------


def tournament_nsga2(
    pop: List[Individual], k: int, rng: random.Random
) -> Individual:
    """NSGA-II binary tournament selection based on rank and crowding distance."""
    contenders = rng.sample(pop, min(k, len(pop)))
    return min(contenders, key=lambda ind: (ind.rank, -ind.crowding_distance))


def _random_individual(
    n: int, n_choices: List[int], rng: random.Random
) -> Individual:
    perm = list(range(n))
    rng.shuffle(perm)
    machines = [rng.randrange(max(1, c)) if c > 0 else 0 for c in n_choices]
    return Individual(perm=perm, machines=machines)


def normalize_objectives(population: List[Individual]) -> Dict[str, Tuple[float, float]]:
    """Compute min/max for each objective and normalize to [0,1]."""
    if not population:
        return {}

    objective_names = ["makespan_hours", "mean_tardiness_hours", "avg_utilization_pct", "setup_count"]
    bounds = {}

    for obj in objective_names:
        values = []
        for ind in population:
            val = ind.objectives.get(obj)
            if val is not None:
                values.append(float(val))

        if not values:
            bounds[obj] = (0.0, 1.0)
            continue

        min_val = min(values)
        max_val = max(values)
        if max_val == min_val:
            bounds[obj] = (0.0, 1.0)
        else:
            bounds[obj] = (min_val, max_val)

    # Normalize
    for ind in population:
        ind.normalized_objectives = {}
        for obj, (min_val, max_val) in bounds.items():
            val = ind.objectives.get(obj)
            if val is None:
                ind.normalized_objectives[obj] = 0.5
                continue

            if max_val == min_val:
                normalized = 0.5
            else:
                normalized = (float(val) - min_val) / (max_val - min_val)

            # Utilization is maximization (invert so lower normalized = better)
            if obj == "avg_utilization_pct":
                normalized = 1.0 - normalized

            ind.normalized_objectives[obj] = normalized

    return bounds


def dominates(ind1: Individual, ind2: Individual) -> bool:
    """True if ind1 dominates ind2 (better or equal on all, strictly better on ≥1)."""
    obj_keys = ["makespan_hours", "mean_tardiness_hours", "avg_utilization_pct", "setup_count"]

    at_least_one_better = False
    for obj in obj_keys:
        v1 = ind1.normalized_objectives.get(obj, 0.5)
        v2 = ind2.normalized_objectives.get(obj, 0.5)
        # Lower is better for all (utilization already inverted in normalization)
        if v1 > v2:
            return False
        elif v1 < v2:
            at_least_one_better = True

    return at_least_one_better


def fast_non_dominated_sort(population: List[Individual]) -> List[List[int]]:
    """Fast non-dominated sorting. Returns list of fronts (each front is list of indices)."""
    n = len(population)
    if n == 0:
        return []

    domination_counts = [0] * n
    dominated_solutions = [[] for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if dominates(population[i], population[j]):
                dominated_solutions[i].append(j)
            elif dominates(population[j], population[i]):
                domination_counts[i] += 1

    fronts = [[]]
    for i in range(n):
        if domination_counts[i] == 0:
            population[i].rank = 1
            fronts[0].append(i)

    current_front = 0
    while fronts[current_front]:
        next_front = []
        for i in fronts[current_front]:
            for j in dominated_solutions[i]:
                domination_counts[j] -= 1
                if domination_counts[j] == 0:
                    population[j].rank = current_front + 2
                    next_front.append(j)
        current_front += 1
        fronts.append(next_front)

    return fronts


def compute_crowding_distance(population: List[Individual], front_indices: List[int]) -> None:
    """Compute crowding distance for individuals in a Pareto front."""
    if len(front_indices) <= 2:
        for i in front_indices:
            population[i].crowding_distance = float("inf")
        return

    obj_keys = ["makespan_hours", "mean_tardiness_hours", "avg_utilization_pct", "setup_count"]

    for i in front_indices:
        population[i].crowding_distance = 0.0

    for obj in obj_keys:
        sorted_indices = sorted(
            front_indices,
            key=lambda i: population[i].normalized_objectives.get(obj, 0.5),
        )

        population[sorted_indices[0]].crowding_distance = float("inf")
        population[sorted_indices[-1]].crowding_distance = float("inf")

        obj_range = population[sorted_indices[-1]].normalized_objectives.get(
            obj, 0.5
        ) - population[sorted_indices[0]].normalized_objectives.get(obj, 0.5)

        if obj_range == 0:
            continue

        for k in range(1, len(sorted_indices) - 1):
            idx = sorted_indices[k]
            prev_idx = sorted_indices[k - 1]
            next_idx = sorted_indices[k + 1]
            distance = (
                population[next_idx].normalized_objectives.get(obj, 0.5)
                - population[prev_idx].normalized_objectives.get(obj, 0.5)
            ) / obj_range
            population[idx].crowding_distance += distance


# ---------------------------------------------------------------------------
# Policy Engine
# ---------------------------------------------------------------------------


class PolicyEngine:
    """
    Selects one Individual from the NSGA-II Pareto front using a
    priority-ordered criterion chain.

    Design goals:
    - Operates exclusively on the final Pareto front (no re-decoding).
    - Reuses objective values already computed by NSGA-II.
    - Deterministic: identical inputs always produce identical outputs.
    - Extensible: new policies require only a new _select_<policy> method.

    Time complexity: O(F) where F = Pareto front size.
    """

    # Tolerance for float comparisons
    _FLOAT_TOL = 1e-6

    def __init__(self, policy: str = "balanced"):
        policy = policy.lower()
        if policy not in SUPPORTED_POLICIES:
            logger.warning(
                "Unknown policy '%s'; falling back to 'balanced'",
                policy,
                extra={"event": "policy_engine_unknown_policy", "policy": policy},
            )
            policy = "balanced"
        self.policy = policy

    def select(
        self,
        pareto_front: List[Individual],
        due_by_order: Optional[Dict[int, Optional[datetime]]] = None,
        committed_lead_time: Optional[datetime] = None,
    ) -> Individual:
        """
        Select one Individual from the Pareto front.

        Parameters
        ----------
        pareto_front : list of Individual
            Non-dominated solutions from NSGA-II.
        due_by_order : dict, optional
            Maps order_id -> due_date (used for delivery commitment checks).
        committed_lead_time : datetime, optional
            Overrides per-order due dates for a global delivery commitment check.

        Returns
        -------
        Individual
            The selected schedule.
        """
        if not pareto_front:
            raise ValueError("PolicyEngine.select: Pareto front is empty.")

        if len(pareto_front) == 1:
            return pareto_front[0]

        selector = getattr(self, f"_select_{self.policy}", None)
        if selector is None:
            selector = self._select_balanced
        return selector(pareto_front, due_by_order=due_by_order or {}, committed_lead_time=committed_lead_time)

    # ------------------------------------------------------------------
    # Policy implementations
    # ------------------------------------------------------------------

    def _select_balanced(
        self,
        front: List[Individual],
        *,
        due_by_order: Dict,
        committed_lead_time: Optional[datetime],
    ) -> Individual:
        """
        Balanced policy — criterion priority order:
          1. Delivery commitment (lead time met)
          2. Priority adherence  (fewer inversions)
          3. Machine utilization (higher preferred)
          4. Makespan            (smaller preferred)
          5. Setup reduction     (fewer setups preferred)
          Tie-break: stable enumeration index for determinism.
        """
        candidates = list(enumerate(front))  # (original_index, ind)

        # 1. Delivery commitment
        if committed_lead_time is not None:
            on_time = [
                (i, ind)
                for i, ind in candidates
                if self._meets_lead_time(ind, committed_lead_time)
            ]
            if on_time:
                candidates = on_time

        # 2. Priority adherence (fewer inversions)
        candidates = self._filter_min(candidates, lambda ind: float(ind.objectives.get("priority_inversions") or 0))

        # 3. Machine utilization (higher is better → negate)
        candidates = self._filter_min(
            candidates,
            lambda ind: -float(ind.objectives.get("avg_utilization_pct") or 0),
        )

        # 4. Makespan
        candidates = self._filter_min(candidates, lambda ind: float(ind.objectives.get("makespan_hours") or 1e12))

        # 5. Setup reduction
        candidates = self._filter_min(candidates, lambda ind: float(ind.objectives.get("setup_count") or 0))

        # Deterministic tie-break: lowest original index
        return min(candidates, key=lambda t: t[0])[1]

    def _select_minimum_makespan(
        self,
        front: List[Individual],
        *,
        due_by_order: Dict,
        committed_lead_time: Optional[datetime],
    ) -> Individual:
        return min(front, key=lambda ind: float(ind.objectives.get("makespan_hours") or 1e12))

    def _select_minimum_setup(
        self,
        front: List[Individual],
        *,
        due_by_order: Dict,
        committed_lead_time: Optional[datetime],
    ) -> Individual:
        return min(front, key=lambda ind: float(ind.objectives.get("setup_count") or 0))

    def _select_throughput(
        self,
        front: List[Individual],
        *,
        due_by_order: Dict,
        committed_lead_time: Optional[datetime],
    ) -> Individual:
        # Maximize throughput
        return max(front, key=lambda ind: float(ind.objectives.get("throughput_units_per_hour") or 0))

    def _select_rush_order(
        self,
        front: List[Individual],
        *,
        due_by_order: Dict,
        committed_lead_time: Optional[datetime],
    ) -> Individual:
        # Prioritize delivery commitment above all else, then makespan
        candidates = list(enumerate(front))
        if committed_lead_time is not None:
            on_time = [
                (i, ind)
                for i, ind in candidates
                if self._meets_lead_time(ind, committed_lead_time)
            ]
            if on_time:
                candidates = on_time
        return min(candidates, key=lambda t: (float(t[1].objectives.get("makespan_hours") or 1e12), t[0]))[1]

    def _select_energy_efficient(
        self,
        front: List[Individual],
        *,
        due_by_order: Dict,
        committed_lead_time: Optional[datetime],
    ) -> Individual:
        # Minimize idle hours (proxy for energy efficiency)
        return min(front, key=lambda ind: float(ind.objectives.get("idle_hours_total") or 0))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _meets_lead_time(self, ind: Individual, lead_time: datetime) -> bool:
        """Returns True if the schedule's makespan ends before the committed lead time."""
        ms = ind.objectives.get("makespan_hours")
        tard = ind.objectives.get("mean_tardiness_hours")
        # Use mean_tardiness_hours as a proxy: zero means on time
        if tard is not None:
            return float(tard) <= self._FLOAT_TOL
        return ms is not None  # if no tardiness info, assume acceptable

    @staticmethod
    def _filter_min(
        candidates: List[Tuple[int, Individual]],
        key_fn,
        tol: float = 1e-6,
    ) -> List[Tuple[int, Individual]]:
        """
        Retain candidates whose key_fn value is within tol of the minimum.
        If only one candidate remains after filtering, return it immediately.
        """
        if len(candidates) <= 1:
            return candidates
        best_val = min(key_fn(ind) for _, ind in candidates)
        filtered = [(i, ind) for i, ind in candidates if key_fn(ind) <= best_val + tol]
        return filtered if filtered else candidates


# ---------------------------------------------------------------------------
# Single NSGA-II run
# ---------------------------------------------------------------------------


def run_single_nsga2(
    db: Session,
    scope: List[Dict[str, Any]],
    activities: List[Activity],
    *,
    engine,
    now: datetime,
    cfg: Nsga2Config,
    rng: random.Random,
    debug: bool = False,
) -> Tuple[List[Individual], List[float], Dict[str, Any]]:
    """Run single NSGA-II optimization. Returns (pareto_front, convergence, best_plan)."""
    n = len(activities)
    n_choices = [
        1
        if (cfg.pin_preferred and a.preferred_id is not None)
        else max(1, len(a.machines))
        for a in activities
    ]

    # Memoization cache for chromosome evaluation
    eval_cache: Dict[Tuple[tuple, tuple], Dict[str, Any]] = {}

    # Debug instrumentation (only allocated when debug=True)
    if debug:
        total_evaluations = 0
        cache_hits = 0
        cache_misses = 0
        total_decode_time = 0.0
        unique_chromosomes_set: set = set()
        unique_objectives_set: set = set()

    def evaluate(ind: Individual) -> Individual:
        nonlocal eval_cache
        if debug:
            nonlocal total_evaluations, cache_hits, cache_misses, total_decode_time  # type: ignore[misc]
            nonlocal unique_chromosomes_set, unique_objectives_set  # type: ignore[misc]
            total_evaluations += 1  # type: ignore[assignment]

        perm_key = tuple(ind.perm)
        mach_key = tuple(ind.machines)
        cache_key = (perm_key, mach_key)

        if debug:
            unique_chromosomes_set.add(cache_key)  # type: ignore[union-attr]

        if cache_key in eval_cache:
            if debug:
                cache_hits += 1  # type: ignore[assignment]
            cached = eval_cache[cache_key]
            ind.objectives = cached["objectives"]
            ind._plan = cached["plan"]  # type: ignore[attr-defined]
            return ind

        if debug:
            cache_misses += 1  # type: ignore[assignment]
            t0 = time.perf_counter()

        plan = decode_activity_priority(
            db,
            scope,
            activities,
            ind.perm,
            ind.machines,
            engine=engine,
            now=now,
            pin_preferred=cfg.pin_preferred,
            source="nsga2",
        )

        if debug:
            total_decode_time += time.perf_counter() - t0  # type: ignore[assignment]
            obj_tuple = tuple(sorted((k, round(v, 6)) for k, v in (plan.get("objectives") or {}).items()))
            unique_objectives_set.add(obj_tuple)  # type: ignore[union-attr]

        ind.objectives = plan.get("objectives") or {}
        ind._plan = plan  # type: ignore[attr-defined]

        eval_cache[cache_key] = {"objectives": ind.objectives, "plan": plan}
        return ind

    pop = [_random_individual(n, n_choices, rng) for _ in range(cfg.population)]
    # Seed with greedy natural order and priority-sorted order
    pop[0] = Individual(perm=list(range(n)), machines=[0] * n)
    if n >= 2 and cfg.population > 1:
        prio_perm = sorted(
            range(n),
            key=lambda aid: (activities[aid].part_priority, activities[aid].part_id, aid),
        )
        pop[1] = Individual(perm=prio_perm, machines=[0] * n)

    for ind in pop:
        evaluate(ind)

    normalize_objectives(pop)
    fronts = fast_non_dominated_sort(pop)
    for front in fronts:
        compute_crowding_distance(pop, front)

    convergence: List[float] = []
    if fronts and fronts[0]:
        convergence.append(
            float(pop[fronts[0][0]].objectives.get("makespan_hours") or 1e9)
        )
    else:
        convergence.append(1e9)

    for _gen in range(cfg.generations):
        offspring: List[Individual] = []

        while len(offspring) < cfg.population:
            p1 = tournament_nsga2(pop, cfg.tournament_k, rng)
            p2 = tournament_nsga2(pop, cfg.tournament_k, rng)
            child_perm = (
                order_crossover(p1.perm, p2.perm, rng)
                if rng.random() < cfg.crossover_rate
                else list(p1.perm)
            )
            child_mach = list(p2.machines if rng.random() < 0.5 else p1.machines)

            child_perm = mutate_perm(child_perm, cfg.mutation_rate, rng)
            child_mach = mutate_machines(child_mach, n_choices, cfg.mutation_rate, rng)
            child = Individual(perm=child_perm, machines=child_mach)
            evaluate(child)
            offspring.append(child)

        combined = pop + offspring
        normalize_objectives(combined)
        fronts = fast_non_dominated_sort(combined)

        next_pop: List[Individual] = []
        current_front = 0

        while (
            current_front < len(fronts)
            and len(next_pop) + len(fronts[current_front]) <= cfg.population
        ):
            compute_crowding_distance(combined, fronts[current_front])
            next_pop.extend([combined[i] for i in fronts[current_front]])
            current_front += 1

        if len(next_pop) < cfg.population and current_front < len(fronts):
            compute_crowding_distance(combined, fronts[current_front])
            remaining_slots = cfg.population - len(next_pop)
            front_indices = sorted(
                fronts[current_front],
                key=lambda i: combined[i].crowding_distance,
                reverse=True,
            )
            next_pop.extend([combined[i] for i in front_indices[:remaining_slots]])

        pop = next_pop[: cfg.population]

        if fronts and fronts[0]:
            convergence.append(
                float(pop[0].objectives.get("makespan_hours") or 1e9)
                if pop
                else (convergence[-1] if convergence else 1e9)
            )
        else:
            convergence.append(convergence[-1] if convergence else 1e9)

    # Final Pareto front
    final_fronts = fast_non_dominated_sort(pop)
    pareto_front = [pop[i] for i in final_fronts[0]] if final_fronts else pop

    # Return the plan of the first individual (Policy Engine will select the best)
    best = pareto_front[0] if pareto_front else pop[0]
    plan = getattr(best, "_plan", {})

    # Attach debug metrics only when requested
    if debug:
        plan["_perf_metrics"] = {
            "total_evaluations": total_evaluations,  # type: ignore[possibly-undefined]
            "cache_hits": cache_hits,  # type: ignore[possibly-undefined]
            "cache_misses": cache_misses,  # type: ignore[possibly-undefined]
            "cache_hit_rate": (
                cache_hits / total_evaluations if total_evaluations > 0 else 0.0  # type: ignore[possibly-undefined]
            ),
            "total_decode_time": total_decode_time,  # type: ignore[possibly-undefined]
            "avg_decode_time": (
                total_decode_time / cache_misses if cache_misses > 0 else 0.0  # type: ignore[possibly-undefined]
            ),
            "unique_chromosomes": len(unique_chromosomes_set),  # type: ignore[arg-type]
            "unique_objectives": len(unique_objectives_set),  # type: ignore[arg-type]
            "chromosome_diversity": (
                len(unique_chromosomes_set) / total_evaluations if total_evaluations > 0 else 0.0  # type: ignore[possibly-undefined]
            ),
            "objective_diversity": (
                len(unique_objectives_set) / total_evaluations if total_evaluations > 0 else 0.0  # type: ignore[possibly-undefined]
            ),
        }

    return pareto_front, convergence, plan


# ---------------------------------------------------------------------------
# Multi-run optimizer
# ---------------------------------------------------------------------------


def plan_dominates_greedy(
    selected_obj: Dict[str, Any],
    greedy_obj: Dict[str, Any],
) -> bool:
    """
    True when selected Pareto-dominates greedy on the four shop objectives:
    minimize makespan / mean tardiness / setups; maximize utilization.
    Requires at least one strict improvement and no strict regression.
    """
    nsga2_ms = float(selected_obj.get("makespan_hours") or 1e12)
    greedy_ms = float(greedy_obj.get("makespan_hours") or 1e12)
    nsga2_tard = float(selected_obj.get("mean_tardiness_hours") or 0.0)
    greedy_tard = float(greedy_obj.get("mean_tardiness_hours") or 0.0)
    nsga2_util = float(selected_obj.get("avg_utilization_pct") or 0.0)
    greedy_util = float(greedy_obj.get("avg_utilization_pct") or 0.0)
    nsga2_setups = float(selected_obj.get("setup_count") or 0.0)
    greedy_setups = float(greedy_obj.get("setup_count") or 0.0)

    better = False
    worse = False
    for nsga_v, greedy_v, higher_is_better in (
        (nsga2_ms, greedy_ms, False),
        (nsga2_tard, greedy_tard, False),
        (nsga2_util, greedy_util, True),
        (nsga2_setups, greedy_setups, False),
    ):
        if higher_is_better:
            if nsga_v > greedy_v + 1e-6:
                better = True
            elif nsga_v < greedy_v - 1e-6:
                worse = True
        else:
            if nsga_v < greedy_v - 1e-6:
                better = True
            elif nsga_v > greedy_v + 1e-6:
                worse = True
    return bool(better and not worse)


def optimize_unit_plan_research(
    db: Session,
    scope: List[Dict[str, Any]],
    *,
    engine,
    now: Optional[datetime] = None,
    config_overrides: Optional[Dict[str, Any]] = None,
    policy: str = "balanced",
    committed_lead_time: Optional[datetime] = None,
    debug: bool = False,
) -> Dict[str, Any]:
    """
    Multi-run NSGA-II optimizer with Policy Engine for final schedule selection.

    Architecture: Greedy → NSGA-II → Pareto Front → Policy Engine → Final Schedule

    Parameters
    ----------
    db : Session
    scope : list of scope dicts (part, order, qty, priority, activation)
    engine : SchedulerEngine instance
    now : reference time (defaults to datetime.now())
    config_overrides : dict of Nsga2Config field overrides
    policy : policy name for PolicyEngine selection (default "balanced")
    committed_lead_time : optional global delivery commitment datetime
    debug : if True, attach profiling metrics to the response (dev mode only)
    """
    cfg = Nsga2Config.from_env(config_overrides)
    now = _strip_tz(now) or datetime.now()

    # ── Greedy baseline ──────────────────────────────────────────────
    greedy = simulate_unit_plan(db, scope, engine=engine, now=now, source="greedy")
    due_by_order = {
        item["order"].id: getattr(item["order"], "due_date", None) for item in scope
    }
    greedy_obj = evaluate_segments(greedy.get("segments") or [], due_by_order=due_by_order)
    greedy["objectives"] = greedy_obj

    meta: Dict[str, Any] = {
        "optimizer": "nsga2",
        "policy": policy,
        "encoding": "activity_permutation_ox",
        "decode": "priority_list_semi_active",
        "runs": cfg.runs,
        "population": cfg.population,
        "generations": cfg.generations,
        "constraints": {
            "active_parts_only": True,
            "shift_calendar": True,
            "machine_breakdown_off": True,
            "freeze_inprogress_machines": True,
            "routing_precedence": True,
            "preferred_machine_pin": cfg.pin_preferred,
            "part_priority_soft_penalty": True,
        },
        "pin_preferred": cfg.pin_preferred,
        "improved": False,
        "selected": "greedy",
    }

    if not _env_bool("UNIT_WISE_GA_ENABLED", True):
        greedy["ga"] = {**meta, "reason": "disabled"}
        greedy["source"] = "greedy"
        return greedy

    activities = build_activities(db, scope)
    meta["n_activities"] = len(activities)
    if len(activities) < 2:
        greedy["ga"] = {**meta, "reason": "too_few_activities"}
        return greedy

    # Scale down on large instances (shop-floor safety)
    if len(activities) > 80:
        cfg.population = min(cfg.population, 24)
        cfg.generations = min(cfg.generations, 30)
        cfg.runs = min(cfg.runs, 2)
        meta["scaled_down"] = True
        meta["population"] = cfg.population
        meta["generations"] = cfg.generations
        meta["runs"] = cfg.runs

    max_seconds = float(
        (config_overrides or {}).get(
            "max_seconds",
            _env_float("UNIT_WISE_GA_MAX_SECONDS", 240.0),
        )
    )
    meta["max_seconds"] = max_seconds

    base_seed = cfg.seed if cfg.seed is not None else _env_int("UNIT_WISE_GA_SEED", 42)

    all_pareto_fronts: List[List[Individual]] = []
    all_perf_metrics_debug: List[Dict[str, Any]] = []
    run_summaries = []
    all_cmax = []
    ga_start_time = time.perf_counter()

    for r in range(cfg.runs):
        if max_seconds > 0 and (time.perf_counter() - ga_start_time) >= max_seconds:
            meta["timed_out"] = True
            meta["timeout_after_runs"] = r
            logger.warning(
                "NSGA-II wall-clock budget exhausted before run %s",
                r,
                extra={"event": "unit_wise_nsga2_timeout", "max_seconds": max_seconds},
            )
            break
        rng = random.Random(base_seed + r * 997)
        try:
            pareto_front, convergence, plan = run_single_nsga2(
                db,
                scope,
                activities,
                engine=engine,
                now=now,
                cfg=cfg,
                rng=rng,
                debug=debug,
            )
            if debug and "_perf_metrics" in plan:
                all_perf_metrics_debug.append(plan.pop("_perf_metrics"))
        except Exception:
            logger.exception(
                "NSGA-II run failed",
                extra={"event": "unit_wise_nsga2_run_failed", "run": r},
            )
            continue

        all_pareto_fronts.append(pareto_front)
        # Track best makespan across runs for convergence summary
        best_ms = min(
            (float(ind.objectives.get("makespan_hours") or 1e9) for ind in pareto_front),
            default=1e9,
        )
        all_cmax.append(best_ms)
        run_summaries.append(
            {
                "run": r,
                "seed": base_seed + r * 997,
                "pareto_front_size": len(pareto_front),
                "best_makespan": best_ms,
                "convergence_makespan": convergence,
            }
        )

    meta["runs_detail"] = run_summaries

    # Stats
    cmax_vals = [c for c in all_cmax if c < 1e8]
    if cmax_vals:
        mean = sum(cmax_vals) / len(cmax_vals)
        var = sum((c - mean) ** 2 for c in cmax_vals) / len(cmax_vals)
        meta["stats"] = {
            "cmax_best": min(cmax_vals),
            "cmax_mean": round(mean, 4),
            "cmax_std": round(math.sqrt(var), 4),
            "cmax_worst": max(cmax_vals),
        }

    # Debug profiling (gated)
    if debug and all_perf_metrics_debug:
        ga_total_time = time.perf_counter() - ga_start_time
        total_evaluations = sum(m.get("total_evaluations", 0) for m in all_perf_metrics_debug)
        total_cache_hits = sum(m.get("cache_hits", 0) for m in all_perf_metrics_debug)
        total_cache_misses = sum(m.get("cache_misses", 0) for m in all_perf_metrics_debug)
        total_decode_time = sum(m.get("total_decode_time", 0.0) for m in all_perf_metrics_debug)
        meta["_debug_performance"] = {
            "total_ga_time_seconds": round(ga_total_time, 4),
            "total_evaluations": total_evaluations,
            "total_cache_hits": total_cache_hits,
            "total_cache_misses": total_cache_misses,
            "cache_hit_rate": round(total_cache_hits / total_evaluations, 4) if total_evaluations > 0 else 0.0,
            "total_decode_time_seconds": round(total_decode_time, 4),
            "avg_decode_time_seconds": round(total_decode_time / total_cache_misses, 4) if total_cache_misses > 0 else 0.0,
            "decode_time_percentage": round((total_decode_time / ga_total_time) * 100, 2) if ga_total_time > 0 else 0.0,
        }

    if not all_pareto_fronts:
        # All runs failed — return greedy
        greedy["ga"] = {**meta, "reason": "all_runs_failed"}
        return greedy

    # ── Merge Pareto fronts from all runs ───────────────────────────
    all_individuals: List[Individual] = []
    for front in all_pareto_fronts:
        all_individuals.extend(front)

    normalize_objectives(all_individuals)
    final_fronts = fast_non_dominated_sort(all_individuals)
    final_pareto_front = (
        [all_individuals[i] for i in final_fronts[0]] if final_fronts else all_individuals
    )
    meta["pareto_front_size"] = len(final_pareto_front)

    # ── Policy Engine: select ONE schedule ──────────────────────────
    policy_engine = PolicyEngine(policy=policy)
    selected_ind = policy_engine.select(
        final_pareto_front,
        due_by_order=due_by_order,
        committed_lead_time=committed_lead_time,
    )
    selected_obj = selected_ind.objectives
    selected_plan = getattr(selected_ind, "_plan", {})

    # ── Compare against greedy ──────────────────────────────────────
    # "Improved" = selected Pareto-dominates greedy (better on ≥1, worse on none).
    improved = bool(plan_dominates_greedy(selected_obj, greedy_obj) and selected_plan)

    meta["improved"] = bool(improved)
    meta["selected"] = "nsga2" if improved else "greedy"
    meta["selected_objectives"] = selected_obj
    meta["greedy_objectives"] = greedy_obj

    # Lead time assessment
    lead_time_met = float(selected_obj.get("mean_tardiness_hours") or 0.0) <= 1e-6
    meta["lead_time_met"] = lead_time_met

    if improved:
        selected_plan["source"] = "nsga2"
        selected_plan["ga"] = meta
        selected_plan["objectives"] = selected_obj
        return selected_plan

    # Greedy wins or NSGA-II produced no valid plan
    meta["selected"] = "greedy"
    greedy["ga"] = meta
    return greedy


# ---------------------------------------------------------------------------
# Backward-compatible alias (kept so existing callers don't break)
# ---------------------------------------------------------------------------

#: Alias for config — old code that imported ResearchGaConfig will still work.
ResearchGaConfig = Nsga2Config

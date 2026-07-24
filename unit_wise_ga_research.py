"""
Research-grade Genetic Algorithm for unit-wise flexible job-shop style scheduling.

Formulation (HMLV unit flow)
----------------------------
Activity a = (part p, unit u, operation o) for each unfinished unit-op.
Precedence: a_{p,u,o_k} → a_{p,u,o_{k+1}}.
Machine capacity: one activity at a time per machine (shift-aware placement).
Preferred-machine pin optional (UNIT_WISE_PIN_PREFERRED).

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

Soft: part-priority inversion penalty (lower priority# = more urgent).

Fitness cost (minimize → maximize −cost) — end goals
----------------------------------------------------
+ w_ms·Cmax + w_flow·F̄ + w_wait·W̄ + w_tard·T̄
+ w_setup·setups + w_idle·idle + w_util_gap·(1 − util)
+ w_priority·inversions − w_thr·throughput

“Maximize flow” in shop language ⇒ minimize mean flow + maximize throughput.
"""

from __future__ import annotations

import logging
import math
import os
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

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
    _preferred_machine_id,
    _rework_due_for_operation,
    _schedulable_operations,
    _snap_to_shift_start,
    _strip_tz,
    simulate_unit_plan,
)

logger = logging.getLogger(__name__)

ActivityId = int


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


@dataclass
class ResearchGaConfig:
    population: int = 40
    generations: int = 60
    tournament_k: int = 3
    crossover_rate: float = 0.9
    mutation_rate: float = 0.25
    elitism: int = 2
    runs: int = 3
    seed: Optional[int] = None
    w_makespan: float = 0.5
    w_mean_flow: float = 0.8
    w_mean_waiting: float = 0.25
    w_mean_tardiness: float = 1.0
    w_setup: float = 0.7
    w_idle: float = 0.45
    w_util_gap: float = 0.35
    w_throughput: float = 0.6
    w_priority: float = 0.4
    pin_preferred: bool = True

    @classmethod
    def from_env(cls, overrides: Optional[Dict[str, Any]] = None) -> "ResearchGaConfig":
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
            w_makespan=float(o.get("w_makespan", _env_float("UNIT_WISE_GA_W_MAKESPAN", 0.5))),
            w_mean_flow=float(o.get("w_mean_flow", _env_float("UNIT_WISE_GA_W_FLOW", 0.8))),
            w_mean_waiting=float(
                o.get("w_mean_waiting", _env_float("UNIT_WISE_GA_W_WAIT", 0.25))
            ),
            w_mean_tardiness=float(
                o.get("w_mean_tardiness", _env_float("UNIT_WISE_GA_W_TARD", 1.0))
            ),
            w_setup=float(o.get("w_setup", _env_float("UNIT_WISE_GA_W_SETUP", 0.7))),
            w_idle=float(o.get("w_idle", _env_float("UNIT_WISE_GA_W_IDLE", 0.45))),
            w_util_gap=float(o.get("w_util_gap", _env_float("UNIT_WISE_GA_W_UTIL_GAP", 0.35))),
            w_throughput=float(
                o.get("w_throughput", _env_float("UNIT_WISE_GA_W_THROUGHPUT", 0.6))
            ),
            w_priority=float(o.get("w_priority", _env_float("UNIT_WISE_GA_W_PRIORITY", 0.4))),
            pin_preferred=bool(
                o.get("pin_preferred", _env_bool("UNIT_WISE_PIN_PREFERRED", True))
            ),
        )


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
            rework_due = _rework_due_for_operation(db, operation.id)
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
                    # If previous op fully approved for this unit, no activity pred
                    # (ready time handled via actual_end / unit_ready init)
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


def _hours(delta_seconds: float) -> float:
    return round(delta_seconds / 3600.0, 4)


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

    # Prefer counted setups; else fall back to flags on segments
    if setup_count <= 0:
        setup_count = sum(1 for s in segments if s.get("is_setup"))

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
    source: str = "ga_research",
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
            for u in range(1, min(approved, qty) + 1):
                done_at = actual_end or unit_ready[(part.id, u)]
                unit_ready[(part.id, u)] = max(unit_ready[(part.id, u)], done_at)

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
            start_candidate = max(ready, free, now)

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
                "Research GA decode deadlock; dropping remaining activities",
                extra={"event": "unit_wise_ga_decode_deadlock", "left": len(remaining)},
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


def scalar_fitness(objectives: Dict[str, Any], cfg: ResearchGaConfig) -> float:
    """
    Higher is better. Aligns with shop end-goals:
    high util, high throughput, low setups/tardiness/idle/flow/waiting.
    """
    ms = objectives.get("makespan_hours")
    if ms is None:
        return -1e12
    flow = float(objectives.get("mean_flow_hours") or 0.0)
    wait = float(objectives.get("mean_waiting_hours") or 0.0)
    tard = float(objectives.get("mean_tardiness_hours") or 0.0)
    setups = float(objectives.get("setup_count") or 0.0)
    idle = float(objectives.get("idle_hours_total") or 0.0)
    util = objectives.get("avg_utilization_pct")
    util_gap = 0.0 if util is None else max(0.0, (100.0 - float(util)) / 100.0)
    thr = float(objectives.get("throughput_units_per_hour") or 0.0)
    inv = float(objectives.get("priority_inversions") or 0.0)
    # Normalize inversions lightly so huge n(n-1)/2 does not dominate
    inv_norm = inv / 100.0

    cost = (
        cfg.w_makespan * float(ms)
        + cfg.w_mean_flow * flow
        + cfg.w_mean_waiting * wait
        + cfg.w_mean_tardiness * tard
        + cfg.w_setup * setups
        + cfg.w_idle * idle
        + cfg.w_util_gap * util_gap * 10.0  # scale util gap into ~hours-like units
        + cfg.w_priority * inv_norm
        - cfg.w_throughput * thr
    )
    return -cost


# ── Genetic operators ───────────────────────────────────────────────


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


def tournament(
    pop: List[Individual], k: int, rng: random.Random
) -> Individual:
    contenders = rng.sample(pop, min(k, len(pop)))
    return max(contenders, key=lambda ind: ind.fitness)


def _random_individual(
    n: int, n_choices: List[int], rng: random.Random
) -> Individual:
    perm = list(range(n))
    rng.shuffle(perm)
    machines = [rng.randrange(max(1, c)) if c > 0 else 0 for c in n_choices]
    return Individual(perm=perm, machines=machines)


def run_single_ga(
    db: Session,
    scope: List[Dict[str, Any]],
    activities: List[Activity],
    *,
    engine,
    now: datetime,
    cfg: ResearchGaConfig,
    rng: random.Random,
) -> Tuple[Individual, List[float], Dict[str, Any]]:
    n = len(activities)
    n_choices = [
        1
        if (cfg.pin_preferred and a.preferred_id is not None)
        else max(1, len(a.machines))
        for a in activities
    ]

    def evaluate(ind: Individual) -> Individual:
        plan = decode_activity_priority(
            db,
            scope,
            activities,
            ind.perm,
            ind.machines,
            engine=engine,
            now=now,
            pin_preferred=cfg.pin_preferred,
            source="ga_research",
        )
        ind.objectives = plan.get("objectives") or {}
        ind.fitness = scalar_fitness(ind.objectives, cfg)
        ind._plan = plan  # type: ignore[attr-defined]
        return ind

    pop = [_random_individual(n, n_choices, rng) for _ in range(cfg.population)]
    # Seed greedy natural order + priority-sorted order
    pop[0] = Individual(perm=list(range(n)), machines=[0] * n)
    if n >= 2 and cfg.population > 1:
        prio_perm = sorted(
            range(n),
            key=lambda aid: (activities[aid].part_priority, activities[aid].part_id, aid),
        )
        pop[1] = Individual(perm=prio_perm, machines=[0] * n)

    for ind in pop:
        evaluate(ind)

    convergence: List[float] = []
    best = max(pop, key=lambda x: x.fitness)
    convergence.append(float(best.objectives.get("makespan_hours") or 1e9))

    for _gen in range(cfg.generations):
        pop.sort(key=lambda x: x.fitness, reverse=True)
        next_pop: List[Individual] = pop[: max(0, cfg.elitism)]

        while len(next_pop) < cfg.population:
            p1 = tournament(pop, cfg.tournament_k, rng)
            p2 = tournament(pop, cfg.tournament_k, rng)
            if rng.random() < cfg.crossover_rate:
                child_perm = order_crossover(p1.perm, p2.perm, rng)
            else:
                child_perm = list(p1.perm)
            child_mach = list(p1.machines)
            if rng.random() < 0.5:
                child_mach = list(p2.machines)

            child_perm = mutate_perm(child_perm, cfg.mutation_rate, rng)
            child_mach = mutate_machines(
                child_mach, n_choices, cfg.mutation_rate, rng
            )
            child = Individual(perm=child_perm, machines=child_mach)
            evaluate(child)
            next_pop.append(child)

        pop = next_pop[: cfg.population]
        gen_best = max(pop, key=lambda x: x.fitness)
        if gen_best.fitness > best.fitness:
            best = gen_best
        convergence.append(float(best.objectives.get("makespan_hours") or 1e9))

    return best, convergence, getattr(best, "_plan", {})


def optimize_unit_plan_research(
    db: Session,
    scope: List[Dict[str, Any]],
    *,
    engine,
    now: Optional[datetime] = None,
    config_overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Multi-run research GA vs greedy baseline; persist better plan.
    """
    cfg = ResearchGaConfig.from_env(config_overrides)
    now = _strip_tz(now) or datetime.now()

    greedy = simulate_unit_plan(db, scope, engine=engine, now=now, source="greedy")
    due_by_order = {
        item["order"].id: getattr(item["order"], "due_date", None) for item in scope
    }
    greedy_obj = evaluate_segments(greedy.get("segments") or [], due_by_order=due_by_order)
    greedy["objectives"] = greedy_obj
    greedy_fit = scalar_fitness(greedy_obj, cfg)

    meta: Dict[str, Any] = {
        "engine": "research",
        "encoding": "activity_permutation_ox",
        "decode": "priority_list_semi_active",
        "runs": cfg.runs,
        "population": cfg.population,
        "generations": cfg.generations,
        "weights": {
            "makespan": cfg.w_makespan,
            "mean_flow": cfg.w_mean_flow,
            "mean_waiting": cfg.w_mean_waiting,
            "mean_tardiness": cfg.w_mean_tardiness,
            "setup": cfg.w_setup,
            "idle": cfg.w_idle,
            "util_gap": cfg.w_util_gap,
            "throughput": cfg.w_throughput,
            "priority": cfg.w_priority,
        },
        "constraints": {
            "active_parts_only": True,
            "shift_calendar": True,
            "machine_breakdown_off": True,
            "freeze_inprogress_machines": True,
            "routing_precedence": True,
            "preferred_machine_pin": cfg.pin_preferred,
            "part_priority_soft_penalty": True,
        },
        "end_goals": [
            "maximize_machine_utilization",
            "minimize_setups",
            "minimize_tardiness_lateness",
            "minimize_machine_idle",
            "minimize_mean_flow_time",
            "maximize_throughput",
        ],
        "pin_preferred": cfg.pin_preferred,
        "greedy_objectives": greedy_obj,
        "greedy_fitness": greedy_fit,
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

    # Scale down on huge instances
    if len(activities) > 120:
        cfg.population = min(cfg.population, 24)
        cfg.generations = min(cfg.generations, 30)
        cfg.runs = min(cfg.runs, 2)
        meta["scaled_down"] = True
        meta["population"] = cfg.population
        meta["generations"] = cfg.generations
        meta["runs"] = cfg.runs

    base_seed = cfg.seed if cfg.seed is not None else _env_int("UNIT_WISE_GA_SEED", 42)
    run_summaries = []
    best_plan = greedy
    best_fit = greedy_fit
    best_obj = greedy_obj
    all_cmax = []

    for r in range(cfg.runs):
        rng = random.Random(base_seed + r * 997)
        try:
            ind, convergence, plan = run_single_ga(
                db,
                scope,
                activities,
                engine=engine,
                now=now,
                cfg=cfg,
                rng=rng,
            )
        except Exception:
            logger.exception(
                "Research GA run failed",
                extra={"event": "unit_wise_ga_research_run_failed", "run": r},
            )
            continue

        cmax = (ind.objectives or {}).get("makespan_hours")
        all_cmax.append(cmax)
        run_summaries.append(
            {
                "run": r,
                "seed": base_seed + r * 997,
                "fitness": ind.fitness,
                "objectives": ind.objectives,
                "convergence_makespan": convergence,
            }
        )
        if ind.fitness > best_fit + 1e-12:
            best_fit = ind.fitness
            best_obj = ind.objectives
            best_plan = plan

    # Stats
    cmax_vals = [c for c in all_cmax if c is not None]
    stats = {}
    if cmax_vals:
        mean = sum(cmax_vals) / len(cmax_vals)
        var = sum((c - mean) ** 2 for c in cmax_vals) / len(cmax_vals)
        stats = {
            "cmax_best": min(cmax_vals),
            "cmax_mean": round(mean, 4),
            "cmax_std": round(math.sqrt(var), 4),
            "cmax_worst": max(cmax_vals),
        }

    meta["runs_detail"] = run_summaries
    meta["stats"] = stats
    meta["best_objectives"] = best_obj
    meta["best_fitness"] = best_fit

    # Accept GA only if strictly better scalar fitness than greedy
    if best_fit > greedy_fit + 1e-12 and best_plan is not greedy:
        meta["improved"] = True
        meta["selected"] = "ga_research"
        best_plan["source"] = "ga_research"
        best_plan["ga"] = meta
        best_plan["objectives"] = best_obj
        return best_plan

    meta["improved"] = False
    meta["selected"] = "greedy"
    greedy["ga"] = meta
    return greedy

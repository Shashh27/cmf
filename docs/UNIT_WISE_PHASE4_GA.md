# Unit-wise Phase 4 — Research-grade GA

## End goals (fitness)

| Goal | How encoded |
|------|-------------|
| Effective machine utilization | Minimize util-gap `(100−util)/100` |
| Minimum setups | Minimize `setup_count` |
| Minimum tardiness / lateness | Minimize mean tardiness |
| Avoid machine idle | Minimize `idle_hours_total` |
| Faster flow | Minimize mean flow time |
| Higher throughput | Maximize units/hour (reward term) |

Weighted cost (higher fitness = lower cost):

`Cmax, flow, wait, tardiness, setups, idle, util_gap, priority_inversions − throughput`

## Hard constraints in decode

| Constraint | Mechanism |
|------------|-----------|
| Part active | Scope = `PartScheduleStatus=active` only |
| Shifts | `SchedulerEngine` shift windows |
| Breakdown / machine OFF | `engine._machine_next_available` before place |
| In-progress freeze | `_freeze_active_machines` |
| Routing precedence | Activity pred links Op k → Op k+1 per unit |
| Preferred machine | Pin by default (`UNIT_WISE_PIN_PREFERRED`) |

## Soft constraint

- **Part priority**: inversion penalty (lower priority# = more urgent). Population seeded with priority-sorted chromosome.

## Encoding / operators

- Activity permutation + optional machine genes  
- OX crossover, swap/inversion mutation, tournament, elitism, multi-run stats  

## Outperform Planned + Dynamic

Phase 3 compare now returns **three** columns:

- `batch_planned` — active `planned_schedule_items`  
- `batch_dynamic` — `rescheduling_items`  
- `unit_wise_greedy` / GA plan rows  

UI: **Planned | Dynamic | Unit-wise** with Δ vs Dyn and Δ vs Plan.

Success for a pilot part means unit-wise (after GA Research rebuild) improves the KPI set vs **both** planned and dynamic on flow / tardiness / throughput where due dates and multi-op work make them meaningful.

## API

```http
POST /api/v1/scheduling/unit-wise/rebuild
{ "optimizer": "ga", "part_id": 1661 }
```

## Env weights

`UNIT_WISE_GA_W_MAKESPAN`, `_FLOW`, `_WAIT`, `_TARD`, `_SETUP`, `_IDLE`, `_UTIL_GAP`, `_THROUGHPUT`, `_PRIORITY`

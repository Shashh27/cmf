# Unit-wise Phase 3 — Pilot checklist

Prove batch dynamic vs unit-wise greedy value **before** Phase 4 (GA).

## Setup

1. Restart API with `UNIT_WISE_SCHEDULE_ENABLED=true`.
2. Pick a pilot part: qty 2–10, **2+ schedulable ops**, active.
3. Ensure batch dynamic has rows (`rescheduling_items`).
4. Rebuild unit-wise: `POST /api/v1/scheduling/unit-wise/rebuild` `{ "part_id": <id> }`.

## Compare UI (Planned Schedule)

On **Machine Scheduling → Planned → Unit-wise (Greedy)**:

- KPI table: makespan, flow, mean flow, waiting, util, idle, throughput, tardiness, earliness
- Per-machine utilization & idle
- Per-unit flow / waiting (expand)

## Compare API

```http
GET /api/v1/scheduling/unit-wise/compare?part_id=<id>
```

Or order-wide:

```http
GET /api/v1/scheduling/unit-wise/compare?order_id=<id>
```

## KPIs to record

| Metric | Purpose | Where |
|--------|---------|--------|
| Makespan | Total completion time | `*.makespan_hours` / `metrics_compare` |
| Flow time | Time each job spends in system | batch `flow_hours`; unit `first_unit_flow_hours` / `unit_flows` |
| Mean flow time | Average job/unit completion time | `*.mean_flow_hours` |
| Waiting time | Idle waiting between operations | `*.mean_waiting_hours` |
| Machine utilization | Resource usage | `*.avg_utilization_pct` + `machines_compare` |
| Machine idle time | Lost capacity | `*.idle_hours_total` + `machines_compare` |
| Throughput | Units completed per hour | `*.throughput_units_per_hour` |
| Tardiness | How late jobs finish | `*.tardiness_hours` (needs `due_date`) |
| Earliness | How early jobs finish | `*.earliness_hours` (needs `due_date`) |

Takt time is **out of scope** for Phase 3.

## Shop checks (same pilot)

1. Op N approve partial qty → next op job card unlocks with available qty.
2. Unit-wise Gantt shows remaining units only for that op’s unfinished indexes.
3. Shift boundaries match configured shift hours.
4. Active job card machine is not stolen by another WC sibling machine.

## Exit criteria for Phase 3

- [ ] Compare API returns data for at least one real part.
- [ ] Phase 3 compare panel loads on Unit-wise mode and switches parts correctly.
- [ ] KPI table shows a clear batch vs unit story (or document why not).
- [ ] Stakeholders agree unit-wise is worth GA (Phase 4) **or** stay on greedy only.

## Out of scope here

- Genetic Algorithm (Phase 4) — see `UNIT_WISE_PHASE4_GA.md`
- Unlock look-ahead debate (plan ≡ unlock) — deferred chat
- Takt time

# Unit-Wise Scheduler — Manager Workflow Overview

**Audience:** Management / PPS leadership  
**Purpose:** Explain *what* the unit-wise (Intelligent) scheduler does, *how work flows*, and *how it differs from today’s batch shop-floor schedule* — without deep technical detail.

---

## 1. One-sentence summary

> Unit-wise scheduling plans **each piece (unit)** through operations with **pipelining** and optional **machine sharing inside a work center**, so we can test better machine utilization and earlier downstream starts — **without changing live job cards**.

---

## 2. Where it sits in PPS

```mermaid
flowchart LR
  subgraph PPS["PPS"]
    AA["Assets Availability"]
    CP["Capacity Planning"]
    MS["Machine Scheduling<br/>(Batch — Production)"]
    IS["Intelligent Scheduler<br/>(Unit-wise — Test bed)"]
  end

  MS -->|"Live Gantt · Job cards · Operators"| Floor["Shop floor"]
  IS -->|"What-if Gantt · Comparison only"| Review["Planning / R&D review"]
```

| Area | Role |
|------|------|
| **Machine Scheduling** | Production schedule. Operators get job cards from here. |
| **Intelligent Scheduler** | Parallel **test bed**. Shows a unit-wise plan + comparison. Does **not** issue job cards. |

---

## 3. Core idea: Batch vs Unit-wise

```mermaid
flowchart TB
  subgraph Batch["Batch (today’s production model)"]
    B1["Finish quantity as a block on Op 10"]
    B2["Then start Op 20 for remaining qty"]
    B3["Usually one preferred machine"]
    B1 --> B2 --> B3
  end

  subgraph Unit["Unit-wise (Intelligent Scheduler)"]
    U1["Unit 1 finishes Op 10 → can enter Op 20"]
    U2["Unit 2 may still be on Op 10"]
    U3["Remaining qty can use several machines<br/>in the same work center"]
    U1 --> U2
    U2 --> U3
  end
```

**Manager takeaway**

- **Batch** = safe, operation-level cascade (shop floor today).
- **Unit-wise** = piece-level flow + optional split across work-center machines → often **less idle time** and **earlier completion** of later ops in simulation.

---

## 4. End-to-end workflow (non-technical)

```mermaid
flowchart TD
  A["Parts activated on the order"] --> B["Production may already have logs<br/>(approved / rework / in progress)"]
  B --> C["Planner opens Intelligent Scheduler"]
  C --> D{"Pin preferred machine?"}

  D -->|"Off — optimized"| E["Work center picks earliest-free machines<br/>Quantity may split across spindles"]
  D -->|"On — controlled"| F["Planner selects Work center + Machine<br/>All remaining qty stays on that machine"]

  E --> G["Choose optimizer: Greedy or GA Research"]
  F --> G
  G --> H["Rebuild schedule"]
  H --> I["Unit-wise plan stored<br/>(separate from batch)"]
  I --> J["Gantt view"]
  I --> K["Comparison Analysis<br/>vs Planned / Dynamic batch"]
  J --> L["Review with manager — decide if approach is worth promoting later"]
  K --> L
```

---

## 5. What “Rebuild” considers

```mermaid
flowchart LR
  subgraph Inputs["Inputs"]
    I1["Active parts & priorities"]
    I2["Routing / work centers"]
    I3["Shifts & OT rules"]
    I4["Production logs<br/>(what is already done)"]
    I5["Pin / machine choice from UI"]
  end

  subgraph Engine["Unit-wise engine"]
    E1["Skip finished units"]
    E2["Pipeline ready units to next op"]
    E3["Place work inside shifts"]
    E4["Greedy plan<br/>or GA multi-objective search"]
  end

  subgraph Outputs["Outputs"]
    O1["Unit schedule Gantt"]
    O2["Comparison KPIs"]
  end

  Inputs --> Engine --> Outputs
```

### After production has started

| Situation | Unit-wise behavior |
|-----------|-------------------|
| Some qty already **approved** on an op | Those units are treated as done; only **remaining** units are planned |
| Job card has a real **finish time** | Next remaining work uses that as continuity |
| Machine still running | That machine is treated as busy until the run can free |

Planner must click **Rebuild** after new logs — the plan does not auto-stream like a live operator board.

---

## 6. Pin preferred — the main control

```mermaid
flowchart TB
  P{"Pin preferred machine?"}

  P -->|OFF| A["Goal: utilization"]
  A --> A1["Earliest free machine in the work center"]
  A1 --> A2["Qty may run in parallel on different machines"]
  A2 --> A3["Example: Unit 3 → Machine A,<br/>Unit 4 → Machine B, Unit 5 → Machine C"]

  P -->|ON| B["Goal: control / match shop intent"]
  B --> B1["Select work center + one machine"]
  B1 --> B2["All remaining qty on that machine only"]
  B2 --> B3["No quantity split"]
```

**Example (part with Op 20 still open):**  
Changing routing to STC updates the **preferred** machine for batch.  
On Intelligent Scheduler:

- Pin **OFF** → STC is only one option in the WC; split can still happen.  
- Pin **ON** + STC → remaining Op 20 all on STC.

---

## 7. Optimizers (high level)

| Mode | What it optimizes for | When to use |
|------|----------------------|-------------|
| **Greedy** | Fast plan: earliest start, WC free machines, pipelining | Day-to-day what-if |
| **GA Research** | Searches trade-offs: due date, utilization, makespan, setups | Deeper study / demos |

Default GA selection policy is **balanced**: delivery → priority → utilization → makespan → setups.

---

## 8. What unit-wise does **not** do

```mermaid
flowchart LR
  IS["Intelligent Scheduler"] -.->|"does not write"| JC["Job cards"]
  IS -.->|"does not change"| RI["Batch rescheduling_items<br/>(live production Gantt)"]
  IS -->|"writes only"| US["unit_schedule_items<br/>(test-bed plan)"]

  MS["Machine Scheduling"] -->|"writes"| RI
  MS -->|"feeds"| JC
```

- Operators continue to work from **Machine Scheduling**.  
- Unit-wise is for **planning review and comparison**, until leadership decides to promote it.

---

## 9. Machine change on an in-progress part (related shop flow)

If production needs a different machine (e.g. Tekcel → STC) while the part is active:

```mermaid
sequenceDiagram
  actor Planner
  participant MS as Machine Scheduling
  participant Ops as Operation routing
  participant Dyn as Dynamic reschedule
  participant IS as Intelligent Scheduler

  Planner->>MS: Deactivate part
  Note over MS: Live batch rows for that part are cleared
  Planner->>Ops: Change machine on the operation
  Planner->>MS: Reactivate part
  MS->>Dyn: Rebuild live batch plan
  Note over Dyn: rescheduling_items updated<br/>Job-card path uses new machine
  Planner->>IS: Rebuild unit-wise plan
  Note over IS: unit_schedule_items refresh<br/>only after this rebuild
```

Production **logs are kept**. Batch Gantt updates on activate; unit-wise Gantt updates only after Intelligent Scheduler rebuild.

---

## 10. How to present this in 3 minutes

1. **Problem:** Batch waits for operation-level close; machines can sit idle; downstream ops start late.  
2. **Idea:** Plan **per unit**, allow **work-center sharing**, respect **real production progress**.  
3. **Safety:** Separate screen; **no job cards**; batch production untouched.  
4. **Control:** Pin OFF = optimize/split; Pin ON = force one machine.  
5. **Proof:** Gantt + Comparison Analysis vs current dynamic schedule.  
6. **Ask:** Continue pilot / compare more parts / later decide on production adoption.

---

## 11. Glossary (manager-friendly)

| Term | Meaning |
|------|---------|
| **Unit** | One piece of the order quantity |
| **Pipelining** | Next operation can start for a unit as soon as *that* unit finished the previous op |
| **Qty split** | Remaining pieces of the same op run on more than one machine in the same work center |
| **Pin preferred** | Force all remaining qty onto one chosen machine |
| **Batch / Dynamic** | Today’s live production schedule |
| **Intelligent Scheduler** | UI for the unit-wise test bed |

---

*Document location: `backend/cmf/docs/UNIT_WISE_SCHEDULER_MANAGER_WORKFLOW.md`*  
*Companion screens: PPS → Intelligent Scheduler (Gantt + Comparison Analysis).*

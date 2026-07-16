# Production Scheduling — Manufacturing Guide (Visual)

**Purpose:** Explain how a part moves from **not yet scheduled** to **fully completed** — in plain manufacturing language with diagrams.

**Audience:** Plant management, production planners, manufacturing coordinators, supervisors, and operators.

**Companion viewer:** Open [view-scheduling-manufacturing-diagrams.html](./view-scheduling-manufacturing-diagrams.html) in a browser for scrollable interactive diagrams.

**Mermaid source (.mmd):** [view-mmd-manufacturing.html](./view-mmd-manufacturing.html) — view, copy, or download [scheduling-workflow-manufacturing.mmd](./scheduling-workflow-manufacturing.mmd).

**Architecture (Excalidraw):** [scheduling-architecture-roles.excalidraw](./scheduling-architecture-roles.excalidraw) — end-to-end scheduling with user roles (open in VS Code Excalidraw extension or [excalidraw.com](https://excalidraw.com)).

**Architecture (Eraser.io):** [pps-scheduling-end-to-end.eraserdiagram](./pps-scheduling-end-to-end.eraserdiagram) — professional BPMN swimlane block diagram ([how to open](./PPS_ERASER_DIAGRAM.md)).

**E2E role flowchart (only flowchart):** [view-pps-e2e-flowchart.html](./view-pps-e2e-flowchart.html) · [pps-e2e-role-flowchart.mmd](./pps-e2e-role-flowchart.mmd) — asset availability → breakdown / leave / OT / out-source → part completed.

**Doc index:** [README.md](./README.md) — which file to open for what.

---

## 1. The full circle — from plant setup to part done

```mermaid
flowchart TB
    subgraph Setup["Step 0 — Prepare the plant"]
        S1[Set shift hours and working calendar]
        S2[Register machines and work centres]
        S3[Assign operators to machines]
    end

    subgraph Ready["Step A — Make the order ready"]
        R1[Link raw material and drawing]
        R2[Activate the sale order]
        R3[Activate each in-house part]
        R4[Set part priority — who runs first]
    end

    subgraph Plan["Step B — Create the plan"]
        P1[Generate the baseline schedule]
        P2[Copy plan to the live shop-floor schedule]
    end

    subgraph Floor["Step C — Run work on the floor"]
        F1[Operator opens job card]
        F2[Start the job when allowed]
        F3[Record what was made]
        F4[Supervisor or coordinator reviews]
    end

    subgraph Replan["Step D — Keep the plan honest"]
        D1[Recalculate remaining work and times]
        D2[Update job cards and Gantt]
    end

    subgraph Done["Step E — Part finished"]
        E1[Every operation approved]
        E2[Part removed from priority queue]
    end

    Setup --> Ready
    Ready --> Plan
    Plan --> Floor
    Floor --> Replan
    Replan --> Floor
    Floor --> Done
    Setup -->|Machine breakdown| Replan
    Ready -->|Priority change| Replan

    style Setup fill:#f1f5f9,stroke:#64748b
    style Ready fill:#eff6ff,stroke:#3b82f6
    style Plan fill:#f0f9ff,stroke:#0284c7
    style Floor fill:#fff7ed,stroke:#ea580c
    style Replan fill:#f0fdf4,stroke:#16a34a
    style Done fill:#faf5ff,stroke:#9333ea
```

**In one sentence:** The plant is configured, orders and parts are made ready, a plan is built, operators run and record work, supervisors approve it, and the system keeps replanning until the part is done.

---

## 2. Two plans — what planners see vs what the floor sees

```mermaid
flowchart LR
    subgraph Baseline["Baseline plan — the formal snapshot"]
        B1[Last generated schedule]
        B2[Used for history and capacity reports]
    end

    subgraph Live["Live plan — what operators follow today"]
        L1[Current start and finish times on job cards]
        L2[Updates after approvals, breakdowns, priority changes]
    end

    GEN[Generate schedule] --> Baseline
    Baseline -->|Copy to floor| Live
    EVENTS[Shop-floor events] --> Live

    style Baseline fill:#f0f9ff,stroke:#0284c7
    style Live fill:#f0fdf4,stroke:#16a34a
```

| Plan | Who uses it | When it changes |
|------|-------------|-----------------|
| **Baseline** | Management, planners | Only when someone runs a full schedule generation |
| **Live** | Operators, supervisors, coordinators | Automatically after approvals, breakdowns, and priority swaps |

---

## 3. What must be true before a part can be scheduled

```mermaid
flowchart TD
    START([Part on the order]) --> T1{Made in-house?}
    T1 -->|No| OUT[Handled outside this scheduling path]
    T1 -->|Yes| T2{Raw material ready?}
    T2 -->|No| BLOCK[Cannot activate — material missing]
    T2 -->|Yes| T3{Engineering drawing available?}
    T3 -->|No| BLOCK
    T3 -->|Yes| T4{Order activated?}
    T4 -->|No| WAIT1[Not in the scheduling pool yet]
    T4 -->|Yes| T5{Part activated?}
    T5 -->|No| WAIT2[Part not released for production]
    T5 -->|Yes| T6{Priority assigned and not completed?}
    T6 -->|No| WAIT3[Completed or taken out of queue]
    T6 -->|Yes| T7{Routing operations defined?}
    T7 -->|No| SKIP[Nothing to schedule]
    T7 -->|Yes| READY([Ready for scheduling])

    style READY fill:#dcfce7,stroke:#16a34a
    style BLOCK fill:#fee2e2,stroke:#dc2626
```

---

## 4. Who does what

```mermaid
flowchart LR
    subgraph Office["Planning & administration"]
        ADM[Administrator]
        MC[Manufacturing Coordinator]
    end

    subgraph Shop["Shop floor"]
        SUP[Supervisor]
        OP[Operator]
    end

    ADM -->|Machines, shifts, breakdowns| Office
    MC -->|Part priorities, swaps| Office
    ADM -->|Activate orders and parts| Office

    Office -->|Live schedule| OP
    OP -->|Production record| SUP
    OP -->|Production record| MC
    SUP -->|Approve OR| LIVE[Live schedule refreshed]
    MC -->|Approve OR| LIVE
    ADM -->|Record breakdown| LIVE
    LIVE --> OP
```

| Role | Main job in scheduling |
|------|------------------------|
| **Administrator** | Plant setup, machine status, order/part activation, exceptions |
| **Manufacturing Coordinator** | Part priority, swap decisions, may approve production |
| **Supervisor** | Approve production, quality decisions, floor oversight |
| **Operator** | Start jobs when allowed, record quantities, submit for approval |

**Approval rule:** For each production submission, **either** the supervisor **or** the manufacturing coordinator may approve — **not both**. Whoever approves first is recorded; the other is notified and cannot change that decision.

---

## 5. Operator job card — start, work, submit, wait for review

```mermaid
stateDiagram-v2
    [*] --> Waiting: Job appears on schedule

    Waiting --> Working: Start job — all checks pass
    Waiting --> Blocked: Machine down, too early, or prior op not done

    Working --> AwaitingReview: Submit quantities for approval

    state AwaitingReview {
        [*] --> ReviewerMustAct
    }

    AwaitingReview --> Reviewed: Supervisor or coordinator decides

    state Reviewed {
        [*] --> MoreWorkNeeded: Some approved, some rework or reject
        [*] --> AllGoodThisRound: Everything presented was approved
    }

    MoreWorkNeeded --> Working: Start next run after review
    AllGoodThisRound --> Working: More quantity still needed on this operation
    AllGoodThisRound --> OperationDone: Total approved equals order quantity

    OperationDone --> [*]

    note right of AwaitingReview
      Operator cannot start
      or submit again until
      reviewer has acted
    end note
```

---

## 6. What the operator records — new work vs rework

After a review, the system knows how much work is still open. The operator enters two kinds of quantity:

```mermaid
flowchart LR
    subgraph StillToDo["Work still open on this operation"]
        TOTAL[Total still to complete]
        NEW[Never-made units + units to remake after rejection]
        REWORK[Same parts to fix — rework only]
        TOTAL --- NEW
        TOTAL --- REWORK
    end

    subgraph OperatorEnters["What the operator enters"]
        E1[New manufacture quantity]
        E2[Rework quantity]
    end

    NEW --> E1
    REWORK --> E2

    style StillToDo fill:#eff6ff,stroke:#3b82f6
    style OperatorEnters fill:#fff7ed,stroke:#ea580c
```

**Plain-language example — order quantity 10:**

| After review | Meaning |
|--------------|---------|
| 5 approved | Good parts accepted |
| 3 rework | Same 3 parts need correction — operator reworks them |
| 2 rejected | Those 2 must be made again from scratch |
| **5 still to do** | 3 rework + 2 remake (nothing left untouched) |

On the next run the operator may enter **up to 2** as new manufacture and **up to 3** as rework — in one submission or across separate job cycles.

---

## 7. When the system will not let the operator start a job

```mermaid
flowchart TD
    START([Operator taps Start]) --> G1{Previous operations on this part done?}
    G1 -->|No| B1[Blocked — finish earlier steps first]
    G1 -->|Yes| G2{Last submission still waiting for review?}
    G2 -->|Yes| B2[Blocked — reviewer must decide first]
    G2 -->|No| G3{This operation already fully approved?}
    G3 -->|Yes| B3[Blocked — nothing left to make]
    G3 -->|No| G4{Machine in breakdown?}
    G4 -->|Yes| B4[Blocked — machine unavailable]
    G4 -->|No| G5{Scheduled start time reached?}
    G5 -->|No| B5[Blocked — too early]
    G5 -->|Yes| G6{Operator on approved leave?}
    G6 -->|Yes| B6[Blocked — on leave]
    G6 -->|No| OK[Job started — work in progress]

    style OK fill:#dcfce7,stroke:#16a34a
    style B1 fill:#fee2e2,stroke:#dc2626
    style B2 fill:#fee2e2,stroke:#dc2626
    style B3 fill:#fee2e2,stroke:#dc2626
    style B4 fill:#fee2e2,stroke:#dc2626
    style B5 fill:#fee2e2,stroke:#dc2626
    style B6 fill:#fee2e2,stroke:#dc2626
```

**Note:** Acknowledging reviewer feedback is **optional**. It does **not** stop the operator from starting the next run once the reviewer has acted.

---

## 8. Waiting for review — why the operator must pause

```mermaid
sequenceDiagram
    actor Operator
    participant JobCard as Job card
    participant Review as Supervisor or Coordinator

    Operator->>JobCard: Start job
    JobCard-->>Operator: Work in progress
    Operator->>JobCard: Submit quantities
    JobCard-->>Operator: Sent for review — please wait
    Operator->>JobCard: Try to start again
    JobCard-->>Operator: Not allowed — review pending
    Operator->>JobCard: Try to submit again
    JobCard-->>Operator: Not allowed — review pending
    Review->>JobCard: Approve, rework, or reject
    JobCard-->>JobCard: Live schedule updated
    Operator->>JobCard: Start next run
    JobCard-->>Operator: Allowed
```

---

## 9. How the live schedule recalculates

```mermaid
flowchart TD
    TRIG([Something changes on the floor]) --> LOAD[Load all active parts by priority]
    LOAD --> WALK[Walk each part's operation sequence]
    WALK --> DEC{Is this operation finished?}
    DEC -->|Yes — all quantity approved| SKIP[Move on — use actual finish time]
    DEC -->|No| WORK{What work is left?}
    WORK -->|Rework only| RW[Plan rework time — machining only, no setup]
    WORK -->|Remake or first-time units| NM[Plan setup plus cycle time per unit]
    WORK -->|Job already running| KEEP[Keep current schedule block — do not disturb active job]
    RW --> UPDATE[Update live schedule on job cards]
    NM --> UPDATE
    KEEP --> UPDATE
    SKIP --> UPDATE

    style UPDATE fill:#dcfce7,stroke:#16a34a
```

**What triggers a recalculation:**

| Event | Effect |
|-------|--------|
| Production approved, reworked, or rejected | Remaining work and times replanned |
| Machine marked unavailable or back in service | Affected jobs pushed or pulled |
| Part priority swapped | Higher-priority part may move ahead on shared machines |
| Full schedule regenerated | Baseline refreshed; live plan realigned |

---

## 10. Rework vs remake — different time on the schedule

```mermaid
flowchart LR
    subgraph Rework["Rework — fix the same part"]
        R1[Uses cycle time only]
        R2[No setup — part already on machine/spindle]
    end

    subgraph Remake["Remake or first-time — new manufacture"]
        M1[Setup time plus cycle time]
        M2[Applies to rejected units and never-started units]
    end

    REVIEW[Reviewer marks rework or reject] --> Rework
    REVIEW --> Remake
    Rework --> GANTT[Live Gantt and job card times]
    Remake --> GANTT

    style Rework fill:#fff7ed,stroke:#ea580c
    style Remake fill:#eff6ff,stroke:#3b82f6
```

**Example:** If 3 units need rework and 2 must be remade, the scheduler plans a **shorter rework block** and a **longer new-manufacture block** (setup included). Long jobs may split across shift end — that is normal.

---

## 11. Machine breakdown — partial work is not lost

```mermaid
gantt
    title Operation running when machine goes down
    dateFormat YYYY-MM-DD HH:mm
    axisFormat %d %H:%M
    section Machine
    Working before breakdown     :active, 2026-07-07 12:39, 2026-07-07 14:15
    Breakdown — machine OFF      :crit, 2026-07-07 14:15, 2026-07-08 08:30
    Resume remaining machining   :active, 2026-07-08 08:30, 2026-07-08 08:58
```

| Rule | What it means on the floor |
|------|----------------------------|
| Machine OFF | No new jobs can start during the breakdown window |
| Work already running | Pauses — remaining machining time continues after return |
| Setup not repeated | Partial cycle is preserved |
| Overnight breakdown | Work resumes when the machine is back — not at shift start if still down |

---

## 12. Changing which part runs first (priority swap)

```mermaid
sequenceDiagram
    actor Coordinator
    participant Priority as Parts priority screen
    participant Schedule as Scheduling system

    Coordinator->>Priority: Preview swap — Part B before Part A
    Priority->>Schedule: Simulate impact
    Schedule-->>Priority: Show effect on machines and due dates
    Coordinator->>Priority: Confirm swap
    Priority->>Schedule: Apply new priority order
    Schedule->>Schedule: Recalculate live schedule
    Schedule-->>Coordinator: Done — audit trail recorded
```

**Safety:** Priority swap is blocked while production is actively running on the affected parts.

---

## 13. Taking a part out of the queue (deactivation)

```mermaid
flowchart TD
    DEACT([Request to deactivate part]) --> P1{Job currently running?}
    P1 -->|Yes| B1[Not allowed — finish or stop job first]
    P1 -->|No| P2{Submission waiting for review?}
    P2 -->|Yes| B2[Not allowed — reviewer must decide]
    P2 -->|No| P3{Part already fully completed?}
    P3 -->|Yes| B3[Not allowed — part is done; history must be cleared by admin]
    P3 -->|No| OK[Part deactivated — removed from live scheduling]

    style OK fill:#dcfce7,stroke:#16a34a
    style B1 fill:#fee2e2,stroke:#dc2626
    style B2 fill:#fee2e2,stroke:#dc2626
    style B3 fill:#fee2e2,stroke:#dc2626
```

---

## 14. Typical week on the floor

```mermaid
timeline
    title Example part journey
    section Monday — Planning
        Shifts confirmed : Calendar and assignments set
        Order released : Part activated and given priority
        Schedule generated : Baseline and live plan aligned
    section Tuesday — First operation
        Operator starts Op 20 : Job card active
        Submits 10 pieces : Waiting for supervisor
        Supervisor approves 5, rework 3, reject 2 : Live plan shows follow-up work
    section Wednesday — Follow-up and breakdown
        Operator completes rework and remakes : Second review cycle
        Machine breakdown midday : Jobs on that machine pushed
        Machine back online : Remaining time resumes without full reset
    section Friday — Done
        All operations approved : Part marked complete
        Priority cleared : Next parts move up in queue
```

---

## 15. Common situations — what happens

| Situation | What the system does |
|-----------|----------------------|
| Operator submits then tries to start again immediately | Blocked until supervisor or coordinator reviews |
| Reviewer asks for rework only | Operator must record it as rework, not as new manufacture |
| Mix of rework and remakes | Operator can enter both in one submission or separate runs |
| Machine down overnight | Work resumes when machine returns, not at shift start if still down |
| Job running when schedule recalculates | Current job block kept — not wiped mid-run |
| Customer expedites a part | Coordinator simulates swap, commits if acceptable, schedule refreshes |
| Part finished | Removed from priority list; no longer competes for machines |
| Try to deactivate part mid-job | Blocked with clear reason per operation |

---

## 16. Glossary (manufacturing terms)

| Term | Meaning |
|------|---------|
| **Baseline plan** | Last formal generated schedule — for history and reporting |
| **Live plan** | Current times on job cards and Gantt — updates with reality |
| **Job card** | Operator screen for one operation: machine, times, start, submit |
| **Production log** | Record of what was made and whether it was approved |
| **Activation** | Operator officially starting an operation |
| **Breakdown** | Machine marked unavailable for a period |
| **Rework** | Fix the same part — no new setup on the schedule |
| **Reject / remake** | Scrap and manufacture again — setup applies |
| **Part priority** | Which in-house parts get machines first across all orders |
| **Priority swap** | Exchange positions of two parts in the queue |
| **Work centre** | Group of similar machines (e.g. turning, milling) |
| **Operation** | One step in the routing (e.g. Op 10, Op 20) |
| **Setup time** | One-time preparation before machining a batch |
| **Cycle time** | Time to machine one unit |

---

*This guide describes implemented system behaviour in manufacturing language. See [README.md](./README.md) for the full doc index.*

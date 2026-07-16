# PPS Logging — Manual Test Checklist

Use this guide to verify Phase 1 and Phase 2 business-event logging after starting the scheduling API locally.

**Related:** [LOGGING_DESIGN_PLAN_PPS.md](./LOGGING_DESIGN_PLAN_PPS.md)

---

## 1. How logging works today

- Configured in `main.py` via `logging.basicConfig(level=logging.INFO)`.
- Each router uses `logger = logging.getLogger(__name__)`.
- Business events use structured `extra={"event": "...", ...}` fields.
- **Console output shows the human-readable message only** — not the `extra` dict — unless you enable the temporary formatter in section 3.

Example console line (default):

```text
2026-07-16 15:00:01 INFO routers.machine_scheduling Priority swap committed
```

With the temporary formatter (section 3):

```text
2026-07-16 15:00:01 INFO routers.machine_scheduling Priority swap committed | {'event': 'priority_swap_committed', 'part_id_moved': 12, ...}
```

---

## 2. Start the API

```powershell
cd "d:\Harshith\CMF Digitalization\backend\cmf"
python -m uvicorn main:app --host 0.0.0.0 --port 8989 --reload
```

**Swagger UI:** http://localhost:8989/docs  
**Health check:** http://localhost:8989/health

### Startup logs to expect

| Message | `event` (in extra) |
|---------|-------------------|
| `Starting CMF Backend API` | — |
| `Database tables created or verified` | — |
| `MinIO client initialized` | `minio_initialized` |
| `CMF Backend API is ready` | — |

---

## 3. Optional — show structured fields in the terminal

Add **temporarily** after `logging.basicConfig(...)` in `main.py` while testing. Remove before production deploy.

```python
class _ExtraFormatter(logging.Formatter):
    _SKIP = {
        "name", "msg", "args", "created", "filename", "funcName",
        "levelname", "levelno", "lineno", "module", "msecs",
        "message", "pathname", "process", "processName",
        "relativeCreated", "thread", "threadName", "exc_info",
        "exc_text", "stack_info", "taskName",
    }

    def format(self, record):
        base = super().format(record)
        extras = {
            k: v for k, v in record.__dict__.items()
            if k not in self._SKIP and v is not None
        }
        return f"{base} | {extras}" if extras else base

for _handler in logging.root.handlers:
    _handler.setFormatter(
        _ExtraFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
```

---

## 4. Find test IDs

Replace placeholders like `{order_id}`, `{part_id}`, `{operation_id}` with values from your environment.

### Quick discovery via API

| Need | Endpoint |
|------|----------|
| Orders + parts + status | `GET /api/v1/scheduling/orders-parts-status` |
| Active parts for one order | `GET /api/v1/scheduling/active-parts/{sale_order_id}` |
| Out-source operations | `GET /api/v1/scheduling/out-source-operations` |
| Operators | `GET /api/v1/shift-hours/operators` |
| Machine operations (for job card) | `GET /api/v1/scheduling/machine-operations/{machine_id}` |
| Shift configs for a year | `GET /api/v1/shift-hours/?year=2026` |

### Priority swap IDs

Priority swap uses **`OrderPartPriority.id`** (not `part_id`). Query your DB, for example:

```sql
SELECT id, order_id, part_id, priority, status
FROM oms.order_part_priorities
WHERE status = 'active' AND priority > 0
ORDER BY priority
LIMIT 10;
```

Use two different `id` values for `id1` and `id2` in simulate/commit swap calls.

### Machine breakdown status IDs

- `status_id = 1` → machine ON (operational)
- `status_id = 2` → machine OFF (breakdown / downtime)

---

## 5. Full event catalog

| `event` | Level | Trigger | Primary file |
|---------|-------|---------|--------------|
| `minio_initialized` | INFO | App startup | `main.py` |
| `machine_status_defaults_created` | INFO | First GET machine status for new machines | `machine_status.py` |
| `machine_breakdown_recorded` | INFO | Machine set to OFF | `machine_status.py` |
| `machine_breakdown_cleared` | INFO | Machine restored from OFF | `machine_status.py` |
| `machine_breakdown_reschedule_triggered` | INFO | Reschedule after breakdown change | `machine_status.py` |
| `dynamic_reschedule_completed` | INFO | Reschedule succeeded | `algorithm.py`, routers |
| `dynamic_reschedule_failed` | ERROR | Reschedule failed | `algorithm.py`, routers |
| `planned_schedule_triggered` | INFO | Generate schedule called | `machine_scheduling.py`, `algorithm.py` |
| `planned_schedule_completed` | INFO | Schedule generation OK | `machine_scheduling.py`, `algorithm.py` |
| `planned_schedule_failed` | ERROR | Schedule generation failed | `machine_scheduling.py`, `algorithm.py` |
| `dynamic_reschedule_triggered` | INFO | Manual / review / breakdown trigger | `production_logs.py`, `algorithm.py` |
| `part_activation_blocked` | WARNING | Part cannot be activated | `machine_scheduling.py` |
| `part_deactivation_blocked` | WARNING | Part cannot be deactivated | `machine_scheduling.py` |
| `job_card_activation_blocked` | WARNING | Job card blocked (generic) | `machine_scheduling.py` |
| `job_card_activation_completed` | INFO | Job card activated | `machine_scheduling.py` |
| `operator_leave_activation_block` | WARNING | Operator on acknowledged leave | `machine_scheduling.py` |
| `outsource_operation_pending_block` | WARNING | Prior out-source not delivered | `machine_scheduling.py` |
| `production_log_submit_blocked` | WARNING | Submit blocked (e.g. pending review) | `production_logs.py` |
| `production_log_submitted` | INFO | Operator submitted log | `production_logs.py` |
| `production_log_reviewed` | INFO | Supervisor/MC reviewed log | `production_logs.py` |
| `part_marked_completed` | INFO | All ops completed for part | `production_logs.py` |
| `priority_swap_simulated` | INFO | Dry-run swap | `machine_scheduling.py` |
| `priority_swap_committed` | INFO | Swap applied | `machine_scheduling.py` |
| `priority_swap_blocked` | WARNING | Swap/simulation rejected | `machine_scheduling.py` |
| `outsource_operation_sent` | INFO | Status → `in_transit` | `machine_scheduling.py` |
| `outsource_operation_returned` | INFO | Status → `delivered` | `machine_scheduling.py` |
| `shift_configuration_created` | INFO | New shift day config | `shift_hours.py` |
| `shift_configuration_updated` | INFO | Shift day updated | `shift_hours.py` |
| `overtime_applied` | INFO | `NEXT` shift added | `shift_hours.py` |
| `overtime_removed` | INFO | `NEXT` shift removed | `shift_hours.py` |
| `machine_operator_assignment_created` | INFO | Operator assigned to machine | `shift_hours.py` |
| `machine_operator_assignment_updated` | INFO | Assignment changed | `shift_hours.py` |
| `machine_operator_assignment_removed` | INFO | Assignment removed | `shift_hours.py` |
| `operator_leave_applied` | INFO | Leave request created | `operator_leaves.py` |
| `operator_leave_approved` | INFO | Leave acknowledged | `operator_leaves.py` |
| `operator_leave_rejected` | INFO | Leave rejected | `operator_leaves.py` |

---

## 6. Recommended 30-minute test path

Work through these in order. Check the **uvicorn terminal** after each step.

- [ ] **1. Startup** — restart server; confirm startup INFO lines.
- [ ] **2. Health** — `GET /health` returns `healthy`.
- [ ] **3. Blocked leave** — easiest WARNING test (section 7.12).
- [ ] **4. Leave applied** — create leave request (section 7.11).
- [ ] **5. Shift created** — new shift config (section 7.9).
- [ ] **6. Schedule trigger** — generate schedule (section 7.2).
- [ ] **7. Swap simulate** — dry-run only (section 7.6).
- [ ] **8. Production submit block** — submit without active job card (section 7.4).

---

## 7. Step-by-step tests with example calls

Base URL: `http://localhost:8989/api/v1`

Use Swagger (**Try it out**) if you prefer GUI over `curl`.

### 7.1 Machine breakdown (Phase 1)

**Record breakdown (OFF)**

```http
PUT /machine-status/machine-status/{machine_id}
Content-Type: application/json

{
  "status_id": 2,
  "description": "Logging test — breakdown",
  "available_from": "2026-07-16T10:00:00"
}
```

**Expect:** `machine_breakdown_recorded`, then `machine_breakdown_reschedule_triggered`, then `dynamic_reschedule_completed` (or `dynamic_reschedule_failed` if schedule data is incomplete).

**Clear breakdown (back ON)**

```json
{
  "status_id": 1,
  "description": "Logging test — restored",
  "available_to": "2026-07-16T14:00:00"
}
```

**Expect:** `machine_breakdown_cleared` and reschedule logs again.

---

### 7.2 Planned schedule (Phase 1)

```http
POST /scheduling/generate-schedule
```

Optional query params: `start_date`, `end_date` (ISO datetime).

**Expect sequence:**

1. `planned_schedule_triggered`
2. `planned_schedule_completed` **or** `planned_schedule_failed`

---

### 7.3 Part activation / deactivation blocked (Phase 1)

**Activate** (should fail if part already has production history):

```http
PUT /scheduling/update-part-status/{sale_order_id}/{part_id}?status=active
```

**Deactivate** (should fail if production in progress):

```http
PUT /scheduling/update-part-status/{sale_order_id}/{part_id}?status=inactive
```

**Expect:** `part_activation_blocked` or `part_deactivation_blocked` with `reason` in `extra`.

---

### 7.4 Production logs (Phase 1)

**Submit blocked** (no in-progress log):

```http
POST /production-logs/operation/{operation_id}/submit
Content-Type: application/json

{
  "produced_quantity": 1,
  "rework_submit_quantity": 0,
  "notes": "Logging test"
}
```

**Expect:** HTTP 404 (no active log) — no submit log.  
If a log is already awaiting review, expect `production_log_submit_blocked`.

**Happy path** (requires prior job card activation):

1. `POST /scheduling/operation-status/{operation_id}/activate?operator_id={operator_id}`
2. Submit as above → `production_log_submitted`
3. Review:

```http
PUT /production-logs/{log_id}/status
Content-Type: application/json

{
  "status": "completed",
  "user_id": {supervisor_or_mc_user_id},
  "approved_quantity": 1,
  "rework_quantity": 0,
  "rejected_quantity": 0,
  "remarks": "Logging test review"
}
```

**Expect:** `production_log_reviewed`, possibly `dynamic_reschedule_triggered`, and `part_marked_completed` when the part finishes.

---

### 7.5 Job card activation (Phase 1 + 2)

```http
POST /scheduling/operation-status/{operation_id}/activate?operator_id={operator_id}
```

| Scenario | Expect |
|----------|--------|
| Success | `job_card_activation_completed` |
| Operator on acknowledged leave today | `operator_leave_activation_block` |
| Prior out-source not delivered | `outsource_operation_pending_block` then `job_card_activation_blocked` |
| Prior ops incomplete | `job_card_activation_blocked` (`reason`: prior_operations_incomplete) |
| Machine on breakdown | `job_card_activation_blocked` |

---

### 7.6 Priority swap (Phase 2)

**Simulate (safe — no DB change)**

```http
POST /scheduling/part-priorities/simulate-swap
Content-Type: application/json

{
  "id1": 101,
  "id2": 102
}
```

**Expect:** `priority_swap_simulated` with `recommendation` in extra.  
If simulation is BLOCKED: also `priority_swap_blocked`.

**Commit (changes priorities + reschedules)**

```http
PUT /scheduling/part-priorities/swap
Content-Type: application/json

{
  "id1": 101,
  "id2": 102,
  "priority_changed_by_id": {admin_or_mc_user_id}
}
```

**Expect:** `priority_swap_committed` on success.  
Completed parts → `priority_swap_blocked`.

---

### 7.7 Out-source (Phase 2)

List candidates:

```http
GET /scheduling/out-source-operations?active_only=true
```

**Mark sent**

```http
POST /scheduling/out-source-operations/{order_id}/{operation_id}/status
Content-Type: application/json

{
  "status": "in_transit"
}
```

**Expect:** `outsource_operation_sent`

**Mark returned**

```json
{
  "status": "delivered"
}
```

**Expect:** `outsource_operation_returned`, then `dynamic_reschedule_completed` (trigger_source `outsource_delivered`).

---

### 7.8 Dynamic reschedule (Phase 1)

```http
POST /scheduling/dynamic-reschedule
```

**Expect:** `dynamic_reschedule_triggered` / `dynamic_reschedule_completed` from `algorithm.py`.

---

### 7.9 Shift configuration & overtime (Phase 2)

Use a **date that does not already have a config** (or DELETE an existing test config first).

**Create with OT (`NEXT` shift)**

```http
POST /shift-hours/
Content-Type: application/json

{
  "date": "2026-12-01",
  "working_day": true,
  "selected_shifts": ["GENERAL", "NEXT"]
}
```

**Expect:** `shift_configuration_created`, `overtime_applied`

**Remove OT**

```http
PUT /shift-hours/{config_id}
Content-Type: application/json

{
  "selected_shifts": ["GENERAL"]
}
```

**Expect:** `shift_configuration_updated`, `overtime_removed`

---

### 7.10 Machine–operator assignment (Phase 2)

Prerequisite: a `shift_config_id` from `GET /shift-hours/?year=2026`.

```http
POST /shift-hours/machine/{machine_id}/operator/{operator_id}/shifts
Content-Type: application/json

{
  "shift_config_id": {shift_config_id},
  "assigned_by_id": {admin_or_mc_user_id}
}
```

**Expect:** `machine_operator_assignment_created`

**Update**

```http
PUT /shift-hours/machine/{machine_id}/operator/{operator_id}/shifts/{assignment_id}
Content-Type: application/json

{
  "assigned_by_id": {admin_or_mc_user_id}
}
```

**Expect:** `machine_operator_assignment_updated`

**Remove**

```http
DELETE /shift-hours/machine/{machine_id}/operator/{operator_id}/shifts/{assignment_id}?assigned_by_id={admin_or_mc_user_id}
```

**Expect:** `machine_operator_assignment_removed`

---

### 7.11 Operator leave (Phase 2)

**Apply**

```http
POST /operator-leaves/?operator_id={operator_id}&from_date=2026-07-16&to_date=2026-07-18&reason=Logging%20test
```

**Expect:** `operator_leave_applied`

**Approve**

```http
PUT /operator-leaves/{leave_id}/approve
Content-Type: application/json

{
  "status": "acknowledged",
  "approved_by": {mc_supervisor_or_admin_user_id}
}
```

**Expect:** `operator_leave_approved`

**Reject** (use a different leave record):

```json
{
  "status": "rejected",
  "approved_by": {approver_user_id}
}
```

**Expect:** `operator_leave_rejected`

---

### 7.12 Fastest WARNING test (operator on leave)

1. Create and **approve** leave for today (7.11).
2. Call job card activate for that operator (7.5).
3. Confirm terminal shows `operator_leave_activation_block`.

---

## 8. Filter terminal output (PowerShell)

While the server runs in one window, in another:

```powershell
# Watch only scheduling logs live (if you pipe uvicorn output to a file)
Get-Content .\api.log -Wait | Select-String "priority_swap|production_log|operator_leave|outsource|shift_configuration"
```

Or scroll the uvicorn window and search for message substrings:

- `blocked`
- `committed`
- `submitted`
- `reviewed`
- `Overtime`

---

## 9. Automated regression (behavior only)

Logging does not change API contracts. Existing tests should still pass:

```powershell
cd "d:\Harshith\CMF Digitalization\backend\cmf"
python -m pytest testing/test_dynamic_scheduling_unit.py testing/test_pending_reviewer_log_block.py testing/test_production_log_submit_scenarios.py -q
```

**95 passed** = business logic intact. These tests do **not** assert log output yet.

### Optional — assert logs in pytest

```python
import logging

def test_leave_create_logs_applied(client, caplog):
    with caplog.at_level(logging.INFO):
        response = client.post(
            "/api/v1/operator-leaves/",
            params={
                "operator_id": 1,
                "from_date": "2026-08-01",
                "to_date": "2026-08-02",
            },
        )
    assert response.status_code == 200
    assert any(
        r.__dict__.get("event") == "operator_leave_applied"
        for r in caplog.records
    )
```

---

## 10. Pass / fail criteria

| Check | Pass |
|-------|------|
| Server starts | Startup INFO lines appear |
| Action → log | Each business action emits **one** clear log line |
| Levels | Success = INFO, blocks = WARNING, failures = ERROR/`exception` |
| No noise | Ordinary `GET` list/read endpoints do not spam logs |
| Business unchanged | HTTP responses and DB state match pre-logging behavior |
| Structured fields | With section 3 formatter, `event` and IDs appear in `extra` |

---

## 11. Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| No logs at all | Wrong terminal / log level | Run uvicorn in foreground; ensure `level=INFO` |
| Message only, no `event` | Default formatter | Enable section 3 temporarily |
| Expected log missing | Preconditions not met | e.g. swap needs active priority rows; submit needs activated job card |
| Duplicate reschedule logs | Breakdown + algorithm both log | Expected — breakdown router and `algorithm.py` each log their layer |
| `400` on shift create | Date already configured | Pick unused date or `PUT` to update |
| `KeyError: Attempt to overwrite 'message' in LogRecord` | `extra={"message": ...}` uses a reserved LogRecord key | Use `result_message` (or similar) — never `message`, `name`, `levelname`, `msg`, `args` in `extra` |

---

## 12. After testing

1. Remove the temporary `_ExtraFormatter` block from `main.py` if added.
2. For production, plan Phase 3: JSON log format, request/correlation IDs, log aggregation (see design plan section 12).

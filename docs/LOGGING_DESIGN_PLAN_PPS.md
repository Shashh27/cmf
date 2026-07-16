# Logging Design Plan for Production Planning & Scheduling

**Purpose:** Define a practical logging strategy for CMF Production Planning & Scheduling so the team can improve traceability, debugging, and auditability **without changing business logic**.

**Scope:** Production planning, scheduling, machine breakdowns, shift/OT changes, operator leave, job-card activation, production logs, out-source operations, priority swaps, dynamic rescheduling, and part completion.

**Audience:** Backend developers, support engineers, manufacturing system owners, and future maintainers.

---

## 1. Why logging is needed

The PPS module contains high-value business decisions that affect machine loading, operator execution, and part completion. When issues happen in production, the team needs to answer:

- What happened?
- When did it happen?
- Who triggered it?
- Which order / part / operation / machine was affected?
- Why did the system allow or block the action?

Logging should make those answers available quickly, while keeping the current business behaviour unchanged.

---

## 2. Logging goals

This design aims to:

1. **Preserve business logic**  
   Logging must observe system behaviour, not alter it.

2. **Improve support and debugging**  
   The team should be able to trace scheduling decisions and blocking reasons.

3. **Create business-level audit visibility**  
   Important state changes should show who did what and why.

4. **Reduce noise**  
   Only meaningful events and blockers should be logged.

5. **Support future structured logging**  
   Logs should be easy to ship later to ELK, Grafana Loki, Datadog, Splunk, or similar tools.

---

## 3. Logging principles

### 3.1 Log business events, not every line

Good candidates:

- state changes
- schedule generation / recalculation
- blocked actions
- approval decisions
- asset availability changes
- assignment changes
- leave / OT decisions
- part completion

Avoid:

- logging every helper call
- logging inside tight loops unless diagnosing a specific algorithm issue
- repeated noisy logs for the same condition
- sensitive or unnecessary payload dumps

### 3.2 Use consistent event names

Use stable, machine-friendly event names such as:

- `machine_breakdown_recorded`
- `dynamic_reschedule_triggered`
- `job_card_activation_blocked`
- `production_log_reviewed`
- `part_marked_completed`

This allows filtering and dashboards later.

### 3.3 Prefer structured context

Every important log should include context fields, not only free text.

Minimum useful fields:

- `event`
- `user_id`
- `user_role`
- `order_id`
- `part_id`
- `operation_id`
- `machine_id`
- `reason`
- `trigger_source`

### 3.4 Log once at the business boundary

Prefer logging at:

- router entry/exit for business actions
- service/helper functions where business decision is finalized
- exception handling blocks

Do not duplicate the same event in three different layers unless each layer adds distinct value.

---

## 4. Log levels to use

### `INFO`
Use for successful business events and major state transitions.

Examples:

- schedule generated
- production log submitted
- production log reviewed
- machine breakdown recorded
- priority swap committed
- part marked completed

### `WARNING`
Use for expected but important blockers or guarded conditions.

Examples:

- job card activation blocked
- part deactivation blocked
- operator on leave so activation denied
- out-source operation not yet returned

### `ERROR`
Use for failures that stop the requested business action.

Examples:

- schedule generation failed
- dynamic reschedule failed
- failed to persist production review
- failed to update machine breakdown state

### `EXCEPTION`
Use in `except` blocks where traceback is valuable.

Examples:

- unexpected exception during rescheduling
- unexpected exception while marking part completed

---

## 5. Standard fields for PPS logs

The following fields should be reused wherever applicable.

| Field | Meaning |
|------|---------|
| `event` | Stable event name |
| `message` | Human-readable summary |
| `user_id` | Who performed the action |
| `user_role` | Admin / manufacturing coordinator / supervisor / operator |
| `order_id` | Sale order ID |
| `sale_order_number` | Readable order reference |
| `part_id` | Part ID |
| `part_number` | Readable part reference |
| `operation_id` | Operation ID |
| `operation_number` | Readable operation reference |
| `machine_id` | Machine ID |
| `machine_name` | Readable machine reference |
| `reason` | Why action happened or was blocked |
| `trigger_source` | e.g. production review, breakdown, manual refresh, priority swap |
| `from_status` | Previous status |
| `to_status` | New status |
| `old_value` | Previous value when relevant |
| `new_value` | New value when relevant |
| `reviewer_id` | Reviewer user ID |
| `reviewer_role` | Supervisor or manufacturing coordinator |
| `approved_quantity` | Approved qty if relevant |
| `rework_quantity` | Rework qty if relevant |
| `rejected_quantity` | Rejected qty if relevant |

Not every log needs every field. The principle is: **include enough context to reconstruct the decision**.

---

## 6. Event catalog

Below is the recommended first-pass event catalog for the current codebase.

### 6.1 Asset availability and machine breakdown

| Event | Level | When |
|------|------|------|
| `machine_breakdown_recorded` | `INFO` | Machine marked unavailable |
| `machine_breakdown_cleared` | `INFO` | Machine returned to service |
| `machine_breakdown_activation_block` | `WARNING` | Operator tries to activate during breakdown |
| `machine_breakdown_reschedule_triggered` | `INFO` | Breakdown caused live reschedule |

Recommended fields:

- `machine_id`
- `machine_name`
- `from_datetime`
- `to_datetime`
- `reason`
- `user_id`
- `user_role`

### 6.2 Planned schedule generation

| Event | Level | When |
|------|------|------|
| `planned_schedule_triggered` | `INFO` | Baseline schedule generation starts |
| `planned_schedule_completed` | `INFO` | Baseline schedule created successfully |
| `planned_schedule_failed` | `ERROR` / `EXCEPTION` | Generation fails |

Recommended fields:

- `trigger_source`
- `user_id`
- `user_role`
- `active_orders_count`
- `active_parts_count`
- `schedule_version`

### 6.3 Dynamic rescheduling

| Event | Level | When |
|------|------|------|
| `dynamic_reschedule_triggered` | `INFO` | Live replan starts |
| `dynamic_reschedule_completed` | `INFO` | Live replan succeeds |
| `dynamic_reschedule_failed` | `ERROR` / `EXCEPTION` | Live replan fails |
| `dynamic_reschedule_scope` | `INFO` | Optional summary of affected part/order scope |

Recommended reasons:

- `production_reviewed`
- `machine_breakdown`
- `machine_restored`
- `priority_swap`
- `manual_refresh`
- `outsource_returned`
- `shift_window_changed`

### 6.4 Part activation / deactivation

| Event | Level | When |
|------|------|------|
| `part_activated` | `INFO` | Part activated successfully |
| `part_activation_blocked` | `WARNING` | Activation denied |
| `part_deactivated` | `INFO` | Part deactivated successfully |
| `part_deactivation_blocked` | `WARNING` | Deactivation denied |

Recommended fields:

- `order_id`
- `part_id`
- `reason`
- `blocking_operations`

### 6.5 Job card activation

| Event | Level | When |
|------|------|------|
| `job_card_activation_started` | `INFO` | Activation request accepted |
| `job_card_activation_blocked` | `WARNING` | Activation denied |
| `job_card_activation_completed` | `INFO` | In-progress job card created |

Recommended blocker reasons:

- `prior_operation_incomplete`
- `pending_reviewer_action`
- `machine_breakdown`
- `before_scheduled_start`
- `operator_on_leave`
- `operation_fully_approved`
- `no_live_schedule_row`

### 6.6 Production logs

| Event | Level | When |
|------|------|------|
| `production_log_submitted` | `INFO` | Operator submits production |
| `production_log_submit_blocked` | `WARNING` | Submit rejected |
| `production_log_reviewed` | `INFO` | Supervisor/MC reviews log |
| `production_log_review_blocked` | `WARNING` | Second reviewer or invalid review attempt |
| `production_log_acknowledged` | `INFO` | Optional acknowledgement done |

Recommended fields:

- `operator_id`
- `reviewer_id`
- `reviewer_role`
- `produced_quantity`
- `rework_submit_quantity`
- `approved_quantity`
- `rework_quantity`
- `rejected_quantity`
- `remaining_quantity`

### 6.7 Priority management

| Event | Level | When |
|------|------|------|
| `priority_swap_simulated` | `INFO` | Swap preview requested |
| `priority_swap_committed` | `INFO` | Swap applied |
| `priority_swap_blocked` | `WARNING` | Swap rejected due to active production or rule |

Recommended fields:

- `from_part_id`
- `to_part_id`
- `from_priority`
- `to_priority`
- `user_id`
- `user_role`

### 6.8 Out-source operations

| Event | Level | When |
|------|------|------|
| `outsource_operation_sent` | `INFO` | Part/operation sent outside |
| `outsource_operation_returned` | `INFO` | Part/operation delivered back |
| `outsource_operation_pending_block` | `WARNING` | Next in-house step blocked waiting for return |

Recommended fields:

- `order_id`
- `part_id`
- `operation_id`
- `vendor_id` if available
- `sent_date`
- `delivered_date`

### 6.9 Part completion

| Event | Level | When |
|------|------|------|
| `part_marked_completed` | `INFO` | All operations approved and part completed |
| `part_completion_reverted` | `INFO` | Completed flag cleared because logs removed |

Recommended fields:

- `order_id`
- `part_id`
- `completed_operations`
- `final_approved_quantity`

### 6.10 Shift configuration and overtime

| Event | Level | When |
|------|------|------|
| `shift_configuration_created` | `INFO` | New shift baseline configured |
| `shift_configuration_updated` | `INFO` | Existing shift updated |
| `overtime_applied` | `INFO` | General shift extended to OT window |
| `overtime_removed` | `INFO` | OT removed or reset |

Recommended fields:

- `shift_date`
- `shift_code`
- `old_start`
- `old_end`
- `new_start`
- `new_end`
- `reason`
- `user_id`

### 6.11 Machine assignment to operator

| Event | Level | When |
|------|------|------|
| `machine_operator_assignment_created` | `INFO` | Operator assigned |
| `machine_operator_assignment_updated` | `INFO` | Assignment changed |
| `machine_operator_assignment_removed` | `INFO` | Assignment removed |

Recommended fields:

- `machine_id`
- `operator_id`
- `shift_date`
- `shift_config_id`
- `assigned_by`

### 6.12 Operator leave

| Event | Level | When |
|------|------|------|
| `operator_leave_applied` | `INFO` | Leave request submitted |
| `operator_leave_approved` | `INFO` | Leave approved |
| `operator_leave_rejected` | `INFO` | Leave rejected |
| `operator_leave_activation_block` | `WARNING` | Activation denied because operator is on leave |

Recommended fields:

- `operator_id`
- `from_date`
- `to_date`
- `reason`
- `approved_by`
- `approved_by_role`

---

## 7. Suggested file ownership

This section maps events to likely implementation points in the current codebase.

| Area | Primary files |
|------|---------------|
| App/bootstrap logging setup | `main.py` |
| Machine breakdown | `machine_breakdown_helpers.py`, `routers/machine_status.py` |
| Schedule generation / dynamic reschedule | `algorithm.py`, `routers/machine_scheduling.py` |
| Part activation / deactivation | `routers/machine_scheduling.py` |
| Job card activation | `routers/machine_scheduling.py`, `production_log_helpers.py` |
| Production logs | `routers/production_logs.py`, `production_log_helpers.py` |
| Out-source operation events | `routers/machine_scheduling.py` |
| Leave workflow | `routers/operator_leaves.py` |
| Shift / OT changes | `routers/shift_hours.py` or related shift helpers |
| Machine–operator assignment | assignment helper/router files |

---

## 8. Suggested implementation pattern

### 8.1 Add module loggers

Each major file should define:

```python
import logging

logger = logging.getLogger(__name__)
```

### 8.2 Add a central logging config

`main.py` should move away from plain `print()` and use a standard logger configuration.

Initial target:

- console logging only
- readable text output in development
- optionally JSON later

### 8.3 Use helper functions for repeated business logs

For consistency, consider small helpers such as:

- `log_schedule_event(...)`
- `log_blocked_action(...)`
- `log_review_event(...)`

This keeps message style uniform and avoids copy/paste mistakes.

---

## 9. Message style recommendations

Log messages should be short and consistent.

Prefer:

- `"Dynamic reschedule triggered"`
- `"Job card activation blocked"`
- `"Production log reviewed"`
- `"Part marked completed"`

Avoid:

- vague messages like `"Something failed"`
- overly technical messages for business events
- large object dumps in the message body

---

## 10. Sample logging snippets

### Successful business event

```python
logger.info(
    "Production log submitted",
    extra={
        "event": "production_log_submitted",
        "operator_id": operator_id,
        "operation_id": operation_id,
        "order_id": order_id,
        "part_id": part_id,
        "produced_quantity": produced_quantity,
        "rework_submit_quantity": rework_submit_quantity,
    },
)
```

### Blocked action

```python
logger.warning(
    "Job card activation blocked",
    extra={
        "event": "job_card_activation_blocked",
        "operator_id": operator_id,
        "operation_id": operation_id,
        "machine_id": machine_id,
        "reason": block_reason,
    },
)
```

### Exception path

```python
logger.exception(
    "Dynamic reschedule failed",
    extra={
        "event": "dynamic_reschedule_failed",
        "trigger_source": "production_reviewed",
        "order_id": order_id,
        "part_id": part_id,
    },
)
```

---

## 11. What not to log

Do **not** log:

- passwords, secrets, tokens
- full raw request payloads unless explicitly needed and sanitized
- repetitive per-row algorithm details in normal operation
- personally sensitive leave remarks if they should remain private

If detailed tracing is needed temporarily, use `DEBUG` locally and keep it off in normal production.

---

## 12. Rollout plan

### Phase 1 — highest-value business visibility

Implement first:

1. machine breakdown recorded / cleared
2. planned schedule triggered / completed / failed
3. dynamic reschedule triggered / completed / failed
4. part activation / deactivation blocked
5. job card activation blocked
6. production log submitted / reviewed
7. part marked completed

### Phase 2 — operational and traceability improvements

Then add:

8. priority swap simulated / committed / blocked
9. out-source operation sent / returned / pending block
10. shift configuration updated / OT applied
11. machine assignment to operator
12. operator leave applied / approved / rejected / activation block

### Phase 3 — formatting and tooling

Later improvements:

- structured JSON logging
- correlation/request IDs
- log dashboards
- alerting on repeated failures
- audit log sink if business needs become stricter

---

## 13. Recommendation summary

Yes, logging is necessary and valuable in this codebase, **if applied to the right business events**.

The best approach is:

- retain existing business logic
- add structured, low-noise logging at business boundaries
- capture who / what / why / affected object IDs
- prioritize blockers, schedule triggers, approvals, and completion events

This plan should be used as the baseline before implementation begins.

---

## 14. Related system areas

- `machine_scheduling.py`
- `production_logs.py`
- `production_log_helpers.py`
- `algorithm.py`
- `machine_breakdown_helpers.py`
- `operator_leaves.py`
- `shift_hours` and assignment-related modules


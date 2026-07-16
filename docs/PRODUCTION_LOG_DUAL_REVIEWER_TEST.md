# Production log dual-reviewer — test / UAT guide
# (no extra notification tables)

## What was implemented

### 1. `GET /api/v1/production-logs/` — filters + flags

| Query | Meaning |
|-------|---------|
| `awaiting_review=true` | Open logs (`user_id` is null) — both roles can approve |
| `reviewer_id={id}` | Logs approved by that user |
| `reviewer_role=manufacturing_coordinator` | Logs approved by any mfg coordinator |
| `reviewer_role=supervisor` | Logs approved by any supervisor |
| `manufacturing_coordinator_id={id}` | **MC only:** logs for sale orders where `orders.manufacturing_coordinator_id` matches |
| `viewer_id={id}` | If that user is an MC, same order scope as above (pass logged-in user id) |
| `status=pending` | Filter by status as before |

Every log response now includes:

- `review_locked` — `true` when someone already approved (`user_id` set)
- `can_review` — `true` only while still open
- `reviewer` — `{ id, user_name, gmail, role }` when approved

**Frontend rule:** disable Approve / status update when `review_locked === true` or `can_review === false`.

### 2. `GET /api/v1/production-logs/review-alerts?for_role=supervisor`

Derived from `production_logs` + `access_users` (no new table).

| `for_role` | Returns |
|------------|---------|
| `supervisor` | Logs already approved by **manufacturing_coordinator** |
| `manufacturing_coordinator` | Logs already approved by **supervisor** |

Each alert has a `message` like:

> Manufacturing Coordinator Raj approved a production log sent by operator Kumar (part ABC, op 10).

### 3. `PUT /api/v1/production-logs/{id}/status`

Unchanged guards:

- Only `supervisor` or `manufacturing_coordinator` → else **403**
- Second different reviewer → **403** exclusive lock

---

## Manual test flow (Postman / Swagger)

Base URL: `http://172.18.7.85:8989/api/v1`

Replace IDs with your environment:

| Role | Example user_id |
|------|-----------------|
| Operator | 12 |
| Manufacturing coordinator | 34 |
| Supervisor | (your supervisor id) |

### Step 1 — Operator sends a production log

1. Log in as **operator**.
2. Activate job card for an operation (if not already).
3. Submit:

```http
POST /production-logs/operation/{operation_id}/submit
{
  "produced_quantity": 1,
  "notes": "done"
}
```

Or create/activate + submit via your UI so a log exists with:

- `status` ≈ `pending` (awaiting review)
- `operator_status` = `completed`
- `user_id` = `null`
- `review_locked` = `false`
- `can_review` = `true`

Note the **`log_id`** (e.g. 400).

---

### Step 2 — Confirm both roles see the open log

Both dashboards should call:

```http
GET /production-logs/?awaiting_review=true
```

Or with pending status:

```http
GET /production-logs/?awaiting_review=true&status=pending
```

**Expected:** your new log appears for **both** manufacturing_coordinator and supervisor.  
`user_id` is null → Approve button **enabled** on both UIs.

Optional full list:

```http
GET /production-logs/?hierarchical=true
```

---

### Step 3 — Manufacturing coordinator approves first

```http
PUT /production-logs/{log_id}/status
{
  "status": "completed",
  "user_id": 34,
  "remarks": "approved by mfg coordinator",
  "approved_quantity": 1,
  "rework_quantity": 0,
  "rejected_quantity": 0
}
```

**Expected response:**

- `user_id`: 34  
- `reviewer.role`: `manufacturing_coordinator`  
- `review_locked`: **true**  
- `can_review`: **false**  
- `machine_id`: present (not null if stored in DB)

---

### Step 4 — Supervisor sees “alert” + locked log

```http
GET /production-logs/review-alerts?for_role=supervisor
```

**Expected:** an entry for this `log_id` with message that mfg coordinator approved operator’s log.

Also:

```http
GET /production-logs/{log_id}
```

**Expected:** `review_locked: true` → UI **disables** status update.

---

### Step 5 — Supervisor cannot approve the same log

```http
PUT /production-logs/{log_id}/status
{
  "status": "completed",
  "user_id": {supervisor_id},
  "approved_quantity": 1,
  "rework_quantity": 0,
  "rejected_quantity": 0
}
```

**Expected:** **403**

> This production log was already reviewed by another user...

---

### Step 6 (optional) — Reverse roles

If **supervisor** approves first instead:

```http
GET /production-logs/review-alerts?for_role=manufacturing_coordinator
```

Mfg coordinator sees that alert and cannot update status (same 403).

---

## What to tell your frontend teammate

1. **Pending / inbox:** `GET /production-logs/?awaiting_review=true`  
   **MC:** add `&viewer_id={loggedInMcId}` or `&manufacturing_coordinator_id={loggedInMcId}`
2. **Disable Approve** when `review_locked === true`
3. **Supervisor “notification” style list:**  
   `GET /production-logs/review-alerts?for_role=supervisor`  
   (poll every 30–60s or on dashboard focus — no new DB table)
4. **History for one user:** `GET /production-logs/?reviewer_id={myId}`

---

## Restart backend

After pull, restart the FastAPI process so new query params and `/review-alerts` load.

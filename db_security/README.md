# CMF Database Security (PostgreSQL)

## Status (updated 2026-07-22)

**Active:**
- Weekly automated backups (every **Friday** 02:15) → `D:\backups\cmf_postgres\YYYY-MM-DD\`
- Row-level audit → `audit.change_log` (triggers on business tables)
- App connects as `postgres` (see `backend/.env`)

**Removed:**
- `cmf_app` / `cmf_owner` / `cmf_backup` roles (dropped from PostgreSQL)
- Access-control role/grant SQL scripts
- Restrictive `pg_hba.conf` rules (open LAN restored)

## Change audit log (audit.change_log)

Applied by `04_audit_logging.sql`.

- Trigger `audit.log_change` fires `AFTER INSERT/UPDATE/DELETE` on business tables
  and writes into `audit.change_log`.
- The app records the current user per request: `auth/deps.py` stores it in a
  ContextVar (`DB/audit_context.py`) and a SQLAlchemy `after_begin` listener in
  `DB/database.py` pushes it into transaction-local settings
  (`app.current_user`, `app.current_user_id`, `app.current_user_role`) via
  `set_config(..., is_local => true)`, so it never leaks across pooled
  connections. This captures both ORM and raw-SQL changes.
- Excluded to control volume: `ems.*`, `production_monitoring.*`, TimescaleDB
  internals, `public.alembic_version`, and `notifications.activity_log`.
- Background jobs with no request user are recorded with a NULL app user.

Example queries:

```sql
-- Recent changes with who did them
SELECT changed_at, app_user_name, operation, schema_name, table_name
FROM audit.change_log ORDER BY id DESC LIMIT 50;

-- Everything a specific user changed
SELECT * FROM audit.change_log WHERE app_user_id = 42 ORDER BY id DESC;

-- What changed on one row (before/after)
SELECT operation, old_row, new_row FROM audit.change_log
WHERE schema_name='oms' AND table_name='orders'
ORDER BY id DESC;
```

Consider a monthly/annual retention or partition policy since this table grows
with write volume (e.g. delete rows older than N months).

## Switch local ↔ server (ONE place)

Edit only `backend/.env`:

```env
# Local
DB_HOST=172.18.7.86
DB_NAME=CMF_Demo

# Server (comment local, use these)
# DB_HOST=172.18.7.91
# DB_NAME=CMF_DIGITIZATION
```

- FastAPI + Alembic build connection URLs from `DB_*`.
- Security SQL: run `.\apply_from_env.ps1` (fills `__DB_NAME__` from `.env`).
- Backup script also reads `DB_HOST` / `DB_NAME` from `.env`.

Do **not** edit host/db name in multiple SQL files by hand.

## Remaining administrator actions

### 1. Install Windows scheduled tasks

Windows rejected task registration from a non-elevated shell. Open
**PowerShell as Administrator**, then run:

```powershell
cd D:\vinod\CMF_Digitization_Code\backend\db_security
.\install_windows_tasks.ps1
```

This creates:

- `CMF PostgreSQL Weekly Backup` — every Friday at 02:15, verified dump, ~8-week retention
- `CMF PostgreSQL Security Monitor` — checks logs every five minutes

### 2. Install pgAudit

The PostgreSQL 17 Windows installation does not currently contain pgAudit.
Follow `PGAUDIT_WINDOWS.md`; preserve `timescaledb` in
`shared_preload_libraries`. Native logging is active as a fallback.

### 3. Remove temporary remote-superuser exceptions

The server still had active `postgres` sessions from these legacy CMF hosts:

- `172.18.7.85`
- `172.18.7.89`
- `172.18.100.54`

There was also pgAdmin/another DB access from `172.18.100.80`.
They are restricted to exact IPs in `pg_hba.conf`, not open to the internet,
but they still violate “no remote postgres”. Migrate each service to its own
role, route DBA access through VPN/bastion, then remove those four temporary
rules. Removing them immediately would break active systems.

### 4. Rotate weak temporary passwords before production

The initial `cmf_app` and `cmf_owner` passwords were simple setup passwords.
Replace them with unique password-manager-generated values, update
`backend/.env`, and restart FastAPI. Do not put passwords in SQL files.

### 5. Test restore monthly

Follow `RESTORE_RUNBOOK.md`. Restore into `CMF_Demo_restore_test`, verify row
counts, then remove only the temporary restore-test database.

## Roles

| Role | Used for | Privileges |
|------|----------|------------|
| `cmf_app` | FastAPI runtime | SELECT/INSERT/UPDATE/DELETE; no DDL |
| `cmf_owner` | Alembic/deploy | CREATE/ALTER and object ownership |
| `cmf_backup` | Daily pg_dump | Read-only |
| `postgres` | DBA via local/VPN/bastion | Superuser; never for applications |

`DELETE` is required by CMF recycle-bin and delete APIs. `TRUNCATE`, CREATE,
ALTER and DROP remain unavailable to `cmf_app`.

## Schema migrations

```powershell
cd D:\vinod\CMF_Digitization_Code\backend
python -m alembic upgrade head
```

Alembic uses `MIGRATION_DATABASE_URL` (`cmf_owner`). FastAPI startup performs
only a connection check because `ALLOW_AUTO_SCHEMA=false`.

## Optional alert delivery

The monitor always records local JSON alerts. To also post alerts externally,
configure `CMF_SECURITY_WEBHOOK_URL` for the scheduled-task user before
installing/restarting the monitor task.

# Monthly restore test runbook (CMF PostgreSQL)

Untested backups are not backups. Run this checklist **once per month**.

## 1. Pick a backup file

- Linux: `/var/backups/cmf_postgres/CMF_Demo_YYYYMMDD_HHMMSS.dump`
- Windows: `D:\backups\cmf_postgres\CMF_Demo_YYYYMMDD_HHMMSS.dump`

Prefer a file from the last 7 days.

## 2. Restore into a throwaway database (never overwrite production)

This database uses TimescaleDB. Always call `timescaledb_pre_restore()` and
`timescaledb_post_restore()` around `pg_restore`; a plain restore can fail while
recreating foreign keys on hypertable chunks.

```bash
# Connect as postgres via bastion
createdb -h 172.18.7.86 -U postgres CMF_Demo_restore_test
psql -h 172.18.7.86 -U postgres -d CMF_Demo_restore_test \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb; SELECT timescaledb_pre_restore();"
pg_restore -h 172.18.7.86 -U postgres -d CMF_Demo_restore_test --exit-on-error \
  /path/to/CMF_Demo_YYYYMMDD_HHMMSS.dump
psql -h 172.18.7.86 -U postgres -d CMF_Demo_restore_test \
  -c "SELECT timescaledb_post_restore();"
```

PowerShell:

```powershell
createdb -h 172.18.7.86 -U postgres CMF_Demo_restore_test
psql -h 172.18.7.86 -U postgres -d CMF_Demo_restore_test `
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb; SELECT timescaledb_pre_restore();"
pg_restore -h 172.18.7.86 -U postgres -d CMF_Demo_restore_test --exit-on-error `
  D:\backups\cmf_postgres\CMF_Demo_YYYYMMDD_HHMMSS.dump
psql -h 172.18.7.86 -U postgres -d CMF_Demo_restore_test `
  -c "SELECT timescaledb_post_restore();"
```

## 3. Smoke-check data

```sql
\c CMF_Demo_restore_test
SELECT COUNT(*) FROM accesscontrol.access_users;
SELECT COUNT(*) FROM oms.orders;
SELECT COUNT(*) FROM inventory.tools_list;  -- adjust table names if needed
```

Confirm counts look sane vs production expectations.

## 4. Clean up

```bash
dropdb -h 172.18.7.86 -U postgres CMF_Demo_restore_test
```

## 5. Record the test

| Field | Value |
|-------|--------|
| Date | |
| Backup file | |
| Restored OK? | Yes / No |
| Row-count spot check | |
| Tester | |
| Notes | |

### Restore test history

| Date | Backup file | Restored OK? | Row-count spot check | Tester | Notes |
|-------|-------------|--------------|----------------------|--------|-------|
| 2026-07-21 | `CMF_Demo_20260721_162527.dump` | Yes | `access_users=10`, `orders=12`, `tools_list=3094`; 139 user tables | Cursor agent / SMPM | TimescaleDB pre/post restore required. Restored DB was removed after verification. |

## Production disaster restore (emergency)

1. Stop the FastAPI app.
2. Restore into a new DB or carefully into production only after approval.
3. Point `DATABASE_URL` at the restored DB (still as `cmf_app`).
4. Re-run grants if roles were recreated (`02_grants_and_revoke.sql`).
5. Start the app and verify `/health` + login.

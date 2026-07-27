# pgAudit on this PostgreSQL 17 Windows server

## Current status

`pgaudit` is **not present** in this PostgreSQL installation:

- PostgreSQL: 17.7 (Windows)
- Current preload libraries: `timescaledb`
- `pg_available_extensions` contains no `pgaudit` row

PostgreSQL cannot create an extension whose matching Windows binary/control
files are absent. Running `03_pgaudit_setup.sql` before installing those files
will fail.

## Safe installation sequence

1. Obtain a trusted **pgAudit build matching PostgreSQL 17 x64 Windows** from
   the PostgreSQL vendor/administrator responsible for this server.
2. Back up the database and PostgreSQL configuration.
3. Install the extension files into the PostgreSQL 17 installation.
4. Preserve TimescaleDB and add pgAudit:

   ```conf
   shared_preload_libraries = 'timescaledb,pgaudit'
   ```

5. Restart the PostgreSQL 17 Windows service during an approved maintenance
   window. A reload is not enough for `shared_preload_libraries`.
6. Run:

   ```powershell
   psql -h 127.0.0.1 -U postgres -d CMF_Demo -f 03_pgaudit_setup.sql
   ```

7. Verify:

   ```sql
   SHOW shared_preload_libraries;
   SELECT extname FROM pg_extension WHERE extname = 'pgaudit';
   SHOW pgaudit.log;
   ```

## Active fallback

Until pgAudit is installed, native PostgreSQL logging is active:

- `log_connections = on`
- `log_disconnections = on`
- `log_statement = mod` (DDL plus INSERT/UPDATE/DELETE and modifying COPY)
- `log_min_duration_statement = 1000` (slow query visibility)
- client IP, user, database and application are included in each log line
- `monitor_postgres_security.ps1` flags authentication failures, unknown
  clients, remote superuser use, schema changes, deletes, exports, odd-hours
  access and query-volume spikes

The native fallback is useful but is not a full replacement for pgAudit,
especially for complete SELECT/read auditing.

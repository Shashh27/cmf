# Alembic migrations for CMF

## Commands (from `backend/`)

```bash
# Apply pending migrations (uses MIGRATION_DATABASE_URL if set)
alembic upgrade head

# Mark existing DB as up-to-date without running SQL
alembic stamp 0001_baseline

# Create a new revision after model changes
alembic revision -m "describe_change"
```

Always run migrations as **`cmf_owner`** via `MIGRATION_DATABASE_URL`.
The FastAPI process uses **`cmf_app`** and must not run DDL.

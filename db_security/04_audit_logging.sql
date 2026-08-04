-- =============================================================================
-- Row-level change auditing into audit.change_log
-- Run: psql -h <host> -U postgres -d <db> -f 04_audit_logging.sql
-- (Replace __DB_NAME__ or use apply_from_env.ps1)
-- =============================================================================
\set ON_ERROR_STOP on
\c "__DB_NAME__"

CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION postgres;

CREATE TABLE IF NOT EXISTS audit.change_log (
    id            BIGSERIAL,
    changed_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    schema_name   TEXT         NOT NULL,
    table_name    TEXT         NOT NULL,
    operation     TEXT         NOT NULL,
    db_user       TEXT         NOT NULL,
    app_user_name TEXT,
    app_user_id   INTEGER,
    app_user_role TEXT,
    client_addr   INET,
    old_row       JSONB,
    new_row       JSONB,
    CONSTRAINT change_log_pkey PRIMARY KEY (id)
);

ALTER TABLE audit.change_log OWNER TO postgres;

CREATE INDEX IF NOT EXISTS ix_change_log_at
    ON audit.change_log (changed_at);
CREATE INDEX IF NOT EXISTS ix_change_log_table
    ON audit.change_log (schema_name, table_name);
CREATE INDEX IF NOT EXISTS ix_change_log_app_user
    ON audit.change_log (app_user_id);
CREATE INDEX IF NOT EXISTS ix_change_log_operation
    ON audit.change_log (operation);

CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit, public
AS $$
DECLARE
    v_old  jsonb;
    v_new  jsonb;
    v_uid  text := current_setting('app.current_user_id', true);
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
    ELSE
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    END IF;

    INSERT INTO audit.change_log (
        schema_name, table_name, operation, db_user,
        app_user_name, app_user_id, app_user_role,
        client_addr, old_row, new_row
    ) VALUES (
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        TG_OP,
        session_user,
        NULLIF(current_setting('app.current_user', true), ''),
        NULLIF(v_uid, '')::int,
        NULLIF(current_setting('app.current_user_role', true), ''),
        inet_client_addr(),
        v_old,
        v_new
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION audit.log_change() OWNER TO postgres;

DO $$
DECLARE
    r record;
    included_schemas text[] := ARRAY[
        'accesscontrol',
        'oms',
        'configuration',
        'inventory',
        'documents',
        'maintenance',
        'notifications',
        'quality',
        'scheduling',
        'public'
    ];
    excluded_tables text[] := ARRAY[
        'public.alembic_version',
        'notifications.activity_log'
    ];
BEGIN
    FOR r IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = ANY(included_schemas)
          AND (n.nspname || '.' || c.relname) <> ALL(excluded_tables)
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_audit_row ON %I.%I',
            r.schema_name, r.table_name
        );
        EXECUTE format(
            'CREATE TRIGGER trg_audit_row
                 AFTER INSERT OR UPDATE OR DELETE ON %I.%I
                 FOR EACH ROW EXECUTE FUNCTION audit.log_change()',
            r.schema_name, r.table_name
        );
    END LOOP;
END
$$;

SELECT n.nspname AS schema, count(*) AS audited_tables
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE t.tgname = 'trg_audit_row'
GROUP BY n.nspname
ORDER BY n.nspname;

\echo 'Audit logging installed. Changes now recorded in audit.change_log.'

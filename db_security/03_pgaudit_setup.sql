-- =============================================================================
-- Enable pgaudit (run as postgres after installing the pgaudit package)
-- OS packages: postgresql-XX-pgaudit  (Debian/Ubuntu) or equivalent
-- Then set shared_preload_libraries = 'pgaudit' and RESTART PostgreSQL.
-- =============================================================================
\c "__DB_NAME__"

CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Session-level defaults (cluster defaults also in postgresql.conf)
ALTER DATABASE "__DB_NAME__" SET pgaudit.log = 'ddl, write, role';
ALTER DATABASE "__DB_NAME__" SET pgaudit.log_catalog = off;
ALTER DATABASE "__DB_NAME__" SET pgaudit.log_relation = on;
ALTER DATABASE "__DB_NAME__" SET pgaudit.log_parameter = on;

\echo 'pgaudit configured (requires shared_preload_libraries + restart)'

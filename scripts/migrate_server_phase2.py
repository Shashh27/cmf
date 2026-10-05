"""
Phase 2: add remaining local FKs + indexes onto server CMF_DIGITIZATION.

Safety:
  * Never DROP / DELETE / TRUNCATE business data.
  * Add constraints only when existing server rows already comply.
  * Add indexes with IF NOT EXISTS (or unique indexes after a duplicate guard).
  * Single transaction; dry-run rolls back by default.
  * Row-count guard aborts if any pre-existing table loses rows.

Usage:
  cd backend
  python -m scripts.migrate_server_phase2           # dry run
  python -m scripts.migrate_server_phase2 --apply   # commit
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

LOCAL = dict(
    host="172.18.7.86",
    port=5432,
    dbname="CMF_Demo",
    user="postgres",
    password="postgres",
    connect_timeout=20,
)
SERVER = dict(
    host="172.18.7.91",
    port=5432,
    dbname="CMF_DIGITIZATION",
    user="postgres",
    password="postgres",
    connect_timeout=20,
)

APP_SCHEMAS = [
    "accesscontrol", "audit", "chatbox", "configuration", "documents", "ems",
    "inventory", "maintenance", "notifications", "oms",
    "production_monitoring", "public", "quality", "scheduling",
]

# Intentionally NOT added (would break existing server rows / history model)
SKIP_CONSTRAINT_NAMES = {
    # PK on last_updated alone is wrong for multi-machine history on server
    "machine_live_history_pkey",
}
SKIP_INDEX_NAMES = {
    "machine_live_history_pkey",
}

# Cosmetic / redundant id indexes SQLAlchemy auto-creates; skip noise
SKIP_INDEX_NAME_PREFIXES = (
    "ix_accesscontrol_refresh_tokens_id",
    "ix_chatbox_chat_message_attachments_id",
    "ix_chatbox_chat_message_read_status_id",
    "ix_chatbox_chat_participants_id",
    "ix_notifications_machine_operator_assignment_notification_id",
    "ix_notifications_pm_missed_notifications_id",
    "ix_notifications_production_log_review_notification_id",
)


def connect(cfg, readonly=False):
    c = psycopg2.connect(**cfg)
    if readonly:
        c.set_session(readonly=True, autocommit=True)
    else:
        c.autocommit = False
    return c


def q(cur, sql, params=None):
    cur.execute(sql, params or ())
    if cur.description is None:
        return []
    return [dict(r) for r in cur.fetchall()]


def norm(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    s = s.replace("::character varying", "").replace("::text", "")
    return s.lower()


def load_local_fks(cur):
    """Return list of FK constraints present on local."""
    return q(cur, """
        SELECT n.nspname AS schema, cl.relname AS table, con.conname AS name,
               pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE con.contype = 'f'
          AND n.nspname = ANY(%s)
        ORDER BY 1, 2, 3
    """, (APP_SCHEMAS,))


def load_local_uniques(cur):
    return q(cur, """
        SELECT n.nspname AS schema, cl.relname AS table, con.conname AS name,
               pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE con.contype = 'u'
          AND n.nspname = ANY(%s)
        ORDER BY 1, 2, 3
    """, (APP_SCHEMAS,))


def load_local_checks(cur):
    return q(cur, """
        SELECT n.nspname AS schema, cl.relname AS table, con.conname AS name,
               pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE con.contype = 'c'
          AND n.nspname = ANY(%s)
        ORDER BY 1, 2, 3
    """, (APP_SCHEMAS,))


def load_local_indexes(cur):
    return q(cur, """
        SELECT n.nspname AS schema, t.relname AS table, i.relname AS name,
               pg_get_indexdef(x.indexrelid) AS definition,
               x.indisunique AS is_unique,
               x.indisprimary AS is_primary
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = ANY(%s)
          AND NOT x.indisprimary
        ORDER BY 1, 2, 3
    """, (APP_SCHEMAS,))


def server_constraint_defs(cur):
    out = set()
    for r in q(cur, """
        SELECT n.nspname AS schema, cl.relname AS table, con.contype AS ctype,
               pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = ANY(%s)
    """, (APP_SCHEMAS,)):
        out.add(f'{r["schema"]}.{r["table"]}|{r["ctype"]}|{norm(r["definition"])}')
    return out


def server_constraint_names(cur):
    return {
        f'{r["schema"]}.{r["table"]}.{r["name"]}'
        for r in q(cur, """
            SELECT n.nspname AS schema, cl.relname AS table, con.conname AS name
            FROM pg_constraint con
            JOIN pg_class cl ON cl.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = cl.relnamespace
            WHERE n.nspname = ANY(%s)
        """, (APP_SCHEMAS,))
    }


def server_index_defs(cur):
    out = set()
    for r in q(cur, """
        SELECT n.nspname AS schema, t.relname AS table,
               pg_get_indexdef(x.indexrelid) AS definition
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = ANY(%s)
    """, (APP_SCHEMAS,)):
        d = r["definition"]
        uniq = "UNIQUE" if d.startswith("CREATE UNIQUE") else ""
        tail = d.split(" ON ", 1)[1] if " ON " in d else d
        out.add(f'{r["schema"]}.{r["table"]}|{uniq}|{norm(tail)}')
    return out


def table_exists(cur, schema, table):
    return bool(q(cur, """
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND c.relname = %s AND c.relkind IN ('r','p')
    """, (schema, table)))


def parse_fk_columns(definition: str):
    """Extract (local_cols, ref_schema, ref_table, ref_cols) from FK definition."""
    m = re.match(
        r"FOREIGN KEY\s*\((.+?)\)\s*REFERENCES\s+([^\s(]+)\s*\((.+?)\)",
        definition,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return None
    local_cols = [c.strip().strip('"') for c in m.group(1).split(",")]
    ref = m.group(2).strip().strip('"')
    if "." in ref:
        ref_schema, ref_table = ref.split(".", 1)
        ref_schema = ref_schema.strip('"')
        ref_table = ref_table.strip('"')
    else:
        ref_schema, ref_table = "public", ref.strip('"')
    ref_cols = [c.strip().strip('"') for c in m.group(3).split(",")]
    return local_cols, ref_schema, ref_table, ref_cols


def orphan_count(cur, schema, table, definition):
    parsed = parse_fk_columns(definition)
    if not parsed:
        return None  # cannot build guard
    local_cols, ref_schema, ref_table, ref_cols = parsed
    if not table_exists(cur, schema, table):
        return None
    if not table_exists(cur, ref_schema, ref_table):
        return None
    # Build orphan query: rows whose FK cols are all NOT NULL but no match
    joins = " AND ".join(
        f'r."{rc}" = t."{lc}"' for lc, rc in zip(local_cols, ref_cols)
    )
    not_null = " AND ".join(f't."{lc}" IS NOT NULL' for lc in local_cols)
    sql = (
        f'SELECT COUNT(*) AS n FROM "{schema}"."{table}" t '
        f'LEFT JOIN "{ref_schema}"."{ref_table}" r ON {joins} '
        f'WHERE {not_null} AND r."{ref_cols[0]}" IS NULL'
    )
    return int(q(cur, sql)[0]["n"])


def parse_unique_cols(definition: str):
    m = re.match(r"UNIQUE\s*\((.+)\)", definition, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    return [c.strip().strip('"') for c in m.group(1).split(",")]


def duplicate_count_unique(cur, schema, table, definition):
    cols = parse_unique_cols(definition)
    if not cols:
        return None
    if not table_exists(cur, schema, table):
        return None
    col_list = ", ".join(f'"{c}"' for c in cols)
    sql = (
        f'SELECT COALESCE(SUM(c - 1), 0) AS n FROM ('
        f'SELECT COUNT(*) AS c FROM "{schema}"."{table}" '
        f'GROUP BY {col_list} HAVING COUNT(*) > 1) d'
    )
    return int(q(cur, sql)[0]["n"])


def parse_unique_index_cols(definition: str):
    """From CREATE UNIQUE INDEX ... ON schema.table USING btree (cols) [WHERE ...]"""
    m = re.search(
        r"ON\s+[^\s]+\s+USING\s+\w+\s*\((.+?)\)(?:\s+WHERE\s+(.+))?$",
        definition,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return None, None
    cols_raw = m.group(1)
    where = m.group(2)
    # Skip expression indexes (contain '(' beyond simple columns)
    if "(" in cols_raw:
        return None, where
    cols = [c.strip().strip('"') for c in cols_raw.split(",")]
    return cols, where


def duplicate_count_unique_index(cur, schema, table, definition):
    cols, where = parse_unique_index_cols(definition)
    if not cols:
        return None
    if not table_exists(cur, schema, table):
        return None
    col_list = ", ".join(f'"{c}"' for c in cols)
    where_sql = f" WHERE {where}" if where else ""
    sql = (
        f'SELECT COALESCE(SUM(c - 1), 0) AS n FROM ('
        f'SELECT COUNT(*) AS c FROM "{schema}"."{table}"{where_sql} '
        f'GROUP BY {col_list} HAVING COUNT(*) > 1) d'
    )
    try:
        return int(q(cur, sql)[0]["n"])
    except Exception:
        return None


def snapshot_counts(cur):
    tables = q(cur, """
        SELECT n.nspname AS schema, c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = ANY(%s)
        ORDER BY 1, 2
    """, (APP_SCHEMAS,))
    counts = {}
    for t in tables:
        key = f'{t["schema"]}.{t["table"]}'
        counts[key] = int(q(cur, f'SELECT COUNT(*) AS n FROM "{t["schema"]}"."{t["table"]}"')[0]["n"])
    return counts


def should_skip_index_name(name: str) -> bool:
    if name in SKIP_INDEX_NAMES:
        return True
    return any(name.startswith(p) or name == p for p in SKIP_INDEX_NAME_PREFIXES)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    mode = "APPLY" if args.apply else "DRY RUN (will roll back)"

    print("=" * 74)
    print(f"Phase 2: remaining FKs + indexes  ->  {SERVER['host']}/{SERVER['dbname']}")
    print(f"Mode: {mode}")
    print("=" * 74)

    # Discover from LOCAL
    lconn = connect(LOCAL, readonly=True)
    lcur = lconn.cursor(cursor_factory=RealDictCursor)
    local_fks = load_local_fks(lcur)
    local_uniques = load_local_uniques(lcur)
    local_checks = load_local_checks(lcur)
    local_indexes = load_local_indexes(lcur)
    lcur.close()
    lconn.close()

    conn = connect(SERVER)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    skipped = []
    added = {"fk": 0, "unique": 0, "check": 0, "index": 0}

    try:
        print("\n[0] Row counts before ...")
        before = snapshot_counts(cur)
        print(f"    {len(before)} tables, {sum(before.values()):,} rows")

        s_defs = server_constraint_defs(cur)
        s_names = server_constraint_names(cur)
        s_ix = server_index_defs(cur)

        # ---- Foreign keys -------------------------------------------------
        print("\n[1] Foreign keys")
        for fk in local_fks:
            schema, table, name, definition = (
                fk["schema"], fk["table"], fk["name"], fk["definition"]
            )
            if name in SKIP_CONSTRAINT_NAMES:
                skipped.append((name, "intentionally skipped"))
                continue
            if not table_exists(cur, schema, table):
                skipped.append((name, "table missing on server"))
                print(f"    SKIP  {schema}.{table}.{name} (table missing)")
                continue
            full = f"{schema}.{table}.{name}"
            def_key = f"{schema}.{table}|f|{norm(definition)}"
            if full in s_names or def_key in s_defs:
                print(f"    exists  {full}")
                continue

            try:
                cur.execute("SAVEPOINT sp_guard")
                orphans = orphan_count(cur, schema, table, definition)
                cur.execute("RELEASE SAVEPOINT sp_guard")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_guard")
                skipped.append((full, f"guard failed: {str(exc).splitlines()[0]}"))
                print(f"    SKIP  {full} (guard failed)")
                continue

            if orphans is None:
                skipped.append((full, "could not parse FK / missing ref table"))
                print(f"    SKIP  {full} (unparseable / missing ref)")
                continue
            if orphans > 0:
                skipped.append((full, f"{orphans} orphan rows kept as-is"))
                print(f"    SKIP  {full} ({orphans} orphans)")
                continue

            ddl = f'ALTER TABLE "{schema}"."{table}" ADD CONSTRAINT "{name}" {definition}'
            try:
                cur.execute("SAVEPOINT sp_fk")
                cur.execute(ddl)
                cur.execute("RELEASE SAVEPOINT sp_fk")
                added["fk"] += 1
                s_names.add(full)
                s_defs.add(def_key)
                print(f"    ADDED {full}")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_fk")
                skipped.append((full, str(exc).splitlines()[0]))
                print(f"    SKIP  {full} ({str(exc).splitlines()[0]})")

        # ---- UNIQUE constraints ------------------------------------------
        print("\n[2] UNIQUE constraints")
        for uq in local_uniques:
            schema, table, name, definition = (
                uq["schema"], uq["table"], uq["name"], uq["definition"]
            )
            if name in SKIP_CONSTRAINT_NAMES:
                continue
            if not table_exists(cur, schema, table):
                continue
            full = f"{schema}.{table}.{name}"
            def_key = f"{schema}.{table}|u|{norm(definition)}"
            if full in s_names or def_key in s_defs:
                print(f"    exists  {full}")
                continue
            try:
                cur.execute("SAVEPOINT sp_guard")
                dups = duplicate_count_unique(cur, schema, table, definition)
                cur.execute("RELEASE SAVEPOINT sp_guard")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_guard")
                skipped.append((full, f"guard failed: {str(exc).splitlines()[0]}"))
                continue
            if dups is None:
                skipped.append((full, "could not parse unique"))
                continue
            if dups > 0:
                skipped.append((full, f"{dups} duplicate groups kept as-is"))
                print(f"    SKIP  {full} ({dups} duplicates)")
                continue
            ddl = f'ALTER TABLE "{schema}"."{table}" ADD CONSTRAINT "{name}" {definition}'
            try:
                cur.execute("SAVEPOINT sp_uq")
                cur.execute(ddl)
                cur.execute("RELEASE SAVEPOINT sp_uq")
                added["unique"] += 1
                print(f"    ADDED {full}")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_uq")
                skipped.append((full, str(exc).splitlines()[0]))
                print(f"    SKIP  {full} ({str(exc).splitlines()[0]})")

        # ---- CHECK constraints -------------------------------------------
        print("\n[3] CHECK constraints")
        for ch in local_checks:
            schema, table, name, definition = (
                ch["schema"], ch["table"], ch["name"], ch["definition"]
            )
            if not table_exists(cur, schema, table):
                continue
            full = f"{schema}.{table}.{name}"
            def_key = f"{schema}.{table}|c|{norm(definition)}"
            if full in s_names or def_key in s_defs:
                print(f"    exists  {full}")
                continue
            # Try adding; if existing rows violate, skip
            ddl = f'ALTER TABLE "{schema}"."{table}" ADD CONSTRAINT "{name}" {definition}'
            try:
                cur.execute("SAVEPOINT sp_ck")
                cur.execute(ddl)
                cur.execute("RELEASE SAVEPOINT sp_ck")
                added["check"] += 1
                print(f"    ADDED {full}")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_ck")
                skipped.append((full, str(exc).splitlines()[0]))
                print(f"    SKIP  {full} ({str(exc).splitlines()[0]})")

        # ---- Indexes -----------------------------------------------------
        print("\n[4] Indexes")
        for ix in local_indexes:
            schema, table, name, definition = (
                ix["schema"], ix["table"], ix["name"], ix["definition"]
            )
            if should_skip_index_name(name):
                continue
            if not table_exists(cur, schema, table):
                continue
            d = definition
            uniq = "UNIQUE" if d.startswith("CREATE UNIQUE") else ""
            tail = d.split(" ON ", 1)[1] if " ON " in d else d
            def_key = f"{schema}.{table}|{uniq}|{norm(tail)}"
            if def_key in s_ix:
                print(f"    exists  {schema}.{table}.{name}")
                continue

            if ix["is_unique"]:
                try:
                    cur.execute("SAVEPOINT sp_guard")
                    dups = duplicate_count_unique_index(cur, schema, table, definition)
                    cur.execute("RELEASE SAVEPOINT sp_guard")
                except Exception as exc:
                    cur.execute("ROLLBACK TO SAVEPOINT sp_guard")
                    skipped.append((name, f"unique-index guard failed: {str(exc).splitlines()[0]}"))
                    continue
                if dups is None:
                    # expression unique index — try and catch
                    pass
                elif dups > 0:
                    skipped.append((name, f"{dups} duplicate groups kept as-is"))
                    print(f"    SKIP  {schema}.{table}.{name} ({dups} duplicates)")
                    continue

            # Use IF NOT EXISTS for non-unique; unique already guarded
            ddl = definition
            if " IF NOT EXISTS " not in ddl.upper():
                ddl = ddl.replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1)
                ddl = ddl.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1)

            try:
                cur.execute("SAVEPOINT sp_ix")
                cur.execute(ddl)
                cur.execute("RELEASE SAVEPOINT sp_ix")
                added["index"] += 1
                s_ix.add(def_key)
                print(f"    ADDED {schema}.{table}.{name}")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_ix")
                skipped.append((name, str(exc).splitlines()[0]))
                print(f"    SKIP  {schema}.{table}.{name} ({str(exc).splitlines()[0]})")

        # ---- Row integrity -----------------------------------------------
        print("\n[5] Verifying no rows were lost ...")
        after = snapshot_counts(cur)
        lost = []
        for key, old in before.items():
            new = after.get(key)
            if new is None:
                lost.append(f"{key}: TABLE MISSING (had {old})")
            elif new < old:
                lost.append(f"{key}: {old} -> {new}")
        if lost:
            raise RuntimeError("Row loss detected:\n  " + "\n  ".join(lost))
        print(f"    OK — {len(before)} tables intact")
        print(f"    before = {sum(before.values()):,}  after = "
              f"{sum(v for k, v in after.items() if k in before):,}")

        print("\n[6] Summary")
        print(f"    FKs added      : {added['fk']}")
        print(f"    UNIQUEs added  : {added['unique']}")
        print(f"    CHECKs added   : {added['check']}")
        print(f"    Indexes added  : {added['index']}")
        print(f"    Skipped        : {len(skipped)}")

        if args.apply:
            conn.commit()
            print("\nCOMMITTED.")
        else:
            conn.rollback()
            print("\nDRY RUN complete — rolled back. Re-run with --apply to commit.")

    except Exception as exc:
        conn.rollback()
        print(f"\nFAILED, rolled back: {type(exc).__name__}: {exc}")
        raise
    finally:
        if skipped:
            print("\n" + "-" * 74)
            print("Skipped (existing server data preserved):")
            for name, reason in skipped:
                print(f"  - {name}: {reason}")
            print("-" * 74)
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()

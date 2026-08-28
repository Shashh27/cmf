"""Read-only: scheduling table row counts on server vs local."""
import psycopg2
from psycopg2.extras import RealDictCursor

LOCAL = dict(host="172.18.7.86", port=5432, dbname="CMF_Demo",
             user="postgres", password="postgres", connect_timeout=20)
SERVER = dict(host="172.18.7.91", port=5432, dbname="CMF_DIGITIZATION",
              user="postgres", password="postgres", connect_timeout=20)


def connect(cfg):
    c = psycopg2.connect(**cfg)
    c.set_session(readonly=True, autocommit=True)
    return c


def scheduling_counts(cfg):
    c = connect(cfg)
    cur = c.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT n.nspname AS schema, c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'scheduling' AND c.relkind = 'r'
        ORDER BY c.relname
    """)
    tables = cur.fetchall()
    out = []
    for t in tables:
        cur.execute(
            f'SELECT COUNT(*) AS n FROM "{t["schema"]}"."{t["table"]}"'
        )
        out.append({
            "table": f'{t["schema"]}.{t["table"]}',
            "rows": cur.fetchone()["n"],
        })
    c.close()
    return out


def audit_scheduling_deletes(cfg):
    c = connect(cfg)
    cur = c.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT COUNT(*) AS n
        FROM audit.change_log
        WHERE schema_name = 'scheduling' AND operation = 'DELETE'
    """)
    n = cur.fetchone()["n"]
    c.close()
    return n


print("=" * 72)
print("SCHEDULING ROW COUNTS")
print("=" * 72)
print(f"{'TABLE':<45} {'LOCAL':>10} {'SERVER':>10} {'DIFF':>8}")
print("-" * 72)

local = {x["table"]: x["rows"] for x in scheduling_counts(LOCAL)}
server = {x["table"]: x["rows"] for x in scheduling_counts(SERVER)}
all_tables = sorted(set(local) | set(server))

for t in all_tables:
    l = local.get(t, 0)
    s = server.get(t, 0)
    diff = s - l
    mark = ""
    if s < l:
        mark = "  <-- server has fewer"
    elif t not in local:
        mark = "  (new on server)"
    print(f"{t:<45} {l:>10} {s:>10} {diff:>+8}{mark}")

print("\n" + "=" * 72)
print("AUDIT: any DELETE on scheduling schema since migration?")
print("=" * 72)
deletes = audit_scheduling_deletes(SERVER)
print(f"  scheduling DELETE entries in audit.change_log: {deletes}")

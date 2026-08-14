import psycopg2

conn = psycopg2.connect(
    host="172.18.7.91",
    port=5432,
    user="postgres",
    password="postgres",
    dbname="CMF_DIGITIZATION",
)
cur = conn.cursor()
cur.execute(
    """
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'maintenance' ORDER BY table_name
    """
)
print("tables:", cur.fetchall())
cur.execute(
    """
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'maintenance' AND table_name = 'oee_issues'
    ORDER BY ordinal_position
    """
)
cols = cur.fetchall()
print("oee_issues cols:", cols)
if cols:
    cur.execute("SELECT COUNT(*) FROM maintenance.oee_issues")
    print("count:", cur.fetchone()[0])
    cur.execute("SELECT * FROM maintenance.oee_issues LIMIT 3")
    print("sample:", cur.fetchall())
cur.close()
conn.close()

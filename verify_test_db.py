import psycopg2

try:
    conn = psycopg2.connect('postgresql://postgres:postgres@172.18.7.86:5432/CMF_Test')
    print("Successfully connected to CMF_Test database")
    cur = conn.cursor()
    cur.execute("SELECT version()")
    version = cur.fetchone()
    print("PostgreSQL version:", version[0])
    cur.close()
    conn.close()
except Exception as e:
    print("Error connecting to CMF_Test:", e)

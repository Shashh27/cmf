import psycopg2
import os
from pathlib import Path

# Connect to CMF_Test database
conn = psycopg2.connect('postgresql://postgres:postgres@172.18.7.86:5432/CMF_Test')
conn.autocommit = True
cur = conn.cursor()

# Create schemas first
print("Creating schemas...")
try:
    cur.execute("CREATE SCHEMA IF NOT EXISTS oms")
    print("Created schema: oms")
except Exception as e:
    print(f"Error creating oms schema: {e}")

try:
    cur.execute("CREATE SCHEMA IF NOT EXISTS scheduling")
    print("Created schema: scheduling")
except Exception as e:
    print(f"Error creating scheduling schema: {e}")

try:
    cur.execute("CREATE SCHEMA IF NOT EXISTS configuration")
    print("Created schema: configuration")
except Exception as e:
    print(f"Error creating configuration schema: {e}")

try:
    cur.execute("CREATE SCHEMA IF NOT EXISTS inventory")
    print("Created schema: inventory")
except Exception as e:
    print(f"Error creating inventory schema: {e}")

# Run SQL migration files
migrations_dir = Path("migrations")
sql_files = sorted(migrations_dir.glob("*.sql"))

print(f"\nFound {len(sql_files)} SQL migration files")

for sql_file in sql_files:
    print(f"\nRunning: {sql_file.name}")
    try:
        with open(sql_file, 'r') as f:
            sql_content = f.read()
        cur.execute(sql_content)
        print(f"✓ Successfully executed: {sql_file.name}")
    except Exception as e:
        print(f"✗ Error executing {sql_file.name}: {e}")

# Run Python migration files
py_files = sorted(migrations_dir.glob("*.py"))
print(f"\nFound {len(py_files)} Python migration files")

for py_file in py_files:
    print(f"\nSkipping Python migration: {py_file.name}")
    print("  (Python migrations need to be run manually or with Alembic)")

cur.close()
conn.close()
print("\n✓ SQL migrations completed")

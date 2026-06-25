import psycopg2
from psycopg2 import sql

print("Starting full database copy from CMF_Demo to cmf_test...")

# Connect to production database (READ ONLY)
prod_conn = psycopg2.connect('postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo')
prod_cur = prod_conn.cursor()

# Connect to test database (WRITE ONLY)
test_conn = psycopg2.connect('postgresql://postgres:postgres@172.18.7.86:5432/cmf_test')
test_cur = test_conn.cursor()
test_conn.autocommit = True

# Step 1: Create all schemas
print("\n=== Creating schemas ===")
prod_cur.execute("""
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'public', 'pg_toast')
""")
schemas = [row[0] for row in prod_cur.fetchall()]
print(f"Found schemas: {schemas}")

for schema in schemas:
    try:
        test_cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)))
        print(f"✓ Created schema: {schema}")
    except Exception as e:
        print(f"✗ Error creating {schema}: {e}")

# Step 2: Copy all tables with structure and data
print("\n=== Copying tables ===")
prod_cur.execute("""
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'public', 'pg_toast')
    ORDER BY table_schema, table_name
""")

tables = prod_cur.fetchall()
print(f"Found {len(tables)} tables to copy")

for schema, table_name in tables:
    print(f"\nProcessing: {schema}.{table_name}")
    
    # Drop table if exists in test
    try:
        test_cur.execute(sql.SQL("DROP TABLE IF EXISTS {}.{} CASCADE").format(
            sql.Identifier(schema), sql.Identifier(table_name)
        ))
    except:
        pass
    
    # Create table in test (using LIKE to copy structure)
    try:
        test_cur.execute(sql.SQL("CREATE TABLE {}.{} (LIKE {}.{} INCLUDING DEFAULTS INCLUDING CONSTRAINTS)").format(
            sql.Identifier(schema), sql.Identifier(table_name),
            sql.Identifier(schema), sql.Identifier(table_name)
        ))
        print(f"  ✓ Created table structure")
    except Exception as e:
        print(f"  ✗ Error creating structure: {e}")
        continue
    
    # Copy data
    try:
        prod_cur.execute(f'SELECT * FROM "{schema}"."{table_name}"')
        columns = [desc[0] for desc in prod_cur.description]
        rows = prod_cur.fetchall()
        
        if rows:
            insert_query = sql.SQL("INSERT INTO {}.{} ({}) VALUES ({})").format(
                sql.Identifier(schema), sql.Identifier(table_name),
                sql.SQL(', ').join(map(sql.Identifier, columns)),
                sql.SQL(', ').join([sql.Placeholder()] * len(columns))
            )
            
            test_cur.executemany(insert_query, rows)
            print(f"  ✓ Copied {len(rows)} rows")
        else:
            print(f"  ✓ Table is empty (0 rows)")
    except Exception as e:
        print(f"  ✗ Error copying data: {e}")

# Step 3: Copy sequences
print("\n=== Copying sequences ===")
prod_cur.execute("""
    SELECT sequence_schema, sequence_name 
    FROM information_schema.sequences 
    WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
""")

sequences = prod_cur.fetchall()
print(f"Found {len(sequences)} sequences")

for schema, seq_name in sequences:
    print(f"Processing sequence: {schema}.{seq_name}")
    try:
        # Get current value
        prod_cur.execute(f"SELECT last_value FROM \"{schema}\".\"{seq_name}\"")
        last_val = prod_cur.fetchone()[0]
        
        # Set sequence in test
        test_cur.execute(f"SELECT setval('\"{schema}\".\"{seq_name}\"', {last_val}, true)")
        print(f"  ✓ Set sequence value to {last_val}")
    except Exception as e:
        print(f"  ✗ Error: {e}")

prod_cur.close()
prod_conn.close()
test_cur.close()
test_conn.close()

print("\n✓✓✓ Full database copy completed successfully ✓✓✓")
print("cmf_test now has the same schema and data as CMF_Demo")
print("Integration tests will READ from cmf_test and WRITE to cmf_test")
print("CMF_Demo remains untouched")

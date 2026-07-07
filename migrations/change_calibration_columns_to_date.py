"""
Migration script to change calibration_date and calibration_due_date from TIMESTAMP to DATE
This will store only the date part without time.
"""

import psycopg2
from psycopg2 import sql

# Database connection
DB_CONFIG = {
    'host': '172.18.7.86',
    'port': 5432,
    'database': 'CMF_Demo',
    'user': 'postgres',
    'password': 'postgres'
}

def migrate():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print("Starting migration: Change calibration columns to DATE type...")
        
        # Check current column types
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'inventory' 
            AND table_name = 'tools_list' 
            AND column_name IN ('calibration_date', 'calibration_due_date')
        """)
        existing_columns = cursor.fetchall()
        print(f"Existing columns: {existing_columns}")
        
        # Drop existing columns
        for column_name, data_type in existing_columns:
            print(f"Dropping column: {column_name} (type: {data_type})")
            cursor.execute(sql.SQL("""
                ALTER TABLE inventory.tools_list 
                DROP COLUMN IF EXISTS {}
            """).format(sql.Identifier(column_name)))
        
        # Add columns as DATE type
        print("Adding calibration_date as DATE type...")
        cursor.execute("""
            ALTER TABLE inventory.tools_list 
            ADD COLUMN calibration_date DATE
        """)
        
        print("Adding calibration_due_date as DATE type...")
        cursor.execute("""
            ALTER TABLE inventory.tools_list 
            ADD COLUMN calibration_due_date DATE
        """)
        
        conn.commit()
        print("Migration completed successfully!")
        print("Columns changed from TIMESTAMP to DATE (date only, no time)")
        
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    migrate()

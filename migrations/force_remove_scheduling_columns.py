"""
Force remove scheduling columns from pokayoke_completed_logs table.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # First, show all columns in the table
    show_columns = text("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_completed_logs'
        ORDER BY ordinal_position
    """)
    columns = conn.execute(show_columns).fetchall()
    print("Current columns in pokayoke_completed_logs:")
    for col in columns:
        print(f"  - {col[0]} ({col[1]})")
    
    # Now try to drop the columns regardless of whether they exist
    columns_to_remove = [
        'frequency_type',
        'interval_value',
        'interval_unit',
        'trigger_hours',
        'inspection_interval',
        'shift',
        'due_date',
        'next_due_date'
    ]
    
    print("\nAttempting to remove columns...")
    for column in columns_to_remove:
        try:
            conn.execute(text(f"""
                ALTER TABLE configuration.pokayoke_completed_logs 
                DROP COLUMN IF EXISTS {column}
            """))
            print(f"Removed {column} column")
        except Exception as e:
            print(f"Error removing {column}: {e}")
    
    conn.commit()
    print("\nMigration completed!")
    
    # Show columns again
    columns_after = conn.execute(show_columns).fetchall()
    print("\nColumns after migration:")
    for col in columns_after:
        print(f"  - {col[0]} ({col[1]})")

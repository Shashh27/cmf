"""
Migration script to remove scheduling fields from pokayoke_completed_logs table.
Scheduling is now handled at the item response level only.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if columns exist in pokayoke_completed_logs
    check_columns = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_completed_logs' 
        AND column_name IN ('frequency_type', 'interval_value', 'interval_unit', 
                           'trigger_hours', 'inspection_interval', 'shift', 
                           'due_date', 'next_due_date')
    """)
    existing_columns = conn.execute(check_columns).fetchall()
    existing_column_names = [col[0] for col in existing_columns]
    
    print(f"Existing completed log columns to remove: {existing_column_names}")
    
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
    
    for column in columns_to_remove:
        if column in existing_column_names:
            conn.execute(text(f"""
                ALTER TABLE configuration.pokayoke_completed_logs 
                DROP COLUMN IF EXISTS {column}
            """))
            print(f"Removed {column} column")
        else:
            print(f"{column} column does not exist, skipping")
    
    conn.commit()
    print("Migration completed successfully!")

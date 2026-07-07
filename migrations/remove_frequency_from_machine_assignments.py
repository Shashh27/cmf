"""
Migration script to remove frequency-related columns from pokayoke_machine_assignments table.
This simplifies machine assignments to only link checklists to machines, since each checkpoint
now has its own frequency configuration.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if columns exist in pokayoke_machine_assignments
    check_columns = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_machine_assignments' 
        AND column_name IN ('frequency_type', 'interval_value', 'interval_unit', 
                           'trigger_hours', 'inspection_interval', 'remarks', 'shift')
    """)
    existing_columns = conn.execute(check_columns).fetchall()
    existing_column_names = [col[0] for col in existing_columns]
    
    print(f"Existing machine assignment columns to remove: {existing_column_names}")
    
    # Remove columns from pokayoke_machine_assignments
    columns_to_remove = [
        'frequency_type',
        'interval_value',
        'interval_unit',
        'trigger_hours',
        'inspection_interval',
        'remarks',
        'shift'
    ]
    
    for column in columns_to_remove:
        if column in existing_column_names:
            conn.execute(text(f"""
                ALTER TABLE configuration.pokayoke_machine_assignments 
                DROP COLUMN IF EXISTS {column}
            """))
            print(f"Removed {column} column")
        else:
            print(f"{column} column does not exist, skipping")
    
    conn.commit()
    print("Migration completed successfully!")

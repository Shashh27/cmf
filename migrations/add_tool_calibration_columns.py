"""
Migration script to add calibration columns to tools_list table.
These columns are only relevant for Instruments category.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if columns already exist
    check_columns = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'tools_list' 
        AND column_name IN ('calibration_date', 'calibration_due_date', 'calibration_frequency')
    """)
    existing_columns = conn.execute(check_columns).fetchall()
    existing_column_names = [col[0] for col in existing_columns]
    
    print(f"Existing calibration columns: {existing_column_names}")
    
    # Add calibration_date column if it doesn't exist
    if 'calibration_date' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE inventory.tools_list 
            ADD COLUMN calibration_date TIMESTAMP WITH TIME ZONE
        """))
        print("Added calibration_date column")
    else:
        print("calibration_date column already exists")
    
    # Add calibration_due_date column if it doesn't exist
    if 'calibration_due_date' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE inventory.tools_list 
            ADD COLUMN calibration_due_date TIMESTAMP WITH TIME ZONE
        """))
        print("Added calibration_due_date column")
    else:
        print("calibration_due_date column already exists")
    
    # Add calibration_frequency column if it doesn't exist
    if 'calibration_frequency' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE inventory.tools_list 
            ADD COLUMN calibration_frequency VARCHAR(50)
        """))
        print("Added calibration_frequency column")
    else:
        print("calibration_frequency column already exists")
    
    conn.commit()
    print("Migration completed successfully!")

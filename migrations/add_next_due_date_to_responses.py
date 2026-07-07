"""
Migration script to add next_due_date and scheduling fields to pokayoke_item_responses table
and next_due_date to pokayoke_completed_logs table.
This enables tracking next due dates for individual checkpoint items based on their frequencies.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Add next_due_date to pokayoke_completed_logs
    check_completed_log = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_completed_logs' 
        AND column_name = 'next_due_date'
    """)
    if not conn.execute(check_completed_log).fetchall():
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            ADD COLUMN next_due_date DATE
        """))
        print("Added next_due_date column to pokayoke_completed_logs")
    else:
        print("next_due_date column already exists in pokayoke_completed_logs")
    
    # Add scheduling fields to pokayoke_item_responses
    check_item_response = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_item_responses' 
        AND column_name IN ('frequency_type', 'interval_value', 'interval_unit', 
                           'trigger_hours', 'inspection_interval', 'next_due_date')
    """)
    existing_columns = conn.execute(check_item_response).fetchall()
    existing_column_names = [col[0] for col in existing_columns]
    
    print(f"Existing item response columns: {existing_column_names}")
    
    columns_to_add = [
        ('frequency_type', 'VARCHAR(50)'),
        ('interval_value', 'INTEGER'),
        ('interval_unit', 'VARCHAR(20)'),
        ('trigger_hours', 'INTEGER'),
        ('inspection_interval', 'VARCHAR(50)'),
        ('next_due_date', 'DATE'),
    ]
    
    for column_name, column_type in columns_to_add:
        if column_name not in existing_column_names:
            conn.execute(text(f"""
                ALTER TABLE configuration.pokayoke_item_responses 
                ADD COLUMN {column_name} {column_type}
            """))
            print(f"Added {column_name} column to pokayoke_item_responses")
        else:
            print(f"{column_name} column already exists in pokayoke_item_responses")
    
    conn.commit()
    print("Migration completed successfully!")

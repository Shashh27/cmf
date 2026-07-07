"""
Add next_due_date column to pokayoke_machine_assignments table.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if column exists
    check_column = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_machine_assignments' 
        AND column_name = 'next_due_date'
    """)
    
    if not conn.execute(check_column).fetchall():
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN next_due_date DATE
        """))
        conn.commit()
        print("Added next_due_date column to pokayoke_machine_assignments")
    else:
        print("next_due_date column already exists in pokayoke_machine_assignments")

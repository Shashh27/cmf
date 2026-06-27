"""
Migration script to add scheduling fields to pokayoke_checklist_items table.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if new columns already exist in pokayoke_checklist_items
    check_columns = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_checklist_items' 
        AND column_name IN ('frequency_type', 'interval_value', 'interval_unit', 
                           'trigger_hours', 'inspection_interval', 'remarks')
    """)
    existing_columns = conn.execute(check_columns).fetchall()
    existing_column_names = [col[0] for col in existing_columns]
    
    print(f"Existing checklist item columns: {existing_column_names}")
    
    # Add new columns to pokayoke_checklist_items
    if 'frequency_type' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_checklist_items 
            ADD COLUMN frequency_type VARCHAR(50)
        """))
        print("Added frequency_type column")
    else:
        print("frequency_type column already exists")
    
    if 'interval_value' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_checklist_items 
            ADD COLUMN interval_value INTEGER
        """))
        print("Added interval_value column")
    else:
        print("interval_value column already exists")
    
    if 'interval_unit' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_checklist_items 
            ADD COLUMN interval_unit VARCHAR(20)
        """))
        print("Added interval_unit column")
    else:
        print("interval_unit column already exists")
    
    if 'trigger_hours' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_checklist_items 
            ADD COLUMN trigger_hours INTEGER
        """))
        print("Added trigger_hours column")
    else:
        print("trigger_hours column already exists")
    
    if 'inspection_interval' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_checklist_items 
            ADD COLUMN inspection_interval VARCHAR(50)
        """))
        print("Added inspection_interval column")
    else:
        print("inspection_interval column already exists")
    
    if 'remarks' not in existing_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_checklist_items 
            ADD COLUMN remarks VARCHAR(500)
        """))
        print("Added remarks column")
    else:
        print("remarks column already exists")
    
    conn.commit()
    print("Migration completed successfully!")

"""
Migration script to refactor PM scheduling mechanism.
This replaces the old frequency/shift/scheduled_day fields with new flexible scheduling fields.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # ========================================
    # Pokayoke Machine Assignments Table
    # ========================================
    
    # Check if new columns already exist in pokayoke_machine_assignments
    check_assignment_columns = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_machine_assignments' 
        AND column_name IN ('frequency_type', 'interval_value', 'interval_unit', 
                           'trigger_hours', 'inspection_interval', 'remarks', 
                           'next_due_date', 'active')
    """)
    existing_assignment_columns = conn.execute(check_assignment_columns).fetchall()
    existing_assignment_column_names = [col[0] for col in existing_assignment_columns]
    
    print(f"Existing assignment columns: {existing_assignment_column_names}")
    
    # Add new columns to pokayoke_machine_assignments
    if 'frequency_type' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN frequency_type VARCHAR(50)
        """))
        print("Added frequency_type column")
    else:
        print("frequency_type column already exists")
    
    if 'interval_value' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN interval_value INTEGER
        """))
        print("Added interval_value column")
    else:
        print("interval_value column already exists")
    
    if 'interval_unit' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN interval_unit VARCHAR(20)
        """))
        print("Added interval_unit column")
    else:
        print("interval_unit column already exists")
    
    if 'trigger_hours' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN trigger_hours INTEGER
        """))
        print("Added trigger_hours column")
    else:
        print("trigger_hours column already exists")
    
    if 'inspection_interval' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN inspection_interval VARCHAR(50)
        """))
        print("Added inspection_interval column")
    else:
        print("inspection_interval column already exists")
    
    if 'remarks' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN remarks VARCHAR(500)
        """))
        print("Added remarks column")
    else:
        print("remarks column already exists")
    
    if 'next_due_date' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN next_due_date DATE
        """))
        print("Added next_due_date column")
    else:
        print("next_due_date column already exists")
    
    if 'active' not in existing_assignment_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_machine_assignments 
            ADD COLUMN active BOOLEAN DEFAULT true
        """))
        print("Added active column")
    else:
        print("active column already exists")
    
    # Migrate existing data from old fields to new fields
    # This maps old frequency values to new frequency_type and interval values
    migrate_assignment_data = text("""
        UPDATE configuration.pokayoke_machine_assignments
        SET 
            frequency_type = CASE 
                WHEN frequency = 'Daily' THEN 'Time Based'
                WHEN frequency = 'Weekly' THEN 'Time Based'
                WHEN frequency = 'Monthly' THEN 'Time Based'
                ELSE 'Time Based'
            END,
            interval_value = CASE 
                WHEN frequency = 'Daily' THEN 1
                WHEN frequency = 'Weekly' THEN 1
                WHEN frequency = 'Monthly' THEN 1
                ELSE NULL
            END,
            interval_unit = CASE 
                WHEN frequency = 'Daily' THEN 'Day'
                WHEN frequency = 'Weekly' THEN 'Week'
                WHEN frequency = 'Monthly' THEN 'Month'
                ELSE NULL
            END
        WHERE frequency IS NOT NULL
    """)
    conn.execute(migrate_assignment_data)
    print("Migrated existing assignment data from old fields to new fields")
    
    # ========================================
    # Pokayoke Completed Logs Table
    # ========================================
    
    # Check if new columns already exist in pokayoke_completed_logs
    check_log_columns = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_completed_logs' 
        AND column_name IN ('frequency_type', 'interval_value', 'interval_unit', 
                           'trigger_hours', 'inspection_interval', 'due_date')
    """)
    existing_log_columns = conn.execute(check_log_columns).fetchall()
    existing_log_column_names = [col[0] for col in existing_log_columns]
    
    print(f"Existing log columns: {existing_log_column_names}")
    
    # Add new columns to pokayoke_completed_logs
    if 'frequency_type' not in existing_log_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            ADD COLUMN frequency_type VARCHAR(50)
        """))
        print("Added frequency_type column to completed_logs")
    else:
        print("frequency_type column already exists in completed_logs")
    
    if 'interval_value' not in existing_log_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            ADD COLUMN interval_value INTEGER
        """))
        print("Added interval_value column to completed_logs")
    else:
        print("interval_value column already exists in completed_logs")
    
    if 'interval_unit' not in existing_log_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            ADD COLUMN interval_unit VARCHAR(20)
        """))
        print("Added interval_unit column to completed_logs")
    else:
        print("interval_unit column already exists in completed_logs")
    
    if 'trigger_hours' not in existing_log_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            ADD COLUMN trigger_hours INTEGER
        """))
        print("Added trigger_hours column to completed_logs")
    else:
        print("trigger_hours column already exists in completed_logs")
    
    if 'inspection_interval' not in existing_log_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            ADD COLUMN inspection_interval VARCHAR(50)
        """))
        print("Added inspection_interval column to completed_logs")
    else:
        print("inspection_interval column already exists in completed_logs")
    
    if 'due_date' not in existing_log_column_names:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            ADD COLUMN due_date DATE
        """))
        print("Added due_date column to completed_logs")
    else:
        print("due_date column already exists in completed_logs")
    
    # Migrate existing completed log data
    migrate_log_data = text("""
        UPDATE configuration.pokayoke_completed_logs
        SET 
            frequency_type = CASE 
                WHEN frequency = 'Daily' THEN 'Time Based'
                WHEN frequency = 'Weekly' THEN 'Time Based'
                WHEN frequency = 'Monthly' THEN 'Time Based'
                ELSE 'Time Based'
            END,
            interval_value = CASE 
                WHEN frequency = 'Daily' THEN 1
                WHEN frequency = 'Weekly' THEN 1
                WHEN frequency = 'Monthly' THEN 1
                ELSE NULL
            END,
            interval_unit = CASE 
                WHEN frequency = 'Daily' THEN 'Day'
                WHEN frequency = 'Weekly' THEN 'Week'
                WHEN frequency = 'Monthly' THEN 'Month'
                ELSE NULL
            END
        WHERE frequency IS NOT NULL
    """)
    conn.execute(migrate_log_data)
    print("Migrated existing completed log data from old fields to new fields")
    
    conn.commit()
    print("Migration completed successfully!")

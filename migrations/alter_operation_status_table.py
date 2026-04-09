#!/usr/bin/env python3
"""
Migration Script: Alter existing operation_status table to match new model
Description: Updates the existing operation_status table structure
Run with: python migrations/alter_operation_status_table.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def alter_operation_status_table():
    """Alter the existing operation_status table to match the new model structure"""
    db = SessionLocal()
    
    try:
        print("Starting operation_status table alteration...")
        
        # Check current table structure
        print("Checking current table structure...")
        current_columns = db.execute(text("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = 'scheduling' AND table_name = 'operation_status'
            ORDER BY ordinal_position
        """)).fetchall()
        
        print("Current columns:")
        for col in current_columns:
            print(f"  {col.column_name}: {col.data_type} (nullable: {col.is_nullable})")
        
        # Make started_at and completed_at nullable
        print("\nMaking started_at and completed_at nullable...")
        
        # First, update any NULL values to current timestamp since they are NOT NULL
        db.execute(text("""
            UPDATE scheduling.operation_status 
            SET started_at = NOW() WHERE started_at IS NULL
        """))
        
        db.execute(text("""
            UPDATE scheduling.operation_status 
            SET completed_at = NOW() WHERE completed_at IS NULL
        """))
        
        # Alter columns to be nullable
        db.execute(text("""
            ALTER TABLE scheduling.operation_status 
            ALTER COLUMN started_at DROP NOT NULL
        """))
        
        db.execute(text("""
            ALTER TABLE scheduling.operation_status 
            ALTER COLUMN completed_at DROP NOT NULL
        """))
        
        # Add created_at and updated_at columns
        print("Adding created_at and updated_at columns...")
        
        # Check if created_at exists
        created_at_exists = any(col.column_name == 'created_at' for col in current_columns)
        if not created_at_exists:
            db.execute(text("""
                ALTER TABLE scheduling.operation_status 
                ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW()
            """))
            print("Added created_at column")
        else:
            print("created_at column already exists")
        
        # Check if updated_at exists
        updated_at_exists = any(col.column_name == 'updated_at' for col in current_columns)
        if not updated_at_exists:
            db.execute(text("""
                ALTER TABLE scheduling.operation_status 
                ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            """))
            print("Added updated_at column")
        else:
            print("updated_at column already exists")
        
        # Make status NOT NULL with default 'pending'
        print("Updating status column constraints...")
        db.execute(text("""
            UPDATE scheduling.operation_status 
            SET status = 'pending' WHERE status IS NULL
        """))
        
        db.execute(text("""
            ALTER TABLE scheduling.operation_status 
            ALTER COLUMN status SET NOT NULL
        """))
        
        db.execute(text("""
            ALTER TABLE scheduling.operation_status 
            ALTER COLUMN status SET DEFAULT 'pending'
        """))
        
        # Make operation_id NOT NULL and UNIQUE if not already
        print("Updating operation_id constraints...")
        db.execute(text("""
            UPDATE scheduling.operation_status 
            SET operation_id = -1 WHERE operation_id IS NULL
        """))
        
        db.execute(text("""
            ALTER TABLE scheduling.operation_status 
            ALTER COLUMN operation_id SET NOT NULL
        """))
        
        # Add unique constraint if not exists
        constraint_check = db.execute(text("""
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'uq_operation_status_operation_id'
        """)).fetchone()
        
        if not constraint_check:
            print("Adding unique constraint on operation_id...")
            db.execute(text("""
                ALTER TABLE scheduling.operation_status 
                ADD CONSTRAINT uq_operation_status_operation_id UNIQUE (operation_id)
            """))
            print("Unique constraint added")
        else:
            print("Unique constraint already exists")
        
        # Create indexes for faster lookups
        print("Creating indexes...")
        
        index_checks = db.execute(text("""
            SELECT indexname FROM pg_indexes 
            WHERE indexname IN ('idx_operation_status_operation_id', 'idx_operation_status_status')
            AND schemaname = 'scheduling'
        """)).fetchall()
        
        existing_indexes = [idx[0] for idx in index_checks]
        
        if 'idx_operation_status_operation_id' not in existing_indexes:
            db.execute(text("""
                CREATE INDEX idx_operation_status_operation_id 
                ON scheduling.operation_status(operation_id)
            """))
            print("Created index on operation_id")
        
        if 'idx_operation_status_status' not in existing_indexes:
            db.execute(text("""
                CREATE INDEX idx_operation_status_status 
                ON scheduling.operation_status(status)
            """))
            print("Created index on status")
        
        # Create trigger for updated_at timestamp
        print("Creating trigger for updated_at timestamp...")
        db.execute(text("""
            CREATE OR REPLACE FUNCTION scheduling.update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        """))
        
        db.execute(text("""
            DROP TRIGGER IF EXISTS update_operation_status_updated_at ON scheduling.operation_status
        """))
        
        db.execute(text("""
            CREATE TRIGGER update_operation_status_updated_at 
                BEFORE UPDATE ON scheduling.operation_status 
                FOR EACH ROW EXECUTE FUNCTION scheduling.update_updated_at_column()
        """))
        print("Trigger created")
        
        # Migrate existing operations that don't have status entries
        print("Migrating existing operations...")
        migration_result = db.execute(text("""
            INSERT INTO scheduling.operation_status (order_id, part_id, operation_id, status, created_at, updated_at)
            SELECT DISTINCT 
                psi.sale_order_id as order_id,
                psi.part_id,
                psi.operation_id,
                'pending' as status,
                NOW() as created_at,
                NOW() as updated_at
            FROM scheduling.planned_schedule_items psi
            LEFT JOIN scheduling.operation_status os ON psi.operation_id = os.operation_id
            WHERE os.operation_id IS NULL
            RETURNING operation_id
        """))
        
        migrated_count = len(migration_result.fetchall()) if migration_result else 0
        print(f"Migrated {migrated_count} existing operations to operation_status table")
        
        db.commit()
        
        # Verify the migration
        total_operations = db.execute(text("SELECT COUNT(*) FROM scheduling.operation_status")).scalar()
        pending_operations = db.execute(text("""
            SELECT COUNT(*) FROM scheduling.operation_status WHERE status = 'pending'
        """)).scalar()
        
        print("\n" + "="*50)
        print("TABLE ALTERATION COMPLETED SUCCESSFULLY")
        print("="*50)
        print(f"Total operations in status table: {total_operations}")
        print(f"Pending operations: {pending_operations}")
        print(f"Newly migrated operations: {migrated_count}")
        print("="*50)
        
        return True
        
    except Exception as e:
        print(f"Table alteration failed: {str(e)}")
        db.rollback()
        return False
        
    finally:
        db.close()


def verify_table_structure():
    """Verify that the table structure is correct after alteration"""
    db = SessionLocal()
    
    try:
        print("\nVerifying table structure...")
        
        # Check table structure
        columns = db.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'scheduling' AND table_name = 'operation_status'
            ORDER BY ordinal_position
        """)).fetchall()
        
        print("Final table structure:")
        for col in columns:
            default_val = col.column_default if col.column_default else "No default"
            print(f"  {col.column_name}: {col.data_type} (nullable: {col.is_nullable}, default: {default_val})")
        
        # Check data integrity
        result = db.execute(text("""
            SELECT 
                COUNT(*) as total_operations,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'inprogress' THEN 1 END) as inprogress,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
            FROM scheduling.operation_status
        """)).fetchone()
        
        print(f"\nData verification:")
        print(f"  Total operations: {result.total_operations}")
        print(f"  Pending: {result.pending}")
        print(f"  In Progress: {result.inprogress}")
        print(f"  Completed: {result.completed}")
        
        # Check for duplicates
        duplicate_check = db.execute(text("""
            SELECT operation_id, COUNT(*) as count
            FROM scheduling.operation_status
            GROUP BY operation_id
            HAVING COUNT(*) > 1
        """)).fetchall()
        
        if duplicate_check:
            print(f"WARNING: Found {len(duplicate_check)} duplicate operation_ids")
        else:
            print("No duplicates found - integrity check passed")
        
        return True
        
    except Exception as e:
        print(f"Verification failed: {str(e)}")
        return False
        
    finally:
        db.close()


if __name__ == "__main__":
    print("Operation Status Table Alteration")
    print("=" * 40)
    print(f"Started at: {datetime.now()}")
    
    success = alter_operation_status_table()
    
    if success:
        verify_table_structure()
        print(f"\nAlteration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nAlteration failed at: {datetime.now()}")
        sys.exit(1)

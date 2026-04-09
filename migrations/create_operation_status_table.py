#!/usr/bin/env python3
"""
Migration Script: Create and configure operation_status table
Description: Creates the operation_status table for tracking operation lifecycle
Run with: python migrations/create_operation_status_table.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from DB.database import engine, SessionLocal
from DB.models.scheduling import OperationStatus
from DB.models.oms import Order, Part, Operation
from DB.models.scheduling import PlannedScheduleItem


def table_exists(table_name, schema_name):
    """Check if a table exists in the database"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names(schema=schema_name)


def constraint_exists(constraint_name):
    """Check if a constraint exists"""
    try:
        with SessionLocal() as db:
            result = db.execute(text("""
                SELECT 1 FROM pg_constraint 
                WHERE conname = :constraint_name
            """), {"constraint_name": constraint_name})
            return result.fetchone() is not None
    except Exception:
        return False


def index_exists(index_name):
    """Check if an index exists"""
    try:
        with SessionLocal() as db:
            result = db.execute(text("""
                SELECT 1 FROM pg_indexes 
                WHERE indexname = :index_name
            """), {"index_name": index_name})
            return result.fetchone() is not None
    except Exception:
        return False


def create_operation_status_table():
    """Create the operation_status table and all necessary constraints"""
    db = SessionLocal()
    
    try:
        print("Starting operation_status table migration...")
        
        # Create the table using SQLAlchemy model
        if not table_exists('operation_status', 'scheduling'):
            print("Creating operation_status table...")
            OperationStatus.__table__.create(engine, checkfirst=True)
            print("Table created successfully")
        else:
            print("Table already exists, checking constraints...")
        
        # Add unique constraint if not exists
        if not constraint_exists('uq_operation_status_operation_id'):
            print("Adding unique constraint on operation_id...")
            db.execute(text("""
                ALTER TABLE scheduling.operation_status 
                ADD CONSTRAINT uq_operation_status_operation_id UNIQUE (operation_id)
            """))
            print("Unique constraint added")
        else:
            print("Unique constraint already exists")
        
        # Create indexes for faster lookups
        if not index_exists('idx_operation_status_operation_id'):
            print("Creating index on operation_id...")
            db.execute(text("""
                CREATE INDEX idx_operation_status_operation_id 
                ON scheduling.operation_status(operation_id)
            """))
            print("Index on operation_id created")
        
        if not index_exists('idx_operation_status_status'):
            print("Creating index on status...")
            db.execute(text("""
                CREATE INDEX idx_operation_status_status 
                ON scheduling.operation_status(status)
            """))
            print("Index on status created")
        
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
                p.product_id as order_id,
                psi.part_id,
                psi.operation_id,
                'pending' as status,
                NOW() as created_at,
                NOW() as updated_at
            FROM scheduling.planned_schedule_items psi
            JOIN oms.parts p ON psi.part_id = p.id
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
        print("MIGRATION COMPLETED SUCCESSFULLY")
        print("="*50)
        print(f"Total operations in status table: {total_operations}")
        print(f"Pending operations: {pending_operations}")
        print(f"Newly migrated operations: {migrated_count}")
        print("="*50)
        
        return True
        
    except Exception as e:
        print(f"Migration failed: {str(e)}")
        db.rollback()
        return False
        
    finally:
        db.close()


def verify_migration():
    """Verify that the migration was successful"""
    db = SessionLocal()
    
    try:
        print("\nVerifying migration...")
        
        # Check table structure
        inspector = inspect(engine)
        columns = inspector.get_columns('operation_status', schema='scheduling')
        print(f"Table has {len(columns)} columns")
        
        # Check data integrity
        result = db.execute(text("""
            SELECT 
                COUNT(*) as total_operations,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'inprogress' THEN 1 END) as inprogress,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
            FROM scheduling.operation_status
        """)).fetchone()
        
        print(f"Data verification:")
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
    print("Operation Status Table Migration")
    print("=" * 40)
    print(f"Started at: {datetime.now()}")
    
    success = create_operation_status_table()
    
    if success:
        verify_migration()
        print(f"\nMigration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nMigration failed at: {datetime.now()}")
        sys.exit(1)

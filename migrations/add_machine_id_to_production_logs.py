#!/usr/bin/env python3
"""
Migration Script: Add machine_id column to production_logs table
Description: Adds machine_id column with foreign key to configuration.machines
Run with: python migrations/add_machine_id_to_production_logs.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def add_machine_id_to_production_logs():
    """Add machine_id column to production_logs table"""
    db = SessionLocal()
    
    try:
        print("Starting migration: Add machine_id to production_logs table...")
        print("=" * 60)
        
        # Check current table structure
        print("\n1. Checking current table structure...")
        current_columns = db.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'scheduling' AND table_name = 'production_logs'
            ORDER BY ordinal_position
        """)).fetchall()
        
        print("Current columns:")
        for col in current_columns:
            default_val = col.column_default if col.column_default else "No default"
            print(f"  {col.column_name}: {col.data_type} (nullable: {col.is_nullable}, default: {default_val})")
        
        # Add machine_id column
        print("\n2. Adding machine_id column...")
        machine_id_exists = any(col.column_name == 'machine_id' for col in current_columns)
        
        if not machine_id_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD COLUMN machine_id INTEGER
            """))
            print("[OK] machine_id column added successfully")
        else:
            print("[OK] machine_id column already exists")
        
        # Add foreign key constraint
        print("\n3. Adding foreign key constraint...")
        try:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD CONSTRAINT fk_production_logs_machine_id 
                FOREIGN KEY (machine_id) REFERENCES configuration.machines(id)
            """))
            print("[OK] Foreign key constraint added successfully")
        except Exception as e:
            if "duplicate" in str(e).lower() or "already exists" in str(e).lower():
                print("[OK] Foreign key constraint already exists")
            else:
                print(f"[WARNING] Could not add foreign key constraint: {e}")
        
        # Commit changes
        db.commit()
        print("\n4. Changes committed successfully!")
        
        # Verify final structure
        print("\n5. Verifying final table structure...")
        final_columns = db.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'scheduling' AND table_name = 'production_logs'
            ORDER BY ordinal_position
        """)).fetchall()
        
        print("\nFinal table structure:")
        for col in final_columns:
            default_val = col.column_default if col.column_default else "No default"
            print(f"  {col.column_name}: {col.data_type} (nullable: {col.is_nullable}, default: {default_val})")
        
        print("\n" + "=" * 60)
        print("[SUCCESS] MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n[ERROR] Migration failed: {str(e)}")
        db.rollback()
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        db.close()


if __name__ == "__main__":
    print("Add machine_id to production_logs table")
    print("=" * 60)
    print(f"Started at: {datetime.now()}")
    
    success = add_machine_id_to_production_logs()
    
    if success:
        print(f"\nMigration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nMigration failed at: {datetime.now()}")
        sys.exit(1)

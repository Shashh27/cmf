#!/usr/bin/env python3
"""
Migration Script: Add acknowledgment fields to production_logs table
Description: Adds acknowledged and acknowledged_at columns to production_logs table
Run with: python migrations/add_acknowledgment_fields.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def add_acknowledgment_fields():
    """Add acknowledgment fields to the production_logs table"""
    db = SessionLocal()
    
    try:
        print("Starting migration to add acknowledgment fields...")
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
        
        # Add acknowledged column
        print("\n2. Adding acknowledged column...")
        acknowledged_exists = any(col.column_name == 'acknowledged' for col in current_columns)
        
        if not acknowledged_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD COLUMN acknowledged BOOLEAN NOT NULL DEFAULT FALSE
            """))
            print("[OK] acknowledged column added successfully")
        else:
            print("[OK] acknowledged column already exists")
        
        # Add acknowledged_at column
        print("\n3. Adding acknowledged_at column...")
        acknowledged_at_exists = any(col.column_name == 'acknowledged_at' for col in current_columns)
        
        if not acknowledged_at_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD COLUMN acknowledged_at TIMESTAMP
            """))
            print("[OK] acknowledged_at column added successfully")
        else:
            print("[OK] acknowledged_at column already exists")
        
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
        print("[SUCCESS] ACKNOWLEDGMENT FIELDS ADDED SUCCESSFULLY!")
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
    print("Add Acknowledgment Fields Migration")
    print("=" * 60)
    print(f"Started at: {datetime.now()}")
    
    success = add_acknowledgment_fields()
    
    if success:
        print(f"\nMigration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nMigration failed at: {datetime.now()}")
        sys.exit(1)

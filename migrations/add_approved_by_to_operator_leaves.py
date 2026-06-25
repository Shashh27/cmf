#!/usr/bin/env python3
"""
Migration Script: Add approved_by column to operator_leaves table
Description: Adds approved_by column to track who approved the leave (manufacturing_coordinator or supervisor)
Run with: python migrations/add_approved_by_to_operator_leaves.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def add_approved_by_column():
    """Add approved_by column to the operator_leaves table"""
    db = SessionLocal()
    
    try:
        print("Starting migration to add approved_by column...")
        print("=" * 60)
        
        # Check current table structure
        print("\n1. Checking current table structure...")
        current_columns = db.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'accesscontrol' AND table_name = 'operator_leaves'
            ORDER BY ordinal_position
        """)).fetchall()
        
        print("Current columns:")
        for col in current_columns:
            default_val = col.column_default if col.column_default else "No default"
            print(f"  {col.column_name}: {col.data_type} (nullable: {col.is_nullable}, default: {default_val})")
        
        # Add approved_by column
        print("\n2. Adding approved_by column...")
        approved_by_exists = any(col.column_name == 'approved_by' for col in current_columns)
        
        if not approved_by_exists:
            db.execute(text("""
                ALTER TABLE accesscontrol.operator_leaves 
                ADD COLUMN approved_by INTEGER
            """))
            print("[OK] approved_by column added successfully")
        else:
            print("[OK] approved_by column already exists")
        
        # Add foreign key constraint
        print("\n3. Adding foreign key constraint...")
        fk_exists = db.execute(text("""
            SELECT COUNT(*) as count
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'accesscontrol' 
                AND tc.table_name = 'operator_leaves'
                AND tc.constraint_type = 'FOREIGN KEY'
                AND kcu.column_name = 'approved_by'
        """)).fetchone()
        
        if fk_exists.count == 0:
            db.execute(text("""
                ALTER TABLE accesscontrol.operator_leaves 
                ADD CONSTRAINT fk_operator_leaves_approved_by 
                FOREIGN KEY (approved_by) REFERENCES accesscontrol.access_users(id)
            """))
            print("[OK] Foreign key constraint added successfully")
        else:
            print("[OK] Foreign key constraint already exists")
        
        # Commit changes
        db.commit()
        print("\n4. Changes committed successfully!")
        
        # Verify final structure
        print("\n5. Verifying final table structure...")
        final_columns = db.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'accesscontrol' AND table_name = 'operator_leaves'
            ORDER BY ordinal_position
        """)).fetchall()
        
        print("\nFinal table structure:")
        for col in final_columns:
            default_val = col.column_default if col.column_default else "No default"
            print(f"  {col.column_name}: {col.data_type} (nullable: {col.is_nullable}, default: {default_val})")
        
        print("\n" + "=" * 60)
        print("[SUCCESS] APPROVED_BY COLUMN ADDED SUCCESSFULLY!")
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
    print("Add approved_by Column Migration")
    print("=" * 60)
    print(f"Started at: {datetime.now()}")
    
    success = add_approved_by_column()
    
    if success:
        print(f"\nMigration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nMigration failed at: {datetime.now()}")
        sys.exit(1)

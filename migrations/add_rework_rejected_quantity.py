#!/usr/bin/env python3
"""
Migration Script: Add rework_quantity, rejected_quantity, and remaining_quantity_to_be_produced fields to production_logs table
Description: Adds rework_quantity, rejected_quantity, and remaining_quantity_to_be_produced columns to production_logs table
Run with: python migrations/add_rework_rejected_quantity.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def add_rework_rejected_quantity_fields():
    """Add rework_quantity, rejected_quantity, and remaining_quantity_to_be_produced fields to the production_logs table"""
    db = SessionLocal()
    
    try:
        print("Starting migration to add rework_quantity, rejected_quantity, and remaining_quantity_to_be_produced fields...")
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
        
        # Add rework_quantity column
        print("\n2. Adding rework_quantity column...")
        rework_exists = any(col.column_name == 'rework_quantity' for col in current_columns)
        
        if not rework_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD COLUMN rework_quantity INTEGER
            """))
            print("[OK] rework_quantity column added successfully")
        else:
            print("[OK] rework_quantity column already exists")
        
        # Add rejected_quantity column
        print("\n3. Adding rejected_quantity column...")
        rejected_exists = any(col.column_name == 'rejected_quantity' for col in current_columns)
        
        if not rejected_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD COLUMN rejected_quantity INTEGER
            """))
            print("[OK] rejected_quantity column added successfully")
        else:
            print("[OK] rejected_quantity column already exists")
        
        # Add remaining_quantity_to_be_produced column
        print("\n4. Adding remaining_quantity_to_be_produced column...")
        remaining_exists = any(col.column_name == 'remaining_quantity_to_be_produced' for col in current_columns)
        
        if not remaining_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD COLUMN remaining_quantity_to_be_produced INTEGER
            """))
            print("[OK] remaining_quantity_to_be_produced column added successfully")
        else:
            print("[OK] remaining_quantity_to_be_produced column already exists")
        
        # Commit changes
        db.commit()
        print("\n5. Changes committed successfully!")
        
        # Verify final structure
        print("\n6. Verifying final table structure...")
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
        print("[SUCCESS] ALL FIELDS ADDED SUCCESSFULLY!")
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
    print("Add Rework, Rejected, and Remaining Quantity Fields Migration")
    print("=" * 60)
    print(f"Started at: {datetime.now()}")
    
    success = add_rework_rejected_quantity_fields()
    
    if success:
        print(f"\nMigration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nMigration failed at: {datetime.now()}")
        sys.exit(1)

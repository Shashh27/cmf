#!/usr/bin/env python3
"""
Migration Script: Update production_logs table with operator_status and new constraints
Description: Adds operator_status column and modifies existing columns
Run with: python migrations/update_production_logs_table.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def update_production_logs_table():
    """Update the production_logs table structure"""
    db = SessionLocal()
    
    try:
        print("Starting production_logs table update...")
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
        
        # Add operator_status column
        print("\n2. Adding operator_status column...")
        operator_status_exists = any(col.column_name == 'operator_status' for col in current_columns)
        
        if not operator_status_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ADD COLUMN operator_status VARCHAR NOT NULL DEFAULT 'inactive'
            """))
            print("[OK] operator_status column added successfully")
        else:
            print("[OK] operator_status column already exists")
        
        # Modify columns to be nullable
        print("\n3. Modifying columns to be nullable...")
        
        # from_date
        print("   - Processing from_date...")
        from_date_col = next((col for col in current_columns if col.column_name == 'from_date'), None)
        if from_date_col and from_date_col.is_nullable == 'NO':
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ALTER COLUMN from_date DROP NOT NULL
            """))
            print("   [OK] from_date made nullable")
        else:
            print("   [OK] from_date already nullable or not found")
        
        # from_time
        print("   - Processing from_time...")
        from_time_col = next((col for col in current_columns if col.column_name == 'from_time'), None)
        if from_time_col and from_time_col.is_nullable == 'NO':
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ALTER COLUMN from_time DROP NOT NULL
            """))
            print("   [OK] from_time made nullable")
        else:
            print("   [OK] from_time already nullable or not found")
        
        # produced_quantity
        print("   - Processing produced_quantity...")
        produced_qty_col = next((col for col in current_columns if col.column_name == 'produced_quantity'), None)
        if produced_qty_col and produced_qty_col.is_nullable == 'NO':
            db.execute(text("""
                ALTER TABLE scheduling.production_logs 
                ALTER COLUMN produced_quantity DROP NOT NULL
            """))
            print("   [OK] produced_quantity made nullable")
        else:
            print("   [OK] produced_quantity already nullable or not found")
        
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
        print("[SUCCESS] PRODUCTION_LOGS TABLE UPDATE COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n[ERROR] Table update failed: {str(e)}")
        db.rollback()
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        db.close()


if __name__ == "__main__":
    print("Production Logs Table Update")
    print("=" * 60)
    print(f"Started at: {datetime.now()}")
    
    success = update_production_logs_table()
    
    if success:
        print(f"\nUpdate completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nUpdate failed at: {datetime.now()}")
        sys.exit(1)

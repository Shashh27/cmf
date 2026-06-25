#!/usr/bin/env python3
"""
Migration Script: Add trigger to enforce approver role constraint
Description: Adds a database trigger to ensure approved_by only references users with roles manufacturing_coordinator, supervisor, or admin
Run with: python migrations/add_approver_role_trigger.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def add_approver_role_trigger():
    """Add trigger to enforce approver role constraint"""
    db = SessionLocal()
    
    try:
        print("Starting migration to add approver role trigger...")
        print("=" * 60)
        
        # Drop existing trigger if it exists
        print("\n1. Dropping existing trigger if it exists...")
        db.execute(text("""
            DROP TRIGGER IF EXISTS check_approver_role_trigger ON accesscontrol.operator_leaves
        """))
        print("[OK] Existing trigger dropped (if existed)")
        
        # Drop existing function if it exists
        print("\n2. Dropping existing function if it exists...")
        db.execute(text("""
            DROP FUNCTION IF EXISTS accesscontrol.check_approver_role_function()
        """))
        print("[OK] Existing function dropped (if existed)")
        
        # Create the trigger function
        print("\n3. Creating trigger function...")
        db.execute(text("""
            CREATE OR REPLACE FUNCTION accesscontrol.check_approver_role_function()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.approved_by IS NOT NULL THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM accesscontrol.access_users 
                        WHERE id = NEW.approved_by 
                        AND role IN ('manufacturing_coordinator', 'supervisor', 'admin')
                    ) THEN
                        RAISE EXCEPTION 'approved_by must reference a user with role manufacturing_coordinator, supervisor, or admin';
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))
        print("[OK] Trigger function created successfully")
        
        # Create the trigger
        print("\n4. Creating trigger...")
        db.execute(text("""
            CREATE TRIGGER check_approver_role_trigger
            BEFORE INSERT OR UPDATE OF approved_by ON accesscontrol.operator_leaves
            FOR EACH ROW
            EXECUTE FUNCTION accesscontrol.check_approver_role_function();
        """))
        print("[OK] Trigger created successfully")
        
        # Commit changes
        db.commit()
        print("\n5. Changes committed successfully!")
        
        # Verify trigger exists
        print("\n6. Verifying trigger...")
        trigger_info = db.execute(text("""
            SELECT trigger_name, event_manipulation, event_object_table
            FROM information_schema.triggers
            WHERE trigger_schema = 'accesscontrol' 
                AND trigger_name = 'check_approver_role_trigger'
        """)).fetchall()
        
        if trigger_info:
            print("Trigger verified:")
            for trig in trigger_info:
                print(f"  {trig.trigger_name}: {trig.event_manipulation} on {trig.event_object_table}")
        else:
            print("[WARNING] Trigger not found in information_schema")
        
        print("\n" + "=" * 60)
        print("[SUCCESS] APPROVER ROLE TRIGGER ADDED SUCCESSFULLY!")
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
    print("Add Approver Role Trigger Migration")
    print("=" * 60)
    print(f"Started at: {datetime.now()}")
    
    success = add_approver_role_trigger()
    
    if success:
        print(f"\nMigration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nMigration failed at: {datetime.now()}")
        sys.exit(1)

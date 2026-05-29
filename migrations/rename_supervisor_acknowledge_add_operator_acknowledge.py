#!/usr/bin/env python3
"""
Migration Script: Rename supervisor acknowledgement columns and add operator acknowledgement columns
Description:
  - Renames 'acknowledged' -> 'supervisor_acknowledged'
  - Renames 'acknowledged_at' -> 'supervisor_acknowledged_at'
  - Adds 'operator_acknowledged' and 'operator_acknowledged_at'
Run with: python migrations/rename_supervisor_acknowledge_add_operator_acknowledge.py
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path to import from the main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def rename_and_add_acknowledgement_columns():
    """Rename supervisor columns and add operator columns to production_logs table"""
    db = SessionLocal()

    try:
        print("Starting migration to rename supervisor and add operator acknowledgement columns...")
        print("=" * 70)

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

        # Step 1: Rename acknowledged -> supervisor_acknowledged
        print("\n2. Renaming 'acknowledged' to 'supervisor_acknowledged'...")
        old_exists = any(col.column_name == 'acknowledged' for col in current_columns)
        new_exists = any(col.column_name == 'supervisor_acknowledged' for col in current_columns)

        if old_exists and not new_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs
                RENAME COLUMN acknowledged TO supervisor_acknowledged
            """))
            print("[OK] 'acknowledged' renamed to 'supervisor_acknowledged'")
        elif new_exists:
            print("[SKIP] 'supervisor_acknowledged' already exists")
        else:
            print("[SKIP] 'acknowledged' column not found")

        # Step 2: Rename acknowledged_at -> supervisor_acknowledged_at
        print("\n3. Renaming 'acknowledged_at' to 'supervisor_acknowledged_at'...")
        old_at_exists = any(col.column_name == 'acknowledged_at' for col in current_columns)
        new_at_exists = any(col.column_name == 'supervisor_acknowledged_at' for col in current_columns)

        if old_at_exists and not new_at_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs
                RENAME COLUMN acknowledged_at TO supervisor_acknowledged_at
            """))
            print("[OK] 'acknowledged_at' renamed to 'supervisor_acknowledged_at'")
        elif new_at_exists:
            print("[SKIP] 'supervisor_acknowledged_at' already exists")
        else:
            print("[SKIP] 'acknowledged_at' column not found")

        # Refresh columns after rename
        current_columns = db.execute(text("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'scheduling' AND table_name = 'production_logs'
            ORDER BY ordinal_position
        """)).fetchall()

        # Step 3: Add operator_acknowledged column
        print("\n4. Adding 'operator_acknowledged' column...")
        op_ack_exists = any(col.column_name == 'operator_acknowledged' for col in current_columns)

        if not op_ack_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs
                ADD COLUMN operator_acknowledged BOOLEAN NOT NULL DEFAULT FALSE
            """))
            print("[OK] 'operator_acknowledged' column added successfully")
        else:
            print("[SKIP] 'operator_acknowledged' already exists")

        # Step 4: Add operator_acknowledged_at column
        print("\n5. Adding 'operator_acknowledged_at' column...")
        op_ack_at_exists = any(col.column_name == 'operator_acknowledged_at' for col in current_columns)

        if not op_ack_at_exists:
            db.execute(text("""
                ALTER TABLE scheduling.production_logs
                ADD COLUMN operator_acknowledged_at TIMESTAMP
            """))
            print("[OK] 'operator_acknowledged_at' column added successfully")
        else:
            print("[SKIP] 'operator_acknowledged_at' already exists")

        # Commit changes
        db.commit()
        print("\n6. Changes committed successfully!")

        # Verify final structure
        print("\n7. Verifying final table structure...")
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

        print("\n" + "=" * 70)
        print("[SUCCESS] MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 70)

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
    print("Rename Supervisor Acknowledge / Add Operator Acknowledge Migration")
    print("=" * 70)
    print(f"Started at: {datetime.now()}")

    success = rename_and_add_acknowledgement_columns()

    if success:
        print(f"\nMigration completed successfully at: {datetime.now()}")
        sys.exit(0)
    else:
        print(f"\nMigration failed at: {datetime.now()}")
        sys.exit(1)

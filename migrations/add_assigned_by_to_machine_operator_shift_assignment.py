#!/usr/bin/env python3
"""
Migration: add assigned_by_id to scheduling.machine_operator_shift_assignment
Run with: python migrations/add_assigned_by_to_machine_operator_shift_assignment.py
"""

import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def run_migration():
    db = SessionLocal()
    try:
        print("Adding assigned_by_id to machine_operator_shift_assignment...")
        db.execute(text("""
            ALTER TABLE scheduling.machine_operator_shift_assignment
            ADD COLUMN IF NOT EXISTS assigned_by_id INTEGER
                REFERENCES accesscontrol.access_users(id)
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_mosa_assigned_by_id
            ON scheduling.machine_operator_shift_assignment(assigned_by_id)
        """))
        db.commit()
        print("[SUCCESS] assigned_by_id column added.")
        return True
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Migration failed: {exc}")
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print(f"Started at: {datetime.now()}")
    sys.exit(0 if run_migration() else 1)

#!/usr/bin/env python3
"""
Migration: Add assignment_mode column to scheduling.unit_schedule_items

This column stores the assignment mode used when the schedule was built:
- 'auto': WC earliest-free, may split across machines
- 'process_plan': Uses operation.machine_id from routing
- 'manual': Uses saved qty→machine allocations

Run: python migrations/add_assignment_mode_to_unit_schedule_items.py
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from DB.database import engine, SessionLocal


def column_exists(table_name, column_name, schema_name):
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns(table_name, schema=schema_name)]
    return column_name in cols


def run_migration():
    print("Starting migration: add assignment_mode to unit_schedule_items")

    with SessionLocal() as db:
        try:
            if column_exists("unit_schedule_items", "assignment_mode", "scheduling"):
                print("Column assignment_mode already exists in unit_schedule_items.")
                return

            db.execute(text("""
                ALTER TABLE scheduling.unit_schedule_items
                ADD COLUMN assignment_mode VARCHAR DEFAULT 'auto'
            """))
            db.commit()
            print("Added column: assignment_mode")
            print("Migration completed successfully.")
        except Exception as e:
            db.rollback()
            print(f"Migration failed: {e}")
            raise


if __name__ == "__main__":
    run_migration()

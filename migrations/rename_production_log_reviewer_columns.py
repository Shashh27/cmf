#!/usr/bin/env python3
"""
Migration: production_logs reviewer columns
  - supervisor_id -> user_id
  - supervisor_acknowledged -> acknowledged
  - supervisor_acknowledged_at -> acknowledged_at

Run: python migrations/rename_production_log_reviewer_columns.py
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal

RENAMES = [
    ("supervisor_id", "user_id"),
    ("supervisor_acknowledged", "acknowledged"),
    ("supervisor_acknowledged_at", "acknowledged_at"),
]


def rename_production_log_reviewer_columns():
    db = SessionLocal()
    try:
        print("Renaming production_logs reviewer columns...")
        print("=" * 60)

        columns = db.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'scheduling' AND table_name = 'production_logs'
                """
            )
        ).fetchall()
        existing = {row.column_name for row in columns}

        for old_name, new_name in RENAMES:
            if old_name in existing and new_name not in existing:
                db.execute(
                    text(
                        f"ALTER TABLE scheduling.production_logs "
                        f"RENAME COLUMN {old_name} TO {new_name}"
                    )
                )
                print(f"[OK] {old_name} -> {new_name}")
                existing.discard(old_name)
                existing.add(new_name)
            elif new_name in existing:
                print(f"[SKIP] {new_name} already exists")
            else:
                print(f"[SKIP] {old_name} not found")

        db.commit()
        print("\nMigration completed successfully.")
    except Exception as exc:
        db.rollback()
        print(f"\nMigration failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    rename_production_log_reviewer_columns()

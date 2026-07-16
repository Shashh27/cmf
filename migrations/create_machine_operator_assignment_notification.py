#!/usr/bin/env python3
"""
Migration: create notifications.machine_operator_assignment_notification table.
Run with: python migrations/create_machine_operator_assignment_notification.py
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
        print("Creating notifications schema and machine_operator_assignment_notification table...")
        db.execute(text("CREATE SCHEMA IF NOT EXISTS notifications"))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS notifications.machine_operator_assignment_notification (
                id SERIAL PRIMARY KEY,
                operator_id INTEGER NOT NULL
                    REFERENCES accesscontrol.access_users(id),
                machine_id INTEGER NOT NULL
                    REFERENCES configuration.machines(id),
                assignment_id INTEGER,
                shift_date DATE NOT NULL,
                action VARCHAR(32) NOT NULL,
                message TEXT NOT NULL,
                assigned_by_id INTEGER
                    REFERENCES accesscontrol.access_users(id),
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_moan_operator_id
            ON notifications.machine_operator_assignment_notification(operator_id)
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_moan_operator_unread
            ON notifications.machine_operator_assignment_notification(operator_id, is_read)
        """))
        db.commit()
        print("[SUCCESS] machine_operator_assignment_notification table is ready.")
        return True
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Migration failed: {exc}")
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print(f"Started at: {datetime.now()}")
    ok = run_migration()
    sys.exit(0 if ok else 1)

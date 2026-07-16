"""
Add operator_rework_quantity to scheduling.production_logs.

Run: python migrations/add_operator_rework_quantity.py
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from DB.database import SessionLocal


def main() -> bool:
    db = SessionLocal()
    try:
        exists = db.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'scheduling'
                  AND table_name = 'production_logs'
                  AND column_name = 'operator_rework_quantity'
                """
            )
        ).fetchone()
        if exists:
            print("[OK] operator_rework_quantity already exists")
            return True

        db.execute(
            text(
                """
                ALTER TABLE scheduling.production_logs
                ADD COLUMN operator_rework_quantity INTEGER
                """
            )
        )
        db.commit()
        print("[OK] operator_rework_quantity column added")
        return True
    finally:
        db.close()


if __name__ == "__main__":
    main()

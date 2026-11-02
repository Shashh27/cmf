#!/usr/bin/env python3
"""Add unit_from / unit_to to scheduling.production_logs.

Unit range belongs on the log row. notes stays the optional operator comment.
"""

import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import SessionLocal


def migrate():
    db = SessionLocal()
    try:
        columns = db.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'scheduling' AND table_name = 'production_logs'
                """
            )
        ).fetchall()
        names = {row.column_name for row in columns}

        if "unit_from" not in names:
            db.execute(text("ALTER TABLE scheduling.production_logs ADD COLUMN unit_from INTEGER"))
        if "unit_to" not in names:
            db.execute(text("ALTER TABLE scheduling.production_logs ADD COLUMN unit_to INTEGER"))

        db.execute(
            text(
                r"""
                UPDATE scheduling.production_logs
                SET unit_from = CAST(
                        (regexp_match(notes, 'unit-wise units\s+(\d+)\s*-\s*(\d+)', 'i'))[1]
                        AS INTEGER
                    ),
                    unit_to = CAST(
                        (regexp_match(notes, 'unit-wise units\s+(\d+)\s*-\s*(\d+)', 'i'))[2]
                        AS INTEGER
                    )
                WHERE unit_from IS NULL
                  AND unit_to IS NULL
                  AND notes ~* 'unit-wise units\s+\d+\s*-\s*\d+'
                """
            )
        )
        db.execute(
            text(
                r"""
                UPDATE scheduling.production_logs
                SET notes = NULL
                WHERE notes ~* '^unit-wise units\s+\d+\s*-\s*\d+$'
                """
            )
        )
        db.execute(
            text(
                r"""
                UPDATE scheduling.production_logs
                SET notes = regexp_replace(
                    notes,
                    '^unit-wise units\s+\d+\s*-\s*\d+\.\s*',
                    '',
                    'i'
                )
                WHERE notes ~* '^unit-wise units\s+\d+\s*-\s*\d+\.'
                """
            )
        )
        db.commit()
        print("unit_from / unit_to added on scheduling.production_logs")
        return True
    except Exception as exc:
        db.rollback()
        print(f"Migration failed: {exc}")
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print(f"Started at: {datetime.now()}")
    sys.exit(0 if migrate() else 1)

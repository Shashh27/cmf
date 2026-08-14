"""
Migrate PM frequency from checklist items → assignment items.
Also creates pm_missed_notifications table and relaxes master frequency NOT NULL.

Run:
  cd backend
  python -m scripts.migrate_pm_freq_to_assignment
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from DB.database import SessionLocal, engine


DDL = [
    """
    ALTER TABLE configuration.pm_assignment_items
      ADD COLUMN IF NOT EXISTS frequency_type VARCHAR,
      ADD COLUMN IF NOT EXISTS interval_value INTEGER,
      ADD COLUMN IF NOT EXISTS interval_unit VARCHAR,
      ADD COLUMN IF NOT EXISTS trigger_hours DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS is_compulsory BOOLEAN NOT NULL DEFAULT FALSE
    """,
    """
    ALTER TABLE configuration.pm_checklist_items
      ALTER COLUMN frequency_type DROP NOT NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS notifications.pm_missed_notifications (
      id SERIAL PRIMARY KEY,
      assignment_item_id INTEGER NOT NULL,
      machine_id INTEGER NOT NULL,
      checklist_id INTEGER,
      due_date DATE NOT NULL,
      item_text VARCHAR,
      machine_label VARCHAR,
      checklist_name VARCHAR,
      message VARCHAR NOT NULL,
      is_ack BOOLEAN NOT NULL DEFAULT FALSE,
      ack_by VARCHAR,
      ack_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_pm_missed_assignment_item
      ON notifications.pm_missed_notifications (assignment_item_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_pm_missed_due_date
      ON notifications.pm_missed_notifications (due_date)
    """,
]

BACKFILL = """
UPDATE configuration.pm_assignment_items ai
SET
  frequency_type = COALESCE(ai.frequency_type, ci.frequency_type),
  interval_value = COALESCE(ai.interval_value, ci.interval_value),
  interval_unit = COALESCE(ai.interval_unit, ci.interval_unit),
  trigger_hours = COALESCE(ai.trigger_hours, ci.trigger_hours)
FROM configuration.pm_checklist_items ci
WHERE ai.checklist_item_id = ci.id
  AND ai.frequency_type IS NULL
  AND ci.frequency_type IS NOT NULL
"""


def main():
    print("Applying PM frequency-on-assign migration…")
    with engine.begin() as conn:
        for stmt in DDL:
            conn.execute(text(stmt))
            print("  OK:", stmt.strip().split("\n", 1)[0][:80])
        result = conn.execute(text(BACKFILL))
        print(f"  Backfilled frequency on assignment items (rowcount={result.rowcount})")
    print("Done.")


if __name__ == "__main__":
    main()

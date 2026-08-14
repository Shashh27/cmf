"""
Clean PM schema for frequency-on-assign model:

1. Ensure all assignment_items have frequency (backfill from checklist items if needed)
2. Default any remaining null frequencies
3. Make assignment_items.frequency_type NOT NULL
4. DROP frequency columns from pm_checklist_items (master no longer stores frequency)

Run:
  cd backend
  python -m scripts.cleanup_pm_frequency_columns
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from DB.database import engine


STEPS = [
    (
        "Ensure assignment frequency columns exist",
        """
        ALTER TABLE configuration.pm_assignment_items
          ADD COLUMN IF NOT EXISTS frequency_type VARCHAR,
          ADD COLUMN IF NOT EXISTS interval_value INTEGER,
          ADD COLUMN IF NOT EXISTS interval_unit VARCHAR,
          ADD COLUMN IF NOT EXISTS trigger_hours DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS is_compulsory BOOLEAN NOT NULL DEFAULT FALSE
        """,
    ),
    (
        "Backfill assignment frequency from checklist items",
        """
        UPDATE configuration.pm_assignment_items ai
        SET
          frequency_type = COALESCE(ai.frequency_type, ci.frequency_type),
          interval_value = COALESCE(ai.interval_value, ci.interval_value),
          interval_unit = COALESCE(ai.interval_unit, ci.interval_unit),
          trigger_hours = COALESCE(ai.trigger_hours, ci.trigger_hours)
        FROM configuration.pm_checklist_items ci
        WHERE ai.checklist_item_id = ci.id
          AND ai.frequency_type IS NULL
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'configuration'
              AND table_name = 'pm_checklist_items'
              AND column_name = 'frequency_type'
          )
        """,
    ),
    (
        "Default remaining null assignment frequencies to Time Based weekly",
        """
        UPDATE configuration.pm_assignment_items
        SET
          frequency_type = 'Time Based',
          interval_value = COALESCE(interval_value, 1),
          interval_unit = COALESCE(interval_unit, 'Week'),
          trigger_hours = NULL
        WHERE frequency_type IS NULL
        """,
    ),
    (
        "Make assignment frequency_type NOT NULL",
        """
        ALTER TABLE configuration.pm_assignment_items
          ALTER COLUMN frequency_type SET NOT NULL
        """,
    ),
    (
        "Drop frequency_type from checklist items",
        """
        ALTER TABLE configuration.pm_checklist_items
          DROP COLUMN IF EXISTS frequency_type
        """,
    ),
    (
        "Drop interval_value from checklist items",
        """
        ALTER TABLE configuration.pm_checklist_items
          DROP COLUMN IF EXISTS interval_value
        """,
    ),
    (
        "Drop interval_unit from checklist items",
        """
        ALTER TABLE configuration.pm_checklist_items
          DROP COLUMN IF EXISTS interval_unit
        """,
    ),
    (
        "Drop trigger_hours from checklist items",
        """
        ALTER TABLE configuration.pm_checklist_items
          DROP COLUMN IF EXISTS trigger_hours
        """,
    ),
]


VERIFY = """
SELECT
  (SELECT COUNT(*) FROM configuration.pm_assignment_items) AS assignment_items,
  (SELECT COUNT(*) FROM configuration.pm_assignment_items WHERE frequency_type IS NULL) AS missing_freq,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='configuration' AND table_name='pm_checklist_items'
       AND column_name IN ('frequency_type','interval_value','interval_unit','trigger_hours')
  ) AS leftover_master_freq_cols,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='configuration' AND table_name='pm_assignment_items'
       AND column_name IN ('frequency_type','interval_value','interval_unit','trigger_hours','is_compulsory')
  ) AS assignment_freq_cols
"""


def main():
    print("Cleaning PM frequency columns…")
    with engine.begin() as conn:
        for label, sql in STEPS:
            # Backfill step fails if checklist freq cols already dropped — skip gracefully
            try:
                result = conn.execute(text(sql))
                print(f"  OK: {label}" + (f" (rowcount={result.rowcount})" if result.rowcount is not None and result.rowcount >= 0 else ""))
            except Exception as e:
                msg = str(e)
                if "frequency_type" in msg and "pm_checklist_items" in msg and "Backfill" in label:
                    print(f"  SKIP: {label} (master freq columns already gone)")
                    continue
                raise

        row = conn.execute(text(VERIFY)).mappings().first()
        print("\nVerify:")
        print(f"  assignment_items        = {row['assignment_items']}")
        print(f"  missing_freq            = {row['missing_freq']} (should be 0)")
        print(f"  leftover_master_freq_cols = {row['leftover_master_freq_cols']} (should be 0)")
        print(f"  assignment_freq_cols    = {row['assignment_freq_cols']} (should be 5)")

    print("\nDone. Restart backend.")


if __name__ == "__main__":
    main()

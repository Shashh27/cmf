"""
Run the operation part_type migration using the app's database connection.
From backend folder: python run_operation_part_type_migration.py
"""
import os
import sys

# Run from backend directory so DB is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from DB.database import engine

SQL_FILE = os.path.join(os.path.dirname(__file__), "DB", "add_operation_part_type_columns.sql")

STATEMENTS = [
    """
    ALTER TABLE oms.operations
      ADD COLUMN IF NOT EXISTS part_type_id integer,
      ADD COLUMN IF NOT EXISTS from_date timestamp with time zone,
      ADD COLUMN IF NOT EXISTS to_date timestamp with time zone;
    """,
    "ALTER TABLE oms.operations ALTER COLUMN part_type_id SET DEFAULT 1;",
    "UPDATE oms.operations SET part_type_id = 1 WHERE part_type_id IS NULL;",
    "ALTER TABLE oms.operations ALTER COLUMN part_type_id SET NOT NULL;",
    """
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_operations_part_type' AND table_schema = 'oms' AND table_name = 'operations'
      ) THEN
        ALTER TABLE oms.operations
          ADD CONSTRAINT fk_operations_part_type
          FOREIGN KEY (part_type_id) REFERENCES oms.part_types(id);
      END IF;
    END $$;
    """,
]


def main():
    with engine.connect() as conn:
        for s in STATEMENTS:
            conn.execute(text(s.strip()))
        conn.commit()
    print("Migration completed: oms.operations now has part_type_id, from_date, to_date.")


if __name__ == "__main__":
    main()


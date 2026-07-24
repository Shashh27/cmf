#!/usr/bin/env python3
"""
Migration: Create scheduling.unit_schedule_items for Phase 1 unit-wise greedy.

Also upgrades an existing incomplete table (e.g. created by create_all)
by adding any missing columns.

Run: python migrations/create_unit_schedule_items.py
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from DB.database import engine, SessionLocal


REQUIRED_COLUMNS = {
    "order_id": "INTEGER",
    "order_number": "VARCHAR",
    "part_id": "INTEGER",
    "part_number": "VARCHAR",
    "unit_index": "INTEGER",
    "operation_id": "INTEGER",
    "operation_number": "VARCHAR",
    "machine_id": "INTEGER",
    "start_time": "TIMESTAMP WITHOUT TIME ZONE",
    "end_time": "TIMESTAMP WITHOUT TIME ZONE",
    "status": "VARCHAR DEFAULT 'unit_scheduled'",
    "schedule_version": "INTEGER NOT NULL DEFAULT 1",
    "source": "VARCHAR NOT NULL DEFAULT 'greedy'",
    "created_at": "TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()",
}


def table_exists(table_name, schema_name):
    inspector = inspect(engine)
    return table_name in inspector.get_table_names(schema=schema_name)


def column_exists(table_name, column_name, schema_name):
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns(table_name, schema=schema_name)]
    return column_name in cols


def ensure_columns(db):
    """Add any columns missing from an older/partial table definition."""
    for col_name, col_type in REQUIRED_COLUMNS.items():
        if column_exists("unit_schedule_items", col_name, "scheduling"):
            continue
        db.execute(
            text(
                f"ALTER TABLE scheduling.unit_schedule_items "
                f"ADD COLUMN {col_name} {col_type}"
            )
        )
        db.commit()
        print(f"Added missing column: {col_name}")


def run_migration():
    print("Starting migration: create unit_schedule_items")

    with SessionLocal() as db:
        try:
            if table_exists("unit_schedule_items", "scheduling"):
                print(
                    "Table scheduling.unit_schedule_items already exists — "
                    "checking columns."
                )
                ensure_columns(db)
            else:
                db.execute(text("""
                    CREATE TABLE scheduling.unit_schedule_items (
                        id               SERIAL PRIMARY KEY,
                        order_id         INTEGER NOT NULL REFERENCES oms.orders(id),
                        order_number     VARCHAR NOT NULL,
                        part_id          INTEGER NOT NULL REFERENCES oms.parts(id),
                        part_number      VARCHAR NOT NULL,
                        unit_index       INTEGER NOT NULL,
                        operation_id     INTEGER NOT NULL REFERENCES oms.operations(id),
                        operation_number VARCHAR NOT NULL,
                        machine_id       INTEGER REFERENCES configuration.machines(id),
                        start_time       TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                        end_time         TIMESTAMP WITHOUT TIME ZONE NOT NULL,
                        status           VARCHAR NOT NULL DEFAULT 'unit_scheduled',
                        schedule_version INTEGER NOT NULL DEFAULT 1,
                        source           VARCHAR NOT NULL DEFAULT 'greedy',
                        created_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
                    )
                """))
                db.commit()
                print("Created table scheduling.unit_schedule_items.")

            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_unit_sched_part_unit_op
                ON scheduling.unit_schedule_items (part_id, unit_index, operation_id)
            """))
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_unit_sched_machine_start
                ON scheduling.unit_schedule_items (machine_id, start_time)
            """))
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_unit_sched_version
                ON scheduling.unit_schedule_items (schedule_version)
            """))
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_unit_sched_order
                ON scheduling.unit_schedule_items (order_id)
            """))
            db.commit()
            print("Indexes ensured.")
            print("Migration completed successfully.")
        except Exception as e:
            db.rollback()
            print(f"Migration failed: {e}")
            raise


if __name__ == "__main__":
    run_migration()

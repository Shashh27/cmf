#!/usr/bin/env python3
"""
Migration Script: Create out_source_operation_status table
Description: Creates the oms.out_source_operation_status table for tracking
             out-source operation delivery lifecycle (pending → in_transit → delivered).
Run with: python migrations/create_out_source_operation_status.py
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from DB.database import engine, SessionLocal


def table_exists(table_name, schema_name):
    inspector = inspect(engine)
    return table_name in inspector.get_table_names(schema=schema_name)


def column_exists(table_name, column_name, schema_name):
    inspector = inspect(engine)
    cols = [c['name'] for c in inspector.get_columns(table_name, schema=schema_name)]
    return column_name in cols


def run_migration():
    print("Starting migration: create out_source_operation_status table")

    with SessionLocal() as db:
        try:
            if table_exists("out_source_operation_status", "oms"):
                print("Table oms.out_source_operation_status already exists — skipping creation.")
            else:
                db.execute(text("""
                    CREATE TABLE oms.out_source_operation_status (
                        id            SERIAL PRIMARY KEY,
                        part_id       INTEGER NOT NULL REFERENCES oms.parts(id),
                        order_id      INTEGER NOT NULL REFERENCES oms.orders(id),
                        operation_id  INTEGER NOT NULL REFERENCES oms.operations(id),
                        sent_date     TIMESTAMPTZ,
                        delivered_date TIMESTAMPTZ,
                        status        VARCHAR NOT NULL DEFAULT 'pending',
                        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """))
                db.commit()
                print("Created table oms.out_source_operation_status.")

            # Index on operation_id for fast lookups during scheduling
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_out_source_op_status_operation_id
                ON oms.out_source_operation_status (operation_id)
            """))

            # Index on (part_id, order_id) for part-level queries
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_out_source_op_status_part_order
                ON oms.out_source_operation_status (part_id, order_id)
            """))

            db.commit()
            print("Indexes ensured.")

            # Also make rescheduling_items.machine_id nullable (needed for out-source rows)
            db.execute(text("""
                ALTER TABLE scheduling.rescheduling_items
                ALTER COLUMN machine_id DROP NOT NULL
            """))
            db.commit()
            print("Made scheduling.rescheduling_items.machine_id nullable.")

            print("Migration completed successfully.")

        except Exception as e:
            db.rollback()
            print(f"Migration failed: {e}")
            raise


if __name__ == "__main__":
    run_migration()

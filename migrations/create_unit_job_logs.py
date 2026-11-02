#!/usr/bin/env python3
"""
Create scheduling.unit_job_logs for unit-wise job cards.

Does not alter scheduling.production_logs.

Run: python migrations/create_unit_job_logs.py
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text
from DB.database import engine


def table_exists(table_name, schema_name):
    inspector = inspect(engine)
    return table_name in inspector.get_table_names(schema=schema_name)


def main():
    print("Starting migration: unit_job_logs")
    with engine.begin() as conn:
        if table_exists("unit_job_logs", "scheduling"):
            print("Table scheduling.unit_job_logs already exists.")
            return
        conn.execute(
            text(
                """
                CREATE TABLE scheduling.unit_job_logs (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER NOT NULL REFERENCES oms.orders(id),
                    part_id INTEGER NOT NULL REFERENCES oms.parts(id),
                    operation_id INTEGER NOT NULL REFERENCES oms.operations(id),
                    machine_id INTEGER NOT NULL REFERENCES configuration.machines(id),
                    unit_from INTEGER NOT NULL,
                    unit_to INTEGER NOT NULL,
                    operator_id INTEGER NOT NULL REFERENCES accesscontrol.access_users(id),
                    reviewer_id INTEGER NULL REFERENCES accesscontrol.access_users(id),
                    from_date DATE NULL,
                    from_time TIME NULL,
                    to_date DATE NULL,
                    to_time TIME NULL,
                    operator_status VARCHAR NOT NULL DEFAULT 'inprogress',
                    status VARCHAR NOT NULL DEFAULT 'pending',
                    produced_quantity INTEGER NULL,
                    operator_rework_quantity INTEGER NULL,
                    approved_quantity INTEGER NULL,
                    rework_quantity INTEGER NULL,
                    rejected_quantity INTEGER NULL,
                    notes TEXT NULL,
                    remarks TEXT NULL,
                    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
                    acknowledged_at TIMESTAMP NULL,
                    operator_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
                    operator_acknowledged_at TIMESTAMP NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    CONSTRAINT chk_unit_job_range CHECK (unit_from >= 1 AND unit_to >= unit_from)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX ix_unit_job_logs_card
                ON scheduling.unit_job_logs (machine_id, operation_id, unit_from, unit_to)
                """
            )
        )
        print("Created scheduling.unit_job_logs.")


if __name__ == "__main__":
    main()

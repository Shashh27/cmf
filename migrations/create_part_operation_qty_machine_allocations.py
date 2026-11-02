#!/usr/bin/env python3
"""
Create scheduling.part_operation_qty_machine_allocations for manual qty→machine bands.

Run: python migrations/create_part_operation_qty_machine_allocations.py
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
    print("Starting migration: part_operation_qty_machine_allocations")
    with engine.begin() as conn:
        if table_exists("part_operation_qty_machine_allocations", "scheduling"):
            print("Table scheduling.part_operation_qty_machine_allocations already exists.")
            return

        conn.execute(
            text(
                """
                CREATE TABLE scheduling.part_operation_qty_machine_allocations (
                    id SERIAL PRIMARY KEY,
                    part_id INTEGER NOT NULL REFERENCES oms.parts(id),
                    order_id INTEGER NULL REFERENCES oms.orders(id),
                    operation_id INTEGER NOT NULL REFERENCES oms.operations(id),
                    unit_from INTEGER NOT NULL,
                    unit_to INTEGER NOT NULL,
                    machine_id INTEGER NOT NULL REFERENCES configuration.machines(id),
                    created_by INTEGER NULL,
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                    CONSTRAINT chk_qty_alloc_unit_range CHECK (unit_from >= 1 AND unit_to >= unit_from)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX ix_qty_alloc_part_id
                ON scheduling.part_operation_qty_machine_allocations (part_id)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX ix_qty_alloc_part_op
                ON scheduling.part_operation_qty_machine_allocations (part_id, operation_id)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX ix_qty_alloc_order_id
                ON scheduling.part_operation_qty_machine_allocations (order_id)
                """
            )
        )
        print("Created scheduling.part_operation_qty_machine_allocations.")


if __name__ == "__main__":
    main()

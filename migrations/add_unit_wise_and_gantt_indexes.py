"""
B-tree indexes for unit-wise greedy + Gantt hot paths.

Run from backend/cmf:
  python migrations/add_unit_wise_and_gantt_indexes.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python migrations/....py` without setting PYTHONPATH
_CMF_ROOT = Path(__file__).resolve().parents[1]
if str(_CMF_ROOT) not in sys.path:
    sys.path.insert(0, str(_CMF_ROOT))

from sqlalchemy import text

from DB.database import SessionLocal


INDEXES = [
    # Unit-wise rebuild / sibling machine occupancy
    (
        "idx_unit_sched_part_version",
        """
        CREATE INDEX IF NOT EXISTS idx_unit_sched_part_version
        ON scheduling.unit_schedule_items (part_id, schedule_version)
        """,
    ),
    (
        "idx_unit_sched_part_ver_machine_end",
        """
        CREATE INDEX IF NOT EXISTS idx_unit_sched_part_ver_machine_end
        ON scheduling.unit_schedule_items (part_id, schedule_version, machine_id, end_time)
        """,
    ),
    # Production logs used heavily by greedy (approved / actual / freeze / preferred)
    (
        "idx_production_logs_operation_id",
        """
        CREATE INDEX IF NOT EXISTS idx_production_logs_operation_id
        ON scheduling.production_logs (operation_id)
        """,
    ),
    (
        "idx_production_logs_op_operator_status",
        """
        CREATE INDEX IF NOT EXISTS idx_production_logs_op_operator_status
        ON scheduling.production_logs (operation_id, operator_status)
        """,
    ),
    (
        "idx_production_logs_inprogress_machine",
        """
        CREATE INDEX IF NOT EXISTS idx_production_logs_inprogress_machine
        ON scheduling.production_logs (operator_status, machine_id)
        WHERE machine_id IS NOT NULL
        """,
    ),
    # Planned / dynamic Gantt filters
    (
        "idx_planned_sched_history_machine_start",
        """
        CREATE INDEX IF NOT EXISTS idx_planned_sched_history_machine_start
        ON scheduling.planned_schedule_items
            (schedule_history_id, machine_id, planned_start_time)
        """,
    ),
    (
        "idx_planned_sched_operation_id",
        """
        CREATE INDEX IF NOT EXISTS idx_planned_sched_operation_id
        ON scheduling.planned_schedule_items (operation_id)
        """,
    ),
    (
        "idx_rescheduling_machine_start",
        """
        CREATE INDEX IF NOT EXISTS idx_rescheduling_machine_start
        ON scheduling.rescheduling_items (machine_id, start_time)
        """,
    ),
    (
        "idx_rescheduling_status_machine_start",
        """
        CREATE INDEX IF NOT EXISTS idx_rescheduling_status_machine_start
        ON scheduling.rescheduling_items (status, machine_id, start_time)
        """,
    ),
    (
        "idx_rescheduling_operation_order",
        """
        CREATE INDEX IF NOT EXISTS idx_rescheduling_operation_order
        ON scheduling.rescheduling_items (operation_id, order_id)
        """,
    ),
    # Active scope load
    (
        "idx_part_schedule_status_status_part",
        """
        CREATE INDEX IF NOT EXISTS idx_part_schedule_status_status_part
        ON scheduling.part_schedule_status (status, part_id)
        """,
    ),
    (
        "idx_machines_work_center_id",
        """
        CREATE INDEX IF NOT EXISTS idx_machines_work_center_id
        ON configuration.machines (work_center_id)
        """,
    ),
]


def run_migration() -> None:
    db = SessionLocal()
    try:
        for name, ddl in INDEXES:
            db.execute(text(ddl))
            print(f"Ensured index: {name}")
        db.commit()
        print("Migration completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()

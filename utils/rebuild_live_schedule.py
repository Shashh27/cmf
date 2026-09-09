#!/usr/bin/env python3
"""
Live Schedule Rebuild Utility

Rebuilds scheduling.rescheduling_items from scratch using Scheduler #2
(dynamic_reschedule) across every active part.
"""

import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from DB.database import SessionLocal
from algorithm import dynamic_reschedule
from time_utils import now_ist

SUMMARY_SQL = text("""
    SELECT COUNT(*)                AS rows,
           COUNT(DISTINCT part_id) AS parts,
           MIN(id)                 AS min_id,
           MAX(id)                 AS max_id,
           MIN(schedule_version)   AS min_version,
           MAX(schedule_version)   AS max_version,
           MIN(start_time)         AS earliest_start,
           MAX(end_time)           AS latest_end
    FROM scheduling.rescheduling_items
""")


def live_schedule_summary(db) -> dict:
    row = db.execute(SUMMARY_SQL).mappings().first()
    return dict(row) if row else {}


def print_summary(label: str, summary: dict) -> None:
    print(f"{label}:")
    if not summary or not summary.get("rows"):
        print("  (empty)")
        return
    print(f"  rows            {summary['rows']} across {summary['parts']} parts")
    print(f"  id range        {summary['min_id']} - {summary['max_id']}")
    print(f"  schedule_version {summary['min_version']} - {summary['max_version']}")
    print(f"  time span       {summary['earliest_start']} -> {summary['latest_end']}")


def rebuild_live_schedule() -> dict:
    """Re-plan every active part and replace the live schedule rows."""
    db = SessionLocal()
    try:
        before = live_schedule_summary(db)
        result = dynamic_reschedule(db)
        after = live_schedule_summary(db)
        return {
            "success": bool(result.get("success")),
            "message": result.get("message", ""),
            "reschedule_version": result.get("reschedule_version"),
            "parts_rescheduled": result.get("parts_rescheduled"),
            "operations_inserted": result.get("operations_inserted"),
            "skipped_parts": result.get("skipped_parts"),
            "before": before,
            "after": after,
            "timestamp": now_ist(),
        }
    except Exception as exc:
        db.rollback()
        return {
            "success": False,
            "message": f"Rebuild failed: {exc}",
            "timestamp": now_ist(),
        }
    finally:
        db.close()


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()

    print("Live Schedule Rebuild Utility")
    print("=" * 40)

    outcome = rebuild_live_schedule()

    if not outcome["success"]:
        print(f"FAILED: {outcome['message']}")
        sys.exit(1)

    print_summary("before", outcome.get("before", {}))
    print_summary("after", outcome.get("after", {}))
    print()
    print(f"parts rescheduled   {outcome.get('parts_rescheduled')}")
    print(f"operations inserted {outcome.get('operations_inserted')}")
    print(f"schedule version    {outcome.get('reschedule_version')}")
    if outcome.get("skipped_parts"):
        print(f"skipped parts       {outcome['skipped_parts']}")
    print()
    print("=" * 40)
    print(outcome["message"] or "Rebuild completed")

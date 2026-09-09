#!/usr/bin/env python3
"""
Live Schedule Restore Utility

Replaces the contents of scheduling.rescheduling_items with an explicit set of
rows read from a CSV file, ids included. Used to put a known-good generation of
the live schedule back after it has been overwritten.

Default CSV: utils/live_schedule_restore_rows.csv
"""

import argparse
import csv
import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from DB.database import SessionLocal
from live_schedule_lock import live_schedule_lock

DEFAULT_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "live_schedule_restore_rows.csv")

COLUMNS = (
    "id", "order_id", "order_number", "part_id", "part_number",
    "operation_id", "operation_number", "machine_id",
    "start_time", "end_time",
    "total_qty", "completed_qty", "remaining_qty",
    "status", "schedule_version",
)

INT_COLUMNS = frozenset({
    "id", "order_id", "part_id", "operation_id", "machine_id",
    "total_qty", "completed_qty", "remaining_qty", "schedule_version",
})

TIMESTAMP_COLUMNS = frozenset({"start_time", "end_time"})

INSERT_SQL = text(
    "INSERT INTO scheduling.rescheduling_items ({cols}) VALUES ({vals})".format(
        cols=", ".join(COLUMNS),
        vals=", ".join(f":{c}" for c in COLUMNS),
    )
)


def _parse_timestamp(value: str) -> datetime:
    text_value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text_value, fmt)
        except ValueError:
            continue
    raise ValueError(f"unrecognised timestamp: {value!r}")


def load_rows(csv_path: str) -> list:
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = set(COLUMNS) - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"CSV is missing columns: {sorted(missing)}")

        rows = []
        for line_no, raw in enumerate(reader, start=2):
            row = {}
            for col in COLUMNS:
                value = (raw.get(col) or "").strip()
                if col in INT_COLUMNS:
                    row[col] = int(value) if value else None
                elif col in TIMESTAMP_COLUMNS:
                    row[col] = _parse_timestamp(value)
                else:
                    row[col] = value
            if row["end_time"] < row["start_time"]:
                raise ValueError(
                    f"line {line_no}: end_time {row['end_time']} precedes "
                    f"start_time {row['start_time']}"
                )
            rows.append(row)
    return rows


def check_references(db, rows: list) -> list:
    """
    Report ids in the CSV that no longer exist in their parent tables.

    rescheduling_items carries no foreign keys, so this is advisory only: it
    catches rows that point at records deleted since the CSV was captured.
    """
    problems = []
    parents = (
        ("order_id", "oms.orders"),
        ("part_id", "oms.parts"),
        ("operation_id", "oms.operations"),
        ("machine_id", "configuration.machines"),
    )
    for column, table in parents:
        values = sorted({r[column] for r in rows if r[column] is not None})
        if not values:
            continue
        try:
            found = {
                row[0] for row in db.execute(
                    text(f"SELECT id FROM {table} WHERE id = ANY(:vals)"),
                    {"vals": values},
                ).all()
            }
        except Exception as exc:
            db.rollback()
            problems.append(f"{column} check against {table} skipped ({exc})")
            continue
        for value in values:
            if value not in found:
                problems.append(f"{column}={value} not present in {table}")
    return problems


def restore_live_schedule(csv_path: str = DEFAULT_CSV,
                          force: bool = False,
                          dry_run: bool = False) -> dict:
    """
    Delete every row in the live schedule and insert the CSV rows verbatim.

    Args:
        csv_path: CSV holding the rows to restore.
        force:    Restore even when some CSV ids no longer exist in parent tables.
        dry_run:  Validate and report without writing.

    Returns:
        dict: Restore outcome.
    """
    try:
        rows = load_rows(csv_path)
    except (OSError, ValueError) as exc:
        return {"success": False, "message": f"Could not read {csv_path}: {exc}"}

    db = SessionLocal()
    try:
        replaced = db.execute(
            text("SELECT COUNT(*) FROM scheduling.rescheduling_items")
        ).scalar()
        reference_problems = check_references(db, rows)

        if dry_run:
            return {
                "success": True,
                "message": f"Dry run: {len(rows)} rows parsed, nothing written.",
                "rows_in_csv": len(rows),
                "rows_currently_present": replaced,
                "reference_problems": reference_problems,
                "dry_run": True,
            }

        if reference_problems and not force:
            return {
                "success": False,
                "message": (
                    "Refusing to restore: some ids in the CSV no longer exist. "
                    "Pass --force to insert anyway."
                ),
                "reference_problems": reference_problems,
            }

        with live_schedule_lock(db, blocking=True) as acquired:
            if not acquired:
                return {"success": False, "message": "Live schedule lock not acquired."}

            db.execute(text("DELETE FROM scheduling.rescheduling_items"))
            db.execute(INSERT_SQL, rows)
            # Keep the identity sequence ahead of the ids we inserted explicitly.
            db.execute(text("""
                SELECT setval(
                    'scheduling.rescheduling_items_id_seq',
                    GREATEST((SELECT MAX(id) FROM scheduling.rescheduling_items), 1)
                )
            """))
            db.commit()

        inserted = db.execute(
            text("SELECT COUNT(*) FROM scheduling.rescheduling_items")
        ).scalar()
        return {
            "success": inserted == len(rows),
            "message": f"Restored {inserted} rows (replaced {replaced}).",
            "rows_deleted": replaced,
            "rows_inserted": inserted,
            "reference_problems": reference_problems,
        }

    except Exception as exc:
        db.rollback()
        return {"success": False, "message": f"Restore failed: {exc}"}
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", default=DEFAULT_CSV, help="CSV of rows to restore")
    parser.add_argument("--force", action="store_true",
                        help="restore even when some CSV ids no longer exist")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate the CSV without writing")
    args = parser.parse_args()

    print("Live Schedule Restore Utility")
    print("=" * 40)
    print(f"csv: {args.csv}")

    outcome = restore_live_schedule(args.csv, force=args.force, dry_run=args.dry_run)

    for problem in outcome.get("reference_problems") or []:
        print(f"  WARNING {problem}")

    print()
    print("=" * 40)
    print(outcome["message"])
    sys.exit(0 if outcome["success"] else 1)

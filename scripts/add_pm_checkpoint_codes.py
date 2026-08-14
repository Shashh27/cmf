"""
Add item_code to configuration.pm_checklist_items and backfill standard codes.

Examples: CL-01, CO-010, HY-03, LG-05, ME-12, SP-02, SA-01

Usage (from backend/):
  python scripts/add_pm_checkpoint_codes.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text
from DB.database import SessionLocal, engine

PREFIX_RULES = [
    (re.compile(r"clean", re.I), "CL"),
    (re.compile(r"coolant", re.I), "CO"),
    (re.compile(r"filter", re.I), "FL"),
    (re.compile(r"hydraulic", re.I), "HY"),
    (re.compile(r"lubric|greas", re.I), "LG"),
    (re.compile(r"mechanic|align", re.I), "ME"),
    (re.compile(r"inspect", re.I), "IN"),
    (re.compile(r"spindle|head", re.I), "SP"),
    (re.compile(r"tool", re.I), "TL"),
    (re.compile(r"safety|emerg", re.I), "SA"),
    (re.compile(r"electric", re.I), "EL"),
    (re.compile(r"pneum|air", re.I), "PN"),
    (re.compile(r"daily", re.I), "DY"),
    (re.compile(r"weekly", re.I), "WK"),
    (re.compile(r"monthly", re.I), "MN"),
]


def prefix_for_checklist(name: str | None) -> str:
    name = name or "PM"
    for pattern, prefix in PREFIX_RULES:
        if pattern.search(name):
            return prefix
    letters = re.sub(r"[^A-Za-z]", "", name).upper()
    return (letters[:2] or "PM")


def make_code(prefix: str, seq: int) -> str:
    # Standard style: CL-01, CO-010, HY-03
    if seq < 100:
        return f"{prefix}-{seq:02d}"
    return f"{prefix}-{seq:03d}"


def column_exists(conn, schema: str, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = :schema
              AND table_name = :table
              AND column_name = :column
            """
        ),
        {"schema": schema, "table": table, "column": column},
    ).fetchone()
    return row is not None


def constraint_exists(conn, schema: str, name: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = :schema
              AND constraint_name = :name
            """
        ),
        {"schema": schema, "name": name},
    ).fetchone()
    return row is not None


def main() -> None:
    with engine.begin() as conn:
        if not column_exists(conn, "configuration", "pm_checklist_items", "item_code"):
            print("Adding column configuration.pm_checklist_items.item_code ...")
            conn.execute(
                text(
                    """
                    ALTER TABLE configuration.pm_checklist_items
                    ADD COLUMN item_code VARCHAR(32)
                    """
                )
            )
        else:
            print("Column item_code already exists.")

        rows = conn.execute(
            text(
                """
                SELECT i.id, i.checklist_id, i.sequence_number, c.name AS checklist_name, i.item_code
                FROM configuration.pm_checklist_items i
                JOIN configuration.pm_checklists c ON c.id = i.checklist_id
                ORDER BY i.checklist_id ASC, i.sequence_number ASC, i.id ASC
                """
            )
        ).fetchall()

        used: dict[int, set[str]] = {}
        updated = 0
        for row in rows:
            item_id, checklist_id, seq, checklist_name, existing = row
            used.setdefault(checklist_id, set())
            if existing and str(existing).strip():
                used[checklist_id].add(str(existing).strip().upper())
                continue

            prefix = prefix_for_checklist(checklist_name)
            n = int(seq or 1)
            code = make_code(prefix, n)
            while code in used[checklist_id]:
                n += 1
                code = make_code(prefix, n)
            used[checklist_id].add(code)
            conn.execute(
                text(
                    """
                    UPDATE configuration.pm_checklist_items
                    SET item_code = :code
                    WHERE id = :id
                    """
                ),
                {"code": code, "id": item_id},
            )
            updated += 1

        print(f"Backfilled item_code on {updated} checkpoint(s).")

        # Fill any remaining nulls defensively
        conn.execute(
            text(
                """
                UPDATE configuration.pm_checklist_items
                SET item_code = 'CP-' || id::text
                WHERE item_code IS NULL OR btrim(item_code) = ''
                """
            )
        )

        conn.execute(
            text(
                """
                ALTER TABLE configuration.pm_checklist_items
                ALTER COLUMN item_code SET NOT NULL
                """
            )
        )
        print("Set item_code NOT NULL.")

        if not constraint_exists(conn, "configuration", "uq_pm_checklist_item_code"):
            conn.execute(
                text(
                    """
                    ALTER TABLE configuration.pm_checklist_items
                    ADD CONSTRAINT uq_pm_checklist_item_code UNIQUE (checklist_id, item_code)
                    """
                )
            )
            print("Added unique constraint uq_pm_checklist_item_code.")
        else:
            print("Unique constraint already exists.")

    # Quick verify
    db = SessionLocal()
    try:
        sample = db.execute(
            text(
                """
                SELECT c.name, i.item_code, i.item_text
                FROM configuration.pm_checklist_items i
                JOIN configuration.pm_checklists c ON c.id = i.checklist_id
                ORDER BY c.name, i.sequence_number
                LIMIT 20
                """
            )
        ).fetchall()
        print("Sample codes:")
        for name, code, text_val in sample:
            print(f"  [{name}] {code} — {text_val[:60]}")
    finally:
        db.close()

    print("Done.")


if __name__ == "__main__":
    main()

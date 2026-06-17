"""
Seed script: inserts sub-categories and all tools from tools_master_upload.xlsx
into the inventory schema.

Assumptions:
  - 'Tools' and 'Instruments' top-level categories already exist in categories table.
  - Run once; re-running is safe only if the table is empty (no upsert logic).

Usage:
    python seed_tools.py
"""

import os
import math
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
import sys

# ── 1. DB connection ──────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",   # <-- update this
)
engine = create_engine(DATABASE_URL)
print("Database connected", flush=True)

# ── 2. Load Excel ─────────────────────────────────────────────────────────────
EXCEL_PATH = "tools_master_upload.xlsx"   # put the file next to this script
print(f"Loading Excel from: {EXCEL_PATH}...", flush=True)
df = pd.read_excel(EXCEL_PATH)
print(f"Loaded {len(df)} rows from Excel", flush=True)

# Normalise column names
df.columns = [c.strip() for c in df.columns]

def clean(val):
    """Return None for NaN / blank, else stripped string."""
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    s = str(val).strip()
    return s if s else None

def clean_int(val):
    try:
        return int(val)
    except (TypeError, ValueError):
        return None

def clean_float(val):
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None

# ── 3. Seed ───────────────────────────────────────────────────────────────────
with Session(engine) as session:

    # 3a. Fetch existing top-level categories (Tools, Instruments)
    rows = session.execute(
        text("SELECT id, name FROM inventory.categories WHERE parent_id IS NULL")
    ).fetchall()
    top_level = {r.name: r.id for r in rows}
    print(f"Top-level categories found: {top_level}", flush=True)

    if not top_level:
        raise RuntimeError(
            "No top-level categories found. "
            "Please ensure 'Tools' and 'Instruments' exist in inventory.categories."
        )

    # 3b. Collect all (category, sub_category) pairs from Excel
    pairs = (
        df[["Category", "Sub Category"]]
        .dropna(subset=["Category", "Sub Category"])
        .drop_duplicates()
        .values.tolist()
    )

    # 3c. Insert sub-categories if they don't already exist
    sub_category_map = {}   # (category_name, sub_category_name) -> sub_category_id

    for cat_name, sub_name in pairs:
        cat_name = cat_name.strip()
        sub_name = sub_name.strip()

        parent_id = top_level.get(cat_name)
        if parent_id is None:
            print(f"  WARNING: parent category '{cat_name}' not found — skipping sub '{sub_name}'", flush=True)
            continue

        # Check if sub-category already exists under this parent
        existing = session.execute(
            text(
                "SELECT id FROM inventory.categories "
                "WHERE name = :name AND parent_id = :pid"
            ),
            {"name": sub_name, "pid": parent_id},
        ).fetchone()

        if existing:
            sub_id = existing.id
            print(f"  Sub-category already exists: [{cat_name}] → [{sub_name}] (id={sub_id})", flush=True)
        else:
            result = session.execute(
                text(
                    "INSERT INTO inventory.categories (name, parent_id) "
                    "VALUES (:name, :pid) RETURNING id"
                ),
                {"name": sub_name, "pid": parent_id},
            )
            sub_id = result.fetchone().id
            print(f"  Created sub-category: [{cat_name}] → [{sub_name}] (id={sub_id})", flush=True)

        sub_category_map[(cat_name, sub_name)] = (parent_id, sub_id)

    session.commit()
    print(f"\nSub-categories done. Total mapped: {len(sub_category_map)}\n", flush=True)

    # 3d. Insert tools
    inserted = 0
    skipped  = 0

    for _, row in df.iterrows():
        cat_name = clean(row.get("Category"))
        sub_name = clean(row.get("Sub Category"))

        if cat_name is None or sub_name is None:
            skipped += 1
            continue

        ids = sub_category_map.get((cat_name, sub_name))
        if ids is None:
            skipped += 1
            continue

        category_id, sub_category_id = ids

        session.execute(
            text("""
                INSERT INTO inventory.tools_list
                    (item_description, range, identification_code, make,
                     quantity, total_quantity, location, gauge, remarks,
                     amount, ref_ledger, type, category_id, sub_category_id)
                VALUES
                    (:item_description, :range, :identification_code, :make,
                     :quantity, :total_quantity, :location, :gauge, :remarks,
                     :amount, :ref_ledger, :type, :category_id, :sub_category_id)
            """),
            {
                "item_description":    clean(row.get("Item Description")),
                "range":               clean(row.get("Range in mm")),
                "identification_code": clean(row.get("Identification Code")),
                "make":                clean(row.get("Make")),
                "quantity":            clean_int(row.get("Quantity")),
                "total_quantity":      clean_int(row.get("Quantity")),   # set total = available on first load
                "location":            clean(row.get("Location")),
                "gauge":               clean(row.get("Gauge")),
                "remarks":             clean(row.get("Remarks")),
                "amount":              clean_float(row.get("Amount")),
                "ref_ledger":          clean(row.get("Ref Ledger")),
                "type":                clean(row.get("TYPE")),
                "category_id":         category_id,
                "sub_category_id":     sub_category_id,
            },
        )
        inserted += 1

    session.commit()
    print(f"Tools inserted : {inserted}", flush=True)
    print(f"Rows skipped   : {skipped}", flush=True)
    print("Done ✓", flush=True)

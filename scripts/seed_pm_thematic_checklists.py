"""
Seed thematic PM checklists + checkpoints from the grouped PM doc data.

- Creates checklists: Hydraulic, Coolant, Lubrication / Greasing, Oiling, etc.
- Keeps frequency model as-is (Time Based / Usage Based / Condition Based).
- Does NOT change machine assignment flow or existing assignments.
- Skips a checklist name if it already exists.
"""
from __future__ import annotations

import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

# Allow running from backend/
BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from DB.database import SessionLocal
from DB.models.configuration import PMChecklist, PMChecklistItem

UNIQUE_JSON = Path(r"C:\Users\SMPM\AppData\Local\Temp\pm_checklist_021\unique_checkpoints.json")
CREATED_BY = 4  # project_coordinator (matches most existing PM rows)

RULES = [
    ("Hydraulic", r"hydraulic|power pack|dte-?\s*25|servosystem|pressure gauge.*hyd|hyd\.?\s*oil|hydraulic oil|hydraulic pressure|hydraulic seal|hydraulic fitting|hydraulic connecting|hydraulic motor|hydraulic return|suction strainer"),
    ("Coolant", r"coolant|collant|chiller|servo cut|nel cool|glycetin|null cool|spindle cool"),
    ("Lubrication / Greasing", r"lubric|grease|greasing|lube|servoway|guideway lubrication|ball screw|lubrication pump|lubricat|rolling guide"),
    ("Oiling", r"\boil\b|oil level|gear.?box oil|spindle oil|cutting oil|oil check|oil leak|top.?up.*oil|refill.*oil|oil filter"),
    ("Filters", r"filter|strainer|wiper|wiping ring|thewiping|the wiping"),
    ("Air / Pneumatic", r"air pressure|pneumatic|air hose|air connection|\b5-7 bar\b|air pressure switch"),
    ("Belts / Drive", r"\bbelt|pulley|tension|drive belt"),
    ("Electrical", r"electric|cabinet|relay|fuse|terminal|panel|cooling fan|battery|connector"),
    ("Safety / Sensors / Switches", r"emergency|limit switch|fire detector|detector|float|tank door|magnetic check clamp"),
    ("Spindle / Head / Tooling", r"spindle|wheel head|work head|tool clamp|tooling|cutting tool|grinding wheel|blade|carbide|chuck|truing|face grinder|wheels|spinde"),
    ("Cleaning", r"clean|cleaning|chip|dust|contamination|contami|machine bed|workplace|turret|turrnet|want before clean"),
    ("Mechanical / Alignment / Inspection", r"alignment|alingment|allignment|level gauge|gib|jib|tailstock|cross slide|axis|axes|guide way|bearing|nut|bolt|fastener|fastner|calibration|accuracy|measure|floodlight|flood light|bulb|suspenion|suspension|rope|conveyer|conveyor|arm |drill|rack|sleeve|elevating|reversing|co-centre|clutch|physical observation|level the machine|pillow"),
]

DESCRIPTIONS = {
    "Hydraulic": "All hydraulic / power-pack related PM checkpoints (grouped from machine checklists).",
    "Coolant": "All coolant / spindle-cool related PM checkpoints.",
    "Lubrication / Greasing": "All lubrication and greasing related PM checkpoints.",
    "Oiling": "General oil level / gearbox / spindle oil checkpoints.",
    "Filters": "Filter, strainer and wiper related checkpoints.",
    "Air / Pneumatic": "Air pressure and pneumatic checkpoints.",
    "Belts / Drive": "Belt, pulley and drive tension checkpoints.",
    "Electrical": "Electrical cabinet, panels and wiring checkpoints.",
    "Safety / Sensors / Switches": "Safety devices, sensors and limit switches.",
    "Spindle / Head / Tooling": "Spindle, head, tooling and grinding-related checkpoints.",
    "Cleaning": "Machine and workplace cleaning checkpoints.",
    "Mechanical / Alignment / Inspection": "Alignment, leveling and mechanical inspection checkpoints.",
    "General / Other": "Other PM checkpoints.",
}


def norm(t: str) -> str:
    t = t.lower()
    t = t.replace("collant", "coolant").replace("spinde", "spindle")
    t = t.replace("alingment", "alignment").replace("allignment", "alignment")
    return re.sub(r"\s+", " ", t).strip()


def collapse_key(t: str) -> str:
    k = re.sub(r"[^a-z0-9 ]+", " ", norm(t))
    k = re.sub(r"\s+", " ", k).strip()
    reps = [
        (r"check(ing)? (the )?hydraulic oil levels?", "hydraulic oil level"),
        (r"check(ing)? (the )?lubrication oil levels?", "lubrication oil level"),
        (r"check(ing)? (the )?coolant (oil )?levels?", "coolant level"),
        (r"check(ing)? (the )?oil levels?", "oil level"),
        (r"check(ing)? (the )?spindle oil levels?", "spindle oil level"),
        (r"clean the machine( properly)?", "clean the machine"),
        (r"cleaning of the machine", "clean the machine"),
        (r"machine cleaning", "clean the machine"),
        (r"general cleaning of the machine", "clean the machine"),
        (r"check and cleaning of flood ?light protective glass", "floodlight glass cleaning"),
        (r"check cleaning of flood ?light protective glass", "floodlight glass cleaning"),
        (r"hydraulic power pack oil.*", "hydraulic power pack oil check"),
        (r"emergency button.*", "emergency button check"),
        (r"air pressure.*", "air pressure check"),
        (r"limit switches?.*", "limit switch check"),
    ]
    for a, b in reps:
        k = re.sub(a, b, k)
    return k


def group_of(t: str) -> str:
    n = norm(t)
    for name, pat in RULES:
        if re.search(pat, n, re.I):
            return name
    return "General / Other"


def parse_frequency(freq: str | None, text: str = "") -> dict:
    """Map free-text frequency from the Word doc into existing PM item fields."""
    raw = f"{freq or ''} {text}".lower()

    # Usage based (hours)
    m = re.search(r"(?:after|every|at least after)\s+(\d+)\s*hours?", raw)
    if m:
        return {
            "frequency_type": "Usage Based",
            "interval_value": None,
            "interval_unit": None,
            "trigger_hours": float(m.group(1)),
        }

    # Explicit intervals
    patterns = [
        (r"once in a day|daily|every day|per day", 1, "Day"),
        (r"once in a week|weekly|every week|every 7 days", 1, "Week"),
        (r"once in a month|monthly|every month|check in a month|refilling in a month", 1, "Month"),
        (r"quarterly|every 3 months|once in 3 months|approx(?:imately)?\s*30-?45 days|approx(?:imately)?\s*30 days", 3, "Month"),
        (r"semi[\s-]?annual|half yearly|every 6 months|6 month once", 6, "Month"),
        (r"yearly|annually|every year|once in a year", 1, "Year"),
        (r"every 6 months", 6, "Month"),
    ]
    src = (freq or "").lower().strip()
    for pat, val, unit in patterns:
        if re.search(pat, src):
            return {
                "frequency_type": "Time Based",
                "interval_value": val,
                "interval_unit": unit,
                "trigger_hours": None,
            }

    # Fallback from text hints
    for pat, val, unit in patterns:
        if re.search(pat, raw):
            return {
                "frequency_type": "Time Based",
                "interval_value": val,
                "interval_unit": unit,
                "trigger_hours": None,
            }

    # Unknown / irregular → Condition Based (same model, optional interval)
    return {
        "frequency_type": "Condition Based",
        "interval_value": None,
        "interval_unit": None,
        "trigger_hours": None,
    }


def build_grouped() -> OrderedDict:
    items = json.loads(UNIQUE_JSON.read_text(encoding="utf-8"))
    dedup: OrderedDict[str, dict] = OrderedDict()
    for it in items:
        key = collapse_key(it["text"])
        if key not in dedup:
            dedup[key] = {"text": it["text"].strip(), "freq": it.get("freq")}
        elif not dedup[key]["freq"] and it.get("freq"):
            dedup[key]["freq"] = it["freq"]

    order = [r[0] for r in RULES] + ["General / Other"]
    grouped: OrderedDict[str, list] = OrderedDict((g, []) for g in order)
    for v in dedup.values():
        grouped[group_of(v["text"])].append(v)
    for g in grouped:
        grouped[g].sort(key=lambda x: x["text"].lower())
    return grouped


def seed(dry_run: bool = False) -> None:
    if not UNIQUE_JSON.exists():
        raise SystemExit(f"Missing extracted data: {UNIQUE_JSON}")

    grouped = build_grouped()
    db = SessionLocal()
    created = []
    skipped = []
    try:
        for name, rows in grouped.items():
            if not rows:
                continue
            existing = db.query(PMChecklist).filter(PMChecklist.name == name).first()
            if existing:
                skipped.append((name, existing.id, len(rows)))
                continue

            checklist = PMChecklist(
                name=name,
                description=DESCRIPTIONS.get(name, f"Grouped PM checklist: {name}"),
                created_by=CREATED_BY,
            )
            if dry_run:
                print(f"[DRY] would create {name!r} with {len(rows)} checkpoints")
                created.append((name, None, len(rows)))
                continue

            db.add(checklist)
            db.flush()

            for seq, row in enumerate(rows, start=1):
                prefix = "".join(ch for ch in name.upper() if ch.isalpha())[:2] or "PM"
                code = f"{prefix}-{seq:02d}" if seq < 100 else f"{prefix}-{seq:03d}"
                db.add(
                    PMChecklistItem(
                        checklist_id=checklist.id,
                        item_code=code,
                        item_text=row["text"],
                        sequence_number=seq,
                        item_type="Boolean",
                        expected_value="Yes",
                        remarks=None,
                    )
                )
            created.append((name, checklist.id, len(rows)))

        if not dry_run:
            db.commit()

        print("=== SEED RESULT ===")
        print(f"Created: {len(created)}")
        for name, cid, n in created:
            print(f"  + id={cid} {name} ({n} checkpoints)")
        print(f"Skipped (already exists): {len(skipped)}")
        for name, cid, n in skipped:
            print(f"  = id={cid} {name} (would have {n})")
        print("Assignments / after-assign flow: unchanged")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    seed(dry_run=dry)

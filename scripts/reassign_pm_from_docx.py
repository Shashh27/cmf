"""
Re-assign PM checkpoints from the Word machine sheets (not all thematic items to every machine).

Source: 021-Preventive Maintenance checklist.docx
- Each sheet → one machine (header Machine / Machine ID)
- Only checkpoints listed on that sheet are assigned
- Frequency comes from the sheet row
- Compulsory: daily / safety-critical → True; otherwise False

Wipes existing PM assignments / schedules / submissions, then rebuilds.

Run:
  cd backend
  python -m scripts.reassign_pm_from_docx
"""
from __future__ import annotations

import re
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from difflib import SequenceMatcher

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from DB.database import SessionLocal
from DB.models.configuration import (
    Machine,
    PMChecklist,
    PMChecklistItem,
    PMMachineAssignment,
    PMAssignmentItem,
    PMSchedule,
    PMCheckpointSubmission,
)
from services.pm_service import create_initial_schedule

DOCX = Path(r"C:\Users\SMPM\AppData\Local\Temp\pm_checklist_021\doc.docx")
SHARE_DOCX = Path(r"\\172.18.7.91\sambashare\Sushmitha V\CMF\PM\021-Preventive Maintenance checklist.docx")
ASSIGNED_BY = 16

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

THEMATIC_NAMES = {
    "Hydraulic", "Coolant", "Lubrication / Greasing", "Oiling", "Filters",
    "Air / Pneumatic", "Belts / Drive", "Electrical", "Safety / Sensors / Switches",
    "Spindle / Head / Tooling", "Cleaning", "Mechanical / Alignment / Inspection",
    "General / Other",
}

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


def norm(t: str) -> str:
    t = (t or "").lower()
    t = t.replace("collant", "coolant").replace("spinde", "spindle")
    t = t.replace("alingment", "alignment").replace("allignment", "alignment")
    t = t.replace("schaublin", "schublin").replace("reishauer", "reisauer")
    t = t.replace("dekel maho", "deckel maho").replace("teckel", "tekcel")
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
    raw = f"{freq or ''} {text}".lower()
    m = re.search(r"(?:after|every|at least after)\s+(\d+)\s*hours?", raw)
    if m:
        return {"frequency_type": "Usage Based", "interval_value": None, "interval_unit": None, "trigger_hours": float(m.group(1))}
    patterns = [
        (r"once in a day|daily|every day|per day", 1, "Day"),
        (r"once in a week|weekly|every week|every 7 days", 1, "Week"),
        (r"once in a month|monthly|every month|check in a month|refilling in a month", 1, "Month"),
        (r"quarterly|every 3 months|once in 3 months|approx(?:imately)?\s*30-?45 days|approx(?:imately)?\s*30 days", 3, "Month"),
        (r"semi[\s-]?annual|half yearly|every 6 months|6 month once", 6, "Month"),
        (r"yearly|once in a year|annual|every year", 1, "Year"),
    ]
    for pat, val, unit in patterns:
        if re.search(pat, raw):
            return {"frequency_type": "Time Based", "interval_value": val, "interval_unit": unit, "trigger_hours": None}
    if re.search(r"as required|when required|condition|if needed|if required|whenever", raw):
        return {"frequency_type": "Condition Based", "interval_value": None, "interval_unit": None, "trigger_hours": None}
    # default weekly if unknown
    return {"frequency_type": "Time Based", "interval_value": 1, "interval_unit": "Week", "trigger_hours": None}


def is_compulsory(freq: dict, text: str) -> bool:
    """Opinion: daily + safety/air/emergency related = compulsory."""
    t = norm(text)
    if freq.get("frequency_type") == "Time Based" and freq.get("interval_unit") == "Day" and freq.get("interval_value") == 1:
        return True
    if re.search(r"emergency|limit switch|air pressure|fire detector|safety", t):
        return True
    return False


def cell_text(tc) -> str:
    texts = []
    for t in tc.findall(".//w:t", NS):
        if t.text:
            texts.append(t.text)
        if t.tail:
            texts.append(t.tail)
    return re.sub(r"\s+", " ", "".join(texts)).strip()


def header_machine(z: ZipFile, header_path: str | None):
    if not header_path:
        return None, None
    hp = "word/" + header_path.lstrip("/")
    if hp not in z.namelist():
        return None, None
    hroot = ET.fromstring(z.read(hp))
    texts = [t.text for t in hroot.findall(".//w:t", NS) if t.text and t.text.strip()]
    joined = re.sub(r"\s+", " ", " ".join(texts))
    m = re.search(r"M\s*achine\s*:\s*(.+?)\s*Machine ID\s*:\s*([A-Z0-9\-]+)", joined, re.I)
    if not m:
        m = re.search(r"Machine\s*:\s*(.+?)\s*Machine ID\s*:\s*([A-Z0-9\-]+)", joined, re.I)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return None, None


def parse_docx(path: Path) -> list[dict]:
    with ZipFile(path) as z:
        rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
        rid_to_target = {rel.attrib.get("Id"): rel.attrib.get("Target") for rel in rels}
        root = ET.fromstring(z.read("word/document.xml"))
        body = root.find("w:body", NS)
        sheets = []
        pending_rows: list[list[list[str]]] = []
        for child in list(body):
            tag = child.tag.split("}")[-1]
            if tag == "tbl":
                rows = []
                for tr in child.findall("./w:tr", NS):
                    cells = [cell_text(tc) for tc in tr.findall("./w:tc", NS)]
                    if any(cells):
                        rows.append(cells)
                pending_rows.append(rows)
            sect = None
            if tag == "p":
                sect = child.find("./w:pPr/w:sectPr", NS)
            elif tag == "sectPr":
                sect = child
            if sect is not None:
                href = None
                for hr in sect.findall(".//w:headerReference", NS):
                    typ = hr.attrib.get(f"{{{NS['w']}}}type")
                    if typ in (None, "default"):
                        href = hr.attrib.get(f"{{{NS['r']}}}id")
                        break
                if href is None:
                    hrs = sect.findall(".//w:headerReference", NS)
                    if hrs:
                        href = hrs[0].attrib.get(f"{{{NS['r']}}}id")
                name, mid = header_machine(z, rid_to_target.get(href))
                sheets.append({"machine": name, "machine_id_code": mid, "tables": pending_rows})
                pending_rows = []
    return sheets


def extract_checkpoints(tables: list) -> list[dict]:
    out = []
    for rows in tables:
        for cells in rows:
            cleaned = [c for c in cells if c]
            if not cleaned:
                continue
            low = " ".join(cleaned).lower()
            if "check point" in low and "frequency" in low:
                continue
            if cleaned[0].lower() in ("sl. no", "sl no", "sl.no"):
                continue
            text = None
            freq = None
            if len(cleaned) >= 2 and re.fullmatch(r"\d+", cleaned[0]):
                text = cleaned[1]
                if len(cleaned) >= 3:
                    freq = cleaned[2]
            else:
                # first long cell
                for c in cleaned:
                    if re.fullmatch(r"\d+", c):
                        continue
                    if c.lower() in ("daily", "weekly", "monthly", "yearly", "frequency", "remarks"):
                        continue
                    if len(c) >= 8:
                        text = c
                        break
                for c in cleaned:
                    if re.search(r"daily|weekly|monthly|yearly|once|hour|day|week|month|approx|half", c.lower()):
                        if c != text:
                            freq = c
                            break
            if not text or len(text) < 5:
                continue
            out.append({"text": text.strip(), "freq": (freq or "").strip() or None})
    return out


def machine_label(m: Machine) -> str:
    parts = [getattr(m, "make", None) or "", getattr(m, "model", None) or ""]
    return " ".join(p for p in parts if p).strip() or f"Machine {m.id}"


def score_machine(sheet_name: str, sheet_code: str | None, m: Machine) -> float:
    label = machine_label(m)
    n_sheet = norm(sheet_name or "")
    n_label = norm(label)
    n_make = norm(getattr(m, "make", "") or "")
    n_model = norm(getattr(m, "model", "") or "")
    score = SequenceMatcher(None, n_sheet, n_label).ratio()
    # boost token overlaps
    sheet_toks = set(re.findall(r"[a-z0-9]+", n_sheet))
    label_toks = set(re.findall(r"[a-z0-9]+", n_label + " " + n_make + " " + n_model))
    if sheet_toks and label_toks:
        overlap = len(sheet_toks & label_toks) / max(len(sheet_toks), 1)
        score = max(score, overlap)
    # special aliases
    aliases = {
        "mazak": ["mazak", "quick", "turn", "sqt"],
        "pinacho": ["pinacho"],
        "spinner": ["spinner", "tc", "46"],
        "bfw": ["bfw", "bmv"],
        "mikron": ["mikron", "wf41", "wf"],
        "mitsubishi": ["mitsubishi", "mv5c", "mv"],
        "ona": ["ona", "qx3f"],
        "multicut": ["multicut"],
        "malwa": ["malwa"],
        "heller": ["heller"],
        "dmu": ["dmu", "dmc", "deckel", "maho"],
        "stallion": ["stallion"],
        "studer": ["studer", "rhu"],
        "schublin": ["schublin", "schaublin"],
        "kellenberger": ["kellenberger"],
        "stc": ["stc"],
        "magerle": ["magerle"],
        "voumard": ["voumard"],
        "reisauer": ["reisauer", "reishauer"],
        "tekcel": ["tekcel", "teckel", "txle"],
        "sparmatic": ["sparmatic", "jig", "jigmill"],
        "deckel": ["deckel", "maho", "dmu"],
    }
    for key, toks in aliases.items():
        if key in n_sheet or any(t in n_sheet for t in toks[:1]):
            if any(t in n_label for t in toks):
                score = max(score, 0.85)
    return score


# Explicit sheet-name / code fragments → preferred DB machine id (when present)
EXPLICIT_MAP = [
    (r"mazak|sqt", 24),
    (r"pinacho", 27),
    (r"spinner|tc-?\s*46", 23),
    (r"bfw|bmv-?\s*50", 18),
    (r"mikron|wf\s*41", 16),
    (r"mitsubishi|mv\s*5c", 15),
    (r"ona|qx3f", 35),
    (r"multicut", 50),
    (r"malwa", 51),
    (r"stallion", 22),
    (r"studer|rhu\s*650", 32),
    (r"schaublin.?125.?i\b|schublin.?125.?i\b", 28),
    (r"schaublin.?125.?ii|schublin.?125.?ii", 29),
    (r"kellenberger", 30),
    (r"\bstc-?\s*25\b|\bstc25\b", 26),
    (r"magerle", 33),
    (r"voumard", 31),
    (r"reishauer|reisauer", 34),
    (r"teckel|tekcel|txle", 25),
    (r"dmc\s*80|dmu\s*80", 21),
    (r"dmc\s*60|dmu\s*60", 20),
    (r"dmc\s*125|dmu\s*125|deckel maho dmc 125|deckel machine", 13),
    (r"ace|ams\s*850|micromatic", 14),
    (r"jig\s*mill|sparmatic|herders", 19),
    (r"tds|tda", 17),
]


def resolve_machine_id(sheet_name: str, sheet_code: str | None, machines: list[Machine]) -> Machine | None:
    n = norm(f"{sheet_name or ''} {sheet_code or ''}")
    by_id = {m.id: m for m in machines}
    for pat, mid in EXPLICIT_MAP:
        if re.search(pat, n, re.I) and mid in by_id:
            return by_id[mid]
    # strict fuzzy only
    ranked = sorted(
        ((score_machine(sheet_name or "", sheet_code, m), m) for m in machines),
        key=lambda x: x[0],
        reverse=True,
    )
    if ranked and ranked[0][0] >= 0.78:
        return ranked[0][1]
    return None


def match_machines(sheets: list[dict], machines: list[Machine]) -> dict[int, list[dict]]:
    """Return machine_id -> list of checkpoint dicts (merged sheets)."""
    by_machine: dict[int, list[dict]] = defaultdict(list)
    unmatched = []

    for s in sheets:
        name = s.get("machine")
        code = s.get("machine_id_code")
        cps = extract_checkpoints(s.get("tables") or [])
        if not name or not cps:
            continue
        best = resolve_machine_id(name, code, machines)
        if not best:
            unmatched.append((name, code, len(cps)))
            continue
        by_machine[best.id].extend(cps)
        print(f"  MAP sheet '{name}' ({code}) -> machine {best.id} {machine_label(best)} cps={len(cps)}")

    if unmatched:
        print("\nSkipped sheets (no matching DB machine):")
        for u in unmatched:
            print(f"  skip {u[0]} ({u[1]}) cps={u[2]}")
    return by_machine


def find_checklist_item(items_by_key: dict, text: str) -> PMChecklistItem | None:
    key = collapse_key(text)
    if key in items_by_key:
        return items_by_key[key]
    # fuzzy fallback within same group
    best = None
    best_score = 0.0
    for k, item in items_by_key.items():
        sc = SequenceMatcher(None, key, k).ratio()
        if sc > best_score:
            best_score = sc
            best = item
    if best_score >= 0.72:
        return best
    return None


def main() -> None:
    docx = DOCX if DOCX.exists() else SHARE_DOCX
    if not docx.exists():
        raise SystemExit(f"DOCX not found: {docx}")
    if SHARE_DOCX.exists():
        try:
            DOCX.parent.mkdir(parents=True, exist_ok=True)
            DOCX.write_bytes(SHARE_DOCX.read_bytes())
            docx = DOCX
            print(f"Copied share doc -> {docx}")
        except Exception as e:
            print(f"Share copy skipped: {e}")

    print(f"Parsing {docx} ...")
    sheets = parse_docx(docx)
    print(f"Sections/sheets: {len(sheets)}")

    db = SessionLocal()
    try:
        machines = db.query(Machine).order_by(Machine.id).all()
        checklists = (
            db.query(PMChecklist)
            .filter(PMChecklist.name.in_(THEMATIC_NAMES))
            .all()
        )
        items = (
            db.query(PMChecklistItem)
            .filter(PMChecklistItem.checklist_id.in_([c.id for c in checklists]))
            .all()
        )
        items_by_key = {}
        for it in items:
            items_by_key[collapse_key(it.item_text)] = it
        checklist_by_name = {c.name: c for c in checklists}

        print(f"DB machines={len(machines)} thematic_items={len(items)}")
        mapped = match_machines(sheets, machines)

        # Build planned assignment rows: machine_id -> checklist_id -> [configs]
        plans: dict[int, dict[int, list[dict]]] = defaultdict(lambda: defaultdict(list))
        missing_master = []
        total_cps = 0

        for machine_id, cps in mapped.items():
            # dedupe by collapse_key within machine (keep first / richer freq)
            seen = OrderedDict()
            for cp in cps:
                key = collapse_key(cp["text"])
                if key not in seen:
                    seen[key] = cp
                elif cp.get("freq") and not seen[key].get("freq"):
                    seen[key] = cp
            for cp in seen.values():
                item = find_checklist_item(items_by_key, cp["text"])
                if not item:
                    # ensure exists under thematic group
                    gname = group_of(cp["text"])
                    cl = checklist_by_name.get(gname)
                    if not cl:
                        missing_master.append(cp["text"])
                        continue
                    # create missing master checkpoint (no frequency on master)
                    seq = (
                        db.query(PMChecklistItem)
                        .filter(PMChecklistItem.checklist_id == cl.id)
                        .count()
                    ) + 1
                    item = PMChecklistItem(
                        checklist_id=cl.id,
                        item_text=cp["text"].strip(),
                        sequence_number=seq,
                        item_type="Boolean",
                        expected_value="Yes",
                        remarks=None,
                    )
                    db.add(item)
                    db.flush()
                    items_by_key[collapse_key(item.item_text)] = item
                    print(f"  + master checkpoint under {gname}: {item.item_text[:70]}")

                freq = parse_frequency(cp.get("freq"), cp["text"])
                compulsory = is_compulsory(freq, cp["text"])
                plans[machine_id][item.checklist_id].append({
                    "checklist_item_id": item.id,
                    "is_required": True,
                    "is_compulsory": compulsory,
                    **freq,
                })
                total_cps += 1

        db.commit()  # persist any new master items

        print(f"\nPlanned machine-checkpoint links: {total_cps}")
        print(f"Machines with plans: {len(plans)}")
        if missing_master:
            print(f"Unresolved texts: {len(missing_master)}")

        # Wipe operational PM data
        sub_n = db.query(PMCheckpointSubmission).delete(synchronize_session=False)
        sch_n = db.query(PMSchedule).delete(synchronize_session=False)
        ai_n = db.query(PMAssignmentItem).delete(synchronize_session=False)
        asg_n = db.query(PMMachineAssignment).delete(synchronize_session=False)
        print(f"Wiped submissions={sub_n} schedules={sch_n} assignment_items={ai_n} assignments={asg_n}")

        created_asg = 0
        created_items = 0
        for machine_id, by_cl in sorted(plans.items()):
            for checklist_id, configs in by_cl.items():
                # unique by checklist_item_id
                uniq = OrderedDict()
                for cfg in configs:
                    uniq[cfg["checklist_item_id"]] = cfg
                configs = list(uniq.values())
                assignment = PMMachineAssignment(
                    machine_id=machine_id,
                    checklist_id=checklist_id,
                    assigned_by=ASSIGNED_BY,
                )
                db.add(assignment)
                db.flush()
                created_asg += 1
                for cfg in configs:
                    ai = PMAssignmentItem(
                        assignment_id=assignment.id,
                        checklist_item_id=cfg["checklist_item_id"],
                        is_required=True,
                        is_compulsory=bool(cfg["is_compulsory"]),
                        frequency_type=cfg["frequency_type"],
                        interval_value=cfg["interval_value"],
                        interval_unit=cfg["interval_unit"],
                        trigger_hours=cfg["trigger_hours"],
                    )
                    db.add(ai)
                    db.flush()
                    create_initial_schedule(db, ai)
                    created_items += 1

        db.commit()
        print(f"\nCreated assignments={created_asg} assignment_items={created_items}")

        # Summary per machine
        print("\nPer-machine assigned checkpoint counts:")
        for machine_id in sorted(plans.keys()):
            n = sum(len(v) for v in plans[machine_id].values())
            m = next(x for x in machines if x.id == machine_id)
            print(f"  machine {machine_id} {machine_label(m)}: {n} checkpoints")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

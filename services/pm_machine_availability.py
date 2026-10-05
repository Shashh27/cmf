"""
Machine ON/OFF from scheduling.machine_status for Preventive Maintenance.

scheduling.status: 1 = ON, 2 = OFF (breakdown).
When OFF, available_from → available_to is the downtime window (available_to can be extended).
"""
from datetime import date, datetime
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

OFF_STATUS_ID = 2


def _as_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except (TypeError, ValueError):
        return None


def _is_off(status_id: Any, status_name: Any) -> bool:
    name = str(status_name or "").strip().lower()
    if name == "on":
        return False
    if "off" in name:
        return True
    try:
        return int(status_id) == OFF_STATUS_ID
    except (TypeError, ValueError):
        return False


def fetch_machine_availability(db: Session) -> Dict[int, dict]:
    """Current scheduling.machine_status keyed by machine_id."""
    try:
        rows = db.execute(text("""
            SELECT ms.machine_id, ms.status_id, s.name AS status_name,
                   ms.available_from, ms.available_to, ms.description
            FROM scheduling.machine_status ms
            LEFT JOIN scheduling.status s ON s.id = ms.status_id
        """))
    except Exception:
        db.rollback()
        return {}

    out: Dict[int, dict] = {}
    for r in rows:
        mid = r[0]
        if mid is None:
            continue
        status_id = r[1]
        status_name = r[2]
        out[int(mid)] = {
            "machine_id": int(mid),
            "status_id": status_id,
            "status_name": status_name,
            "is_breakdown": _is_off(status_id, status_name),
            "available_from": r[3].isoformat() if r[3] is not None else None,
            "available_to": r[4].isoformat() if r[4] is not None else None,
            "description": r[5],
        }
    return out


def is_machine_down_on(info: Optional[dict], day: date, today: Optional[date] = None) -> bool:
    """True when the machine is OFF and `day` falls in available_from..available_to."""
    if not info or not info.get("is_breakdown"):
        return False
    today = today or date.today()
    start = _as_date(info.get("available_from"))
    end = _as_date(info.get("available_to"))
    if start and day < start:
        return False
    if end and day > end:
        return False
    if end is None and day > today:
        return False
    return True


def is_machine_id_down_on(
    availability: Dict[int, dict],
    machine_id: Optional[int],
    day: date,
    today: Optional[date] = None,
) -> bool:
    if machine_id is None:
        return False
    return is_machine_down_on(availability.get(int(machine_id)), day, today)

"""Helpers for machine breakdown windows vs job-card activation."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from DB.models.scheduling import MachineStatus

STATUS_OFF = 2


def _coerce_naive(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def get_active_breakdown(
    db: Session, machine_id: int, at_time: datetime
) -> Optional[MachineStatus]:
    """Return the OFF/breakdown row covering at_time, if any."""
    at = _coerce_naive(at_time)
    return (
        db.query(MachineStatus)
        .filter(
            MachineStatus.machine_id == machine_id,
            MachineStatus.status_id == STATUS_OFF,
            MachineStatus.available_from <= at,
            or_(
                MachineStatus.available_to.is_(None),
                MachineStatus.available_to > at,
            ),
        )
        .first()
    )


def is_machine_in_breakdown_window(
    db: Session, machine_id: int, at_time: datetime
) -> bool:
    return get_active_breakdown(db, machine_id, at_time) is not None


def get_machine_breakdown_block_message(
    db: Session, machine_id: int, at_time: datetime
) -> Optional[str]:
    off = get_active_breakdown(db, machine_id, at_time)
    if not off:
        return None
    if off.available_to:
        end_label = _coerce_naive(off.available_to).strftime("%d %b %Y %H:%M")
        return (
            f"Machine is in breakdown until {end_label}. "
            "Job card activation is not allowed."
        )
    return (
        "Machine is in breakdown with no scheduled return time. "
        "Job card activation is not allowed."
    )


def get_scheduled_start_block_message(
    planned_start: Optional[datetime], at_time: datetime
) -> Optional[str]:
    if not planned_start:
        return None
    start = _coerce_naive(planned_start)
    now = _coerce_naive(at_time)
    if now < start:
        return (
            f"Cannot activate until scheduled start time "
            f"({start.strftime('%d %b %Y %H:%M')})."
        )
    return None


def get_job_card_activation_block_message(
    db: Session,
    machine_id: int,
    planned_start: Optional[datetime],
    at_time: Optional[datetime] = None,
) -> Optional[str]:
    """First blocking reason for job-card activation, or None if allowed."""
    now = at_time or datetime.now()
    breakdown_msg = get_machine_breakdown_block_message(db, machine_id, now)
    if breakdown_msg:
        return breakdown_msg
    return get_scheduled_start_block_message(planned_start, now)

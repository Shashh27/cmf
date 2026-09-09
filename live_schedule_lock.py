"""
Shared PostgreSQL advisory lock for writers of scheduling.rescheduling_items.

Scheduler #2 (Rescheduler / dynamic_reschedule) uses this so concurrent
reschedule calls do not interleave DELETE/INSERT on the live table.

Non-PostgreSQL dialects (SQLite tests) are a no-op that always acquires.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ASCII "LIVE" — dedicated key, not the order-part-priority lock.
LIVE_SCHEDULE_LOCK_KEY = 0x4C495645


def _is_postgres(db: Session) -> bool:
    bind = db.get_bind()
    return bool(bind is not None and bind.dialect.name == "postgresql")


def try_acquire_live_schedule_lock(db: Session, blocking: bool = True) -> bool:
    """Acquire the shared live-schedule lock. Returns False if try-lock misses."""
    if not _is_postgres(db):
        return True
    try:
        if blocking:
            db.execute(
                text("SELECT pg_advisory_lock(:key)"),
                {"key": LIVE_SCHEDULE_LOCK_KEY},
            )
            return True
        got = db.execute(
            text("SELECT pg_try_advisory_lock(:key)"),
            {"key": LIVE_SCHEDULE_LOCK_KEY},
        ).scalar()
        return bool(got)
    except Exception:
        logger.exception("Failed to acquire live schedule advisory lock")
        return False


def release_live_schedule_lock(db: Session) -> None:
    if not _is_postgres(db):
        return
    try:
        db.execute(
            text("SELECT pg_advisory_unlock(:key)"),
            {"key": LIVE_SCHEDULE_LOCK_KEY},
        )
    except Exception:
        logger.exception("Failed to release live schedule advisory lock")


@contextmanager
def live_schedule_lock(db: Session, blocking: bool = True) -> Iterator[bool]:
    """
    Yield True if the lock was acquired.

    Periodic reconciliation should use blocking=False and skip the tick
    when another writer holds the lock.
    """
    acquired = False
    try:
        acquired = try_acquire_live_schedule_lock(db, blocking=blocking)
        yield acquired
    finally:
        if acquired:
            release_live_schedule_lock(db)

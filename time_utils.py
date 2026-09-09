"""Shop-floor clock: naive India Standard Time.

Does NOT blindly add 5 hours 30 minutes to whatever the OS thinks local time is.

datetime.now(IST) converts the current UTC instant into IST:
  - Local Windows already on IST:  09:45 IST → 09:45  (same as datetime.now())
  - Docker / python:slim on UTC:   04:15 UTC → 09:45 IST

India has no DST, so a fixed +05:30 offset is correct and needs no tzdata.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Current wall-clock time in IST, stored naive (matches DB DateTime columns)."""
    return datetime.now(IST).replace(tzinfo=None)


def to_naive_ist(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalise a datetime to naive IST for comparisons with stored schedule times.

    Naive values are left as-is (they are already stored as IST).
    Aware values (typically UTC) are converted to IST, not stripped to UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(IST).replace(tzinfo=None)

"""Per-request audit user context.

The FastAPI middleware stores the logged-in user here; a SQLAlchemy
``after_begin`` listener (see database.py) copies it into transaction-local
PostgreSQL settings (``app.current_user*``) so the audit trigger can record
who made each change.
"""

from contextvars import ContextVar
from typing import Optional, TypedDict


class AuditUser(TypedDict):
    id: Optional[int]
    name: Optional[str]
    role: Optional[str]


_current_audit_user: ContextVar[Optional[AuditUser]] = ContextVar(
    "current_audit_user", default=None
)


def set_audit_user(
    user_id: Optional[int],
    name: Optional[str],
    role: Optional[str],
):
    """Store the acting user for this request; returns a reset token."""
    return _current_audit_user.set(
        {"id": user_id, "name": name, "role": role}
    )


def reset_audit_user(token) -> None:
    try:
        _current_audit_user.reset(token)
    except (ValueError, LookupError):
        pass


def get_audit_user() -> Optional[AuditUser]:
    return _current_audit_user.get()

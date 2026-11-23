"""Canonical role names and normalization."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from fastapi import HTTPException, status

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from DB.models.access_control import AccessUser

CANONICAL_ROLES = frozenset(
    {
        "admin",
        "project_coordinator",
        "manufacturing_coordinator",
        "supervisor",
        "inventory_supervisor",
        "operator",
        "quality_assurance",
    }
)

# Map common display / spaced variants → snake_case
_ROLE_ALIASES = {
    "admin": "admin",
    "project coordinator": "project_coordinator",
    "project_coordinator": "project_coordinator",
    "pc": "project_coordinator",
    "coordinator": "project_coordinator",
    "manufacturing coordinator": "manufacturing_coordinator",
    "manufacturing_coordinator": "manufacturing_coordinator",
    "mc": "manufacturing_coordinator",
    "supervisor": "supervisor",
    "inventory supervisor": "inventory_supervisor",
    "inventory_supervisor": "inventory_supervisor",
    "operator": "operator",
    "quality assurance": "quality_assurance",
    "quality_assurance": "quality_assurance",
    "qa": "quality_assurance",
}


def normalize_role(role: str | None) -> str:
    if not role:
        return ""
    key = str(role).strip().lower().replace("_", " ")
    # Prefer spaced lookup, then snake
    spaced = key
    snaked = key.replace(" ", "_")
    if spaced in _ROLE_ALIASES:
        return _ROLE_ALIASES[spaced]
    if snaked in _ROLE_ALIASES:
        return _ROLE_ALIASES[snaked]
    return snaked


def is_qa_role(role: str | None) -> bool:
    return normalize_role(role) == "quality_assurance"


def roles_match(role_a: str | None, role_b: str | None) -> bool:
    a = normalize_role(role_a)
    b = normalize_role(role_b)
    if not a or not b:
        return False
    if a == b:
        return True
    return is_qa_role(a) and is_qa_role(b)


def can_download_by_uploader_role(
    uploader_role: str | None,
    current_user_role: str | None,
) -> bool:
    """
    Download rules (matches frontend documentAccess):
    - QA-uploaded docs → any logged-in role may download
    - otherwise → only when current user role matches uploader role
    Preview endpoints stay auth-only (no role match).
    """
    if is_qa_role(uploader_role):
        return True
    return roles_match(uploader_role, current_user_role)


def ensure_can_download_document(
    *,
    db: "Session",
    uploader_user_id: Optional[int],
    current_user: "AccessUser",
    uploader_role: Optional[str] = None,
) -> None:
    """
    Raise 403 unless the current session role may download the document.

    Uses uploaded_role (role at upload time) when provided. Same person logged
    in as a different role cannot download (e.g. MC upload → PC session denied).
    """
    from DB.models.access_control import AccessUser

    resolved_uploader_role = uploader_role
    if resolved_uploader_role is None and uploader_user_id:
        uploader = db.query(AccessUser).filter(AccessUser.id == uploader_user_id).first()
        resolved_uploader_role = getattr(uploader, "role", None) if uploader else None

    if can_download_by_uploader_role(
        resolved_uploader_role,
        getattr(current_user, "role", None),
    ):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only the uploading role can download this document.",
    )


def get_user_roles(db: "Session", user: "AccessUser") -> list[str]:
    """
    Allowed roles for a user: junction rows + primary access_users.role.
    Primary is always included for back-compat when the junction is empty.
    """
    from DB.models.access_control import AccessUserRole

    ordered: list[str] = []
    seen: set[str] = set()

    def _add(raw: str | None) -> None:
        n = normalize_role(raw)
        if n and n not in seen:
            seen.add(n)
            ordered.append(n)

    _add(getattr(user, "role", None))
    try:
        rows = (
            db.query(AccessUserRole)
            .filter(AccessUserRole.user_id == user.id)
            .all()
        )
        for row in rows:
            _add(row.role)
    except Exception:
        # Table may not exist yet before migration; primary role alone still works.
        pass
    return ordered


def user_has_role(db: "Session", user: "AccessUser", role: str | None) -> bool:
    want = normalize_role(role)
    if not want:
        return False
    return want in set(get_user_roles(db, user))


def sync_user_roles(
    db: "Session",
    user_id: int,
    *,
    primary_role: str | None,
    roles: Optional[list[str]] = None,
) -> list[str]:
    """Replace junction rows. Always includes primary_role."""
    from DB.models.access_control import AccessUserRole

    wanted: list[str] = []
    seen: set[str] = set()

    def _add(raw: str | None) -> None:
        n = normalize_role(raw)
        if n and n not in seen:
            seen.add(n)
            wanted.append(n)

    _add(primary_role)
    for r in roles or []:
        _add(r)

    if not wanted:
        return []

    db.query(AccessUserRole).filter(AccessUserRole.user_id == user_id).delete()
    for role in wanted:
        db.add(AccessUserRole(user_id=user_id, role=role))
    return wanted


def resolve_login_role(
    db: "Session",
    user: "AccessUser",
    requested_role: str | None,
) -> str:
    """
    Pick the active session role for login.
    - If requested_role is set, it must be in the user's allowed roles.
    - Otherwise use primary access_users.role.
    """
    allowed = get_user_roles(db, user)
    primary = normalize_role(getattr(user, "role", None))
    requested = normalize_role(requested_role) if requested_role else ""

    if not requested:
        return primary or (allowed[0] if allowed else "")

    if requested not in set(allowed):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have the '{requested}' role. Allowed: {', '.join(allowed) or primary}",
        )
    return requested

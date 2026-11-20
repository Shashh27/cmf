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
    """Raise 403 unless the current user may download/preview the document."""
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

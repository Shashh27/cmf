"""Canonical role names and normalization."""

CANONICAL_ROLES = frozenset(
    {
        "admin",
        "project_coordinator",
        "manufacturing_coordinator",
        "supervisor",
        "inventory_supervisor",
        "operator",
    }
)

# Map common display / spaced variants → snake_case
_ROLE_ALIASES = {
    "admin": "admin",
    "project coordinator": "project_coordinator",
    "project_coordinator": "project_coordinator",
    "manufacturing coordinator": "manufacturing_coordinator",
    "manufacturing_coordinator": "manufacturing_coordinator",
    "supervisor": "supervisor",
    "inventory supervisor": "inventory_supervisor",
    "inventory_supervisor": "inventory_supervisor",
    "operator": "operator",
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

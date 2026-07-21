"""Auth helpers: password hashing, role normalization, JWT, scope."""

from auth.roles import normalize_role
from auth.deps import get_current_user, require_roles
from auth.scope import scope_ids_from_user, apply_order_role_scope

__all__ = [
    "normalize_role",
    "get_current_user",
    "require_roles",
    "scope_ids_from_user",
    "apply_order_role_scope",
]

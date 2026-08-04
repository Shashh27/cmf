"""Map authenticated user role → data-scoping fields (admin / MC / PC / user)."""

from typing import Any, Optional

from auth.roles import normalize_role


def scope_ids_from_user(user: Any) -> dict[str, Optional[int]]:
    """
    Return filter kwargs derived from JWT identity.
    Only one of admin_id / manufacturing_coordinator_id / project_coordinator_id / user_id
    is set for role-scoped list endpoints.
    """
    role = normalize_role(getattr(user, "role", None))
    uid = int(user.id)
    if role == "admin":
        return {
            "admin_id": uid,
            "manufacturing_coordinator_id": None,
            "project_coordinator_id": None,
            "user_id": None,
            "mc_id": None,
            "pc_id": None,
        }
    if role == "manufacturing_coordinator":
        return {
            "admin_id": None,
            "manufacturing_coordinator_id": uid,
            "project_coordinator_id": None,
            "user_id": None,
            "mc_id": uid,
            "pc_id": None,
        }
    if role == "project_coordinator":
        return {
            "admin_id": None,
            "manufacturing_coordinator_id": None,
            "project_coordinator_id": uid,
            "user_id": None,
            "mc_id": None,
            "pc_id": uid,
        }
    return {
        "admin_id": None,
        "manufacturing_coordinator_id": None,
        "project_coordinator_id": None,
        "user_id": uid,
        "mc_id": None,
        "pc_id": None,
    }


def apply_order_role_scope(query, order_model, user: Any):
    """Filter an Order query by the caller's role ownership columns."""
    role = normalize_role(getattr(user, "role", None))
    uid = int(user.id)
    if role == "admin":
        return query.filter(order_model.admin_id == uid)
    if role == "manufacturing_coordinator":
        return query.filter(order_model.manufacturing_coordinator_id == uid)
    if role == "project_coordinator":
        return query.filter(order_model.project_coordinator_id == uid)
    return query.filter(order_model.user_id == uid)

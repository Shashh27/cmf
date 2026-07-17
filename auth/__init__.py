"""Auth helpers (password hashing + role normalization). JWT removed."""

from auth.roles import normalize_role

__all__ = ["normalize_role"]

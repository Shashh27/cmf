"""Ensure refresh_tokens table matches the current JWT model."""

from sqlalchemy import inspect, text

from DB.database import engine
from DB.models.refresh_token import RefreshToken

_REQUIRED_COLUMNS = {"id", "user_id", "jti", "token_hash", "expires_at", "revoked", "created_at"}


def ensure_refresh_tokens_schema() -> None:
    """Recreate refresh_tokens if an older schema is present (missing jti, etc.)."""
    insp = inspect(engine)
    if not insp.has_table("refresh_tokens", schema="accesscontrol"):
        RefreshToken.__table__.create(bind=engine, checkfirst=True)
        return

    existing = {c["name"] for c in insp.get_columns("refresh_tokens", schema="accesscontrol")}
    if _REQUIRED_COLUMNS.issubset(existing):
        return

    print("WARN: refresh_tokens schema outdated — recreating table for JWT auth")
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS accesscontrol.refresh_tokens CASCADE"))
    RefreshToken.__table__.create(bind=engine, checkfirst=True)
    print("SUCCESS: refresh_tokens table recreated")

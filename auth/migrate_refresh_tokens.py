"""Refresh-token table checks.

DDL belongs to Alembic / cmf_owner — not the runtime cmf_app role.
Set ALLOW_AUTO_SCHEMA=true only for temporary local bootstrap.
"""

import os

from sqlalchemy import inspect, text

from DB.database import engine
from DB.models.refresh_token import RefreshToken

_REQUIRED_COLUMNS = {"id", "user_id", "jti", "token_hash", "expires_at", "revoked", "created_at"}


def _auto_schema_enabled() -> bool:
    return os.getenv("ALLOW_AUTO_SCHEMA", "false").lower() in ("1", "true", "yes")


def ensure_refresh_tokens_schema() -> None:
    """Verify refresh_tokens shape; optionally recreate if ALLOW_AUTO_SCHEMA=true."""
    insp = inspect(engine)
    if not insp.has_table("refresh_tokens", schema="accesscontrol"):
        if _auto_schema_enabled():
            RefreshToken.__table__.create(bind=engine, checkfirst=True)
            print("SUCCESS: refresh_tokens table created (ALLOW_AUTO_SCHEMA)")
            return
        print(
            "WARN: accesscontrol.refresh_tokens missing — "
            "run Alembic as cmf_owner (see backend/alembic)"
        )
        return

    existing = {c["name"] for c in insp.get_columns("refresh_tokens", schema="accesscontrol")}
    if _REQUIRED_COLUMNS.issubset(existing):
        return

    if not _auto_schema_enabled():
        print(
            "WARN: refresh_tokens schema outdated — "
            "run: alembic upgrade head (as cmf_owner / MIGRATION_DATABASE_URL)"
        )
        return

    print("WARN: refresh_tokens schema outdated — recreating table for JWT auth")
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS accesscontrol.refresh_tokens CASCADE"))
    RefreshToken.__table__.create(bind=engine, checkfirst=True)
    print("SUCCESS: refresh_tokens table recreated (ALLOW_AUTO_SCHEMA)")

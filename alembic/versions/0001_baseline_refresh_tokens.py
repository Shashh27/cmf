"""Baseline + ensure accesscontrol.refresh_tokens for JWT auth.

Existing databases: after applying roles SQL, run:
  alembic stamp 0001_baseline
only if this revision is already reflected in the live schema.
Otherwise run:
  alembic upgrade head
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS accesscontrol")
    # Create refresh_tokens if missing (idempotent for existing installs).
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS accesscontrol.refresh_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL
                REFERENCES accesscontrol.access_users(id) ON DELETE CASCADE,
            jti VARCHAR(64) NOT NULL UNIQUE,
            token_hash VARCHAR(128) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id "
        "ON accesscontrol.refresh_tokens (user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_jti "
        "ON accesscontrol.refresh_tokens (jti)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS accesscontrol.refresh_tokens CASCADE")

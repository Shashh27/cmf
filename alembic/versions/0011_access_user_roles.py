"""Add access_user_roles for multi-role users; backfill from access_users.role."""

from typing import Sequence, Union

from alembic import op

# Keep revision id <= 32 chars (alembic_version.version_num)
revision: str = "0011_user_roles"
down_revision: Union[str, None] = "0010_urgent_jobs_maintenance_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS accesscontrol.access_user_roles (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL
                REFERENCES accesscontrol.access_users(id) ON DELETE CASCADE,
            role VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT uq_access_user_roles_user_role UNIQUE (user_id, role)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_access_user_roles_user_id
        ON accesscontrol.access_user_roles (user_id)
        """
    )
    # Backfill: every existing user gets their primary role as an allowed role
    op.execute(
        """
        INSERT INTO accesscontrol.access_user_roles (user_id, role)
        SELECT u.id, u.role
        FROM accesscontrol.access_users u
        WHERE u.role IS NOT NULL AND TRIM(u.role) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM accesscontrol.access_user_roles r
            WHERE r.user_id = u.id AND r.role = u.role
          )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS accesscontrol.access_user_roles")

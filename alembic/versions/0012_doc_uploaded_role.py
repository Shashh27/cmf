"""Add uploaded_role to document tables for session-role download gating."""

from typing import Sequence, Union

from alembic import op

revision: str = "0012_doc_uploaded_role"
down_revision: Union[str, None] = "0011_user_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE oms.documents ADD COLUMN IF NOT EXISTS uploaded_role VARCHAR"
    )
    op.execute(
        "ALTER TABLE oms.operation_documents ADD COLUMN IF NOT EXISTS uploaded_role VARCHAR"
    )
    op.execute(
        "ALTER TABLE oms.order_documents ADD COLUMN IF NOT EXISTS uploaded_role VARCHAR"
    )
    # Backfill from uploader's primary role for existing rows
    op.execute(
        """
        UPDATE oms.documents d
        SET uploaded_role = u.role
        FROM accesscontrol.access_users u
        WHERE d.user_id = u.id
          AND d.uploaded_role IS NULL
          AND u.role IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE oms.operation_documents d
        SET uploaded_role = u.role
        FROM accesscontrol.access_users u
        WHERE d.user_id = u.id
          AND d.uploaded_role IS NULL
          AND u.role IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE oms.order_documents d
        SET uploaded_role = u.role
        FROM accesscontrol.access_users u
        WHERE d.user_id = u.id
          AND d.uploaded_role IS NULL
          AND u.role IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE oms.documents DROP COLUMN IF EXISTS uploaded_role")
    op.execute("ALTER TABLE oms.operation_documents DROP COLUMN IF EXISTS uploaded_role")
    op.execute("ALTER TABLE oms.order_documents DROP COLUMN IF EXISTS uploaded_role")

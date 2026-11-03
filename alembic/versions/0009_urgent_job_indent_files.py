"""Add dept fields and drawing attachments for PC right-now job indents."""

from typing import Sequence, Union

from alembic import op

revision: str = "0009_urgent_job_indent_files"
down_revision: Union[str, None] = "0008_urgent_job_indents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE oms.urgent_job_indents
            ADD COLUMN IF NOT EXISTS from_dept VARCHAR,
            ADD COLUMN IF NOT EXISTS to_dept VARCHAR,
            ADD COLUMN IF NOT EXISTS project_no VARCHAR,
            ADD COLUMN IF NOT EXISTS project_name VARCHAR
        """
    )
    op.execute("ALTER TABLE oms.urgent_job_indents ALTER COLUMN order_id DROP NOT NULL")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS oms.urgent_job_indent_attachments (
            id SERIAL PRIMARY KEY,
            indent_id INTEGER NOT NULL REFERENCES oms.urgent_job_indents(id) ON DELETE CASCADE,
            kind VARCHAR NOT NULL,
            file_name VARCHAR NOT NULL,
            file_type VARCHAR NOT NULL,
            file_size INTEGER NOT NULL,
            minio_url VARCHAR NOT NULL,
            uploaded_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
            CONSTRAINT ck_urgent_job_indent_attachments_kind
                CHECK (kind IN ('2d', '3d'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_urgent_job_indent_attachments_indent ON oms.urgent_job_indent_attachments (indent_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS oms.urgent_job_indent_attachments")
    op.execute("ALTER TABLE oms.urgent_job_indents DROP COLUMN IF EXISTS from_dept")
    op.execute("ALTER TABLE oms.urgent_job_indents DROP COLUMN IF EXISTS to_dept")

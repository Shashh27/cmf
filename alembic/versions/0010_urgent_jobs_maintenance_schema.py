"""Move urgent job indents from oms to maintenance schema."""

from typing import Sequence, Union

from alembic import op

revision: str = "0010_urgent_jobs_maintenance_schema"
down_revision: Union[str, None] = "0009_urgent_job_indent_files"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS maintenance")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS maintenance.urgent_job_indents (
            id SERIAL PRIMARY KEY,
            created_by INTEGER NOT NULL REFERENCES accesscontrol.access_users(id),
            order_id INTEGER REFERENCES oms.orders(id),
            project_no VARCHAR,
            project_name VARCHAR,
            part_id INTEGER REFERENCES oms.parts(id),
            operation_id INTEGER REFERENCES oms.operations(id),
            description TEXT NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            mc_id INTEGER REFERENCES accesscontrol.access_users(id),
            mc_remark TEXT,
            reviewed_at TIMESTAMP,
            operator_id INTEGER REFERENCES accesscontrol.access_users(id),
            workcenter_id INTEGER REFERENCES configuration.work_centers(id),
            machine_id INTEGER REFERENCES configuration.machines(id),
            assigned_at TIMESTAMP,
            operator_ack BOOLEAN NOT NULL DEFAULT FALSE,
            operator_ack_at TIMESTAMP,
            mc_ack BOOLEAN NOT NULL DEFAULT FALSE,
            mc_ack_at TIMESTAMP,
            from_dept VARCHAR,
            to_dept VARCHAR,
            created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
            CONSTRAINT ck_maint_urgent_job_indents_status
                CHECK (status IN ('pending', 'accepted', 'rejected', 'assigned'))
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS maintenance.urgent_job_indent_attachments (
            id SERIAL PRIMARY KEY,
            indent_id INTEGER NOT NULL REFERENCES maintenance.urgent_job_indents(id) ON DELETE CASCADE,
            kind VARCHAR NOT NULL,
            file_name VARCHAR NOT NULL,
            file_type VARCHAR NOT NULL,
            file_size INTEGER NOT NULL,
            minio_url VARCHAR NOT NULL,
            uploaded_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
            CONSTRAINT ck_maint_urgent_job_indent_attachments_kind
                CHECK (kind IN ('2d', '3d'))
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS maintenance.urgent_job_indent_attachments")
    op.execute("DROP TABLE IF EXISTS maintenance.urgent_job_indents")

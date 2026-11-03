"""Add oms.urgent_job_indents for PC -> MC -> operator urgent jobs."""

from typing import Sequence, Union

from alembic import op

revision: str = "0008_urgent_job_indents"
down_revision: Union[str, None] = "0007_stock_quality_unit_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS oms.urgent_job_indents (
            id SERIAL PRIMARY KEY,
            created_by INTEGER NOT NULL REFERENCES accesscontrol.access_users(id),
            order_id INTEGER NOT NULL REFERENCES oms.orders(id),
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
            created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
            CONSTRAINT ck_urgent_job_indents_status
                CHECK (status IN ('pending', 'accepted', 'rejected', 'assigned'))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_urgent_job_indents_status ON oms.urgent_job_indents (status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_urgent_job_indents_operator ON oms.urgent_job_indents (operator_id, status)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS oms.urgent_job_indents")

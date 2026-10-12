"""Add maintenance.notes for operator job review by supervisor."""

from typing import Sequence, Union

from alembic import op

revision: str = "0005_maintenance_notes"
down_revision: Union[str, None] = "0004_cycle_time_duration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS maintenance.notes (
            id SERIAL PRIMARY KEY,
            operator_id INTEGER NOT NULL REFERENCES accesscontrol.access_users(id),
            machine_id INTEGER REFERENCES configuration.machines(id) ON DELETE CASCADE,
            order_no VARCHAR,
            project_name VARCHAR,
            part_no VARCHAR,
            part_name VARCHAR,
            description TEXT NOT NULL,
            supervisor_id INTEGER REFERENCES accesscontrol.access_users(id),
            status VARCHAR NOT NULL DEFAULT 'pending',
            remark TEXT,
            reviewed_at TIMESTAMP,
            supervisor_ack BOOLEAN NOT NULL DEFAULT FALSE,
            supervisor_ack_at TIMESTAMP,
            operator_ack BOOLEAN NOT NULL DEFAULT FALSE,
            operator_ack_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
            CONSTRAINT ck_maintenance_notes_status CHECK (status IN ('pending', 'accepted', 'rejected'))
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_maintenance_notes_id ON maintenance.notes (id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_maintenance_notes_operator_status
        ON maintenance.notes (operator_id, status)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS maintenance.notes")

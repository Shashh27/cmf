"""Add chat_message_attachments table for order chat file uploads."""

from typing import Sequence, Union

from alembic import op

revision: str = "0005_chatbox_attachments"
down_revision: Union[str, None] = "0004_cycle_time_duration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_message_attachments (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL
                REFERENCES chatbox.chat_messages(id) ON DELETE CASCADE,
            file_name VARCHAR(512) NOT NULL,
            file_url TEXT NOT NULL,
            file_category VARCHAR(50) NOT NULL,
            uploaded_by INTEGER NOT NULL
                REFERENCES accesscontrol.access_users(id),
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_message_attachments_message_id "
        "ON chatbox.chat_message_attachments (message_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_message_attachments_uploaded_by "
        "ON chatbox.chat_message_attachments (uploaded_by)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chatbox.chat_message_attachments CASCADE")

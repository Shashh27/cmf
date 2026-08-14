"""Alembic revision: create chatbox schema + order chat tables."""

from typing import Sequence, Union

from alembic import op

revision: str = "0002_order_chatbox"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Prefer dedicated chatbox schema (not oms).
    # Clean up any earlier oms.* chat tables if they were created during prototyping.
    op.execute("DROP TABLE IF EXISTS oms.chat_message_read_status CASCADE")
    op.execute("DROP TABLE IF EXISTS oms.chat_messages CASCADE")
    op.execute("DROP TABLE IF EXISTS oms.chat_participants CASCADE")
    op.execute("DROP TABLE IF EXISTS oms.chat_conversations CASCADE")

    op.execute("CREATE SCHEMA IF NOT EXISTS chatbox")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_conversations (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL
                REFERENCES oms.orders(id) ON DELETE CASCADE,
            conversation_name VARCHAR(255),
            conversation_type VARCHAR(50) NOT NULL,
            created_by INTEGER NOT NULL
                REFERENCES accesscontrol.access_users(id),
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_conversations_order_id "
        "ON chatbox.chat_conversations (order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_conversations_id "
        "ON chatbox.chat_conversations (id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_participants (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER NOT NULL
                REFERENCES chatbox.chat_conversations(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL
                REFERENCES accesscontrol.access_users(id) ON DELETE CASCADE,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_read_at TIMESTAMPTZ,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT uq_chat_conversation_user UNIQUE (conversation_id, user_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_participants_conversation_id "
        "ON chatbox.chat_participants (conversation_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_participants_user_id "
        "ON chatbox.chat_participants (user_id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_messages (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER NOT NULL
                REFERENCES chatbox.chat_conversations(id) ON DELETE CASCADE,
            sender_id INTEGER NOT NULL
                REFERENCES accesscontrol.access_users(id),
            message_text TEXT NOT NULL,
            message_type VARCHAR(50) NOT NULL DEFAULT 'text',
            reply_to_id INTEGER
                REFERENCES chatbox.chat_messages(id),
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_id "
        "ON chatbox.chat_messages (conversation_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_messages_id "
        "ON chatbox.chat_messages (id)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_message_read_status (
            id SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL
                REFERENCES chatbox.chat_messages(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL
                REFERENCES accesscontrol.access_users(id) ON DELETE CASCADE,
            read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_chat_message_user_read UNIQUE (message_id, user_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chat_message_read_status_message_id "
        "ON chatbox.chat_message_read_status (message_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chatbox.chat_message_read_status CASCADE")
    op.execute("DROP TABLE IF EXISTS chatbox.chat_messages CASCADE")
    op.execute("DROP TABLE IF EXISTS chatbox.chat_participants CASCADE")
    op.execute("DROP TABLE IF EXISTS chatbox.chat_conversations CASCADE")
    op.execute("DROP SCHEMA IF EXISTS chatbox CASCADE")

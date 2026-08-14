"""Add composite indexes for order chatbox query paths.

Matches list-by-order, unread counts, message history, replies, and creator lookups.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003_chatbox_indexes"
down_revision: Union[str, None] = "0002_order_chatbox"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_conversations_order_updated
        ON chatbox.chat_conversations (order_id, is_deleted, updated_at DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_conversations_created_by
        ON chatbox.chat_conversations (created_by)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_participants_user_active
        ON chatbox.chat_participants (user_id, is_active)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_messages_conv_created
        ON chatbox.chat_messages (conversation_id, is_deleted, created_at)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_messages_reply_to_id
        ON chatbox.chat_messages (reply_to_id)
        WHERE reply_to_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_messages_sender_id
        ON chatbox.chat_messages (sender_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_chat_message_read_status_user_id
        ON chatbox.chat_message_read_status (user_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS chatbox.ix_chat_message_read_status_user_id")
    op.execute("DROP INDEX IF EXISTS chatbox.ix_chat_messages_sender_id")
    op.execute("DROP INDEX IF EXISTS chatbox.ix_chat_messages_reply_to_id")
    op.execute("DROP INDEX IF EXISTS chatbox.ix_chat_messages_conv_created")
    op.execute("DROP INDEX IF EXISTS chatbox.ix_chat_participants_user_active")
    op.execute("DROP INDEX IF EXISTS chatbox.ix_chat_conversations_created_by")
    op.execute("DROP INDEX IF EXISTS chatbox.ix_chat_conversations_order_updated")

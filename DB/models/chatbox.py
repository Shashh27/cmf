from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Text,
    TIMESTAMP,
    Boolean,
    UniqueConstraint,
    Index,
    func,
    text,
)
from sqlalchemy.orm import relationship

from ..database import Base


# =======================
# Order Chatbox (schema: chatbox)
# =======================

class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    __table_args__ = (
        Index(
            "ix_chat_conversations_order_updated",
            "order_id",
            "is_deleted",
            "updated_at",
        ),
        Index("ix_chat_conversations_created_by", "created_by"),
        {"schema": "chatbox"},
    )

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(
        Integer,
        ForeignKey("oms.orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    conversation_name = Column(String, nullable=True)
    conversation_type = Column(String, nullable=False)  # individual | group
    created_by = Column(
        Integer,
        ForeignKey("accesscontrol.access_users.id"),
        nullable=False,
    )
    is_deleted = Column(Boolean, default=False, nullable=False, server_default=text("false"))
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    order = relationship("Order", back_populates="chat_conversations")
    creator = relationship("AccessUser", foreign_keys=[created_by])
    participants = relationship(
        "ChatParticipant",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    messages = relationship(
        "ChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class ChatParticipant(Base):
    __tablename__ = "chat_participants"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_chat_conversation_user"),
        Index("ix_chat_participants_user_active", "user_id", "is_active"),
        {"schema": "chatbox"},
    )

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("chatbox.chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("accesscontrol.access_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    joined_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    last_read_at = Column(TIMESTAMP(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, server_default=text("true"))

    conversation = relationship("ChatConversation", back_populates="participants")
    user = relationship("AccessUser")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index(
            "ix_chat_messages_conv_created",
            "conversation_id",
            "is_deleted",
            "created_at",
        ),
        Index("ix_chat_messages_reply_to_id", "reply_to_id"),
        Index("ix_chat_messages_sender_id", "sender_id"),
        {"schema": "chatbox"},
    )

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("chatbox.chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id = Column(
        Integer,
        ForeignKey("accesscontrol.access_users.id"),
        nullable=False,
    )
    message_text = Column(Text, nullable=False)
    message_type = Column(String, default="text", nullable=False, server_default=text("'text'"))
    reply_to_id = Column(
        Integer,
        ForeignKey("chatbox.chat_messages.id"),
        nullable=True,
    )
    is_deleted = Column(Boolean, default=False, nullable=False, server_default=text("false"))
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    conversation = relationship("ChatConversation", back_populates="messages")
    sender = relationship("AccessUser", foreign_keys=[sender_id])
    reply_to = relationship("ChatMessage", remote_side=[id], foreign_keys=[reply_to_id])
    read_status = relationship(
        "ChatMessageReadStatus",
        back_populates="message",
        cascade="all, delete-orphan",
    )
    attachments = relationship(
        "ChatMessageAttachment",
        back_populates="message",
        cascade="all, delete-orphan",
    )


class ChatMessageAttachment(Base):
    __tablename__ = "chat_message_attachments"
    __table_args__ = (
        Index("ix_chat_message_attachments_message_id", "message_id"),
        Index("ix_chat_message_attachments_uploaded_by", "uploaded_by"),
        {"schema": "chatbox"},
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer,
        ForeignKey("chatbox.chat_messages.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_category = Column(String, nullable=False)  # image | video | file
    uploaded_by = Column(
        Integer,
        ForeignKey("accesscontrol.access_users.id"),
        nullable=False,
    )
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    message = relationship("ChatMessage", back_populates="attachments")
    uploader = relationship("AccessUser", foreign_keys=[uploaded_by])


class ChatMessageReadStatus(Base):
    __tablename__ = "chat_message_read_status"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_chat_message_user_read"),
        Index("ix_chat_message_read_status_user_id", "user_id"),
        {"schema": "chatbox"},
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer,
        ForeignKey("chatbox.chat_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("accesscontrol.access_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    read_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    message = relationship("ChatMessage", back_populates="read_status")
    user = relationship("AccessUser")

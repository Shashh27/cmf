from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, ConfigDict


# =======================
# Chat Participant
# =======================

class ChatParticipantBase(BaseModel):
    conversation_id: int
    user_id: int


class ChatParticipantCreate(BaseModel):
    user_id: int


class ChatParticipant(ChatParticipantBase):
    id: int
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    joined_at: Optional[datetime] = None
    last_read_at: Optional[datetime] = None
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


# =======================
# Chat Conversation
# =======================

class ChatConversationBase(BaseModel):
    order_id: int
    conversation_name: Optional[str] = None
    conversation_type: str

    @field_validator("conversation_type")
    @classmethod
    def validate_conversation_type(cls, v: str) -> str:
        if v not in ("individual", "group"):
            raise ValueError('conversation_type must be either "individual" or "group"')
        return v


class ChatConversationCreate(ChatConversationBase):
    participant_ids: List[int] = Field(min_length=1)

    @field_validator("conversation_name")
    @classmethod
    def validate_conversation_name(cls, v: Optional[str]) -> str:
        name = (v or "").strip()
        if not name:
            raise ValueError("conversation_name is required")
        return name


class ChatConversationUpdate(BaseModel):
    conversation_name: Optional[str] = None


class ChatConversation(ChatConversationBase):
    id: int
    created_by: int
    is_deleted: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    participants: List[ChatParticipant] = []
    message_count: int = 0
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ChatConversationWithUnreadCount(ChatConversation):
    unread_count: int = 0


# =======================
# Chat Message
# =======================

class ChatMessageBase(BaseModel):
    conversation_id: int
    message_text: str
    message_type: str = "text"
    reply_to_id: Optional[int] = None

    @field_validator("message_type")
    @classmethod
    def validate_message_type(cls, v: str) -> str:
        allowed = {"text", "image", "file", "system"}
        if v not in allowed:
            raise ValueError(f"message_type must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("message_text")
    @classmethod
    def validate_message_text(cls, v: str) -> str:
        text = (v or "").strip()
        if not text:
            raise ValueError("message_text cannot be empty")
        return text


class ChatMessageCreate(ChatMessageBase):
    pass


class ChatMessageUpdate(BaseModel):
    message_text: Optional[str] = None


class ChatMessageReplyPreview(BaseModel):
    id: int
    message_text: str
    sender_id: Optional[int] = None
    sender_name: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class ChatMessage(ChatMessageBase):
    id: int
    sender_id: int
    sender_name: Optional[str] = None
    sender_role: Optional[str] = None
    reply_to_message: Optional[ChatMessageReplyPreview] = None
    is_deleted: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    read_by: List[int] = []

    model_config = ConfigDict(from_attributes=True)


class ChatConversationWithMessages(ChatConversation):
    messages: List[ChatMessage] = []


# =======================
# Read status
# =======================

class MarkReadBody(BaseModel):
    """Optional body; user is always taken from JWT."""
    pass


class MarkAllReadResponse(BaseModel):
    status: str = "marked as read"
    marked_count: int = 0


class UnreadCountResponse(BaseModel):
    conversation_id: int
    unread_count: int


class OrderStakeholdersResponse(BaseModel):
    order_id: int
    stakeholders: List[dict]

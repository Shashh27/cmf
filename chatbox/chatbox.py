"""
Order Chatbox API — WhatsApp-like messaging for order stakeholders.
Mounted at /api/v1/chatbox (not the LLM /api/chatbot).
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import List, Optional, Set

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, joinedload

from auth.deps import get_current_user, _load_user_from_access_token
from auth.roles import normalize_role
from DB.database import SessionLocal, get_db
from DB.models.access_control import AccessUser
from DB.models.oms import Order
from DB.models.chatbox import (
    ChatConversation,
    ChatParticipant,
    ChatMessage,
    ChatMessageReadStatus,
)
from chatbox.ws_manager import chat_ws_manager
from DB.schemas.chatbox import (
    ChatConversationCreate,
    ChatConversationUpdate,
    ChatConversation as ChatConversationSchema,
    ChatConversationWithUnreadCount,
    ChatConversationWithMessages,
    ChatParticipant as ChatParticipantSchema,
    ChatParticipantCreate,
    ChatMessageCreate,
    ChatMessageUpdate,
    ChatMessage as ChatMessageSchema,
    ChatMessageReplyPreview,
    MarkAllReadResponse,
    UnreadCountResponse,
    OrderStakeholdersResponse,
)

router = APIRouter(prefix="/chatbox", tags=["chatbox"])

ALLOWED_CHAT_ROLES = {
    "admin",
    "project_coordinator",
    "manufacturing_coordinator",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _require_chat_role(user: AccessUser) -> None:
    role = normalize_role(user.role)
    if role not in ALLOWED_CHAT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin, Project Coordinator, and Manufacturing Coordinator can use order chat",
        )


def _order_stakeholder_ids(order: Order) -> Set[int]:
    ids: Set[int] = set()
    for uid in (
        order.admin_id,
        order.project_coordinator_id,
        order.manufacturing_coordinator_id,
    ):
        if uid is not None:
            ids.add(uid)
    return ids


def _get_order_or_404(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _assert_order_access(order: Order, user: AccessUser) -> None:
    """User must be a stakeholder on the order."""
    if user.id not in _order_stakeholder_ids(order):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a stakeholder on this order",
        )


def _get_active_participant(
    db: Session, conversation_id: int, user_id: int
) -> Optional[ChatParticipant]:
    return (
        db.query(ChatParticipant)
        .filter(
            ChatParticipant.conversation_id == conversation_id,
            ChatParticipant.user_id == user_id,
            ChatParticipant.is_active.is_(True),
        )
        .first()
    )


def _assert_participant(db: Session, conversation_id: int, user_id: int) -> ChatParticipant:
    participant = _get_active_participant(db, conversation_id, user_id)
    if not participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this conversation",
        )
    return participant


def _serialize_participant(p: ChatParticipant) -> dict:
    user = p.user
    return {
        "id": p.id,
        "conversation_id": p.conversation_id,
        "user_id": p.user_id,
        "user_name": user.user_name if user else None,
        "user_role": user.role if user else None,
        "joined_at": p.joined_at,
        "last_read_at": p.last_read_at,
        "is_active": p.is_active,
    }


def _serialize_message(msg: ChatMessage) -> dict:
    sender = msg.sender
    reply_preview = None
    if msg.reply_to is not None:
        reply_preview = {
            "id": msg.reply_to.id,
            "message_text": (
                "[deleted]" if msg.reply_to.is_deleted else msg.reply_to.message_text
            ),
            "sender_id": msg.reply_to.sender_id,
            "sender_name": msg.reply_to.sender.user_name if msg.reply_to.sender else None,
            "is_deleted": msg.reply_to.is_deleted,
        }
    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "sender_name": sender.user_name if sender else None,
        "sender_role": sender.role if sender else None,
        "message_text": "[This message was deleted]" if msg.is_deleted else msg.message_text,
        "message_type": msg.message_type,
        "reply_to_id": msg.reply_to_id,
        "reply_to_message": reply_preview,
        "is_deleted": msg.is_deleted,
        "created_at": msg.created_at,
        "updated_at": msg.updated_at,
        "read_by": [r.user_id for r in (msg.read_status or [])],
    }


def _message_stats(db: Session, conversation_id: int) -> tuple[int, Optional[datetime], Optional[str]]:
    count = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.is_deleted.is_(False),
        )
        .scalar()
        or 0
    )
    last = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.is_deleted.is_(False),
        )
        .order_by(ChatMessage.created_at.desc())
        .first()
    )
    if not last:
        return count, None, None
    preview = (last.message_text or "")[:120]
    return count, last.created_at, preview


def _unread_count(db: Session, conversation: ChatConversation, user_id: int) -> int:
    last_read = None
    for p in conversation.participants:
        if p.user_id == user_id and p.is_active:
            last_read = p.last_read_at
            break

    q = db.query(func.count(ChatMessage.id)).filter(
        ChatMessage.conversation_id == conversation.id,
        ChatMessage.sender_id != user_id,
        ChatMessage.is_deleted.is_(False),
    )
    if last_read is not None:
        q = q.filter(ChatMessage.created_at > last_read)
    unread_messages = q.scalar() or 0

    # New conversation the user did not create — show badge until they open it once.
    if (
        unread_messages == 0
        and last_read is None
        and conversation.created_by != user_id
    ):
        return 1
    return unread_messages


def _bulk_ensure_read_status(
    db: Session, message_ids: List[int], user_id: int
) -> int:
    """Insert read rows for messages; ignore duplicates (safe under concurrent calls)."""
    ids = [mid for mid in message_ids if mid]
    if not ids:
        return 0
    existing_ids = {
        row[0]
        for row in db.query(ChatMessageReadStatus.message_id)
        .filter(
            ChatMessageReadStatus.user_id == user_id,
            ChatMessageReadStatus.message_id.in_(ids),
        )
        .all()
    }
    new_ids = [mid for mid in ids if mid not in existing_ids]
    if not new_ids:
        return 0
    stmt = pg_insert(ChatMessageReadStatus.__table__).values(
        [{"message_id": mid, "user_id": user_id} for mid in new_ids]
    )
    stmt = stmt.on_conflict_do_nothing(constraint="uq_chat_message_user_read")
    db.execute(stmt)
    return len(new_ids)


def _touch_participant_last_read(
    db: Session, conversation_id: int, user_id: int
) -> None:
    db.query(ChatParticipant).filter(
        ChatParticipant.conversation_id == conversation_id,
        ChatParticipant.user_id == user_id,
    ).update({"last_read_at": _utcnow()})


def _serialize_conversation(
    db: Session,
    conv: ChatConversation,
    *,
    include_unread_for: Optional[int] = None,
) -> dict:
    active_participants = [p for p in conv.participants if p.is_active]
    count, last_at, preview = _message_stats(db, conv.id)
    data = {
        "id": conv.id,
        "order_id": conv.order_id,
        "conversation_name": conv.conversation_name,
        "conversation_type": conv.conversation_type,
        "created_by": conv.created_by,
        "is_deleted": conv.is_deleted,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
        "participants": [_serialize_participant(p) for p in active_participants],
        "message_count": count,
        "last_message_at": last_at,
        "last_message_preview": preview,
    }
    if include_unread_for is not None:
        data["unread_count"] = _unread_count(db, conv, include_unread_for)
    return data


def _load_conversation(db: Session, conversation_id: int) -> ChatConversation:
    conv = (
        db.query(ChatConversation)
        .options(
            joinedload(ChatConversation.participants).joinedload(ChatParticipant.user),
        )
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.is_deleted.is_(False),
        )
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _assert_conversation_creator(conv: ChatConversation, user: AccessUser) -> None:
    if conv.created_by != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the conversation creator can perform this action",
        )


def _hard_delete_message(db: Session, message_id: int) -> None:
    """Permanently remove one message (and read rows) from DB."""
    db.query(ChatMessage).filter(ChatMessage.reply_to_id == message_id).update(
        {ChatMessage.reply_to_id: None},
        synchronize_session=False,
    )
    db.query(ChatMessageReadStatus).filter(
        ChatMessageReadStatus.message_id == message_id,
    ).delete(synchronize_session=False)
    deleted = (
        db.query(ChatMessage)
        .filter(ChatMessage.id == message_id)
        .delete(synchronize_session=False)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found")


def _hard_delete_conversation_messages(db: Session, conversation_id: int) -> int:
    """Permanently remove all messages for a conversation."""
    message_ids = [
        row[0]
        for row in db.query(ChatMessage.id)
        .filter(ChatMessage.conversation_id == conversation_id)
        .all()
    ]
    if not message_ids:
        return 0

    db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id,
        ChatMessage.reply_to_id.isnot(None),
    ).update({ChatMessage.reply_to_id: None}, synchronize_session=False)
    db.query(ChatMessageReadStatus).filter(
        ChatMessageReadStatus.message_id.in_(message_ids),
    ).delete(synchronize_session=False)
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .delete(synchronize_session=False)
    )


def _hard_delete_conversation(db: Session, conv: ChatConversation) -> None:
    """Permanently remove conversation, participants, and all messages from DB."""
    conversation_id = conv.id
    _hard_delete_conversation_messages(db, conversation_id)
    db.query(ChatParticipant).filter(
        ChatParticipant.conversation_id == conversation_id
    ).delete(synchronize_session=False)
    db.delete(conv)


def _find_existing_individual(
    db: Session, order_id: int, user_a: int, user_b: int
) -> Optional[ChatConversation]:
    """Return existing 1:1 chat for the same pair on this order, if any."""
    pair = {user_a, user_b}
    candidates = (
        db.query(ChatConversation)
        .options(joinedload(ChatConversation.participants))
        .filter(
            ChatConversation.order_id == order_id,
            ChatConversation.conversation_type == "individual",
            ChatConversation.is_deleted.is_(False),
        )
        .all()
    )
    for conv in candidates:
        active_ids = {p.user_id for p in conv.participants if p.is_active}
        if active_ids == pair:
            return conv
    return None


def _conversations_for_order_user(db: Session, order_id: int, user_id: int) -> List[dict]:
    conversations = (
        db.query(ChatConversation)
        .join(ChatParticipant)
        .options(
            joinedload(ChatConversation.participants).joinedload(ChatParticipant.user),
        )
        .filter(
            ChatConversation.order_id == order_id,
            ChatConversation.is_deleted.is_(False),
            ChatParticipant.user_id == user_id,
            ChatParticipant.is_active.is_(True),
        )
        .order_by(ChatConversation.updated_at.desc())
        .all()
    )
    seen: Set[int] = set()
    unique: List[ChatConversation] = []
    for c in conversations:
        if c.id not in seen:
            seen.add(c.id)
            unique.append(c)
    return [
        _serialize_conversation(db, c, include_unread_for=user_id)
        for c in unique
    ]


async def _ws_push_order_sync(order_id: int) -> None:
    db = SessionLocal()
    try:
        for uid, sockets in chat_ws_manager.iter_order(order_id):
            convs = _conversations_for_order_user(db, order_id, uid)
            total_unread = sum(int(c.get("unread_count") or 0) for c in convs)
            await chat_ws_manager.send_to_sockets(
                sockets,
                {
                    "type": "conversations",
                    "order_id": order_id,
                    "total_unread": total_unread,
                    "conversations": convs,
                },
            )
    finally:
        db.close()


async def _ws_push_event(order_id: int, event: dict) -> None:
    db = SessionLocal()
    try:
        for _, sockets in chat_ws_manager.iter_order(order_id):
            await chat_ws_manager.send_to_sockets(sockets, event)
    finally:
        db.close()


def _schedule_order_sync(order_id: int, background_tasks: BackgroundTasks) -> None:
    background_tasks.add_task(_ws_push_order_sync, order_id)


def _schedule_ws_event(order_id: int, event: dict, background_tasks: BackgroundTasks) -> None:
    async def _run() -> None:
        await _ws_push_event(order_id, event)
        await _ws_push_order_sync(order_id)

    background_tasks.add_task(_run)


# ---------------------------------------------------------------------------
# Stakeholders helper (for UI pickers)
# ---------------------------------------------------------------------------

@router.get("/orders/{order_id}/stakeholders", response_model=OrderStakeholdersResponse)
def get_order_stakeholders(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    order = _get_order_or_404(db, order_id)
    _assert_order_access(order, current_user)

    role_map = [
        (order.admin_id, "admin"),
        (order.project_coordinator_id, "project_coordinator"),
        (order.manufacturing_coordinator_id, "manufacturing_coordinator"),
    ]
    stakeholders = []
    seen: Set[int] = set()
    for uid, label in role_map:
        if uid is None or uid in seen:
            continue
        seen.add(uid)
        user = db.query(AccessUser).filter(AccessUser.id == uid).first()
        if user:
            stakeholders.append(
                {
                    "user_id": user.id,
                    "user_name": user.user_name,
                    "user_role": user.role,
                    "order_role": label,
                }
            )
    return {"order_id": order_id, "stakeholders": stakeholders}


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@router.post(
    "/conversations",
    response_model=ChatConversationSchema,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    body: ChatConversationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    order = _get_order_or_404(db, body.order_id)
    _assert_order_access(order, current_user)

    allowed = _order_stakeholder_ids(order)
    participant_ids = set(body.participant_ids)
    participant_ids.add(current_user.id)

    invalid = participant_ids - allowed
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Participants must be order stakeholders. Invalid user ids: {sorted(invalid)}",
        )

    if body.conversation_type == "individual":
        if len(participant_ids) != 2:
            raise HTTPException(
                status_code=400,
                detail="Individual conversations must have exactly 2 participants",
            )
        other_id = next(uid for uid in participant_ids if uid != current_user.id)
        existing = _find_existing_individual(db, body.order_id, current_user.id, other_id)
        if existing:
            existing = _load_conversation(db, existing.id)
            return _serialize_conversation(db, existing)

    conversation_name = (body.conversation_name or "").strip()
    if not conversation_name:
        raise HTTPException(status_code=400, detail="conversation_name is required")

    users = db.query(AccessUser).filter(AccessUser.id.in_(participant_ids)).all()
    if len(users) != len(participant_ids):
        raise HTTPException(status_code=400, detail="One or more users not found")

    conv = ChatConversation(
        order_id=body.order_id,
        conversation_name=conversation_name,
        conversation_type=body.conversation_type,
        created_by=current_user.id,
    )
    db.add(conv)
    db.flush()

    for uid in participant_ids:
        db.add(
            ChatParticipant(
                conversation_id=conv.id,
                user_id=uid,
                last_read_at=_utcnow() if uid == current_user.id else None,
            )
        )

    db.commit()
    conv = _load_conversation(db, conv.id)
    _schedule_order_sync(body.order_id, background_tasks)
    return _serialize_conversation(db, conv)


@router.get("/conversations", response_model=List[ChatConversationWithUnreadCount])
def list_my_conversations(
    order_id: Optional[int] = Query(None, description="Filter by order"),
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)

    q = (
        db.query(ChatConversation)
        .join(ChatParticipant)
        .options(
            joinedload(ChatConversation.participants).joinedload(ChatParticipant.user),
        )
        .filter(
            ChatParticipant.user_id == current_user.id,
            ChatParticipant.is_active.is_(True),
            ChatConversation.is_deleted.is_(False),
        )
    )
    if order_id is not None:
        q = q.filter(ChatConversation.order_id == order_id)

    conversations = q.order_by(ChatConversation.updated_at.desc()).all()
    # Deduplicate (join can multiply rows)
    seen: Set[int] = set()
    unique: List[ChatConversation] = []
    for c in conversations:
        if c.id not in seen:
            seen.add(c.id)
            unique.append(c)

    return [
        _serialize_conversation(db, c, include_unread_for=current_user.id)
        for c in unique
    ]


@router.get(
    "/conversations/order/{order_id}",
    response_model=List[ChatConversationWithUnreadCount],
)
def list_conversations_for_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    order = _get_order_or_404(db, order_id)
    _assert_order_access(order, current_user)

    conversations = (
        db.query(ChatConversation)
        .join(ChatParticipant)
        .options(
            joinedload(ChatConversation.participants).joinedload(ChatParticipant.user),
        )
        .filter(
            ChatConversation.order_id == order_id,
            ChatConversation.is_deleted.is_(False),
            ChatParticipant.user_id == current_user.id,
            ChatParticipant.is_active.is_(True),
        )
        .order_by(ChatConversation.updated_at.desc())
        .all()
    )
    seen: Set[int] = set()
    unique: List[ChatConversation] = []
    for c in conversations:
        if c.id not in seen:
            seen.add(c.id)
            unique.append(c)

    return [
        _serialize_conversation(db, c, include_unread_for=current_user.id)
        for c in unique
    ]


@router.get(
    "/conversations/{conversation_id}",
    response_model=ChatConversationWithMessages,
)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)

    messages = (
        db.query(ChatMessage)
        .options(
            joinedload(ChatMessage.sender),
            joinedload(ChatMessage.reply_to).joinedload(ChatMessage.sender),
            joinedload(ChatMessage.read_status),
        )
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    data = _serialize_conversation(db, conv, include_unread_for=current_user.id)
    data["messages"] = [_serialize_message(m) for m in messages if not m.is_deleted]
    return data


@router.put("/conversations/{conversation_id}", response_model=ChatConversationSchema)
def update_conversation(
    conversation_id: int,
    body: ChatConversationUpdate,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)

    if body.conversation_name is not None:
        conv.conversation_name = body.conversation_name
    conv.updated_at = _utcnow()
    db.commit()
    conv = _load_conversation(db, conversation_id)
    return _serialize_conversation(db, conv)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)
    _assert_conversation_creator(conv, current_user)

    order_id = conv.order_id
    _hard_delete_conversation(db, conv)
    db.commit()
    _schedule_ws_event(
        order_id,
        {
            "type": "conversation_deleted",
            "order_id": order_id,
            "conversation_id": conversation_id,
        },
        background_tasks,
    )
    return {"status": "conversation permanently deleted"}


@router.delete("/conversations/{conversation_id}/messages")
def clear_conversation_messages(
    conversation_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """Delete all messages but keep the conversation (name stays in the list)."""
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)
    _assert_conversation_creator(conv, current_user)

    order_id = conv.order_id
    deleted_count = _hard_delete_conversation_messages(db, conversation_id)
    conv.updated_at = _utcnow()
    db.commit()
    _schedule_ws_event(
        order_id,
        {
            "type": "messages_cleared",
            "order_id": order_id,
            "conversation_id": conversation_id,
            "deleted_count": deleted_count,
        },
        background_tasks,
    )
    return {"status": "messages cleared", "deleted_count": deleted_count}


# ---------------------------------------------------------------------------
# Participants
# ---------------------------------------------------------------------------

@router.get(
    "/conversations/{conversation_id}/participants",
    response_model=List[ChatParticipantSchema],
)
def list_participants(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)
    return [_serialize_participant(p) for p in conv.participants if p.is_active]


@router.post(
    "/conversations/{conversation_id}/participants",
    response_model=ChatParticipantSchema,
    status_code=status.HTTP_201_CREATED,
)
def add_participant(
    conversation_id: int,
    body: ChatParticipantCreate,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)

    if conv.conversation_type == "individual":
        raise HTTPException(
            status_code=400,
            detail="Cannot add participants to an individual conversation",
        )

    order = _get_order_or_404(db, conv.order_id)
    if body.user_id not in _order_stakeholder_ids(order):
        raise HTTPException(status_code=400, detail="User is not an order stakeholder")

    existing = (
        db.query(ChatParticipant)
        .filter(
            ChatParticipant.conversation_id == conversation_id,
            ChatParticipant.user_id == body.user_id,
        )
        .first()
    )
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail="User is already a participant")
        existing.is_active = True
        existing.joined_at = _utcnow()
        db.commit()
        db.refresh(existing)
        existing = (
            db.query(ChatParticipant)
            .options(joinedload(ChatParticipant.user))
            .filter(ChatParticipant.id == existing.id)
            .first()
        )
        return _serialize_participant(existing)

    user = db.query(AccessUser).filter(AccessUser.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    participant = ChatParticipant(
        conversation_id=conversation_id,
        user_id=body.user_id,
    )
    db.add(participant)
    conv.updated_at = _utcnow()
    db.commit()
    participant = (
        db.query(ChatParticipant)
        .options(joinedload(ChatParticipant.user))
        .filter(ChatParticipant.id == participant.id)
        .first()
    )
    return _serialize_participant(participant)


@router.delete("/conversations/{conversation_id}/participants/{user_id}")
def remove_participant(
    conversation_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)

    if conv.conversation_type == "individual":
        raise HTTPException(
            status_code=400,
            detail="Cannot remove participants from an individual conversation",
        )

    participant = (
        db.query(ChatParticipant)
        .filter(
            ChatParticipant.conversation_id == conversation_id,
            ChatParticipant.user_id == user_id,
            ChatParticipant.is_active.is_(True),
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.is_active = False
    conv.updated_at = _utcnow()
    db.commit()
    return {"status": "participant removed"}


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@router.post(
    "/messages",
    response_model=ChatMessageSchema,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    body: ChatMessageCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, body.conversation_id)
    _assert_participant(db, body.conversation_id, current_user.id)

    if body.reply_to_id is not None:
        reply = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.id == body.reply_to_id,
                ChatMessage.conversation_id == body.conversation_id,
            )
            .first()
        )
        if not reply:
            raise HTTPException(
                status_code=400,
                detail="reply_to_id must reference a message in this conversation",
            )

    msg = ChatMessage(
        conversation_id=body.conversation_id,
        sender_id=current_user.id,
        message_text=body.message_text,
        message_type=body.message_type,
        reply_to_id=body.reply_to_id,
    )
    db.add(msg)
    db.flush()

    db.add(
        ChatMessageReadStatus(
            message_id=msg.id,
            user_id=current_user.id,
        )
    )

    # Sender has read up to now
    db.query(ChatParticipant).filter(
        ChatParticipant.conversation_id == body.conversation_id,
        ChatParticipant.user_id == current_user.id,
    ).update({"last_read_at": _utcnow()})

    conv.updated_at = _utcnow()
    db.commit()

    msg = (
        db.query(ChatMessage)
        .options(
            joinedload(ChatMessage.sender),
            joinedload(ChatMessage.reply_to).joinedload(ChatMessage.sender),
            joinedload(ChatMessage.read_status),
        )
        .filter(ChatMessage.id == msg.id)
        .first()
    )
    serialized = _serialize_message(msg)
    _schedule_ws_event(
        conv.order_id,
        {
            "type": "message_new",
            "order_id": conv.order_id,
            "conversation_id": body.conversation_id,
            "message": serialized,
        },
        background_tasks,
    )
    return serialized


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=List[ChatMessageSchema],
)
def get_messages(
    conversation_id: int,
    after_id: Optional[int] = Query(None, description="Return messages with id > after_id"),
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)

    q = (
        db.query(ChatMessage)
        .options(
            joinedload(ChatMessage.sender),
            joinedload(ChatMessage.reply_to).joinedload(ChatMessage.sender),
            joinedload(ChatMessage.read_status),
        )
        .filter(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.is_deleted.is_(False),
        )
    )
    if after_id is not None:
        q = q.filter(ChatMessage.id > after_id)

    messages = q.order_by(ChatMessage.created_at.asc()).all()
    return [_serialize_message(m) for m in messages]


@router.put("/messages/{message_id}", response_model=ChatMessageSchema)
def edit_message(
    message_id: int,
    body: ChatMessageUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    msg = (
        db.query(ChatMessage)
        .options(
            joinedload(ChatMessage.sender),
            joinedload(ChatMessage.reply_to).joinedload(ChatMessage.sender),
            joinedload(ChatMessage.read_status),
        )
        .filter(ChatMessage.id == message_id)
        .first()
    )
    if not msg or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found")

    conv = _load_conversation(db, msg.conversation_id)
    _assert_participant(db, msg.conversation_id, current_user.id)
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the sender can edit this message")

    if body.message_text is not None:
        text = body.message_text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="message_text cannot be empty")
        msg.message_text = text
        msg.updated_at = _utcnow()

    db.commit()
    msg = (
        db.query(ChatMessage)
        .options(
            joinedload(ChatMessage.sender),
            joinedload(ChatMessage.reply_to).joinedload(ChatMessage.sender),
            joinedload(ChatMessage.read_status),
        )
        .filter(ChatMessage.id == message_id)
        .first()
    )
    serialized = _serialize_message(msg)
    _schedule_ws_event(
        conv.order_id,
        {
            "type": "message_updated",
            "order_id": conv.order_id,
            "conversation_id": msg.conversation_id,
            "message": serialized,
        },
        background_tasks,
    )
    return serialized


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    conv = _load_conversation(db, msg.conversation_id)
    _assert_participant(db, msg.conversation_id, current_user.id)
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the sender can delete this message")

    order_id = conv.order_id
    conversation_id = msg.conversation_id
    _hard_delete_message(db, message_id)
    conv.updated_at = _utcnow()
    db.commit()
    _schedule_ws_event(
        order_id,
        {
            "type": "message_deleted",
            "order_id": order_id,
            "conversation_id": conversation_id,
            "message_id": message_id,
        },
        background_tasks,
    )
    return {"status": "message permanently deleted"}


@router.post("/messages/{message_id}/read")
def mark_message_read(
    message_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found")

    _assert_participant(db, msg.conversation_id, current_user.id)

    _bulk_ensure_read_status(db, [message_id], current_user.id)
    _touch_participant_last_read(db, msg.conversation_id, current_user.id)

    db.commit()
    conv = db.query(ChatConversation).filter(ChatConversation.id == msg.conversation_id).first()
    if conv:
        _schedule_order_sync(conv.order_id, background_tasks)
    return {"status": "marked as read"}


@router.post(
    "/conversations/{conversation_id}/mark-all-read",
    response_model=MarkAllReadResponse,
)
def mark_all_read(
    conversation_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)

    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.is_deleted.is_(False),
        )
        .all()
    )
    message_ids = [m.id for m in messages]
    marked = _bulk_ensure_read_status(db, message_ids, current_user.id)
    _touch_participant_last_read(db, conversation_id, current_user.id)

    db.commit()
    _schedule_order_sync(conv.order_id, background_tasks)
    return {"status": "marked as read", "marked_count": marked}


@router.get(
    "/conversations/{conversation_id}/unread-count",
    response_model=UnreadCountResponse,
)
def get_unread_count(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    _require_chat_role(current_user)
    conv = _load_conversation(db, conversation_id)
    _assert_participant(db, conversation_id, current_user.id)
    return {
        "conversation_id": conversation_id,
        "unread_count": _unread_count(db, conv, current_user.id),
    }


@router.websocket("/orders/{order_id}/ws")
async def order_chat_websocket(
    websocket: WebSocket,
    order_id: int,
):
    """Real-time order chat — client sends { type: 'auth', token } as first message."""
    await websocket.accept()

    db = SessionLocal()
    user = None
    try:
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=15.0)
        except asyncio.TimeoutError:
            await websocket.close(code=4401)
            return

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.close(code=4401)
            return

        if payload.get("type") != "auth":
            await websocket.close(code=4401)
            return

        token = (payload.get("token") or "").strip()
        if not token:
            await websocket.close(code=4401)
            return

        user = _load_user_from_access_token(token, db)
        _require_chat_role(user)
        order = _get_order_or_404(db, order_id)
        _assert_order_access(order, user)
    except HTTPException:
        await websocket.close(code=4401)
        return
    finally:
        db.close()

    if user is None:
        await websocket.close(code=4401)
        return

    await chat_ws_manager.connect(order_id, user.id, websocket)

    await websocket.send_json(jsonable_encoder({"type": "auth_ok", "order_id": order_id}))

    db = SessionLocal()
    try:
        convs = _conversations_for_order_user(db, order_id, user.id)
        total_unread = sum(int(c.get("unread_count") or 0) for c in convs)
        await websocket.send_json(
            jsonable_encoder(
                {
                    "type": "conversations",
                    "order_id": order_id,
                    "total_unread": total_unread,
                    "conversations": convs,
                }
            )
        )
    finally:
        db.close()

    try:
        while True:
            raw = await websocket.receive_text()
            if raw.strip().lower() == "ping":
                await websocket.send_json(jsonable_encoder({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        await chat_ws_manager.disconnect(order_id, user.id, websocket)

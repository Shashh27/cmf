import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiWsUrl } from '../auth/apiUrl.js';
import { getAccessToken } from '../api/client.js';
import {
  fetchOrderStakeholders,
  fetchConversationsForOrder,
  fetchMessages,
  createConversation,
  sendMessage,
  markAllRead,
  deleteMessage,
  editMessage,
  deleteConversation,
  clearConversationMessages,
} from './api';
import {
  applyConversationsPayload,
  mergeMessages,
  sumUnread,
  upsertMessage,
  bumpConversationUnread,
} from './chatUtils';

/**
 * Order chat state + WebSocket sync.
 * WS connects whenever orderId is set (badge updates even when drawer closed).
 */
export function useOrderChat({ orderId, panelOpen, currentUserId, messageApi }) {
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [stakeholders, setStakeholders] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [mobileView, setMobileView] = useState('list');
  const [wsConnected, setWsConnected] = useState(false);

  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const wsOrderIdRef = useRef(null);
  const reconnectRef = useRef(null);
  const allowReconnectRef = useRef(true);
  const activeConvIdRef = useRef(null);
  const orderIdRef = useRef(orderId);
  const handleWsPayloadRef = useRef(null);
  const loadConversationsRef = useRef(null);
  const markAllReadInFlightRef = useRef(new Set());

  useEffect(() => {
    orderIdRef.current = orderId;
  }, [orderId]);

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const loadConversations = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [convs, stake] = await Promise.all([
        fetchConversationsForOrder(orderId),
        fetchOrderStakeholders(orderId),
      ]);
      const list = Array.isArray(convs) ? convs : [];
      setConversations(list);
      setTotalUnread(sumUnread(list));
      setStakeholders(stake?.stakeholders || []);
    } catch (err) {
      messageApi?.error?.(
        err?.response?.data?.detail || 'Failed to load conversations'
      );
    } finally {
      setLoading(false);
    }
  }, [orderId, messageApi]);

  const loadMessages = useCallback(
    async (conversationId, { quiet } = {}) => {
      if (!conversationId) return;
      if (!quiet) setMessagesLoading(true);
      try {
        const msgs = await fetchMessages(conversationId);
        setMessages(Array.isArray(msgs) ? msgs : []);
        if (!markAllReadInFlightRef.current.has(conversationId)) {
          markAllReadInFlightRef.current.add(conversationId);
          try {
            await markAllRead(conversationId);
          } finally {
            markAllReadInFlightRef.current.delete(conversationId);
          }
        }
        setConversations((prev) => {
          const target = prev.find((c) => c.id === conversationId);
          const cleared = target?.unread_count || 0;
          const next = prev.map((c) =>
            c.id === conversationId ? { ...c, unread_count: 0 } : c
          );
          setTotalUnread(sumUnread(next));
          return next;
        });
        scrollToBottom();
      } catch (err) {
        if (!quiet) {
          messageApi?.error?.(
            err?.response?.data?.detail || 'Failed to load messages'
          );
        }
      } finally {
        if (!quiet) setMessagesLoading(false);
      }
    },
    [messageApi, scrollToBottom]
  );

  const handleWsPayload = useCallback(
    (payload) => {
      if (!payload?.type) return;

      if (payload.type === 'conversations') {
        applyConversationsPayload(setConversations, setTotalUnread, payload);
        return;
      }

      if (payload.type === 'message_new') {
        const convId = payload.conversation_id;
        const msg = payload.message;
        if (!msg) return;

        if (convId === activeConvIdRef.current) {
          setMessages((prev) => mergeMessages(prev, [msg]));
          scrollToBottom();
          if (msg.sender_id !== currentUserId && !markAllReadInFlightRef.current.has(convId)) {
            markAllReadInFlightRef.current.add(convId);
            markAllRead(convId)
              .then(() => {
                setConversations((prev) => {
                  const next = prev.map((c) =>
                    c.id === convId ? { ...c, unread_count: 0 } : c
                  );
                  setTotalUnread(sumUnread(next));
                  return next;
                });
              })
              .catch(() => {})
              .finally(() => markAllReadInFlightRef.current.delete(convId));
          }
        } else if (msg.sender_id !== currentUserId) {
          setConversations((prev) => {
            const next = bumpConversationUnread(prev, convId, msg, currentUserId);
            setTotalUnread(sumUnread(next));
            return next;
          });
        }
        return;
      }

      if (payload.type === 'message_deleted') {
        const { message_id: messageId, conversation_id: convId } = payload;
        if (convId === activeConvIdRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
        return;
      }

      if (payload.type === 'message_updated') {
        const { conversation_id: convId, message: msg } = payload;
        if (convId === activeConvIdRef.current && msg) {
          setMessages((prev) => upsertMessage(prev, msg));
        }
        return;
      }

      if (payload.type === 'conversation_deleted') {
        const { conversation_id: convId } = payload;
        setConversations((prev) => {
          const removed = prev.find((c) => c.id === convId);
          const next = prev.filter((c) => c.id !== convId);
          if (removed?.unread_count) {
            setTotalUnread((t) => Math.max(0, t - removed.unread_count));
          }
          return next;
        });
        if (activeConvIdRef.current === convId) {
          setActiveConvId(null);
          setMessages([]);
          setDraft('');
          setReplyTo(null);
          setMobileView('list');
        }
        return;
      }

      if (payload.type === 'messages_cleared') {
        const { conversation_id: convId } = payload;
        if (convId === activeConvIdRef.current) {
          setMessages([]);
          setReplyTo(null);
        }
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  unread_count: 0,
                  last_message_preview: null,
                  last_message_at: null,
                  message_count: 0,
                }
              : c
          )
        );
      }
    },
    [currentUserId, scrollToBottom]
  );

  useEffect(() => {
    handleWsPayloadRef.current = handleWsPayload;
  }, [handleWsPayload]);

  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

  const closeWs = useCallback((preventReconnect = false) => {
    if (preventReconnect) {
      allowReconnectRef.current = false;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    const existing = wsRef.current;
    if (existing) {
      existing.onclose = null;
      existing.close();
      wsRef.current = null;
    }
    wsOrderIdRef.current = null;
    setWsConnected(false);
  }, []);

  const connectWs = useCallback(() => {
    const activeOrderId = orderIdRef.current;
    if (!activeOrderId) return;

    const token = getAccessToken();
    if (!token) return;

    const existing = wsRef.current;
    if (
      existing &&
      wsOrderIdRef.current === activeOrderId &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (existing) {
      existing.onclose = null;
      existing.close();
      wsRef.current = null;
    }

    const url = getApiWsUrl(`chatbox/orders/${activeOrderId}/ws`);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    wsOrderIdRef.current = activeOrderId;

    ws.onopen = () => {
      const authToken = getAccessToken();
      if (!authToken) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ type: 'auth', token: authToken }));
    };
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'auth_ok') {
          setWsConnected(true);
          return;
        }
        if (payload?.type === 'auth_error') {
          setWsConnected(false);
          ws.close();
          return;
        }
        handleWsPayloadRef.current?.(payload);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      setWsConnected(false);
      if (wsRef.current === ws) {
        wsRef.current = null;
        wsOrderIdRef.current = null;
      }
      if (allowReconnectRef.current && orderIdRef.current) {
        reconnectRef.current = setTimeout(connectWs, 4000);
      }
    };
    ws.onerror = () => ws.close();
  }, []);

  // One persistent WebSocket per order — reconnect only when orderId changes or connection drops.
  useEffect(() => {
    if (!orderId) {
      closeWs(true);
      return undefined;
    }

    allowReconnectRef.current = true;
    connectWs();

    return () => {
      closeWs(true);
      allowReconnectRef.current = false;
    };
  }, [orderId, connectWs, closeWs]);

  useEffect(() => {
    if (orderId) {
      loadConversationsRef.current?.();
    }
  }, [orderId]);

  useEffect(() => {
    if (!panelOpen) {
      setActiveConvId(null);
      setMessages([]);
      setDraft('');
      setReplyTo(null);
      setMobileView('list');
    }
  }, [panelOpen]);

  useEffect(() => {
    if (panelOpen && activeConvId) {
      loadMessages(activeConvId);
      setMobileView('chat');
    }
  }, [panelOpen, activeConvId, loadMessages]);

  const handleSelectConv = (id) => {
    setReplyTo(null);
    setDraft('');
    setActiveConvId(id);
    setMobileView('chat');
  };

  const handleBackToList = () => {
    setActiveConvId(null);
    setMessages([]);
    setMobileView('list');
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activeConvId || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage({
        conversation_id: activeConvId,
        message_text: text,
        message_type: 'text',
        reply_to_id: replyTo?.id ?? null,
      });
      setMessages((prev) => mergeMessages(prev, [msg]));
      setDraft('');
      setReplyTo(null);
      scrollToBottom();
    } catch (err) {
      messageApi?.error?.(err?.response?.data?.detail || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      messageApi?.success?.('Message deleted');
    } catch (err) {
      messageApi?.error?.(err?.response?.data?.detail || 'Failed to delete message');
    }
  };

  const handleEditMessage = async (messageId, messageText) => {
    const text = messageText.trim();
    if (!text) {
      messageApi?.warning?.('Message cannot be empty');
      return false;
    }
    try {
      const msg = await editMessage(messageId, text);
      setMessages((prev) => upsertMessage(prev, msg));
      messageApi?.success?.('Message updated');
      return true;
    } catch (err) {
      messageApi?.error?.(err?.response?.data?.detail || 'Failed to edit message');
      return false;
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    try {
      await deleteConversation(conversationId);
      setConversations((prev) => {
        const removed = prev.find((c) => c.id === conversationId);
        const next = prev.filter((c) => c.id !== conversationId);
        if (removed?.unread_count) {
          setTotalUnread((t) => Math.max(0, t - removed.unread_count));
        }
        return next;
      });
      if (activeConvIdRef.current === conversationId) {
        setActiveConvId(null);
        setMessages([]);
        setDraft('');
        setReplyTo(null);
        setMobileView('list');
      }
      messageApi?.success?.('Conversation permanently deleted');
      return true;
    } catch (err) {
      messageApi?.error?.(
        err?.response?.data?.detail || 'Failed to delete conversation'
      );
      return false;
    }
  };

  const handleClearAllMessages = async (conversationId) => {
    try {
      await clearConversationMessages(conversationId);
      if (activeConvIdRef.current === conversationId) {
        setMessages([]);
        setReplyTo(null);
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                unread_count: 0,
                last_message_preview: null,
                last_message_at: null,
                message_count: 0,
              }
            : c
        )
      );
      messageApi?.success?.('All messages cleared');
      return true;
    } catch (err) {
      messageApi?.error?.(
        err?.response?.data?.detail || 'Failed to clear messages'
      );
      return false;
    }
  };

  const handleCreateConversation = async ({
    createType,
    createName,
    createParticipants,
    stakeholders: stakeList,
    orderLabel,
    onSuccess,
  }) => {
    let participantIds = [];
    if (createType === 'group') {
      participantIds = createParticipants.length
        ? [...new Set([currentUserId, ...createParticipants])]
        : stakeList.map((s) => s.user_id);
      if (participantIds.length < 2) {
        messageApi?.warning?.('Select at least one other participant');
        return false;
      }
    } else {
      if (createParticipants.length !== 1) {
        messageApi?.warning?.('Select one person for private chat');
        return false;
      }
      participantIds = [currentUserId, createParticipants[0]];
    }

    const name = createName?.trim();
    if (!name) {
      messageApi?.warning?.('Conversation name is required');
      return false;
    }

    try {
      const conv = await createConversation({
        order_id: Number(orderId),
        conversation_name: name,
        conversation_type: createType,
        participant_ids: participantIds,
      });
      await loadConversations();
      setActiveConvId(conv.id);
      setMobileView('chat');
      onSuccess?.();
      messageApi?.success?.(
        createType === 'individual' ? 'Private chat ready' : 'Group chat created'
      );
      return true;
    } catch (err) {
      messageApi?.error?.(
        err?.response?.data?.detail || 'Failed to create conversation'
      );
      return false;
    }
  };

  return {
    loading,
    conversations,
    totalUnread,
    stakeholders,
    activeConvId,
    messages,
    messagesLoading,
    draft,
    setDraft,
    sending,
    replyTo,
    setReplyTo,
    mobileView,
    wsConnected,
    messagesEndRef,
    scrollToBottom,
    loadConversations,
    handleSelectConv,
    handleBackToList,
    handleSend,
    handleDeleteMessage,
    handleEditMessage,
    handleDeleteConversation,
    handleClearAllMessages,
    handleCreateConversation,
  };
}

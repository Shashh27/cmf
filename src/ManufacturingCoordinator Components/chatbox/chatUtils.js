import dayjs from 'dayjs';

export function conversationTitle(conv, currentUserId) {
  if (!conv) return 'Chat';
  if (conv.conversation_name) return conv.conversation_name;
  if (conv.conversation_type === 'individual') {
    const other = (conv.participants || []).find((p) => p.user_id !== currentUserId);
    return other?.user_name || 'Private chat';
  }
  const names = (conv.participants || []).map((p) => p.user_name).filter(Boolean);
  return names.length ? names.join(', ') : 'Group chat';
}

export function formatMsgTime(ts) {
  if (!ts) return '';
  return dayjs(ts).format('HH:mm');
}

export function formatConvTime(ts) {
  if (!ts) return '';
  const d = dayjs(ts);
  const today = dayjs();
  if (d.isSame(today, 'day')) return d.format('HH:mm');
  if (d.isSame(today.subtract(1, 'day'), 'day')) return 'Yesterday';
  return d.format('DD/MM/YY');
}

export function avatarInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export function sumUnread(conversations) {
  if (!Array.isArray(conversations)) return 0;
  return conversations.reduce((n, c) => n + (c.unread_count || 0), 0);
}

export function mergeMessages(prev, incoming) {
  const ids = new Set(prev.map((m) => m.id));
  const merged = [...prev];
  for (const m of incoming) {
    if (!ids.has(m.id)) merged.push(m);
  }
  return merged.sort((a, b) => a.id - b.id);
}

export function upsertMessage(prev, updated) {
  if (!updated?.id) return prev;
  const idx = prev.findIndex((m) => m.id === updated.id);
  if (idx === -1) return mergeMessages(prev, [updated]);
  const next = [...prev];
  next[idx] = { ...next[idx], ...updated };
  return next;
}

export function isMessageEdited(message) {
  if (!message?.updated_at || !message?.created_at) return false;
  return message.updated_at !== message.created_at;
}

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
]);

export function getPendingFileCategory(file) {
  if (!file?.name) return 'file';
  const ext = file.name.includes('.')
    ? `.${file.name.split('.').pop().toLowerCase()}`
    : '';
  if (IMAGE_EXTENSIONS.has(ext) || file.type?.startsWith('image/')) return 'image';
  if (VIDEO_EXTENSIONS.has(ext) || file.type?.startsWith('video/')) return 'video';
  return 'file';
}

export function canPreviewPendingFile(category) {
  return category === 'image' || category === 'video';
}

export function applyConversationsPayload(setConversations, setTotalUnread, payload) {
  if (!payload || payload.type !== 'conversations') return;
  if (Array.isArray(payload.conversations)) {
    setConversations(payload.conversations);
    setTotalUnread(
      typeof payload.total_unread === 'number'
        ? payload.total_unread
        : sumUnread(payload.conversations)
    );
  } else if (typeof payload.total_unread === 'number') {
    setTotalUnread(payload.total_unread);
  }
}

export function bumpConversationUnread(prev, convId, message, currentUserId) {
  if (!message || message.sender_id === currentUserId) return prev;
  const next = prev.map((c) =>
    c.id === convId
      ? {
          ...c,
          unread_count: (c.unread_count || 0) + 1,
          last_message_preview: (message.message_text || '').slice(0, 120),
          last_message_at: message.created_at || c.last_message_at,
        }
      : c
  );
  return next;
}

import { api } from '../../api/client.js';

const BASE = '/chatbox';

export async function fetchOrderStakeholders(orderId) {
  const { data } = await api.get(`${BASE}/orders/${orderId}/stakeholders`);
  return data;
}

export async function fetchConversationsForOrder(orderId) {
  const { data } = await api.get(`${BASE}/conversations/order/${orderId}`);
  return data;
}

export async function fetchConversation(conversationId) {
  const { data } = await api.get(`${BASE}/conversations/${conversationId}`);
  return data;
}

export async function createConversation(payload) {
  const { data } = await api.post(`${BASE}/conversations`, payload);
  return data;
}

export async function fetchMessages(conversationId, afterId = null) {
  const params = afterId != null ? { after_id: afterId } : undefined;
  const { data } = await api.get(
    `${BASE}/conversations/${conversationId}/messages`,
    { params }
  );
  return data;
}

export async function sendMessage(payload) {
  const { data } = await api.post(`${BASE}/messages`, payload);
  return data;
}

export async function uploadMessageAttachment({
  conversationId,
  file,
  replyToId = null,
  messageText = '',
}) {
  const form = new FormData();
  form.append('file', file);
  form.append('conversation_id', String(conversationId));
  if (replyToId != null) form.append('reply_to_id', String(replyToId));
  if (messageText.trim()) form.append('message_text', messageText.trim());
  const { data } = await api.post(`${BASE}/messages/with-attachment`, form);
  return data;
}

export async function markAllRead(conversationId) {
  const { data } = await api.post(
    `${BASE}/conversations/${conversationId}/mark-all-read`
  );
  return data;
}

export async function markMessageRead(messageId) {
  const { data } = await api.post(`${BASE}/messages/${messageId}/read`);
  return data;
}

export async function deleteMessage(messageId) {
  const { data } = await api.delete(`${BASE}/messages/${messageId}`);
  return data;
}

export async function editMessage(messageId, messageText) {
  const { data } = await api.put(`${BASE}/messages/${messageId}`, {
    message_text: messageText,
  });
  return data;
}

export async function deleteConversation(conversationId) {
  const { data } = await api.delete(`${BASE}/conversations/${conversationId}`);
  return data;
}

export async function clearConversationMessages(conversationId) {
  const { data } = await api.delete(`${BASE}/conversations/${conversationId}/messages`);
  return data;
}

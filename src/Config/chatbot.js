// Chatbot Configuration
// Uses Vite proxy (/api/chatbot → backend:3000). Override with VITE_CHATBOT_API_BASE_URL if needed.
export const CHATBOT_CONFIG = {
  API_BASE_URL: import.meta.env.VITE_CHATBOT_API_BASE_URL || '/api/chatbot',
  CHAT_ENDPOINT: '/chat',
  STREAM_ENDPOINT: '/chat/stream',
  HISTORY_ENDPOINT: '/history',
  SUGGESTIONS_ENDPOINT: '/suggestions',
};
// Chatbot — use Vite proxy in dev (/api/chatbot → backend). Override with VITE_CHATBOT_API_BASE_URL.
export const CHATBOT_CONFIG = {
  API_BASE_URL: import.meta.env.VITE_CHATBOT_API_BASE_URL || '/api/chatbot',
  CHAT_ENDPOINT: '/chat',
  STREAM_ENDPOINT: '/chat/stream',
  HISTORY_ENDPOINT: '/history',
  SUGGESTIONS_ENDPOINT: '/suggestions',
};

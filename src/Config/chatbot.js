// Chatbot — uses Vite proxy only (/api/chatbot → backend:3000).
// Override with a full URL if you need to hit chatbot without the proxy.
export const CHATBOT_CONFIG = {
  API_BASE_URL: '/api/chatbot',
  CHAT_ENDPOINT: '/chat',
  STREAM_ENDPOINT: '/chat/stream',
  HISTORY_ENDPOINT: '/history',
  SUGGESTIONS_ENDPOINT: '/suggestions',
};

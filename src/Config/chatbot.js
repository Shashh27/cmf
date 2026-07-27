// Chatbot — call backend directly (same host as auth.js). JWT via authFetch.
export const CHATBOT_CONFIG = {
  API_BASE_URL: 'http://172.18.7.86:3000/api/chatbot',
  CHAT_ENDPOINT: '/chat',
  STREAM_ENDPOINT: '/chat/stream',
  HISTORY_ENDPOINT: '/history',
  SUGGESTIONS_ENDPOINT: '/suggestions',
};

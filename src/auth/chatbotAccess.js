import { normalizeRoleKey } from './roleHomes.js';

/** CMF AI chatbot is available only to Admin and Manufacturing Coordinator. */
export function isChatbotAllowedRole(user) {
  const role = normalizeRoleKey(user?.role || user?.user_role);
  return role === 'admin' || role === 'manufacturing_coordinator';
}

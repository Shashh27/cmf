/** Parse logged-in user from localStorage. */
export function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Role labels that may appear in notification `created_by` for a given user. */
function roleCreatedByLabels(role) {
  const r = String(role || '').toLowerCase();
  const labels = [];
  if (r.includes('admin')) labels.push('admin');
  if (r.includes('manufacturing') || r === 'mc') labels.push('mc', 'manufacturing');
  if (r.includes('project') || r === 'pc') labels.push('pc', 'project');
  return labels;
}

/** True when the notification was created by the current user (username or role label). */
export function isSelfCreatedNotification(notification, user) {
  if (!notification?.created_by || !user) return false;

  const createdBy = String(notification.created_by).toLowerCase().trim();

  const names = [user.username, user.user_name, user.name]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase().trim());

  if (names.includes(createdBy)) return true;

  const role = user.role || user.user_role;
  return roleCreatedByLabels(role).includes(createdBy);
}

/** Exclude notifications the current user created themselves. */
export function filterOwnCreatedNotifications(notifications, user) {
  if (!Array.isArray(notifications)) return [];
  if (!user) return notifications;
  return notifications.filter((n) => !isSelfCreatedNotification(n, user));
}

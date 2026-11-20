/** Normalize role strings for comparison (spaces/hyphens → snake_case). */
export function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

export function isQaRole(role) {
  const r = normalizeRole(role);
  return r === 'quality_assurance' || r === 'qa';
}

/** QA aliases match each other; otherwise exact normalized role. */
export function rolesMatch(roleA, roleB) {
  const a = normalizeRole(roleA);
  const b = normalizeRole(roleB);
  if (!a || !b) return false;
  if (a === b) return true;
  return isQaRole(a) && isQaRole(b);
}

/** Current user role from localStorage `user`. */
export function getStoredUserRole() {
  try {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const u = JSON.parse(stored);
    return u?.role || null;
  } catch {
    return null;
  }
}

/**
 * Download rules:
 * - QA-uploaded docs → any logged-in role may download
 * - PC / Admin / MC uploads → only the same uploading role may download
 */
export function canDownloadDocument(doc, currentUserRole = getStoredUserRole()) {
  if (isQaRole(doc?.user_role)) return true;
  return rolesMatch(doc?.user_role, currentUserRole);
}

export const DOWNLOAD_ROLE_TOOLTIP =
  'Only the uploading role can download this document';

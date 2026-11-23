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

export function isPcRole(role) {
  const r = normalizeRole(role);
  return r === 'project_coordinator' || r === 'pc' || r === 'coordinator';
}

/** Current user id from localStorage `user`. */
export function getStoredUserId() {
  try {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const u = JSON.parse(stored);
    const id = u?.id ?? u?.user_id;
    return id != null ? Number(id) : null;
  } catch {
    return null;
  }
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
 * Download rules (session role at upload time):
 * - QA-uploaded docs → any logged-in role may download
 * - otherwise → only the same uploading role (MC upload ≠ PC download,
 *   even for the same person)
 */
export function canDownloadDocument(doc, currentUserRole = getStoredUserRole()) {
  const uploadRole = doc?.uploaded_role || doc?.user_role;
  if (isQaRole(uploadRole)) return true;
  return rolesMatch(uploadRole, currentUserRole);
}

export const DOWNLOAD_ROLE_TOOLTIP =
  'Only the uploading role can download this document';

/**
 * Delete rules:
 * - PC-uploaded docs → only the uploading user (any viewer)
 * - QA-uploaded docs → only the uploading user
 * - Logged-in PC → only own uploads
 * - Admin / MC on other docs → allowed (existing behavior)
 */
export function canDeleteDocument(
  doc,
  currentUserId = getStoredUserId(),
  currentUserRole = getStoredUserRole(),
) {
  if (currentUserId == null) return false;
  const isOwner =
    doc?.user_id != null && Number(doc.user_id) === Number(currentUserId);

  if (isPcRole(doc?.user_role)) return isOwner;
  if (isQaRole(doc?.user_role)) return isOwner;
  if (isPcRole(currentUserRole)) return isOwner;
  return true;
}

export const DELETE_OWNER_TOOLTIP =
  'Only the user who uploaded this document can delete it';

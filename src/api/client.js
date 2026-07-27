/**
 * Shared Axios client: access token in memory, refresh + user profile in localStorage.
 */
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth.js';

const REFRESH_STORAGE_KEY = 'cmf_refresh_token';
const USER_STORAGE_KEY = 'cmf_user';

let accessToken = null;
let refreshToken = null;
let onUnauthorized = null;
let refreshPromise = null;
let sessionRestorePromise = null;
let isBootstrapping = false;

function readStoredRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredRefreshToken(token) {
  try {
    if (token) {
      localStorage.setItem(REFRESH_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

refreshToken = readStoredRefreshToken();

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export function setRefreshToken(token) {
  refreshToken = token || null;
  writeStoredRefreshToken(refreshToken);
}

export function getRefreshToken() {
  return refreshToken || readStoredRefreshToken();
}

export function setSessionUser(user) {
  writeStoredUser(user);
}

export function clearStoredSession() {
  setAccessToken(null);
  setRefreshToken(null);
  writeStoredUser(null);
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export function getIsBootstrapping() {
  return isBootstrapping;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  // Wait for session restore on page load before sending protected requests.
  if (!accessToken && sessionRestorePromise) {
    await sessionRestorePromise;
  }
  config.headers = config.headers || {};
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers['Content-Type']) {
      delete config.headers['Content-Type'];
    }
  } else if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

export async function refreshAccessToken() {
  const rt = getRefreshToken();
  if (!rt) {
    throw new Error('No refresh token');
  }
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refresh_token: rt })
      .then((res) => {
        const token = res.data?.access_token;
        const nextRefresh = res.data?.refresh_token || rt;
        const user = res.data?.user;
        setAccessToken(token);
        setRefreshToken(nextRefresh);
        if (user) setSessionUser(user);
        return { access_token: token, refresh_token: nextRefresh, user };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Single shared restore call — safe with React Strict Mode double-mount. */
export function restoreSessionFromStorage() {
  if (sessionRestorePromise) {
    return sessionRestorePromise;
  }
  const rt = getRefreshToken();
  if (!rt) {
    return Promise.resolve(null);
  }
  isBootstrapping = true;
  sessionRestorePromise = refreshAccessToken()
    .then((result) => result)
    .catch(() => null)
    .finally(() => {
      isBootstrapping = false;
    });
  return sessionRestorePromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (!original || error.response?.status !== 401) {
      return Promise.reject(error);
    }
    const url = original.url || '';
    if (url.includes('/login') || url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }
    if (isBootstrapping && sessionRestorePromise) {
      try {
        await sessionRestorePromise;
        original.headers = original.headers || {};
        if (accessToken) {
          original.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }
    if (isBootstrapping) {
      return Promise.reject(error);
    }
    if (original._retry) {
      clearStoredSession();
      if (onUnauthorized) onUnauthorized();
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      const result = await refreshAccessToken();
      if (!result?.access_token) throw new Error('No access token');
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${result.access_token}`;
      return api(original);
    } catch (refreshErr) {
      clearStoredSession();
      if (onUnauthorized) onUnauthorized();
      return Promise.reject(refreshErr);
    }
  }
);

export async function authFetch(input, init = {}) {
  if (!accessToken && sessionRestorePromise) {
    await sessionRestorePromise;
  }
  // Proactively refresh before calling if memory token is gone but refresh exists
  // (new tab, HMR, or access token cleared while page stayed open).
  if (!accessToken && getRefreshToken()) {
    try {
      await refreshAccessToken();
    } catch {
      // handled below
    }
  }
  if (!accessToken) {
    // Do not spam the API without a Bearer token (EMS polls were doing this).
    return new Response(JSON.stringify({ detail: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  const opts = { ...init, headers };
  let res = await fetch(input, opts);
  if (res.status !== 401) return res;

  const url = typeof input === 'string' ? input : input.url;
  if (url?.includes('/login') || url?.includes('/auth/refresh')) return res;

  try {
    const result = await refreshAccessToken();
    if (!result?.access_token) {
      clearStoredSession();
      if (onUnauthorized) onUnauthorized();
      return res;
    }
    headers.set('Authorization', `Bearer ${result.access_token}`);
    res = await fetch(input, { ...opts, headers });
  } catch {
    clearStoredSession();
    if (onUnauthorized) onUnauthorized();
  }
  return res;
}

export default api;

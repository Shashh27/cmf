import { API_BASE_URL } from '../Config/auth.js';

/**
 * Resolve API path to an absolute URL (supports relative `/api/v1` base).
 */
export function toAbsoluteApiUrl(path) {
  const cleanPath = String(path || '').replace(/^\//, '');
  const base = String(API_BASE_URL || '/api/v1').replace(/\/$/, '');

  if (base.startsWith('http://') || base.startsWith('https://')) {
    return new URL(`${base}/${cleanPath}`);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  return new URL(`${base}/${cleanPath}`, origin);
}

/**
 * WebSocket URL for an API path like `monitoring/live/ws`.
 */
export function getApiWsUrl(path) {
  const url = toAbsoluteApiUrl(path);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth.js';
import {
  api,
  setAccessToken,
  setRefreshToken,
  setSessionUser,
  getAccessToken,
  getRefreshToken,
  readStoredUser,
  clearStoredSession,
  restoreSessionFromStorage,
  setUnauthorizedHandler,
} from '../api/client.js';

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

const AuthContext = createContext(null);

function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [accessToken, setAccessTokenState] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(() => Boolean(getRefreshToken()));
  const idleTimerRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessTokenState(null);
    clearStoredSession();
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('user');
  }, []);

  const logout = useCallback(async () => {
    const machine = localStorage.getItem('selectedMachine');
    const rt = getRefreshToken();
    try {
      if (rt) {
        await axios.post(`${API_BASE_URL}/auth/logout`, { refresh_token: rt });
      }
    } catch {
      // still clear local session
    }
    clearSession();
    localStorage.clear();
    if (machine) {
      localStorage.setItem('selectedMachine', machine);
    }
  }, [clearSession]);

  const logoutToLogin = useCallback(
    async (navigate) => {
      navigate('/login', { replace: true, state: null });
      await logout();
    },
    [logout]
  );

  const applySession = useCallback((token, refresh, profile) => {
    setAccessToken(token);
    setRefreshToken(refresh);
    setSessionUser(profile);
    setAccessTokenState(token);
    setUser(profile);
    // Back-compat: many components still read the current user from localStorage.
    try {
      if (profile) {
        localStorage.setItem('user', JSON.stringify(profile));
        localStorage.setItem('isAuthenticated', 'true');
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const login = useCallback(
    async (user_name, password) => {
      const { data } = await axios.post(`${API_BASE_URL}/login/`, {
        user_name,
        password,
      });
      const profile = data?.user;
      const token = data?.access_token;
      const refresh = data?.refresh_token;
      if (!profile?.id || !token || !refresh) {
        throw new Error('Login response missing token or user');
      }
      applySession(token, refresh, profile);
      return { user: profile, access_token: token };
    },
    [applySession]
  );

  useEffect(() => {
    let active = true;
    restoreSessionFromStorage()
      .then((result) => {
        if (!active) return;
        if (result?.access_token && result?.user) {
          applySession(
            result.access_token,
            result.refresh_token || getRefreshToken(),
            result.user
          );
        } else if (getRefreshToken()) {
          clearSession();
        }
      })
      .finally(() => {
        if (active) setBootstrapping(false);
      });
    return () => {
      active = false;
    };
  }, [applySession, clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!userRef.current && !getAccessToken()) return;
    idleTimerRef.current = setTimeout(() => {
      logout().finally(() => {
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      });
    }, IDLE_TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    if (!user && !accessToken) return undefined;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [user, accessToken, resetIdleTimer]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(accessToken && user),
      bootstrapping,
      login,
      logout,
      logoutToLogin,
      clearSession,
      normalizeRole,
      api,
    }),
    [user, accessToken, bootstrapping, login, logout, logoutToLogin, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export default AuthContext;

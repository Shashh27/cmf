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

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const AuthContext = createContext(null);

function normalizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const idleTimerRef = useRef(null);

  const clearSession = useCallback(() => {
    setUser(null);
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('user');
  }, []);

  const logout = useCallback(async () => {
    const machine = localStorage.getItem('selectedMachine');
    clearSession();
    localStorage.clear();
    if (machine) {
      localStorage.setItem('selectedMachine', machine);
    }
  }, [clearSession]);

  const login = useCallback(async (user_name, password) => {
    const { data } = await axios.post(`${API_BASE_URL}/login/`, {
      user_name,
      password,
    });
    const profile = data?.user || data;
    setUser(profile);
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('user', JSON.stringify(profile));
    return { user: profile };
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!user) return;
    idleTimerRef.current = setTimeout(() => {
      logout().finally(() => {
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      });
    }, IDLE_TIMEOUT_MS);
  }, [logout, user]);

  useEffect(() => {
    if (!user) return undefined;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [user, resetIdleTimer]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      bootstrapping: false,
      login,
      logout,
      normalizeRole,
    }),
    [user, login, logout]
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

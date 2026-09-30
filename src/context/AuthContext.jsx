import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '../services/runtimeConfig.js';

const AuthContext = createContext();

const readStoredAuth = () => {
  const localUser = localStorage.getItem('user');
  const sessionUser = sessionStorage.getItem('user');
  const localToken = localStorage.getItem('token');
  const sessionToken = sessionStorage.getItem('token');

  const hasLocalAuth = Boolean(localUser && localToken);
  const hasSessionAuth = Boolean(sessionUser && sessionToken);
  const storage = hasLocalAuth ? 'local' : 'session';
  const userRaw = hasLocalAuth ? localUser : hasSessionAuth ? sessionUser : null;
  const token = hasLocalAuth ? localToken : hasSessionAuth ? sessionToken : null;

  if (!hasLocalAuth) {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }

  if (!hasSessionAuth) {
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
  }

  return {
    storage,
    user: userRaw ? JSON.parse(userRaw) : null,
    token: token || null
  };
};

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const initialAuth = useMemo(() => readStoredAuth(), []);
  const [user, setUserState] = useState(initialAuth.user);
  const [token, setToken] = useState(initialAuth.token);
  const [storageMode, setStorageMode] = useState(initialAuth.storage);

  const storageApi = storageMode === 'session' ? sessionStorage : localStorage;
  const otherStorage = storageMode === 'session' ? localStorage : sessionStorage;

  const persistAuth = ({ nextUser, nextToken, mode = storageMode }) => {
    const primary = mode === 'session' ? sessionStorage : localStorage;
    const secondary = mode === 'session' ? localStorage : sessionStorage;

    setStorageMode(mode);
    setUserState(nextUser ?? null);
    setToken(nextToken ?? null);

    if (nextUser) {
      primary.setItem('user', JSON.stringify(nextUser));
    } else {
      primary.removeItem('user');
    }

    if (nextToken) {
      primary.setItem('token', nextToken);
    } else {
      primary.removeItem('token');
    }

    secondary.removeItem('user');
    secondary.removeItem('token');
  };

  const updateUser = (newUserData) => {
    const previousUser = user;
    const nextUser = typeof newUserData === 'function'
      ? newUserData(previousUser)
      : { ...previousUser, ...newUserData };

    persistAuth({ nextUser, nextToken: token, mode: storageMode });

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'user',
      newValue: JSON.stringify(nextUser),
      oldValue: JSON.stringify(previousUser)
    }));

    return nextUser;
  };

  const login = async (credentials, options = {}) => {
    const remember = options.remember !== false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);  // 12s — enough for slower connections
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        // Surface structured backend errors clearly
        const msg = data.message || data.error || `Login failed (${res.status})`;
        const code = data.code || 'LOGIN_FAILED';
        if (code === 'DATABASE_UNAVAILABLE') {
          throw new Error(
            'The authentication service is temporarily unavailable. ' +
            'The database cannot be reached. Try again later or use the development path.'
          );
        }
        throw new Error(msg);
      }

      persistAuth({
        nextUser: data.user,
        nextToken: data.token,
        mode: remember ? 'local' : 'session'
      });

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        // The login request timed out. In development mode an explicit env
        // flag (VITE_ENABLE_DEMO_FALLBACK=true) may enable an offline
        // placeholder, but production must never silently grant auth.
        if (import.meta.env.VITE_ENABLE_DEMO_FALLBACK === 'true') {
          const demoUser = {
            user: {
              _id: 'demo-user',
              name: credentials.email.split('@')[0],
              email: credentials.email,
              reputation: { trustScore: 85 },
              verifiedReporter: true
            },
            token: `demo-token-${Date.now()}`
          };

          persistAuth({
            nextUser: demoUser.user,
            nextToken: demoUser.token,
            mode: remember ? 'local' : 'session'
          });

          return demoUser;
        }

        // Production: surface the timeout to the caller so the UI can
        // show an accurate error instead of a false authenticated state.
        throw new Error(
          'Login request timed out. Check your connection and try again.'
        );
      }

      throw err;
    }
  };

  /**
   * Verify the stored token is still accepted by the server.
   * Called once at startup when a token is already in storage.
   * On 401 (stale DEV_AUTH token after server restart, expired JWT, etc.)
   * the stored credentials are cleared so the user sees the login screen
   * rather than a broken authenticated state.
   *
   * Skipped when the backend is unreachable (network error / timeout) so
   * an offline user with a valid token is not logged out unnecessarily.
   */
  const verifyStoredToken = async (storedToken) => {
    if (!storedToken) return;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/auth/verify`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${storedToken}` },
        signal: controller.signal
      });
      clearTimeout(id);
      if (res.status === 401 || res.status === 403) {
        // Token is stale / server doesn't recognise it — clear auth state
        persistAuth({ nextUser: null, nextToken: null, mode: storageMode });
      }
      // 200 → still valid, leave state alone
      // 503/500 → backend unavailable, leave state alone (don't log out)
    } catch {
      // Network error or abort → backend unreachable, keep state as-is
    }
  };

  // Verify stored token once on mount — detects stale DEV_AUTH sessions
  // after a server restart without forcing re-login when offline.
  useEffect(() => {
    if (initialAuth.token) {
      verifyStoredToken(initialAuth.token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    persistAuth({ nextUser: null, nextToken: null, mode: storageMode });
  };

  useEffect(() => {
    const syncAuth = () => {
      const next = readStoredAuth();
      setStorageMode(next.storage);
      setUserState(next.user);
      setToken(next.token);
    };

    window.addEventListener('storage', syncAuth);
    return () => window.removeEventListener('storage', syncAuth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setUser: updateUser, storageMode, persistAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

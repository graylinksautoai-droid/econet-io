import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '../services/runtimeConfig.js';

const AuthContext = createContext();

const readStoredAuth = () => {
  const localUser = localStorage.getItem('user');
  const sessionUser = sessionStorage.getItem('user');
  const localToken = localStorage.getItem('token');
  const sessionToken = sessionStorage.getItem('token');

  const storage = localToken || localUser ? 'local' : 'session';
  const userRaw = storage === 'local' ? localUser : sessionUser;
  const token = storage === 'local' ? localToken : sessionToken;

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
      const timeoutId = setTimeout(() => controller.abort(), 5000);
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
        throw new Error(data.message || data.error || `Login failed: ${res.status}`);
      }

      persistAuth({
        nextUser: data.user,
        nextToken: data.token,
        mode: remember ? 'local' : 'session'
      });

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
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

      throw err;
    }
  };

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

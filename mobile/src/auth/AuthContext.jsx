import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin } from '../api/endpoints.js';
import { setToken, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    setToken(null); setUser(null);
    try { await SecureStore.deleteItemAsync('token'); await SecureStore.deleteItemAsync('user'); } catch { /* nothing to delete */ }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { logout(); });
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        const saved = await SecureStore.getItemAsync('user');
        if (token && saved) { setToken(token); setUser(JSON.parse(saved)); }
      } catch { /* start logged out */ }
      setReady(true);
    })();
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const result = await apiLogin(email.trim(), password);
    if (result.user.role !== 'guard') {
      const e = new Error('This app is for guards. Managers and clients use the web dashboard.');
      e.code = 'NOT_A_GUARD'; throw e;
    }
    setToken(result.token);
    await SecureStore.setItemAsync('token', result.token);
    await SecureStore.setItemAsync('user', JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

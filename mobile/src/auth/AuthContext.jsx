// Holds "who is logged in" for the whole app. Any component can call useAuth().
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { clearToken, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { clearCache } from '../hooks/cache';

const AuthContext = createContext(null);
const USER_KEY = 'patrol_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // false until we have checked any saved login

  const clearSession = useCallback(() => {
    clearToken();
    localStorage.removeItem(USER_KEY);
    clearCache(); // do not leave saved data behind on a shared computer
    setUser(null);
  }, []);

  // On first load: if a token was saved, ask the server who it belongs to.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    if (!getToken()) { setReady(true); return; }
    authApi.getMe()
      .then(({ data }) => setUser({ id: data.id, full_name: data.full_name, role: data.role, client_id: data.client_id }))
      .catch(clearSession)
      .finally(() => setReady(true));
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const { data } = await authApi.login(email, password);
    setToken(data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* the token is thrown away either way */ }
    clearSession();
  }, [clearSession]);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

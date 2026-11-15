// Owns the offline queue. Screens call enqueue(); this uploads in the background:
// right away, every 15 seconds, and whenever the app comes back to the foreground.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext.jsx';
import { sqliteStore } from '../db.js';
import { syncPending } from '../lib/sync.js';
import { uuid } from '../lib/uuid.js';
import * as api from '../api/endpoints.js';
import { SYNC_INTERVAL_MS } from '../config.js';

const SyncContext = createContext(null);
export const useSync = () => useContext(SyncContext);
export const store = sqliteStore;
const DEVICE_ID = `phone-${uuid().slice(0, 8)}`;

export function SyncProvider({ children }) {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [version, setVersion] = useState(0); // goes up whenever the queue changes, so screens re-read it
  const running = useRef(false);
  const userId = user ? user.id : null;

  const refresh = useCallback(async () => {
    if (userId == null) { setPending(0); return; }
    setPending(await store.pendingCount(userId));
    setVersion((v) => v + 1);
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (userId == null || running.current) return null;
    running.current = true; setSyncing(true);
    try {
      const r = await syncPending({ store, api, userId, deviceId: DEVICE_ID });
      if (r.offline) setOnline(false); else if (!r.serverTrouble) { setOnline(true); setLastSync(new Date()); }
      if (r.authExpired) logout();
      return r;
    } finally { running.current = false; setSyncing(false); await refresh(); }
  }, [userId, logout, refresh]);

  const enqueue = useCallback(async (type, shiftId, payload) => {
    const item = { id: uuid(), user_id: userId, type, shift_id: shiftId, payload, created_at: new Date().toISOString(), status: 'pending' };
    await store.insert(item);
    await refresh();
    syncNow();
    return item;
  }, [userId, refresh, syncNow]);

  useEffect(() => {
    refresh();
    if (userId == null) return undefined;
    syncNow();
    const timer = setInterval(syncNow, SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') syncNow(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [userId, refresh, syncNow]);

  const value = useMemo(() => ({ pending, online, setOnline, syncing, lastSync, version, enqueue, syncNow, refresh }),
    [pending, online, syncing, lastSync, version, enqueue, syncNow, refresh]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

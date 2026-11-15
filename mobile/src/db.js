// The phone's own storage (SQLite): the queue of events waiting to upload, and a saved copy of
// shifts and routes so the app still shows them with no signal.
import * as SQLite from 'expo-sqlite';

let opening;
function open() {
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync('patrol.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS queue (
          id TEXT PRIMARY KEY NOT NULL, user_id INTEGER NOT NULL, type TEXT NOT NULL, shift_id INTEGER NOT NULL,
          payload TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          reason TEXT, attempts INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS queue_user_status ON queue (user_id, status, created_at);
        CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      `);
      return db;
    })();
  }
  return opening;
}
const parse = (r) => ({ ...r, payload: JSON.parse(r.payload) });
const COLUMNS = ['status', 'reason', 'attempts'];

export const sqliteStore = {
  async insert(item) {
    const db = await open();
    await db.runAsync('INSERT INTO queue (id, user_id, type, shift_id, payload, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.user_id, item.type, item.shift_id, JSON.stringify(item.payload), item.created_at, 'pending']);
  },
  async list(userId) { const db = await open(); return (await db.getAllAsync('SELECT * FROM queue WHERE user_id = ? ORDER BY created_at DESC', [userId])).map(parse); },
  async pending(userId) { const db = await open(); return (await db.getAllAsync("SELECT * FROM queue WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC, rowid ASC", [userId])).map(parse); },
  async pendingCount(userId) { const db = await open(); const r = await db.getFirstAsync("SELECT count(*) AS n FROM queue WHERE user_id = ? AND status = 'pending'", [userId]); return r ? r.n : 0; },
  async update(id, patch) {
    const keys = Object.keys(patch).filter((k) => COLUMNS.includes(k));
    if (!keys.length) return;
    const db = await open();
    await db.runAsync(`UPDATE queue SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => patch[k]), id]);
  },
  async getCache(key) { const db = await open(); const r = await db.getFirstAsync('SELECT value FROM cache WHERE key = ?', [key]); return r ? JSON.parse(r.value) : null; },
  async setCache(key, value) { const db = await open(); await db.runAsync('INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]); },
};

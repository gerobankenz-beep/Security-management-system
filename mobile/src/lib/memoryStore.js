// Same interface as the SQLite store, kept in memory. Used by the tests.
export function createMemoryStore() {
  const rows = new Map();
  const cache = new Map();
  const byTime = (a, b) => a.created_at.localeCompare(b.created_at) || a.seq - b.seq;
  let seq = 0;
  return {
    async insert(item) { rows.set(item.id, { reason: null, attempts: 0, ...item, seq: seq++ }); },
    async list(userId) { return [...rows.values()].filter((r) => r.user_id === userId).sort((a, b) => -byTime(a, b)); },
    async pending(userId) { return [...rows.values()].filter((r) => r.user_id === userId && r.status === 'pending').sort(byTime); },
    async pendingCount(userId) { return [...rows.values()].filter((r) => r.user_id === userId && r.status === 'pending').length; },
    async update(id, patch) { Object.assign(rows.get(id), patch); },
    async getCache(key) { return cache.has(key) ? cache.get(key) : null; },
    async setCache(key, value) { cache.set(key, value); },
  };
}

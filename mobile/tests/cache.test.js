import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/lib/memoryStore.js';
import { loadWithCache } from '../src/lib/loadWithCache.js';

test('online: returns fresh data and keeps a copy; offline: returns the copy; offline with no copy: error', async () => {
  const store = createMemoryStore();
  const down = async () => { throw Object.assign(new Error('x'), { network: true }); };
  await assert.rejects(loadWithCache(store, 'k', down), { network: true });
  assert.deepEqual(await loadWithCache(store, 'k', async () => [1, 2]), { data: [1, 2], saved: false });
  assert.deepEqual(await loadWithCache(store, 'k', down), { data: [1, 2], saved: true, offline: true });
  await assert.rejects(loadWithCache(store, 'k', async () => { throw Object.assign(new Error('no'), { status: 403 }); }), { status: 403 });
});

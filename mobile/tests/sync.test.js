import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/lib/memoryStore.js';
import { syncPending } from '../src/lib/sync.js';
import { uuid } from '../src/lib/uuid.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const net = () => Object.assign(new Error('Cannot reach the server'), { network: true });
const http = (status, code, message) => Object.assign(new Error(message || code), { status, code });
let n = 0;
const item = (type, extra = {}) => ({ id: uuid(), user_id: 4, type, shift_id: 101, status: 'pending', created_at: new Date(Date.UTC(2026, 10, 13, 6, 0, n++)).toISOString(),
  payload: type === 'scan' ? { tag_code: 'CP-1-2-C3D4', scanned_at: '2026-11-13T06:10:00.000Z' } : { device_time: '2026-11-13T06:00:00.000Z' }, ...extra });
const fakeApi = (over = {}) => {
  const calls = [];
  return { calls,
    checkIn: async (b) => { calls.push(['in', b]); return {}; },
    checkOut: async (b) => { calls.push(['out', b]); return {}; },
    scansBatch: async (s) => { calls.push(['scans', s]); return s.map((x) => ({ client_scan_id: x.client_scan_id, status: 'accepted' })); },
    ...over };
};

test('uuid() makes valid version-4 ids', () => { for (let i = 0; i < 50; i++) assert.match(uuid(), UUID); });

test('offline: nothing is lost and nothing is marked sent', async () => {
  const store = createMemoryStore();
  await store.insert(item('check_in')); await store.insert(item('scan')); await store.insert(item('scan'));
  const api = fakeApi({ checkIn: async () => { throw net(); }, scansBatch: async () => { throw net(); } });
  const r = await syncPending({ store, api, userId: 4 });
  assert.equal(r.offline, true); assert.equal(r.left, 3); assert.equal(r.sent, 0);
});

test('airplane-mode demo: queue offline, reconnect, everything uploads once, in order', async () => {
  const store = createMemoryStore();
  const ci = item('check_in'); const s1 = item('scan'); const s2 = item('scan'); const co = item('check_out', { payload: { device_time: '2026-11-13T14:00:00.000Z' } });
  for (const x of [ci, s1, s2, co]) await store.insert(x);
  const down = fakeApi({ checkIn: async () => { throw net(); } });
  assert.equal((await syncPending({ store, api: down, userId: 4 })).left, 4);
  const up = fakeApi();
  const r = await syncPending({ store, api: up, userId: 4, deviceId: 'phone-1' });
  assert.deepEqual([r.sent, r.rejected, r.left], [4, 0, 0]);
  assert.deepEqual(up.calls.map((c) => c[0]), ['in', 'out', 'scans']);
  assert.equal(up.calls[0][1].client_event_id, ci.id);
  assert.equal(up.calls[0][1].device_id, 'phone-1');
  assert.equal(up.calls[2][1].length, 2);
  assert.equal(up.calls[2][1][0].client_scan_id, s1.id);
  const again = fakeApi();
  await syncPending({ store, api: again, userId: 4 });
  assert.equal(again.calls.length, 0, 'a second run sends nothing');
});

test('"already checked in" counts as uploaded', async () => {
  const store = createMemoryStore(); const ci = item('check_in'); await store.insert(ci);
  const r = await syncPending({ store, api: fakeApi({ checkIn: async () => { throw http(409, 'ALREADY_CHECKED_IN'); } }), userId: 4 });
  assert.equal(r.sent, 1); assert.equal((await store.list(4))[0].status, 'sent');
});

test('a refused check-in is marked Rejected with the server message, and later items still go', async () => {
  const store = createMemoryStore(); await store.insert(item('check_in')); await store.insert(item('scan'));
  const api = fakeApi({ checkIn: async () => { throw http(409, 'OUTSIDE_SHIFT_WINDOW', 'This check-in time is outside the shift'); } });
  const r = await syncPending({ store, api, userId: 4 });
  assert.equal(r.rejected, 1); assert.equal(r.sent, 1); assert.equal(r.left, 0);
  const rows = await store.list(4);
  assert.match(rows.find((x) => x.type === 'check_in').reason, /outside the shift/);
});

test('scan results: rejected is kept as Rejected, duplicate counts as uploaded', async () => {
  const store = createMemoryStore(); const a = item('scan'); const b = item('scan'); const c = item('scan');
  for (const x of [a, b, c]) await store.insert(x);
  const api = fakeApi({ scansBatch: async (s) => [{ client_scan_id: s[0].client_scan_id, status: 'accepted' }, { client_scan_id: s[1].client_scan_id, status: 'rejected', reason: 'UNKNOWN_TAG' }, { client_scan_id: s[2].client_scan_id, status: 'duplicate' }] });
  const r = await syncPending({ store, api, userId: 4 });
  assert.deepEqual([r.sent, r.rejected, r.left], [2, 1, 0]);
  assert.equal((await store.list(4)).find((x) => x.id === b.id).reason, 'UNKNOWN_TAG');
});

test('a server fault (500) keeps items waiting; a 401 is reported so the app can log out', async () => {
  const store = createMemoryStore(); await store.insert(item('scan'));
  const r500 = await syncPending({ store, api: fakeApi({ scansBatch: async () => { throw http(500, 'INTERNAL', 'boom'); } }), userId: 4 });
  assert.equal(r500.serverTrouble, true); assert.equal(r500.left, 1);
  const r401 = await syncPending({ store, api: fakeApi({ scansBatch: async () => { throw http(401, 'UNAUTHORIZED'); } }), userId: 4 });
  assert.equal(r401.authExpired, true); assert.equal(r401.left, 1);
});

test('only the logged-in guard\'s items are uploaded', async () => {
  const store = createMemoryStore(); await store.insert(item('scan', { user_id: 5 }));
  const api = fakeApi(); await syncPending({ store, api, userId: 4 });
  assert.equal(api.calls.length, 0); assert.equal(await store.pendingCount(5), 1);
});

test('batches of more than 100 scans are split', async () => {
  const store = createMemoryStore(); for (let i = 0; i < 230; i++) await store.insert(item('scan'));
  const api = fakeApi(); const r = await syncPending({ store, api, userId: 4 });
  assert.deepEqual(api.calls.map((c) => c[1].length), [100, 100, 30]); assert.equal(r.left, 0);
});

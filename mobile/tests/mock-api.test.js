// The mock backend must behave like the real one, because the demo and the screens rely on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { request, setToken, NetworkError } from '../src/api/client.js';
import * as api from '../src/api/endpoints.js';
import { setMockOffline, resetMobileMocks } from '../src/mocks/index.js';

test('login, my shifts, check-in, duplicate scan, and offline behaviour', async () => {
  resetMobileMocks();
  await assert.rejects(api.login('amina@example.com', 'wrong'), { status: 401 });
  const { token, user } = await api.login('amina@example.com', 'Password123!');
  assert.equal(user.role, 'guard'); setToken(token);
  const shifts = await api.getMyShifts(); assert.equal(shifts.length, 2);
  const route = await api.getShiftRoute(101); assert.equal(route.checkpoints.length, 4);
  assert.equal((await api.getShiftRounds(101)).length, 3);

  const ev = { client_event_id: 'e1', shift_id: 101, device_time: new Date().toISOString(), latitude: 0.33, longitude: 32.59 };
  assert.equal((await api.checkIn(ev)).duplicate, false);
  assert.equal((await api.checkIn(ev)).duplicate, true, 'same id again is safe');
  await assert.rejects(api.checkIn({ ...ev, client_event_id: 'e2' }), { code: 'ALREADY_CHECKED_IN' });

  const scan = { client_scan_id: 's1', shift_id: 101, tag_code: 'CP-1-2-C3D4', scanned_at: new Date().toISOString() };
  const r = await api.scansBatch([scan, { ...scan, client_scan_id: 's2', tag_code: 'NOPE' }]);
  assert.deepEqual(r.map((x) => x.status), ['accepted', 'rejected']);
  assert.equal(r[1].reason, 'UNKNOWN_TAG');
  assert.equal((await api.scansBatch([scan]))[0].status, 'duplicate');

  setMockOffline(true);
  await assert.rejects(api.getMyShifts(), (e) => e instanceof NetworkError && e.network === true);
  setMockOffline(false);
  setToken('bad'); await assert.rejects(api.getMyShifts(), { status: 401 });
});

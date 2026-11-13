// Integration tests: check-in and check-out (safe to resend), attendance lists, no-show job, corrections.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { startServer } = require('./helpers');
const { query } = require('../src/config/db');
const { markNoShows } = require('../src/modules/attendance/noshow');
const { weekStartOf, toKampalaDate } = require('../src/utils/time');

let api; let admin; let manager; let supervisorTok;
const stamp = Date.now() * 1000 + Math.floor(Math.random() * 1000);
const w = {};
const uuid = () => crypto.randomUUID();
const post = (path, token, body) => api.request(path, { method: 'POST', token, body });
const MIN = 60000;
const hhmm = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(11, 16);   // Kampala clock time
const SITE = { lat: 0.31, lng: 32.58 };

// Makes a guard, a shift that started `startOffsetMin` minutes ago (negative = in the future) and returns what the tests need
async function makeShift(label, startOffsetMin) {
  const now = new Date();
  const start = new Date(now.getTime() - startOffsetMin * MIN);
  const tpl = (await post('/shift-templates', admin, { name: `${label} ${stamp}`, start_time: hhmm(start), end_time: hhmm(new Date(start.getTime() + 8 * 60 * MIN)) })).body.data;
  const guard = (await post('/guards', admin, { full_name: `Att ${label}`, email: `att.${label}.${stamp}@example.com`, hourly_rate_ugx: 5000, site_ids: [w.site.id] })).body.data;
  const date = toKampalaDate(start);
  const roster = (await post('/rosters', manager, { site_id: w.site.id, week_start: weekStartOf(date) })).body;
  const rosterId = roster.data ? roster.data.id : w.rosterIds[weekStartOf(date)];
  w.rosterIds[weekStartOf(date)] = rosterId;
  const shift = (await post(`/rosters/${rosterId}/shifts`, manager, { guard_id: guard.id, shift_template_id: tpl.id, date })).body.data;
  const login = await api.request('/auth/login', { method: 'POST', body: { email: guard.email, password: guard.temporary_password } });
  return { guard, shift, rosterId, token: login.body.data.token, date, start };
}

before(async () => {
  api = await startServer();
  admin = await api.login('admin@example.com'); manager = await api.login('manager@example.com'); supervisorTok = await api.login('supervisor@example.com');
  const client = (await post('/clients', admin, { name: `Att Co ${stamp}` })).body.data;
  w.site = (await post('/sites', admin, { client_id: client.id, name: `Att Site ${stamp}`, latitude: SITE.lat, longitude: SITE.lng, geofence_radius_m: 150, guards_required_day: 0, guards_required_night: 0 })).body.data;
  const sup = (await api.request('/auth/me', { token: supervisorTok })).body.data;
  await api.request(`/sites/${w.site.id}/supervisors`, { method: 'PUT', token: admin, body: { user_ids: [sup.id] } });
  w.rosterIds = {};
  w.onTime = await makeShift('OnTime', 2);       // started 2 minutes ago
  w.late = await makeShift('Late', 40);          // started 40 minutes ago
  w.far = await makeShift('Far', 5);
  w.nogps = await makeShift('NoGps', 5);
  w.early = await makeShift('Early', -180);      // starts in 3 hours
  w.absent = await makeShift('Absent', 120);     // started 2 hours ago, nobody comes
  w.offline = await makeShift('Offline', 15);    // check-in will be sent late, with the phone's own time
  w.future = await makeShift('FutureClock', 5);  // phone clock is ahead
  for (const roster of Object.values(w.rosterIds)) await post(`/rosters/${roster}/publish`, manager);
});
after(async () => { await api.stop(); });

const near = { latitude: SITE.lat + 0.0001, longitude: SITE.lng + 0.0001, accuracy_m: 8, device_id: 'test-phone' };

test('check-in inside the geofence on time: 201, on_time, verified, shift becomes in_progress', async () => {
  const id = uuid();
  const res = await post('/attendance/check-in', w.onTime.token, { client_event_id: id, shift_id: w.onTime.shift.id, device_time: new Date().toISOString(), ...near });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.status, 'on_time');
  assert.strictEqual(res.body.data.verification_status, 'verified');
  assert.ok(res.body.data.distance_from_site_m < 30);
  assert.strictEqual(res.body.data.duplicate, false);
  w.onTime.eventId = id; w.onTime.attendanceId = res.body.data.id;
  const mine = await api.request(`/me/shifts?from=${w.onTime.date}&to=${w.onTime.date}`, { token: w.onTime.token });
  assert.strictEqual(mine.body.data.find((s) => s.id === w.onTime.shift.id).status, 'in_progress');
});

test('sending the same check-in again is safe: 200, duplicate true, same record, still one row', async () => {
  const res = await post('/attendance/check-in', w.onTime.token, { client_event_id: w.onTime.eventId, shift_id: w.onTime.shift.id, ...near });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.duplicate, true);
  assert.strictEqual(res.body.data.id, w.onTime.attendanceId);
  const n = (await query('SELECT count(*) AS n FROM attendance WHERE shift_id = $1', [w.onTime.shift.id])).rows[0].n;
  assert.strictEqual(n, 1);
});

test('a second check-in with a new event id is refused: ALREADY_CHECKED_IN', async () => {
  const res = await post('/attendance/check-in', w.onTime.token, { client_event_id: uuid(), shift_id: w.onTime.shift.id, ...near });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error.code, 'ALREADY_CHECKED_IN');
});

test('arriving 40 minutes after the start is late (threshold 10 minutes)', async () => {
  const res = await post('/attendance/check-in', w.late.token, { client_event_id: uuid(), shift_id: w.late.shift.id, ...near });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.status, 'late');
  assert.ok(res.body.data.late_minutes >= 39 && res.body.data.late_minutes <= 41);
});

test('500 m away or no GPS: still stored (201), marked pending_review and the supervisor is told', async () => {
  const far = await post('/attendance/check-in', w.far.token, { client_event_id: uuid(), shift_id: w.far.shift.id, latitude: SITE.lat + 0.005, longitude: SITE.lng, device_id: 'p' });
  assert.strictEqual(far.status, 201);
  assert.strictEqual(far.body.data.verification_status, 'pending_review');
  assert.ok(far.body.data.distance_from_site_m > 400);
  const nogps = await post('/attendance/check-in', w.nogps.token, { client_event_id: uuid(), shift_id: w.nogps.shift.id });
  assert.strictEqual(nogps.status, 201);
  assert.strictEqual(nogps.body.data.verification_status, 'pending_review');
  assert.strictEqual(nogps.body.data.distance_from_site_m, null);
  const notes = await api.request('/notifications?per_page=50', { token: supervisorTok });
  assert.ok(notes.body.data.some((n) => n.type === 'attendance_review' && n.message.includes('Att Far')));
});

test('check-in is refused too early, for someone else\'s shift, for the wrong role, and with a bad event id', async () => {
  const early = await post('/attendance/check-in', w.early.token, { client_event_id: uuid(), shift_id: w.early.shift.id, ...near });
  assert.strictEqual(early.status, 409);
  assert.strictEqual(early.body.error.code, 'OUTSIDE_SHIFT_WINDOW');
  const theirs = await post('/attendance/check-in', w.onTime.token, { client_event_id: uuid(), shift_id: w.late.shift.id, ...near });
  assert.strictEqual(theirs.status, 404);
  assert.strictEqual((await post('/attendance/check-in', manager, { client_event_id: uuid(), shift_id: w.late.shift.id })).status, 403);
  const bad = await post('/attendance/check-in', w.onTime.token, { client_event_id: 'not-a-uuid', shift_id: w.onTime.shift.id });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.error.details[0].field, 'client_event_id');
  const half = await post('/attendance/check-in', w.onTime.token, { client_event_id: uuid(), shift_id: w.onTime.shift.id, latitude: 0.3 });
  assert.strictEqual(half.status, 400);
});

test('an offline check-in sent later is accepted using the phone time, and a future phone clock is flagged', async () => {
  const tenMinAgo = new Date(Date.now() - 10 * MIN).toISOString();
  const s = w.offline;
  const res = await post('/attendance/check-in', s.token, { client_event_id: uuid(), shift_id: s.shift.id, device_time: tenMinAgo, ...near });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(new Date(res.body.data.checked_in_at).toISOString(), tenMinAgo);
  const s2 = w.future;
  const ahead = await post('/attendance/check-in', s2.token, { client_event_id: uuid(), shift_id: s2.shift.id, device_time: new Date(Date.now() + 30 * MIN).toISOString(), ...near });
  assert.strictEqual(ahead.status, 201);
  assert.strictEqual(ahead.body.data.verification_status, 'pending_review');
});

test('check-out: needs a check-in, is safe to resend, and cannot happen twice or before the check-in', async () => {
  const before = await post('/attendance/check-out', w.far.token, { client_event_id: uuid(), shift_id: w.absent.shift.id, ...near });
  assert.strictEqual(before.status, 404);                                   // not their shift
  const notIn = await post('/attendance/check-out', w.early.token, { client_event_id: uuid(), shift_id: w.early.shift.id, ...near });
  assert.strictEqual(notIn.status, 409); assert.strictEqual(notIn.body.error.code, 'NOT_CHECKED_IN');
  const earlier = await post('/attendance/check-out', w.onTime.token, { client_event_id: uuid(), shift_id: w.onTime.shift.id, device_time: new Date(Date.now() - 5 * 3600e3).toISOString(), ...near });
  assert.strictEqual(earlier.status, 409); assert.strictEqual(earlier.body.error.code, 'BEFORE_CHECK_IN');
  const id = uuid();
  const out = await post('/attendance/check-out', w.onTime.token, { client_event_id: id, shift_id: w.onTime.shift.id, ...near });
  assert.strictEqual(out.status, 200);
  assert.ok(out.body.data.checked_out_at);
  const again = await post('/attendance/check-out', w.onTime.token, { client_event_id: id, shift_id: w.onTime.shift.id, ...near });
  assert.strictEqual(again.status, 200); assert.strictEqual(again.body.data.duplicate, true);
  const twice = await post('/attendance/check-out', w.onTime.token, { client_event_id: uuid(), shift_id: w.onTime.shift.id, ...near });
  assert.strictEqual(twice.status, 409); assert.strictEqual(twice.body.error.code, 'ALREADY_CHECKED_OUT');
  const mine = await api.request(`/me/shifts?from=${w.onTime.date}&to=${w.onTime.date}`, { token: w.onTime.token });
  assert.strictEqual(mine.body.data.find((s) => s.id === w.onTime.shift.id).status, 'completed');
});

test('the no-show job marks an unattended shift once, and tells the supervisor and managers', async () => {
  const countNotes = async () => (await query("SELECT count(*) AS n FROM notifications WHERE type = 'shift_no_show' AND message LIKE '%Att Absent%'")).rows[0].n;
  const before = await countNotes();
  const marked = await markNoShows(new Date());
  assert.ok(marked >= 1);
  const row = (await query('SELECT status, checked_in_at FROM attendance WHERE shift_id = $1', [w.absent.shift.id])).rows[0];
  assert.strictEqual(row.status, 'no_show'); assert.strictEqual(row.checked_in_at, null);
  const notes = await api.request('/notifications?per_page=100', { token: supervisorTok });
  assert.ok(notes.body.data.some((n) => n.type === 'shift_no_show' && n.message.includes('Att Absent')));
  const after = await countNotes();
  assert.ok(after > before);
  await markNoShows(new Date());                                          // running again changes nothing
  assert.strictEqual(await countNotes(), after);
  const upcoming = (await query('SELECT count(*) AS n FROM attendance WHERE shift_id = $1', [w.early.shift.id])).rows[0].n;
  assert.strictEqual(upcoming, 0);                                        // a shift that has not started is never a no-show
  const recent = (await query('SELECT count(*) AS n FROM attendance WHERE shift_id = $1', [w.offline.shift.id])).rows[0].n;
  assert.strictEqual(recent, 1);                                          // checked in, so not a no-show
});

test('attendance list and exceptions: scoped, filtered, and showing shifts with no check-in yet', async () => {
  const day = await api.request(`/attendance?site_id=${w.site.id}&date=${w.late.date}&per_page=100`, { token: supervisorTok });
  assert.strictEqual(day.status, 200);
  const byGuard = Object.fromEntries(day.body.data.map((r) => [r.guard_name, r]));
  assert.strictEqual(byGuard['Att OnTime'].status, 'on_time');
  assert.strictEqual(byGuard['Att Late'].status, 'late');
  assert.strictEqual(byGuard['Att Far'].verification_status, 'pending_review');
  assert.strictEqual(byGuard['Att Absent'].status, 'no_show');
  // the Early shift starts in 3 hours, which may already be tomorrow's date: look at it on its own date
  const earlyDay = await api.request(`/attendance?site_id=${w.site.id}&date=${w.early.date}&per_page=100`, { token: supervisorTok });
  assert.strictEqual(earlyDay.body.data.find((r) => r.guard_name === 'Att Early').status, 'pending');   // nothing yet
  const ex = await api.request(`/attendance/exceptions?site_id=${w.site.id}&per_page=100`, { token: supervisorTok });
  const names = ex.body.data.map((r) => r.guard_name);
  for (const n of ['Att Late', 'Att Far', 'Att NoGps', 'Att Absent']) assert.ok(names.includes(n), `${n} should be an exception`);
  assert.ok(!names.includes('Att OnTime')); assert.ok(!names.includes('Att Early'));
  const other = await api.request(`/attendance?site_id=1&per_page=5`, { token: supervisorTok });
  assert.strictEqual(other.body.meta.total, 0);                              // supervisor of one site sees nothing of site 1
  assert.strictEqual((await api.request('/attendance', { token: w.onTime.token })).status, 403);
});

test('corrections need a reason, change the record, keep a history and are for staff only', async () => {
  const far = (await query('SELECT id FROM attendance WHERE shift_id = $1', [w.far.shift.id])).rows[0].id;
  assert.strictEqual((await post(`/attendance/${far}/corrections`, supervisorTok, { verification_status: 'accepted' })).status, 400);
  assert.strictEqual((await post(`/attendance/${far}/corrections`, w.far.token, { reason: 'x', verification_status: 'accepted' })).status, 403);
  const ok = await post(`/attendance/${far}/corrections`, supervisorTok, { reason: 'Gate was moved, guard was on site', verification_status: 'accepted' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.data.verification_status, 'accepted');
  const hist = (await query('SELECT reason, changes FROM attendance_corrections WHERE attendance_id = $1', [far])).rows;
  assert.strictEqual(hist.length, 1);
  assert.strictEqual(hist[0].changes.verification_status.from, 'pending_review');
  // moving the check-in time recalculates late/on_time
  const late = (await query('SELECT id FROM attendance WHERE shift_id = $1', [w.late.shift.id])).rows[0].id;
  const fixed = await post(`/attendance/${late}/corrections`, manager, { reason: 'Phone clock was wrong', checked_in_at: w.late.start.toISOString() });
  assert.strictEqual(fixed.body.data.status, 'on_time');
  const noShow = (await query('SELECT id FROM attendance WHERE shift_id = $1', [w.absent.shift.id])).rows[0].id;
  assert.strictEqual((await post(`/attendance/${noShow}/corrections`, manager, { reason: 'bad time', checked_in_at: 'yesterday-ish' })).status, 400);
  assert.strictEqual((await post('/attendance/999999/corrections', manager, { reason: 'x', verification_status: 'accepted' })).status, 404);
});


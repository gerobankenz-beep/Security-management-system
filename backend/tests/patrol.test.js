// Integration tests: scans (safe to resend), rounds, flags and their review, dashboard numbers.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { startServer } = require('./helpers');
const { query } = require('../src/config/db');
const anomaly = require('../src/modules/anomaly/anomaly.service');
const { weekStartOf, toKampalaDate } = require('../src/utils/time');

let api; let admin; let manager; let supervisorTok;
const stamp = Date.now() * 1000 + Math.floor(Math.random() * 1000);
const w = { rosters: {} };
const uuid = () => crypto.randomUUID();
const post = (path, token, body) => api.request(path, { method: 'POST', token, body });
const patch = (path, token, body) => api.request(path, { method: 'PATCH', token, body });
const MIN = 60000;
const hhmm = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(11, 16);

async function makeGuardShift(label) {
  const start = new Date(w.setupAt.getTime() - 30 * MIN);
  const tpl = (await post('/shift-templates', admin, { name: `${label} ${stamp}`, start_time: hhmm(start), end_time: hhmm(new Date(start.getTime() + 8 * 60 * MIN)) })).body.data;
  const guard = (await post('/guards', admin, { full_name: `Pat ${label}`, email: `pat.${label}.${stamp}@example.com`, hourly_rate_ugx: 5000, site_ids: [w.site.id] })).body.data;
  const date = toKampalaDate(start);
  const week = weekStartOf(date);
  if (!w.rosters[week]) w.rosters[week] = (await post('/rosters', manager, { site_id: w.site.id, week_start: week })).body.data.id;
  const shift = (await post(`/rosters/${w.rosters[week]}/shifts`, manager, { guard_id: guard.id, shift_template_id: tpl.id, date })).body.data;
  const login = await api.request('/auth/login', { method: 'POST', body: { email: guard.email, password: guard.temporary_password } });
  return { guard, shift, token: login.body.data.token };
}

// a scan `sec` seconds from the setup moment, taken at the checkpoint (or with an offset in metres north)
const scanAt = (g, cp, sec, extra = {}) => ({
  client_scan_id: uuid(), shift_id: g.shift.id, tag_code: cp.tag_code, scanned_at: new Date(w.setupAt.getTime() + sec * 1000).toISOString(),
  latitude: Number(cp.latitude), longitude: Number(cp.longitude), accuracy_m: 6, device_id: 'test-phone', ...extra });
const sendBatch = (g, scans) => post('/scans/batch', g.token, { scans });
const roundOf = async (g) => (await api.request(`/shifts/${g.shift.id}/rounds`, { token: g.token })).body.data[0];
const flagRules = async (roundId) => (await query('SELECT rule FROM flags WHERE round_id = $1 ORDER BY id', [roundId])).rows.map((r) => r.rule);

before(async () => {
  api = await startServer();
  admin = await api.login('admin@example.com'); manager = await api.login('manager@example.com'); supervisorTok = await api.login('supervisor@example.com');
  w.setupAt = new Date();
  const client = (await post('/clients', admin, { name: `Pat Co ${stamp}` })).body.data;
  w.site = (await post('/sites', admin, { client_id: client.id, name: `Pat Site ${stamp}`, latitude: 0.31, longitude: 32.58, guards_required_day: 0, guards_required_night: 0 })).body.data;
  w.cps = [];
  for (let i = 1; i <= 4; i += 1) w.cps.push((await post(`/sites/${w.site.id}/checkpoints`, admin, { name: `CP${i}`, latitude: 0.31 + i * 0.0001, longitude: 32.58 })).body.data);
  w.route = (await post(`/sites/${w.site.id}/routes`, admin, { name: 'Walk', checkpoint_sequence: w.cps.map((c) => c.id), round_start_times: [hhmm(new Date(w.setupAt.getTime() - 5 * MIN))], max_round_minutes: 45, min_seconds_between_scans: 60 })).body.data;
  const sup = (await api.request('/auth/me', { token: supervisorTok })).body.data;
  await api.request(`/sites/${w.site.id}/supervisors`, { method: 'PUT', token: admin, body: { user_ids: [sup.id] } });
  const other = w.otherSite = (await post('/sites', admin, { client_id: client.id, name: `Other Pat Site ${stamp}`, latitude: 0.4, longitude: 32.7 })).body.data;
  w.otherCp = (await post(`/sites/${other.id}/checkpoints`, admin, { name: 'Elsewhere', latitude: 0.4, longitude: 32.7 })).body.data;
  for (const label of ['Good', 'Fast', 'Order', 'Place', 'Missed', 'Clock', 'Rejects', 'Other']) w[label] = await makeGuardShift(label);
  for (const id of Object.values(w.rosters)) assert.strictEqual((await post(`/rosters/${id}/publish`, manager)).status, 200);
});
after(async () => { await api.stop(); });

test('route and rounds: the guard sees the route in walking order, other guards and roles are handled', async () => {
  const route = await api.request(`/shifts/${w.Good.shift.id}/route`, { token: w.Good.token });
  assert.strictEqual(route.status, 200);
  assert.deepStrictEqual(route.body.data.checkpoints.map((c) => c.name), ['CP1', 'CP2', 'CP3', 'CP4']);
  assert.ok(route.body.data.checkpoints.every((c) => /^CP-\d+-\d+-[0-9A-F]{6}$/.test(c.tag_code)));
  assert.strictEqual(route.body.data.min_seconds_between_scans, 60);
  const rounds = await api.request(`/shifts/${w.Good.shift.id}/rounds`, { token: w.Good.token });
  assert.strictEqual(rounds.body.data.length, 1);
  assert.deepStrictEqual([rounds.body.data[0].status, rounds.body.data[0].scans_done, rounds.body.data[0].scans_expected], ['pending', 0, 4]);
  assert.strictEqual((await api.request(`/shifts/${w.Other.shift.id}/route`, { token: w.Good.token })).status, 404);
  assert.strictEqual((await api.request(`/shifts/${w.Good.shift.id}/rounds`, { token: supervisorTok })).status, 200);
  assert.strictEqual((await api.request(`/shifts/${w.Good.shift.id}/rounds`, { token: await api.login('grace@example.com') })).status, 403);
});

test('a good round: four accepted scans, no flags, the round becomes complete', async () => {
  const scans = w.cps.map((cp, i) => scanAt(w.Good, cp, -270 + i * 70));
  const res = await sendBatch(w.Good, scans);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.data.results.map((r) => r.status), ['accepted', 'accepted', 'accepted', 'accepted']);
  const round = await roundOf(w.Good);
  assert.deepStrictEqual([round.status, round.scans_done], ['complete', 4]);
  assert.deepStrictEqual(await flagRules(round.id), []);
  assert.ok(res.body.data.results.every((r) => r.round_id === round.id));
});

test('sending the same scans again is safe: duplicates, no extra rows, same round status', async () => {
  const before = (await query('SELECT count(*) AS n FROM scans WHERE shift_id = $1', [w.Good.shift.id])).rows[0].n;
  const first = (await query('SELECT client_scan_id FROM scans WHERE shift_id = $1 ORDER BY scanned_at', [w.Good.shift.id])).rows;
  const again = await sendBatch(w.Good, first.map((r, i) => scanAt(w.Good, w.cps[i], -270 + i * 70, { client_scan_id: r.client_scan_id })));
  assert.deepStrictEqual(again.body.data.results.map((r) => r.status), ['duplicate', 'duplicate', 'duplicate', 'duplicate']);
  assert.strictEqual((await query('SELECT count(*) AS n FROM scans WHERE shift_id = $1', [w.Good.shift.id])).rows[0].n, before);
});

test('rejections are explained and stored as evidence; a bad scan never blocks the others in the batch', async () => {
  const g = w.Rejects;
  const good = scanAt(g, w.cps[0], -200);
  const unknown = scanAt(g, w.cps[0], -190, { tag_code: 'CP-FAKE-000000' });
  const wrongSite = scanAt(g, w.cps[0], -180, { tag_code: w.otherCp.tag_code });
  const notMine = scanAt(w.Good, w.cps[0], -170, { shift_id: w.Other.shift.id });
  const outside = scanAt(g, w.cps[0], -160, { scanned_at: new Date(w.setupAt.getTime() + 20 * 3600e3).toISOString() });
  const broken = { client_scan_id: 'nope', shift_id: g.shift.id };
  const res = await sendBatch(g, [good, unknown, wrongSite, notMine, outside, broken]);
  assert.strictEqual(res.status, 200);
  const r = res.body.data.results;
  assert.deepStrictEqual(r.map((x) => x.status), ['accepted', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
  assert.deepStrictEqual(r.slice(1, 5).map((x) => x.reason), ['UNKNOWN_TAG', 'WRONG_SITE', 'NOT_YOUR_SHIFT', 'OUTSIDE_SHIFT']);
  assert.match(r[5].reason, /^INVALID_SCAN/);
  const stored = (await query("SELECT reject_reason FROM scans WHERE shift_id = $1 AND validation_status = 'rejected' ORDER BY id", [g.shift.id])).rows.map((x) => x.reject_reason);
  assert.deepStrictEqual(stored, ['UNKNOWN_TAG', 'WRONG_SITE', 'OUTSIDE_SHIFT']);   // stored; NOT_YOUR_SHIFT and invalid are not
  assert.strictEqual((await query('SELECT count(*) AS n FROM scans WHERE shift_id = $1', [w.Other.shift.id])).rows[0].n, 0);
});

test('single scan endpoint: 400 for a badly formed scan, and only guards may scan', async () => {
  const bad = await post('/scans', w.Rejects.token, { client_scan_id: 'x' });
  assert.strictEqual(bad.status, 400);
  assert.ok(bad.body.error.details.some((d) => d.field === 'tag_code'));
  const one = await post('/scans', w.Rejects.token, scanAt(w.Rejects, w.cps[1], -100));
  assert.strictEqual(one.status, 200);
  assert.strictEqual(one.body.data.status, 'accepted');
  assert.strictEqual((await post('/scans', manager, scanAt(w.Rejects, w.cps[1], -90))).status, 403);
  assert.strictEqual((await post('/scans/batch', w.Rejects.token, { scans: [] })).status, 400);
});

test('scanning too fast creates TOO_FAST flags, the round is flagged, and the supervisor is notified', async () => {
  const res = await sendBatch(w.Fast, w.cps.map((cp, i) => scanAt(w.Fast, cp, -60 + i * 4)));
  assert.ok(res.body.data.results.every((r) => r.status === 'accepted'));
  const round = await roundOf(w.Fast);
  assert.strictEqual(round.status, 'flagged');
  assert.deepStrictEqual(await flagRules(round.id), ['TOO_FAST', 'TOO_FAST', 'TOO_FAST']);
  const notes = await api.request('/notifications?per_page=100', { token: supervisorTok });
  assert.ok(notes.body.data.some((n) => n.type === 'flag_created' && n.message.includes('Pat Fast')));
  w.fastRound = round.id;
});

test('wrong order and wrong place are flagged', async () => {
  const order = [w.cps[1], w.cps[0], w.cps[2], w.cps[3]];
  await sendBatch(w.Order, order.map((cp, i) => scanAt(w.Order, cp, -270 + i * 70)));
  assert.deepStrictEqual(await flagRules((await roundOf(w.Order)).id), ['OUT_OF_SEQUENCE']);
  const scans = w.cps.map((cp, i) => scanAt(w.Place, cp, -270 + i * 70, i === 2 ? { latitude: Number(cp.latitude) + 0.002 } : {}));
  await sendBatch(w.Place, scans);
  const flags = (await query("SELECT rule, details FROM flags WHERE round_id = $1", [(await roundOf(w.Place)).id])).rows;
  assert.deepStrictEqual(flags.map((f) => f.rule), ['WRONG_LOCATION']);
  assert.ok(flags[0].details.distance_m > 150);
});

test('a phone clock that is ahead is flagged together with the late start it causes', async () => {
  await sendBatch(w.Clock, [scanAt(w.Clock, w.cps[0], 30 * 60)]);            // scanned_at is 30 minutes in the future
  const round = await roundOf(w.Clock);
  const rules = await flagRules(round.id);
  assert.ok(rules.includes('CLOCK_MISMATCH')); assert.ok(rules.includes('LATE_ROUND'));
});

test('missed checkpoints appear once the round window has ended, and re-running never duplicates flags', async () => {
  await sendBatch(w.Missed, [scanAt(w.Missed, w.cps[0], -270), scanAt(w.Missed, w.cps[1], -200)]);
  const round = await roundOf(w.Missed);
  assert.strictEqual(round.status, 'in_progress');
  assert.deepStrictEqual(await flagRules(round.id), []);
  const later = new Date(w.setupAt.getTime() + 2 * 3600e3);
  const created = await anomaly.evaluateRound(round.id, later);
  assert.deepStrictEqual(created.map((f) => f.rule), ['MISSED_CHECKPOINT', 'MISSED_CHECKPOINT']);
  assert.strictEqual((await roundOf(w.Missed)).status, 'missed');
  assert.strictEqual((await anomaly.evaluateRound(round.id, later)).length, 0);
  assert.deepStrictEqual(await flagRules(round.id), ['MISSED_CHECKPOINT', 'MISSED_CHECKPOINT']);
  assert.ok((await anomaly.evaluateEndedRounds(later)) >= 1);                  // the scheduled job picks up ended rounds
  const viaApi = await post(`/rounds/${round.id}/evaluate`, manager);
  assert.strictEqual(viaApi.status, 200); assert.strictEqual(viaApi.body.data.new_flags, 0);
  assert.strictEqual((await post(`/rounds/${round.id}/evaluate`, supervisorTok)).status, 403);
});

test('flag list: filters, scoping by role, and the evidence on one flag', async () => {
  const all = await api.request(`/flags?site_id=${w.site.id}&per_page=100`, { token: manager });
  assert.strictEqual(all.status, 200);
  assert.ok(all.body.data.length >= 8);
  assert.ok(all.body.data.every((f) => f.site_name === w.site.name));
  const fast = await api.request(`/flags?site_id=${w.site.id}&rule=TOO_FAST&status=open`, { token: supervisorTok });
  assert.strictEqual(fast.body.data.length, 3);
  assert.strictEqual(fast.body.data[0].guard_name, 'Pat Fast');
  const detail = await api.request(`/flags/${fast.body.data[0].id}`, { token: supervisorTok });
  assert.strictEqual(detail.status, 200);
  assert.strictEqual(detail.body.data.scans.length, 4);
  assert.match(detail.body.data.details.message, /seconds apart/);
  assert.strictEqual(detail.body.data.round.id, w.fastRound);
  assert.strictEqual((await api.request('/flags', { token: w.Fast.token })).status, 403);
  assert.strictEqual((await api.request('/flags/9999999', { token: manager })).status, 404);
  const round = await api.request(`/rounds/${w.fastRound}`, { token: manager });
  assert.strictEqual(round.body.data.scans.length, 4); assert.strictEqual(round.body.data.flags.length, 3);
  assert.strictEqual((await api.request(`/rounds/${w.fastRound}`, { token: w.Fast.token })).status, 403);
});

test('reviewing flags: confirm keeps the round flagged; dismissing every flag makes the round complete', async () => {
  const flags = (await api.request(`/flags?round_id=${w.fastRound}`, { token: supervisorTok })).body.data;
  assert.strictEqual((await patch(`/flags/${flags[0].id}`, supervisorTok, { status: 'maybe' })).status, 400);
  assert.strictEqual((await patch(`/flags/${flags[0].id}`, w.Fast.token, { status: 'dismissed' })).status, 403);
  const confirmed = await patch(`/flags/${flags[0].id}`, supervisorTok, { status: 'confirmed', note: 'Seen on camera' });
  assert.strictEqual(confirmed.body.data.status, 'confirmed'); assert.strictEqual(confirmed.body.data.note, 'Seen on camera');
  assert.ok(confirmed.body.data.reviewed_by);
  await patch(`/flags/${flags[1].id}`, supervisorTok, { status: 'dismissed' });
  await patch(`/flags/${flags[2].id}`, supervisorTok, { status: 'dismissed', note: 'Guard was running' });
  assert.strictEqual((await roundOf(w.Fast)).status, 'flagged');                // one confirmed flag still counts
  await patch(`/flags/${flags[0].id}`, manager, { status: 'dismissed', note: 'Reviewed again, camera showed nothing wrong' });
  assert.strictEqual((await roundOf(w.Fast)).status, 'complete');
});

test('dashboard: numbers match the data, supervisors see only their sites, guards are refused', async () => {
  for (const label of ['Good', 'Fast']) {
    const res = await post('/attendance/check-in', w[label].token, { client_event_id: uuid(), shift_id: w[label].shift.id, latitude: 0.31, longitude: 32.58 });
    assert.strictEqual(res.status, 201);
  }
  const ov = await api.request('/dashboard/overview', { token: manager });
  assert.strictEqual(ov.status, 200);
  const mine = ov.body.data.sites.find((s) => s.site_id === w.site.id);
  assert.strictEqual(mine.guards_required, 8);                                  // eight shifts are running right now
  assert.strictEqual(mine.guards_on_duty, 2);                                   // two have checked in
  const { rows } = await query(
    `SELECT count(*) AS total, count(*) FILTER (WHERE pr.status = 'complete') AS complete, count(*) FILTER (WHERE pr.status = 'missed') AS missed
       FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN rosters r ON r.id = sh.roster_id WHERE r.site_id = $1`, [w.site.id]);
  assert.strictEqual(mine.rounds_expected, rows[0].total);
  assert.strictEqual(mine.rounds_complete, rows[0].complete); assert.ok(mine.rounds_complete >= 2);   // Good and Fast
  assert.strictEqual(mine.rounds_missed, rows[0].missed); assert.ok(mine.rounds_missed >= 1);          // Missed
  const openFlags = (await query("SELECT count(*) AS n FROM flags WHERE site_id = $1 AND status = 'open'", [w.site.id])).rows[0].n;
  assert.strictEqual(mine.open_flags, openFlags);
  const totalOpen = ov.body.data.sites.reduce((t, s) => t + s.open_flags, 0);
  assert.strictEqual(ov.body.data.open_flags, totalOpen);
  assert.match(ov.body.data.date, /^\d{4}-\d{2}-\d{2}$/);

  const sup = await api.request('/dashboard/overview', { token: supervisorTok });
  const visible = (await api.request('/sites?per_page=100', { token: supervisorTok })).body.data.map((s) => s.id);
  assert.ok(sup.body.data.sites.length > 0 && sup.body.data.sites.every((s) => visible.includes(s.site_id)));
  assert.ok(sup.body.data.sites.some((s) => s.site_id === w.site.id));
  assert.strictEqual((await api.request('/dashboard/overview', { token: w.Good.token })).status, 403);
  assert.strictEqual((await api.request('/dashboard/overview', { token: await api.login('grace@example.com') })).status, 403);
});

test('site status: who is on duty right now, and access rules', async () => {
  const st = await api.request(`/dashboard/sites/${w.site.id}/status`, { token: supervisorTok });
  assert.strictEqual(st.status, 200);
  assert.deepStrictEqual(st.body.data.current_guards.map((g) => g.full_name).sort(), ['Pat Fast', 'Pat Good']);
  assert.strictEqual(st.body.data.guards_on_duty, 2);
  assert.strictEqual(st.body.data.name, w.site.name);
  assert.strictEqual((await api.request(`/dashboard/sites/${w.otherSite.id}/status`, { token: supervisorTok })).status, 404);   // a site this supervisor is not assigned to
  assert.strictEqual((await api.request('/dashboard/sites/99999/status', { token: manager })).status, 404);
});


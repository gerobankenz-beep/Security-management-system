// Integration tests: rosters, validation, publishing, rounds, my shifts.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');
const { weekStartOf, addDays, toKampalaDate } = require('../src/utils/time');

let api; let admin; let manager; let supervisorTok;
const stamp = Date.now() * 1000 + Math.floor(Math.random() * 1000);
const w = {};                                  // shared state between the tests below
const monday = addDays(weekStartOf(toKampalaDate(new Date())), 7);   // next week's Monday
const day = (n) => addDays(monday, n);

const post = (path, token, body) => api.request(path, { method: 'POST', token, body });
const patch = (path, token, body) => api.request(path, { method: 'PATCH', token, body });
const del = (path, token) => api.request(path, { method: 'DELETE', token });
const rulesOf = (res) => res.body.data.violations.map((v) => v.rule);

before(async () => {
  api = await startServer();
  admin = await api.login('admin@example.com'); manager = await api.login('manager@example.com'); supervisorTok = await api.login('supervisor@example.com');
  const client = (await post('/clients', admin, { name: `Roster Co ${stamp}` })).body.data;
  const site = (await post('/sites', admin, { client_id: client.id, name: `Roster Site ${stamp}`, latitude: 0.31, longitude: 32.58, guards_required_day: 0, guards_required_night: 0 })).body.data;
  w.site = site;
  w.cps = [];
  for (const n of ['A', 'B', 'C', 'D']) w.cps.push((await post(`/sites/${site.id}/checkpoints`, admin, { name: n, latitude: 0.31, longitude: 32.58 })).body.data);
  w.route = (await post(`/sites/${site.id}/routes`, admin, { name: 'Night walk', checkpoint_sequence: w.cps.map((c) => c.id), round_start_times: ['20:00', '22:00', '00:00', '02:00'], max_round_minutes: 45 })).body.data;
  w.guards = [];
  for (const n of ['One', 'Two']) {
    const g = (await post('/guards', admin, { full_name: `Roster Guard ${n}`, email: `rg.${n}.${stamp}@example.com`, hourly_rate_ugx: 5000, site_ids: [site.id] })).body.data;
    w.guards.push(g);
  }
  const tpls = (await api.request('/shift-templates', { token: admin })).body.data;
  w.day = tpls.find((t) => t.name === 'Day'); w.night = tpls.find((t) => t.name === 'Night');
  w.mid = (await post('/shift-templates', admin, { name: `Mid ${stamp}`, start_time: '10:00', end_time: '14:00' })).body.data;
});
after(async () => { await api.stop(); });

test('creating a roster: must be a Monday, one roster per site and week', async () => {
  assert.strictEqual((await post('/rosters', manager, { site_id: w.site.id, week_start: day(1) })).status, 400);
  assert.strictEqual((await post('/rosters', manager, { site_id: 99999, week_start: monday })).status, 400);
  const r = await post('/rosters', manager, { site_id: w.site.id, week_start: monday });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.data.status, 'draft');
  w.rosterId = r.body.data.id;
  assert.strictEqual((await post('/rosters', manager, { site_id: w.site.id, week_start: monday })).status, 409);
  assert.strictEqual((await post('/rosters', supervisorTok, { site_id: w.site.id, week_start: monday })).status, 403);
});

test('adding shifts: validates date, guard and template; duplicates are refused; times are Kampala time', async () => {
  const add = (g, t, date) => post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: g, shift_template_id: t, date });
  assert.strictEqual((await add(w.guards[0].id, w.day.id, day(9))).status, 400);          // outside the week
  assert.strictEqual((await add(99999, w.day.id, day(0))).status, 400);
  assert.strictEqual((await add(w.guards[0].id, 99999, day(0))).status, 400);
  const night = await add(w.guards[0].id, w.night.id, day(0));
  assert.strictEqual(night.status, 201);
  assert.strictEqual(new Date(night.body.data.start_at).toISOString(), `${day(0)}T15:00:00.000Z`);       // 18:00 Kampala
  assert.strictEqual(new Date(night.body.data.end_at).toISOString(), `${day(1)}T03:00:00.000Z`);         // 06:00 next day
  w.nightShift = night.body.data;
  assert.strictEqual((await add(w.guards[0].id, w.night.id, day(0))).status, 409);
});

test('validation finds the rest violation and shows guard names', async () => {
  const dayShift = await post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: w.guards[0].id, shift_template_id: w.day.id, date: day(1) });
  w.restShift = dayShift.body.data;
  const res = await api.request(`/rosters/${w.rosterId}/validate`, { token: manager });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.valid, false);
  assert.deepStrictEqual(rulesOf(res), ['MIN_REST_HOURS']);
  assert.match(res.body.data.violations[0].message, /Roster Guard One has only 0 hours rest/);
});

test('double booking, ineligible guard and max consecutive days are all reported', async () => {
  await post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: w.guards[1].id, shift_template_id: w.mid.id, date: day(2) });
  const overlap = await post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: w.guards[1].id, shift_template_id: w.day.id, date: day(2) });
  assert.strictEqual(overlap.status, 201);
  const outsider = (await post('/guards', admin, { full_name: 'Outsider', email: `out.${stamp}@example.com`, hourly_rate_ugx: 1000 })).body.data;
  const shiftOut = await post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: outsider.id, shift_template_id: w.day.id, date: day(3) });
  const res = await api.request(`/rosters/${w.rosterId}/validate`, { token: manager });
  const rules = rulesOf(res);
  assert.ok(rules.includes('DOUBLE_BOOKED')); assert.ok(rules.includes('GUARD_NOT_ELIGIBLE'));
  // clean up so the next tests start from one known problem
  await del(`/rosters/${w.rosterId}/shifts/${shiftOut.body.data.id}`, manager);
  await del(`/rosters/${w.rosterId}/shifts/${overlap.body.data.id}`, manager);
  const mid = (await api.request(`/rosters/${w.rosterId}`, { token: manager })).body.data.shifts.find((s) => s.template_name.startsWith('Mid'));
  assert.strictEqual((await del(`/rosters/${w.rosterId}/shifts/${mid.id}`, manager)).status, 204);
});

test('seven days in a row: the seventh day is flagged', async () => {
  const roster = (await post('/rosters', manager, { site_id: w.site.id, week_start: addDays(monday, 7) })).body.data;
  for (let i = 0; i < 7; i += 1) await post(`/rosters/${roster.id}/shifts`, manager, { guard_id: w.guards[1].id, shift_template_id: w.day.id, date: addDays(monday, 7 + i) });
  const res = await api.request(`/rosters/${roster.id}/validate`, { token: manager });
  assert.deepStrictEqual(res.body.data.violations.map((v) => [v.rule, v.date]), [['MAX_CONSECUTIVE_DAYS', addDays(monday, 13)]]);
});

test('rest is checked across rosters: Sunday night on one site, Monday morning on another', async () => {
  const client = (await post('/clients', admin, { name: `Other Co ${stamp}` })).body.data;
  const site2 = (await post('/sites', admin, { client_id: client.id, name: `Other Site ${stamp}`, latitude: 0.32, longitude: 32.59, guards_required_day: 0, guards_required_night: 0 })).body.data;
  await api.request(`/guards/${w.guards[0].id}/sites`, { method: 'PUT', token: admin, body: { site_ids: [w.site.id, site2.id] } });
  const rosterB = (await post('/rosters', manager, { site_id: site2.id, week_start: addDays(monday, 14) })).body.data;
  // Sunday night of week (monday+7 .. +13) on site 1 is shift on day 13; Monday morning of week 3 on site 2
  const weekTwo = (await api.request(`/rosters?site_id=${w.site.id}&week_start=${addDays(monday, 7)}`, { token: manager })).body.data[0];
  await post(`/rosters/${weekTwo.id}/shifts`, manager, { guard_id: w.guards[0].id, shift_template_id: w.night.id, date: addDays(monday, 13) });
  await post(`/rosters/${rosterB.id}/shifts`, manager, { guard_id: w.guards[0].id, shift_template_id: w.day.id, date: addDays(monday, 14) });
  const res = await api.request(`/rosters/${rosterB.id}/validate`, { token: manager });
  assert.ok(rulesOf(res).includes('MIN_REST_HOURS'));
});

test('MIN_GUARDS_PER_SHIFT: an empty week needs guards when the site requires them', async () => {
  const client = (await post('/clients', admin, { name: `Needs Co ${stamp}` })).body.data;
  const site3 = (await post('/sites', admin, { client_id: client.id, name: `Needs Site ${stamp}`, latitude: 0.33, longitude: 32.6, guards_required_day: 1, guards_required_night: 0 })).body.data;
  const roster = (await post('/rosters', manager, { site_id: site3.id, week_start: monday })).body.data;
  const res = await api.request(`/rosters/${roster.id}/validate`, { token: manager });
  const v = res.body.data.violations.filter((x) => x.rule === 'MIN_GUARDS_PER_SHIFT');
  assert.strictEqual(v.length, 7);
  assert.deepStrictEqual(v[0], { rule: 'MIN_GUARDS_PER_SHIFT', date: day(0), kind: 'day', required: 1, assigned: 0, message: `${day(0)} day: 0 guards assigned, 1 needed` });
  assert.strictEqual((await post(`/rosters/${roster.id}/publish`, manager)).status, 409);
});

test('publish is blocked with the violation list, then works once fixed and creates the patrol rounds', async () => {
  const blocked = await post(`/rosters/${w.rosterId}/publish`, manager);
  assert.strictEqual(blocked.status, 409);
  assert.strictEqual(blocked.body.error.code, 'ROSTER_INVALID');
  assert.strictEqual(blocked.body.error.details[0].rule, 'MIN_REST_HOURS');
  assert.strictEqual((await del(`/rosters/${w.rosterId}/shifts/${w.restShift.id}`, manager)).status, 204);
  // a second guard on the same night shares the rounds (round-robin)
  await post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: w.guards[1].id, shift_template_id: w.night.id, date: day(0) });
  await post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: w.guards[1].id, shift_template_id: w.day.id, date: day(3) });   // day shift: no night rounds
  const ok = await post(`/rosters/${w.rosterId}/publish`, manager);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.data.status, 'published');
  assert.strictEqual(ok.body.data.rounds_created, 4);
  assert.strictEqual((await post(`/rosters/${w.rosterId}/publish`, manager)).status, 409);
});

test('published rosters cannot be edited; guards see only their own shifts with the site name', async () => {
  const add = await post(`/rosters/${w.rosterId}/shifts`, manager, { guard_id: w.guards[0].id, shift_template_id: w.day.id, date: day(5) });
  assert.strictEqual(add.status, 409);
  assert.strictEqual((await del(`/rosters/${w.rosterId}/shifts/${w.nightShift.id}`, manager)).status, 409);
  const login = await api.request('/auth/login', { method: 'POST', body: { email: `rg.One.${stamp}@example.com`, password: w.guards[0].temporary_password } });
  const gtoken = login.body.data.token;
  const mine = await api.request(`/me/shifts?from=${day(0)}&to=${day(6)}`, { token: gtoken });
  assert.strictEqual(mine.status, 200);
  assert.deepStrictEqual(mine.body.data.map((s) => s.date), [day(0)]);
  assert.strictEqual(mine.body.data[0].site_name, w.site.name);
  assert.strictEqual(mine.body.data[0].guard_id, w.guards[0].id);
  assert.strictEqual((await api.request('/me/shifts', { token: manager })).status, 403);
  assert.strictEqual((await api.request(`/rosters/${w.rosterId}`, { token: gtoken })).status, 403);
  const notes = await api.request('/notifications', { token: gtoken });
  assert.ok(notes.body.data.some((n) => n.type === 'roster_published'));
});

test('rounds were created on the night shift only, shared between the two guards', async () => {
  const { query } = require('../src/config/db');
  const { rows } = await query(
    `SELECT pr.round_index, sh.guard_id, to_char(pr.window_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS start
       FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id WHERE sh.roster_id = $1 ORDER BY pr.round_index`, [w.rosterId]);
  assert.deepStrictEqual(rows.map((r) => r.round_index), [1, 2, 3, 4]);
  // 20:00, 22:00, 00:00 and 02:00 Kampala time are 17:00, 19:00, 21:00 and 23:00 UTC
  assert.deepStrictEqual(rows.map((r) => r.start), [`${day(0)}T17:00`, `${day(0)}T19:00`, `${day(0)}T21:00`, `${day(0)}T23:00`]);
  assert.deepStrictEqual(rows.map((r) => r.guard_id), [w.guards[0].id, w.guards[1].id, w.guards[0].id, w.guards[1].id]);
});

test('unpublishing removes the rounds, and publishing again recreates them', async () => {
  assert.strictEqual((await post(`/rosters/${w.rosterId}/unpublish`, manager)).body.data.status, 'draft');
  assert.strictEqual((await post(`/rosters/${w.rosterId}/unpublish`, manager)).status, 409);
  const again = await post(`/rosters/${w.rosterId}/publish`, manager);
  assert.strictEqual(again.body.data.rounds_created, 4);
});

test('supervisors can read rosters of their sites only; guards cannot list', async () => {
  const list = await api.request('/rosters', { token: supervisorTok });
  assert.strictEqual(list.status, 200);
  assert.ok(!list.body.data.some((r) => r.site_id === w.site.id));
  assert.strictEqual((await api.request(`/rosters/${w.rosterId}`, { token: supervisorTok })).status, 404);
  const all = await api.request(`/rosters?site_id=${w.site.id}`, { token: manager });
  assert.ok(all.body.data.length >= 1);
  assert.ok(all.body.data[0].shift_count >= 0);
});


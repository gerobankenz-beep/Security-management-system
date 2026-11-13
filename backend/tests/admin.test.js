// Integration tests for the admin APIs (needs: schema.sql, seed.sql, 002_admin_payroll.sql, npm run set-passwords).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

let api; let admin; let manager; let guardTok; let supervisorTok;
const stamp = Date.now() * 1000 + Math.floor(Math.random() * 1000);
const ctx = {};

before(async () => {
  api = await startServer();
  admin = await api.login('admin@example.com');
  manager = await api.login('manager@example.com');
  guardTok = await api.login('amina@example.com');
  supervisorTok = await api.login('supervisor@example.com');
});
after(async () => { await api.stop(); });

const post = (path, token, body) => api.request(path, { method: 'POST', token, body });
const patch = (path, token, body) => api.request(path, { method: 'PATCH', token, body });
const put = (path, token, body) => api.request(path, { method: 'PUT', token, body });
const fields = (res) => (res.body.error.details || []).map((d) => d.field);

// ---------------- guards ----------------
test('admin adds a guard: 201, pay profile, temporary password, no password_hash', async () => {
  ctx.email = `guard.${stamp}@example.com`;
  const res = await post('/guards', admin, { full_name: 'Test Guard One', email: ctx.email, phone: '+256700111222',
    employee_no: `E${stamp}`, hourly_rate_ugx: 5500, night_allowance_ugx: 3500 });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.pay_profile.hourly_rate_ugx, 5500);
  assert.ok(res.body.data.temporary_password.length >= 8);
  assert.strictEqual(res.body.data.password_hash, undefined);
  ctx.guardId = res.body.data.id; ctx.tempPw = res.body.data.temporary_password;
});

test('the new guard can log in with the temporary password', async () => {
  const res = await api.request('/auth/login', { method: 'POST', body: { email: ctx.email, password: ctx.tempPw } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.user.role, 'guard');
});

test('guard creation: duplicate email 409, missing fields 400 with field details, negative rate 400', async () => {
  const dup = await post('/guards', admin, { full_name: 'Dup', email: ctx.email, hourly_rate_ugx: 5000 });
  assert.strictEqual(dup.status, 409);
  const missing = await post('/guards', admin, { phone: '1' });
  assert.strictEqual(missing.status, 400);
  assert.ok(['full_name', 'email', 'hourly_rate_ugx'].every((f) => fields(missing).includes(f)));
  const neg = await post('/guards', admin, { full_name: 'X', email: `x.${stamp}@example.com`, hourly_rate_ugx: -5 });
  assert.strictEqual(neg.status, 400);
});

test('only admin can add guards: manager, supervisor and guard get 403', async () => {
  for (const token of [manager, supervisorTok, guardTok]) {
    const res = await post('/guards', token, { full_name: 'No', email: `no.${stamp}@example.com`, hourly_rate_ugx: 1 });
    assert.strictEqual(res.status, 403);
  }
});

test('guard list: search, pagination meta, manager may read, guard may not', async () => {
  const res = await api.request(`/guards?search=${encodeURIComponent('Test Guard One')}`, { token: admin });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.some((g) => g.id === ctx.guardId));
  assert.ok(res.body.meta.total >= 1);
  assert.strictEqual(res.body.data[0].password_hash, undefined);
  assert.strictEqual((await api.request('/guards', { token: manager })).status, 200);
  assert.strictEqual((await api.request('/guards', { token: guardTok })).status, 403);
});

test('changing pay keeps history and the guard shows the new rate', async () => {
  const res = await patch(`/guards/${ctx.guardId}`, admin, { hourly_rate_ugx: 6000 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.pay_profile.hourly_rate_ugx, 6000);
  assert.strictEqual(res.body.data.pay_profile.night_allowance_ugx, 3500); // unchanged value carried over
});

test('deactivated guard cannot log in; reactivated guard can', async () => {
  assert.strictEqual((await post(`/guards/${ctx.guardId}/deactivate`, admin)).status, 200);
  const blocked = await api.request('/auth/login', { method: 'POST', body: { email: ctx.email, password: ctx.tempPw } });
  assert.strictEqual(blocked.status, 401);
  assert.strictEqual((await post(`/guards/${ctx.guardId}/reactivate`, admin)).status, 200);
  const ok = await api.request('/auth/login', { method: 'POST', body: { email: ctx.email, password: ctx.tempPw } });
  assert.strictEqual(ok.status, 200);
});

test('reset password gives a new temporary password and the old one stops working', async () => {
  const res = await post(`/users/${ctx.guardId}/reset-password`, admin);
  assert.strictEqual(res.status, 200);
  const old = await api.request('/auth/login', { method: 'POST', body: { email: ctx.email, password: ctx.tempPw } });
  assert.strictEqual(old.status, 401);
  const fresh = await api.request('/auth/login', { method: 'POST', body: { email: ctx.email, password: res.body.data.temporary_password } });
  assert.strictEqual(fresh.status, 200);
  assert.strictEqual((await post('/users/99999/reset-password', admin)).status, 404);
});

// ---------------- clients and sites ----------------
test('clients: admin creates and edits, manager reads, guard blocked', async () => {
  const c = await post('/clients', admin, { name: `Acme ${stamp}`, contact_email: 'acme@example.com' });
  assert.strictEqual(c.status, 201);
  ctx.clientId = c.body.data.id;
  assert.strictEqual((await post('/clients', admin, { contact_name: 'no name' })).status, 400);
  assert.strictEqual((await patch(`/clients/${ctx.clientId}`, admin, { contact_name: 'Jane' })).body.data.contact_name, 'Jane');
  assert.strictEqual((await api.request('/clients', { token: manager })).status, 200);
  assert.strictEqual((await api.request('/clients', { token: guardTok })).status, 403);
  assert.strictEqual((await patch('/clients/99999', admin, { name: 'x' })).status, 404);
});

test('sites: create uses the default geofence, validates coordinates and geofence', async () => {
  const s = await post('/sites', admin, { client_id: ctx.clientId, name: `Site ${stamp}`, latitude: 0.31, longitude: 32.58, patrols_per_night: 3 });
  assert.strictEqual(s.status, 201);
  assert.strictEqual(s.body.data.geofence_radius_m, 150);
  ctx.siteId = s.body.data.id;
  const bad = await post('/sites', admin, { client_id: ctx.clientId, name: 'Bad', latitude: 95, longitude: 32 });
  assert.strictEqual(bad.status, 400); assert.ok(fields(bad).includes('latitude'));
  const zero = await post('/sites', admin, { client_id: ctx.clientId, name: 'Bad', latitude: 0, longitude: 0, geofence_radius_m: 0 });
  assert.strictEqual(zero.status, 400);
  const noClient = await post('/sites', admin, { client_id: 99999, name: 'Bad', latitude: 0, longitude: 0 });
  assert.strictEqual(noClient.status, 400);
  assert.strictEqual((await post('/sites', manager, { client_id: ctx.clientId, name: 'x', latitude: 0, longitude: 0 })).status, 403);
  assert.strictEqual((await patch(`/sites/${ctx.siteId}`, admin, { geofence_radius_m: 200 })).body.data.geofence_radius_m, 200);
});

// ---------------- checkpoints ----------------
test('checkpoints: unique unguessable tag codes, validation, role rules', async () => {
  ctx.cps = [];
  for (const [i, n] of ['Gate', 'Back', 'Roof', 'Store'].entries()) {
    const res = await post(`/sites/${ctx.siteId}/checkpoints`, admin, { name: n, latitude: 0.31 + i / 10000, longitude: 32.58 });
    assert.strictEqual(res.status, 201);
    assert.match(res.body.data.tag_code, /^CP-\d+-\d+-[0-9A-F]{6}$/);
    ctx.cps.push(res.body.data);
  }
  assert.strictEqual(new Set(ctx.cps.map((c) => c.tag_code)).size, 4);
  const bad = await post(`/sites/${ctx.siteId}/checkpoints`, admin, { name: 'Bad', latitude: 0, longitude: 190 });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await post(`/sites/${ctx.siteId}/checkpoints`, guardTok, { name: 'x', latitude: 0, longitude: 0 })).status, 403);
  assert.strictEqual((await post('/sites/99999/checkpoints', admin, { name: 'x', latitude: 0, longitude: 0 })).status, 404);
  assert.strictEqual((await patch(`/checkpoints/${ctx.cps[0].id}`, admin, { name: 'Main gate' })).body.data.name, 'Main gate');
});

test('tag sheet returns a QR image per active checkpoint', async () => {
  const res = await api.request(`/sites/${ctx.siteId}/checkpoints/tag-sheet`, { token: admin });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.checkpoints.length, 4);
  assert.ok(res.body.data.checkpoints.every((c) => c.qr_data_url.startsWith('data:image/png;base64,')));
  assert.strictEqual((await api.request(`/sites/${ctx.siteId}/checkpoints/tag-sheet`, { token: guardTok })).status, 403);
});

// ---------------- routes ----------------
test('routes: ordered checkpoints and HH:MM times; bad input refused; can be edited', async () => {
  const ids = ctx.cps.map((c) => c.id);
  const res = await post(`/sites/${ctx.siteId}/routes`, admin, { name: 'Night walk', checkpoint_sequence: [ids[2], ids[0], ids[1]],
    round_start_times: ['20:00', '22:30'], max_round_minutes: 40, min_seconds_between_scans: 45 });
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(res.body.data.checkpoints.map((c) => c.id), [ids[2], ids[0], ids[1]]);
  assert.deepStrictEqual(res.body.data.checkpoints.map((c) => c.sequence), [1, 2, 3]);
  assert.deepStrictEqual(res.body.data.round_start_times, ['20:00', '22:30']);
  ctx.routeId = res.body.data.id;
  const other = await post('/sites/1/checkpoints', admin, { name: 'Other site cp', latitude: 0.3, longitude: 32.5 });
  const foreign = await post(`/sites/${ctx.siteId}/routes`, admin, { name: 'R', checkpoint_sequence: [other.body.data.id], round_start_times: ['20:00'] });
  assert.strictEqual(foreign.status, 400);
  const twice = await post(`/sites/${ctx.siteId}/routes`, admin, { name: 'R', checkpoint_sequence: [ids[0], ids[0]], round_start_times: ['20:00'] });
  assert.strictEqual(twice.status, 400);
  const badTime = await post(`/sites/${ctx.siteId}/routes`, admin, { name: 'R', checkpoint_sequence: [ids[0]], round_start_times: ['25:99'] });
  assert.strictEqual(badTime.status, 400);
  const edited = await patch(`/routes/${ctx.routeId}`, manager, { checkpoint_sequence: [ids[0], ids[1], ids[2], ids[3]], round_start_times: ['21:00'] });
  assert.strictEqual(edited.status, 200);
  assert.strictEqual(edited.body.data.checkpoints.length, 4);
  assert.deepStrictEqual(edited.body.data.round_start_times, ['21:00']);
  assert.strictEqual((await api.request(`/sites/${ctx.siteId}/routes`, { token: admin })).body.data.length, 1);
  assert.strictEqual((await post(`/sites/${ctx.siteId}/routes`, guardTok, { name: 'R', checkpoint_sequence: [ids[0]], round_start_times: ['20:00'] })).status, 403);
});

// ---------------- scoping ----------------
test('visibility: supervisor sees a site only after assignment; guard only after eligibility; deactivated site disappears', async () => {
  const before = await api.request('/sites?per_page=100', { token: supervisorTok });
  assert.ok(!before.body.data.some((s) => s.id === ctx.siteId));
  assert.strictEqual((await api.request(`/sites/${ctx.siteId}/checkpoints`, { token: supervisorTok })).status, 404);
  const sup = await api.request('/auth/me', { token: supervisorTok });
  assert.strictEqual((await put(`/sites/${ctx.siteId}/supervisors`, admin, { user_ids: [sup.body.data.id] })).status, 200);
  assert.ok((await api.request('/sites?per_page=100', { token: supervisorTok })).body.data.some((s) => s.id === ctx.siteId));
  const sups = await api.request(`/sites/${ctx.siteId}/supervisors`, { token: admin });
  assert.deepStrictEqual(sups.body.data.map((u) => u.id), [sup.body.data.id]);
  assert.strictEqual((await api.request(`/sites/${ctx.siteId}/supervisors`, { token: guardTok })).status, 403);
  assert.strictEqual((await api.request(`/sites/${ctx.siteId}/checkpoints`, { token: supervisorTok })).status, 200);

  assert.strictEqual((await api.request(`/sites/${ctx.siteId}/checkpoints`, { token: guardTok })).status, 404);
  const assigned = await put(`/guards/${ctx.guardId}/sites`, admin, { site_ids: [ctx.siteId] });
  assert.deepStrictEqual(assigned.body.data.site_ids, [ctx.siteId]);
  const guardsAtSite = await api.request(`/sites/${ctx.siteId}/guards`, { token: admin });
  assert.ok(guardsAtSite.body.data.some((g) => g.id === ctx.guardId));
  assert.strictEqual((await put(`/guards/${ctx.guardId}/sites`, admin, { site_ids: [99999] })).status, 400);

  await patch(`/sites/${ctx.siteId}`, admin, { is_active: false });
  assert.ok(!(await api.request('/sites?per_page=100', { token: admin })).body.data.some((s) => s.id === ctx.siteId));
});

// ---------------- settings, holidays, templates ----------------
test('settings: admin and manager read; admin changes with validation; unknown keys refused', async () => {
  const read = await api.request('/settings', { token: manager });
  assert.strictEqual(read.status, 200);
  assert.strictEqual(read.body.data.overtime_multiplier, 1.5);
  const set = await patch('/settings', admin, { late_checkin_minutes: 12 });
  assert.strictEqual(set.body.data.late_checkin_minutes, 12);
  await patch('/settings', admin, { late_checkin_minutes: 10 });
  assert.strictEqual((await patch('/settings', admin, { made_up: 1 })).status, 400);
  assert.strictEqual((await patch('/settings', admin, { overtime_multiplier: 0.5 })).status, 400);
  assert.strictEqual((await patch('/settings', admin, { paid_early_arrival: 'yes' })).status, 400);
  assert.strictEqual((await patch('/settings', manager, { late_checkin_minutes: 5 })).status, 403);
  assert.strictEqual((await api.request('/settings', { token: guardTok })).status, 403);
});

test('public holidays: add, reject bad or duplicate dates, list, delete', async () => {
  const date = `2031-0${(stamp % 9) + 1}-1${stamp % 9}`;
  const a = await post('/public-holidays', admin, { holiday_date: date, name: 'Test holiday' });
  assert.strictEqual(a.status, 201);
  assert.strictEqual((await post('/public-holidays', admin, { holiday_date: date, name: 'Again' })).status, 409);
  assert.strictEqual((await post('/public-holidays', admin, { holiday_date: '25/12/2031', name: 'Bad' })).status, 400);
  assert.ok((await api.request('/public-holidays', { token: manager })).body.data.some((h) => h.holiday_date === date));
  assert.strictEqual((await api.request(`/public-holidays/${a.body.data.id}`, { method: 'DELETE', token: admin })).status, 204);
  assert.strictEqual((await post('/public-holidays', guardTok, { holiday_date: '2031-01-01', name: 'x' })).status, 403);
});

test('shift templates: Night is flagged as a night shift; create validates times', async () => {
  const list = await api.request('/shift-templates', { token: manager });
  assert.strictEqual(list.status, 200);
  const night = list.body.data.find((t) => t.name === 'Night');
  assert.ok(night.is_night); assert.strictEqual(night.start_time, '18:00'); assert.strictEqual(night.end_time, '06:00');
  assert.strictEqual((await post('/shift-templates', manager, { name: 'Bad', start_time: '7am', end_time: '15:00' })).status, 400);
  const made = await post('/shift-templates', admin, { name: `Late ${stamp}`, start_time: '14:00', end_time: '22:00' });
  assert.strictEqual(made.status, 201); assert.strictEqual(made.body.data.start_time, '14:00');
  assert.strictEqual((await post('/shift-templates', guardTok, { name: 'x', start_time: '01:00', end_time: '02:00' })).status, 403);
});

test('every admin change is written to the audit log', async () => {
  const me = await api.request('/auth/me', { token: admin });
  const res = await api.request(`/audit-logs?user_id=${me.body.data.id}&per_page=100`, { token: admin });
  const types = new Set(res.body.data.map((r) => r.entity_type));
  for (const t of ['guard', 'client', 'site', 'checkpoint', 'route', 'settings']) assert.ok(types.has(t), `missing audit entry for ${t}`);
});


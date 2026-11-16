// Integration tests for incidents. Need the same seeded database as the other tests.
// They clean up the incidents and notifications they create.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');
const { pool } = require('../src/config/db');

let api; let t; let siteId; let opts; const made = []; const startedAt = new Date();
before(async () => {
  api = await startServer();
  t = {};
  for (const [k, e] of [['guard', 'amina@example.com'], ['sup', 'supervisor@example.com'], ['mgr', 'manager@example.com'], ['admin', 'admin@example.com'], ['client', 'grace@example.com']]) t[k] = await api.login(e);
  siteId = (await pool.query("SELECT sg.site_id FROM site_guards sg JOIN users u ON u.id = sg.guard_id WHERE u.email = 'amina@example.com' ORDER BY sg.site_id LIMIT 1")).rows[0].site_id;
  opts = (await api.request('/incidents/options', { token: t.guard })).body.data;
});
after(async () => {
  if (made.length) await pool.query('DELETE FROM incidents WHERE id = ANY($1)', [made]);
  await pool.query("DELETE FROM notifications WHERE type IN ('incident_reported', 'incident_updated') AND created_at >= $1", [startedAt]);
  await api.stop();
});

const report = (body, token) => api.request('/incidents', { method: 'POST', token, body: { site_id: siteId, category: opts.categories[0], description: 'Test incident: unknown person at the gate', ...body } });

test('options lists the allowed statuses and categories', () => {
  assert.ok(opts.statuses.includes('open'));
  assert.ok(opts.categories.length > 0);
});

test('a guard reports an incident at their own site and it starts open', async () => {
  const res = await report({ latitude: 0.31, longitude: 32.58 }, t.guard);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.status, 'open');
  assert.strictEqual(res.body.data.site_id, siteId);
  assert.strictEqual(res.body.data.reported_by_name.length > 0, true);
  made.push(res.body.data.id);
});

test('bad reports are rejected with details', async () => {
  const res = await report({ category: 'not-a-category', description: 'no' }, t.guard);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(res.body.error.details.length >= 2);
});

test('a guard cannot report at a site that is not theirs (404)', async () => {
  const res = await report({ site_id: 999999 }, t.guard);
  assert.strictEqual(res.status, 404);
});

test('only guards can report, and only staff can list', async () => {
  assert.strictEqual((await report({}, t.mgr)).status, 403);
  for (const tok of [t.guard, t.client]) assert.strictEqual((await api.request('/incidents', { token: tok })).status, 403);
  assert.strictEqual((await api.request('/incidents')).status, 401);
});

test('staff list incidents with filters and a status summary', async () => {
  for (const tok of [t.mgr, t.admin]) {
    const res = await api.request(`/incidents?status=open&site_id=${siteId}`, { token: tok });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.some((i) => i.id === made[0]));
    assert.ok(res.body.meta.by_status.open >= 1);
    assert.ok(res.body.data.every((i) => i.status === 'open'));
  }
  assert.strictEqual((await api.request('/incidents?from=nonsense', { token: t.mgr })).status, 400);
});

test('resolving needs a note, then the guard is told and can read it', async () => {
  const id = made[0];
  const noNote = await api.request(`/incidents/${id}`, { method: 'PATCH', token: t.mgr, body: { status: 'resolved' } });
  assert.strictEqual(noNote.status, 400);
  assert.strictEqual(noNote.body.error.details[0].field, 'resolution_note');
  const bad = await api.request(`/incidents/${id}`, { method: 'PATCH', token: t.mgr, body: { status: 'sideways' } });
  assert.strictEqual(bad.status, 400);
  const ok = await api.request(`/incidents/${id}`, { method: 'PATCH', token: t.mgr, body: { status: 'resolved', resolution_note: 'Checked the gate with the supervisor. No threat.' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.data.status, 'resolved');
  const own = await api.request(`/incidents/${id}`, { token: t.guard });
  assert.strictEqual(own.status, 200);
  assert.match(own.body.data.resolution_note, /No threat/);
  const notes = await api.request('/notifications', { token: t.guard });
  assert.ok(notes.body.data.some((n) => n.type === 'incident_updated'));
  assert.strictEqual((await api.request(`/incidents/${id}`, { method: 'PATCH', token: t.guard, body: { status: 'open' } })).status, 403);
});

test('unknown incident is a 404', async () => {
  assert.strictEqual((await api.request('/incidents/999999', { token: t.mgr })).status, 404);
});

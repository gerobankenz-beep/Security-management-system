// Integration tests (need the database): payroll rules and report scoping. Uses an empty future month so no data is needed.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

let api; let admin; let manager; let supervisor; let client;
const month = '2031-03';
const post = (path, token, body) => api.request(path, { method: 'POST', token, body });

before(async () => {
  api = await startServer();
  admin = await api.login('admin@example.com'); manager = await api.login('manager@example.com');
  supervisor = await api.login('supervisor@example.com'); client = await api.login('grace@example.com');
});
after(async () => { if (api && api.stop) await api.stop(); });

test('manager and supervisor get 403 on payroll', async () => {
  for (const tok of [manager, supervisor]) {
    assert.equal((await api.request(`/payroll/runs/${month}`, { token: tok })).status, 403);
    assert.equal((await post('/payroll/runs', tok, { month })).status, 403);
  }
});

test('payroll run lifecycle: reason required, review, finalise locks, unlock needs a reason', async () => {
  assert.equal((await post('/payroll/runs', admin, { month: 'bad' })).status, 400);
  const made = await post('/payroll/runs', admin, { month });
  assert.ok([200, 201].includes(made.status));
  assert.equal((await post('/payroll/adjustments', admin, { guard_id: 1, month, type: 'deduction', amount_ugx: 1000, reason: '' })).status, 400);
  assert.equal((await post(`/payroll/runs/${month}/finalise`, admin)).status, 409);        // not reviewed yet
  assert.equal((await post(`/payroll/runs/${month}/review`, admin)).status, 200);
  assert.equal((await post(`/payroll/runs/${month}/finalise`, admin)).status, 200);
  assert.equal((await post(`/payroll/runs/${month}/recalculate`, admin)).status, 409);     // locked
  assert.equal((await post(`/payroll/runs/${month}/unlock`, admin, { reason: '' })).status, 400);
  assert.equal((await post(`/payroll/runs/${month}/unlock`, admin, { reason: 'test unlock' })).status, 200);
});

test('weekly report: staff only, week must be a Monday', async () => {
  assert.equal((await api.request('/reports/weekly-field?week_start=2026-11-09', { token: client })).status, 403);
  const ok = await api.request('/reports/weekly-field?week_start=2026-11-09', { token: supervisor });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.data.summary && Array.isArray(ok.body.data.by_site));
  assert.equal((await api.request('/reports/weekly-field?week_start=2026-11-10', { token: admin })).status, 400); // not a Monday
});

test('proof of service: client allowed and sees no pay or guard names', async () => {
  const r = await api.request('/reports/proof-of-service?week_start=2026-11-09', { token: client });
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.ok(!/guard_name|hourly_rate|"net"|employee_no/.test(text));
  assert.equal((await api.request('/reports/proof-of-service?week_start=2026-11-09', { token: supervisor })).status, 403);
});

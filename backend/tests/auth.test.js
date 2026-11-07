// Integration tests: need the database from database/schema.sql + seed.sql and `npm run set-passwords`.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.stop(); });

test('health check works', async () => {
  const res = await api.request('/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.status, 'ok');
});

test('login succeeds with correct password', async () => {
  const res = await api.request('/auth/login', { method: 'POST', body: { email: 'amina@example.com', password: 'Password123!' } });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.token);
  assert.strictEqual(res.body.data.user.role, 'guard');
  assert.strictEqual(res.body.data.expires_in, 28800);
});

test('login fails with wrong password (401, generic message)', async () => {
  const res = await api.request('/auth/login', { method: 'POST', body: { email: 'amina@example.com', password: 'nope-nope' } });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'UNAUTHENTICATED');
});

test('login with missing fields gives VALIDATION_ERROR with details', async () => {
  const res = await api.request('/auth/login', { method: 'POST', body: { email: 'not-an-email' } });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(res.body.error.details.length >= 2);
});

test('/auth/me needs a token', async () => {
  const res = await api.request('/auth/me');
  assert.strictEqual(res.status, 401);
});

test('/auth/me returns the logged-in user', async () => {
  const token = await api.login('manager@example.com');
  const res = await api.request('/auth/me', { token });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.role, 'ops_manager');
});

test('admin can list users with pagination meta; password_hash is never returned', async () => {
  const token = await api.login('admin@example.com');
  const res = await api.request('/users?per_page=3', { token });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.length, 3);
  assert.ok(res.body.meta.total >= 7);
  assert.strictEqual(res.body.data[0].password_hash, undefined);
});

test('guard cannot list users (403)', async () => {
  const token = await api.login('amina@example.com');
  const res = await api.request('/users', { token });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error.code, 'FORBIDDEN');
});

test('admin can create a user, duplicate email gives 409', async () => {
  const token = await api.login('admin@example.com');
  const email = `test.${Date.now()}@example.com`;
  const body = { full_name: 'Test Guard', email, role: 'guard', password: 'Password123!' };
  const first = await api.request('/users', { method: 'POST', token, body });
  assert.strictEqual(first.status, 201);
  assert.strictEqual(first.body.data.email, email);
  const second = await api.request('/users', { method: 'POST', token, body });
  assert.strictEqual(second.status, 409);
});

test('sites are scoped by role: guard sees own site, client sees own site', async () => {
  const guardToken = await api.login('amina@example.com');
  const guardSites = await api.request('/sites', { token: guardToken });
  assert.strictEqual(guardSites.status, 200);
  assert.strictEqual(guardSites.body.meta.total, 1);
  const clientToken = await api.login('grace@example.com');
  const clientSites = await api.request('/sites', { token: clientToken });
  assert.strictEqual(clientSites.body.meta.total, 1);
});

test('stub endpoints answer 501 so owners know what to build', async () => {
  const token = await api.login('manager@example.com');
  const res = await api.request('/rosters', { token });
  assert.strictEqual(res.status, 501);
  assert.strictEqual(res.body.error.code, 'NOT_IMPLEMENTED');
});

test('unknown route gives 404 in the standard error shape', async () => {
  const res = await api.request('/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'NOT_FOUND');
});

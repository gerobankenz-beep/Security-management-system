// Starts the app on a random port so tests can call it with fetch().
const http = require('http');
const app = require('../src/app');
const { pool } = require('../src/config/db');

async function startServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}/api/v1`;

  async function request(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function login(email, password = 'Password123!') {
    const res = await request('/auth/login', { method: 'POST', body: { email, password } });
    return res.body.data.token;
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  return { request, login, stop };
}

module.exports = { startServer };

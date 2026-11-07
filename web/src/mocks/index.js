// A tiny fake backend that lives in the browser. It follows the API contract so screens can be
// built before the real endpoints exist. Add a route here when you start a new screen.
import * as data from './data';

const LATENCY = Number(import.meta.env.VITE_MOCK_LATENCY ?? 250);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Local copy of the error class (client.js imports this file, so it cannot be imported back).
class MockError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.isMock = true;
  }
}

const tokenFor = (user) => `mock-token-${user.id}`;
const userFromToken = (token) => data.users.find((u) => tokenFor(u) === token);

function page(rows, query = {}) {
  const per = Number(query.per_page) || 20;
  const current = Number(query.page) || 1;
  return { data: rows.slice((current - 1) * per, current * per), meta: { page: current, per_page: per, total: rows.length } };
}

const publicUser = ({ id, full_name, email, phone, role, client_id, is_active }) =>
  ({ id, full_name, email, phone, role, client_id, is_active });

// [method, path pattern, allowed roles (empty = any logged-in user), handler]
const routes = [
  ['GET', '/users', ['admin'], ({ query }) => {
    const rows = data.users.filter((u) => !query?.role || u.role === query.role).map(publicUser);
    return page(rows, query);
  }],
  ['GET', '/audit-logs', ['admin'], ({ query }) => page(data.auditLogs, query)],
  ['GET', '/sites', [], ({ user, query }) => {
    const rows = user.role === 'client' ? data.sites.filter((s) => s.client_id === user.client_id) : data.sites;
    return page(rows, query);
  }],
  ['GET', '/sites/:id', [], ({ user, params }) => {
    const site = data.sites.find((s) => s.id === Number(params.id));
    if (!site || (user.role === 'client' && site.client_id !== user.client_id)) throw new MockError(404, 'NOT_FOUND', `Site ${params.id} not found`);
    return { data: site };
  }],
  ['GET', '/dashboard/overview', ['ops_manager', 'supervisor', 'admin'], () => ({ data: data.overview })],
  ['GET', '/dashboard/sites/:id/status', ['ops_manager', 'supervisor', 'admin'], () => ({ data: data.siteStatus })],
  ['GET', '/reports/patrol-compliance', ['ops_manager', 'supervisor', 'admin'], () => ({ data: data.compliance })],
  ['GET', '/flags', ['ops_manager', 'supervisor', 'admin'], ({ query }) => page(data.flags, query)],
];

function match(pattern, path) {
  const names = [];
  const regex = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
  const m = path.match(regex);
  if (!m) return null;
  return Object.fromEntries(names.map((n, i) => [n, m[i + 1]]));
}

export async function mockRequest({ method, path, body, query, token }) {
  await sleep(LATENCY);

  if (method === 'POST' && path === '/auth/login') {
    const user = data.users.find((u) => u.email.toLowerCase() === String(body?.email || '').toLowerCase());
    if (!user || body.password !== data.MOCK_PASSWORD) throw new MockError(401, 'UNAUTHENTICATED', 'Wrong email or password');
    return { data: { token: tokenFor(user), expires_in: 28800, user: { id: user.id, full_name: user.full_name, role: user.role } } };
  }

  const user = userFromToken(token);
  if (!user) throw new MockError(401, 'UNAUTHENTICATED', 'Missing or invalid token');

  if (method === 'GET' && path === '/auth/me') return { data: publicUser(user) };
  if (method === 'POST' && path === '/auth/logout') return null;

  for (const [m, pattern, roles, handler] of routes) {
    if (m !== method) continue;
    const params = match(pattern, path);
    if (!params) continue;
    if (roles.length > 0 && !roles.includes(user.role)) throw new MockError(403, 'FORBIDDEN', `Role '${user.role}' cannot access this`);
    return handler({ user, params, query, body });
  }
  throw new MockError(501, 'NOT_IMPLEMENTED', `No mock for ${method} ${path} yet. Add one in src/mocks/index.js`);
}

// A tiny fake backend that lives in the browser. It follows the API contract so screens can be
// built before the real endpoints exist. Add a route here when you start a new screen.
import * as data from './data';
import { MockError, page } from './util';
import { adminRoutes, resetAdminMocks } from './admin';
import { opsRoutes, resetOpsMocks } from './ops';

const LATENCY = Number(import.meta.env.VITE_MOCK_LATENCY ?? 250);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tokenFor = (user) => `mock-token-${user.id}`;
const userFromToken = (token) => data.users.find((u) => tokenFor(u) === token);

const publicUser = ({ id, full_name, email, phone, role, client_id, is_active }) =>
  ({ id, full_name, email, phone, role, client_id, is_active });

// [method, path pattern, allowed roles (empty = any logged-in user), handler]
const routes = [
  ...adminRoutes,
  ...opsRoutes,
  ['GET', '/users', ['admin'], ({ query }) => {
    const rows = data.users.filter((u) => !query?.role || u.role === query.role).map(publicUser);
    return page(rows, query);
  }],
  ['GET', '/audit-logs', ['admin'], ({ query }) => page(data.auditLogs, query)],
  ['GET', '/dashboard/sites/:id/status', ['ops_manager', 'supervisor', 'admin'], () => ({ data: data.siteStatus })],
  ['GET', '/reports/patrol-compliance', ['ops_manager', 'supervisor', 'admin'], () => ({ data: data.compliance })],
];

function match(pattern, path) {
  const names = [];
  const regex = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
  const m = path.match(regex);
  if (!m) return null;
  return Object.fromEntries(names.map((n, i) => [n, m[i + 1]]));
}

export function resetMocks() { resetAdminMocks(); resetOpsMocks(); }

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
    const result = await handler({ user, params, query, body });
    return result && result.status ? { data: result.data } : result;
  }
  throw new MockError(501, 'NOT_IMPLEMENTED', `No mock for ${method} ${path} yet. Add one in src/mocks/index.js`);
}

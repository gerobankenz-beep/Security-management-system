// Fake backend for the guard app (EXPO_PUBLIC_USE_MOCKS=true). It follows the real API's answers,
// including "already checked in" and duplicate scans, so the offline queue can be demonstrated without a server.
import { ApiError, NetworkError } from '../api/client.js';

let offline = false;
export const setMockOffline = (v) => { offline = !!v; };
export const isMockOffline = () => offline;

const MIN = 60000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const USERS = {
  'amina@example.com': { id: 4, full_name: 'Amina K.', role: 'guard' },
  'grace@example.com': { id: 9, full_name: 'Grace Client', role: 'client' },
  'manager@example.com': { id: 2, full_name: 'Mary Manager', role: 'ops_manager' },
};
const CHECKPOINTS = [
  { id: 1, name: 'Main gate', tag_code: 'CP-1-1-A1B2', sequence: 1 },
  { id: 2, name: 'Back gate', tag_code: 'CP-1-2-C3D4', sequence: 2 },
  { id: 3, name: 'Generator', tag_code: 'CP-1-3-E5F6', sequence: 3 },
  { id: 4, name: 'Roof access', tag_code: 'CP-1-4-G7H8', sequence: 4 },
];

let db;
export function resetMobileMocks() {
  offline = false;
  db = {
    shifts: [
      { id: 101, roster_id: 1, guard_id: 4, site_id: 1, site_name: 'Kololo Office Park', date: iso(now).slice(0, 10), start_at: iso(now - 30 * MIN), end_at: iso(now + 8 * 60 * MIN), status: 'scheduled', template_name: 'Day', is_night: false },
      { id: 102, roster_id: 1, guard_id: 4, site_id: 1, site_name: 'Kololo Office Park', date: iso(now + 24 * 60 * MIN).slice(0, 10), start_at: iso(now + 24 * 60 * MIN), end_at: iso(now + 32 * 60 * MIN), status: 'scheduled', template_name: 'Night', is_night: true },
    ],
    attendance: {}, events: new Map(), scans: new Map(),
  };
}
resetMobileMocks();

const guard = (token) => {
  const u = Object.values(USERS).find((x) => `mock-token-${x.id}` === token);
  if (!u) throw new ApiError(401, 'UNAUTHORIZED', 'Please log in again');
  return u;
};

export async function mockRequest(path, { method, body, token, auth }) {
  await new Promise((r) => setTimeout(r, 30));
  if (offline) throw new NetworkError('Cannot reach the server (mock offline)');
  if (method === 'POST' && path === '/auth/login') {
    const u = USERS[String(body.email).toLowerCase()];
    if (!u || body.password !== 'Password123!') throw new ApiError(401, 'UNAUTHORIZED', 'Wrong email or password');
    return { data: { token: `mock-token-${u.id}`, expires_in: 3600, user: u } };
  }
  const user = auth ? guard(token) : null;
  if (method === 'GET' && path === '/me/shifts') return { data: db.shifts.filter((s) => s.guard_id === user.id) };
  const route = path.match(/^\/shifts\/(\d+)\/(route|rounds)$/);
  if (method === 'GET' && route) {
    const shift = db.shifts.find((s) => s.id === Number(route[1]) && s.guard_id === user.id);
    if (!shift) throw new ApiError(404, 'NOT_FOUND', 'Shift not found');
    if (route[2] === 'route') return { data: { id: 1, name: 'Perimeter walk', max_round_minutes: 40, min_seconds_between_scans: 30, round_start_times: ['08:00', '10:00', '12:00'], checkpoints: CHECKPOINTS } };
    return { data: [0, 1, 2].map((i) => ({ id: 500 + i, round_index: i + 1, route_id: 1, window_start: iso(new Date(shift.start_at).getTime() + i * 120 * MIN), window_end: iso(new Date(shift.start_at).getTime() + i * 120 * MIN + 40 * MIN), status: 'pending', scans_done: 0, scans_expected: 4 })) };
  }
  if (method === 'POST' && (path === '/attendance/check-in' || path === '/attendance/check-out')) {
    const isIn = path.endsWith('check-in');
    const prior = db.events.get(body.client_event_id);
    if (prior) return { data: { ...prior, duplicate: true } };
    const shift = db.shifts.find((s) => s.id === body.shift_id && s.guard_id === user.id);
    if (!shift) throw new ApiError(404, 'NOT_FOUND', 'Shift not found');
    const a = (db.attendance[shift.id] = db.attendance[shift.id] || {});
    if (isIn) {
      if (a.checked_in_at) throw new ApiError(409, 'ALREADY_CHECKED_IN', 'You have already checked in for this shift');
      const t = new Date(body.device_time).getTime();
      if (t < new Date(shift.start_at).getTime() - 60 * MIN || t > new Date(shift.end_at).getTime()) throw new ApiError(409, 'OUTSIDE_SHIFT_WINDOW', 'This check-in time is outside the shift (check-in opens 60 minutes before the start)');
      a.checked_in_at = body.device_time; shift.status = 'in_progress';
    } else {
      if (!a.checked_in_at) throw new ApiError(409, 'NOT_CHECKED_IN', 'Check in before checking out');
      if (a.checked_out_at) throw new ApiError(409, 'ALREADY_CHECKED_OUT', 'You have already checked out of this shift');
      a.checked_out_at = body.device_time; shift.status = 'completed';
    }
    const result = { id: shift.id, shift_id: shift.id, checked_in_at: a.checked_in_at, checked_out_at: a.checked_out_at || null, status: 'on_time', verification_status: body.latitude === undefined ? 'pending_review' : 'verified', duplicate: false };
    db.events.set(body.client_event_id, result);
    return { data: result };
  }
  if (method === 'POST' && path === '/scans/batch') {
    if (!Array.isArray(body.scans) || !body.scans.length) throw new ApiError(400, 'VALIDATION_ERROR', 'scans must be a list');
    return { data: { results: body.scans.map((s) => {
      if (db.scans.has(s.client_scan_id)) return { client_scan_id: s.client_scan_id, status: 'duplicate', round_id: 500 };
      const shift = db.shifts.find((x) => x.id === s.shift_id && x.guard_id === user.id);
      let r;
      if (!shift) r = { client_scan_id: s.client_scan_id, status: 'rejected', reason: 'NOT_YOUR_SHIFT' };
      else if (!CHECKPOINTS.find((c) => c.tag_code === s.tag_code)) r = { client_scan_id: s.client_scan_id, status: 'rejected', reason: 'UNKNOWN_TAG' };
      else r = { client_scan_id: s.client_scan_id, status: 'accepted', round_id: 500 };
      db.scans.set(s.client_scan_id, r);
      return r;
    }) } };
  }
  throw new ApiError(404, 'NOT_FOUND', `No mock for ${method} ${path}`);
}

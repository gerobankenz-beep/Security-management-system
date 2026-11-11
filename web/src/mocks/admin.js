// Fake backend for the admin screens. Mirrors the rules of the real API (see docs/api-contract-additions-1.md)
// closely enough that screens behave the same in mock mode and against the real backend.
import * as data from './data';
import { MockError, invalid, page } from './util';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rand = (n) => Array.from({ length: n }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
const tempPassword = () => `Tmp${rand(6)}x9`;
const toDate = () => new Date().toISOString().slice(0, 10);

let state;
export function resetAdminMocks() {
  state = {
    next: { user: 100, client: 100, site: 100, cp: 100, route: 100, holiday: 100, template: 100 },
    clients: [
      { id: 1, name: 'Kololo Holdings Ltd', contact_name: 'Grace Namuli', contact_phone: '+256700000001', contact_email: 'grace@example.com', is_active: true },
      { id: 2, name: 'Nakasero Logistics', contact_name: 'Moses K.', contact_phone: '+256700000002', contact_email: 'moses@example.com', is_active: true },
    ],
    sites: data.sites.map((s) => ({ ...s })),
    checkpoints: [
      { id: 1, site_id: 1, name: 'Main gate', tag_code: 'CP-1-1-A1B2', latitude: 0.3343, longitude: 32.5919, is_active: true },
      { id: 2, site_id: 1, name: 'Back gate', tag_code: 'CP-1-2-C3D4', latitude: 0.3349, longitude: 32.5925, is_active: true },
      { id: 3, site_id: 1, name: 'Generator', tag_code: 'CP-1-3-E5F6', latitude: 0.3347, longitude: 32.5923, is_active: true },
      { id: 4, site_id: 1, name: 'Roof access', tag_code: 'CP-1-4-G7H8', latitude: 0.3346, longitude: 32.5922, is_active: true },
    ],
    routes: [{ id: 1, site_id: 1, name: 'Night perimeter walk', max_round_minutes: 45, min_seconds_between_scans: 60, is_active: true,
      checkpoint_ids: [1, 2, 3, 4], round_start_times: ['20:00', '22:00', '00:00', '02:00'] }],
    supervisors: { 1: [3] },
    guardSites: { 4: [1], 5: [1], 6: [1] },
    pay: { 4: { hourly_rate_ugx: 5000, night_allowance_ugx: 3000, overtime_multiplier: null }, 5: { hourly_rate_ugx: 5000, night_allowance_ugx: 3000, overtime_multiplier: null }, 6: { hourly_rate_ugx: 5500, night_allowance_ugx: 3000, overtime_multiplier: 1.5 } },
    employee: { 4: 'G004', 5: 'G005', 6: 'G006' },
    settings: { default_geofence_radius_m: 150, late_checkin_minutes: 10, no_show_minutes: 30, min_rest_hours: 10, max_consecutive_days: 6,
      late_round_minutes: 15, wrong_location_metres: 50, overtime_weekly_threshold_hours: 48, overtime_multiplier: 1.5, holiday_multiplier: 2, paid_early_arrival: false },
    holidays: [{ id: 1, holiday_date: '2026-12-25', name: 'Christmas Day (example)' }],
    templates: [{ id: 1, name: 'Day', start_time: '06:00', end_time: '18:00', is_night: false }, { id: 2, name: 'Night', start_time: '18:00', end_time: '06:00', is_night: true }],
  };
  // fresh copy of the users so tests do not leak into each other
  data.users.length = 0;
  [
    { id: 1, full_name: 'Sam Admin', email: 'admin@example.com', phone: '+256700000010', role: 'admin', client_id: null, is_active: true },
    { id: 2, full_name: 'Olivia Manager', email: 'manager@example.com', phone: '+256700000011', role: 'ops_manager', client_id: null, is_active: true },
    { id: 3, full_name: 'Peter Supervisor', email: 'supervisor@example.com', phone: '+256700000012', role: 'supervisor', client_id: null, is_active: true },
    { id: 4, full_name: 'Amina K.', email: 'amina@example.com', phone: '+256700000013', role: 'guard', client_id: null, is_active: true },
    { id: 5, full_name: 'John M.', email: 'john@example.com', phone: '+256700000014', role: 'guard', client_id: null, is_active: true },
    { id: 6, full_name: 'Ruth N.', email: 'ruth@example.com', phone: '+256700000015', role: 'guard', client_id: null, is_active: true },
    { id: 7, full_name: 'Grace Namuli', email: 'grace@example.com', phone: '+256700000001', role: 'client', client_id: 1, is_active: true },
  ].forEach((u) => data.users.push(u));
  data.sites.length = 0;
  state.sites.forEach((s) => data.sites.push(s));
}
resetAdminMocks();

const guardView = (u) => ({
  id: u.id, full_name: u.full_name, email: u.email, phone: u.phone, employee_no: state.employee[u.id] || null, is_active: u.is_active,
  site_ids: state.guardSites[u.id] || [],
  pay_profile: state.pay[u.id] ? { ...state.pay[u.id], effective_from: toDate() } : null,
});
const findGuard = (id) => {
  const u = data.users.find((x) => x.id === Number(id) && x.role === 'guard');
  if (!u) throw new MockError(404, 'NOT_FOUND', `Guard ${id} not found`);
  return u;
};
const siteVisible = (user, s) => {
  if (user.role === 'client') return s.client_id === user.client_id;
  if (user.role === 'supervisor') return (state.supervisors[s.id] || []).includes(user.id);
  if (user.role === 'guard') return Object.entries(state.guardSites).some(([gid, ids]) => Number(gid) === user.id && ids.includes(s.id));
  return true;
};
const getSiteFor = (user, id) => {
  const s = data.sites.find((x) => x.id === Number(id));
  if (!s || !siteVisible(user, s)) throw new MockError(404, 'NOT_FOUND', `Site ${id} not found`);
  return s;
};
const cpView = (c) => ({ id: c.id, name: c.name, tag_code: c.tag_code, sequence: undefined });
const routeView = (r) => ({
  id: r.id, site_id: r.site_id, name: r.name, max_round_minutes: r.max_round_minutes, min_seconds_between_scans: r.min_seconds_between_scans, is_active: r.is_active,
  checkpoints: r.checkpoint_ids.map((cid, i) => ({ ...cpView(state.checkpoints.find((c) => c.id === cid)), sequence: i + 1 })),
  round_start_times: [...r.round_start_times].sort(),
});
const qrPlaceholder = (text) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#fff" stroke="#000"/><text x="120" y="110" text-anchor="middle" font-size="14">MOCK QR</text><text x="120" y="135" text-anchor="middle" font-size="12">${text}</text></svg>`)}`;

function checkSite(b, creating) {
  const d = [];
  const num = (f, min, max) => { if (b[f] !== undefined && (typeof b[f] !== 'number' || b[f] < min || b[f] > max)) d.push({ field: f, issue: `must be a number between ${min} and ${max}` }); };
  if (creating) {
    if (!b.client_id) d.push({ field: 'client_id', issue: 'is required' });
    if (!b.name) d.push({ field: 'name', issue: 'is required' });
    if (b.latitude === undefined) d.push({ field: 'latitude', issue: 'is required' });
    if (b.longitude === undefined) d.push({ field: 'longitude', issue: 'is required' });
  }
  num('latitude', -90, 90); num('longitude', -180, 180);
  if (b.geofence_radius_m !== undefined && !(b.geofence_radius_m > 0)) d.push({ field: 'geofence_radius_m', issue: 'must be above 0' });
  ['guards_required_day', 'guards_required_night', 'patrols_per_night'].forEach((f) => { if (b[f] !== undefined && !(Number.isInteger(b[f]) && b[f] >= 0)) d.push({ field: f, issue: 'must be 0 or more' }); });
  if (d.length) throw invalid(d);
}

function checkRoute(site, b, creating) {
  const d = [];
  if (creating && !b.name) d.push({ field: 'name', issue: 'is required' });
  if (b.checkpoint_sequence !== undefined) {
    const ids = b.checkpoint_sequence;
    if (!Array.isArray(ids) || ids.length === 0) d.push({ field: 'checkpoint_sequence', issue: 'needs at least one checkpoint' });
    else if (new Set(ids).size !== ids.length) d.push({ field: 'checkpoint_sequence', issue: 'a checkpoint appears twice' });
    else if (ids.some((id) => !state.checkpoints.find((c) => c.id === id && c.site_id === site.id && c.is_active))) d.push({ field: 'checkpoint_sequence', issue: 'every checkpoint must be an active checkpoint of this site' });
  } else if (creating) d.push({ field: 'checkpoint_sequence', issue: 'is required' });
  if (b.round_start_times !== undefined) {
    if (!Array.isArray(b.round_start_times) || b.round_start_times.length === 0 || b.round_start_times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) d.push({ field: 'round_start_times', issue: 'must be a list of times like 20:00' });
  } else if (creating) d.push({ field: 'round_start_times', issue: 'is required' });
  if (d.length) throw invalid(d);
}

const ADMIN = ['admin'];
const STAFF_READ = ['admin', 'ops_manager', 'supervisor'];

export const adminRoutes = [
  // ---- guards ----
  ['GET', '/guards', STAFF_READ, ({ query }) => {
    const q = String(query?.search || '').toLowerCase();
    let rows = data.users.filter((u) => u.role === 'guard');
    if (q) rows = rows.filter((u) => `${u.full_name} ${u.email} ${state.employee[u.id] || ''}`.toLowerCase().includes(q));
    if (query?.status === 'active') rows = rows.filter((u) => u.is_active);
    if (query?.status === 'inactive') rows = rows.filter((u) => !u.is_active);
    if (query?.site_id) rows = rows.filter((u) => (state.guardSites[u.id] || []).includes(Number(query.site_id)));
    return page(rows.map(guardView), query);
  }],
  ['GET', '/guards/:id', ['admin', 'ops_manager'], ({ params }) => ({ data: guardView(findGuard(params.id)) })],
  ['POST', '/guards', ADMIN, ({ body }) => {
    const d = [];
    if (!body.full_name) d.push({ field: 'full_name', issue: 'is required' });
    if (!body.email) d.push({ field: 'email', issue: 'is required' }); else if (!EMAIL.test(body.email)) d.push({ field: 'email', issue: 'must be a valid email' });
    if (body.hourly_rate_ugx === undefined) d.push({ field: 'hourly_rate_ugx', issue: 'is required' });
    else if (!Number.isInteger(body.hourly_rate_ugx) || body.hourly_rate_ugx < 0) d.push({ field: 'hourly_rate_ugx', issue: 'must be a whole number, 0 or more' });
    if (body.overtime_multiplier !== undefined && (body.overtime_multiplier < 1 || body.overtime_multiplier > 5)) d.push({ field: 'overtime_multiplier', issue: 'must be between 1 and 5' });
    if (body.password && body.password.length < 8) d.push({ field: 'password', issue: 'must be at least 8 characters' });
    if (d.length) throw invalid(d);
    if (data.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) throw new MockError(409, 'CONFLICT', 'That record already exists');
    const id = state.next.user++;
    const user = { id, full_name: body.full_name, email: body.email.toLowerCase(), phone: body.phone || null, role: 'guard', client_id: null, is_active: true };
    data.users.push(user);
    state.employee[id] = body.employee_no || null;
    state.pay[id] = { hourly_rate_ugx: body.hourly_rate_ugx, night_allowance_ugx: body.night_allowance_ugx ?? 0, overtime_multiplier: body.overtime_multiplier ?? null };
    state.guardSites[id] = body.site_ids || [];
    return { data: { ...guardView(user), temporary_password: body.password ? undefined : tempPassword() }, status: 201 };
  }],
  ['PATCH', '/guards/:id', ADMIN, ({ params, body }) => {
    const u = findGuard(params.id);
    ['full_name', 'phone'].forEach((f) => { if (body[f] !== undefined) u[f] = body[f]; });
    if (body.employee_no !== undefined) state.employee[u.id] = body.employee_no;
    ['hourly_rate_ugx', 'night_allowance_ugx', 'overtime_multiplier'].forEach((f) => { if (body[f] !== undefined) state.pay[u.id] = { ...(state.pay[u.id] || {}), [f]: body[f] }; });
    if (body.site_ids) state.guardSites[u.id] = body.site_ids;
    return { data: guardView(u) };
  }],
  ['POST', '/guards/:id/deactivate', ADMIN, ({ params }) => { const u = findGuard(params.id); u.is_active = false; return { data: guardView(u) }; }],
  ['POST', '/guards/:id/reactivate', ADMIN, ({ params }) => { const u = findGuard(params.id); u.is_active = true; return { data: guardView(u) }; }],
  ['PUT', '/guards/:id/sites', ADMIN, ({ params, body }) => {
    const u = findGuard(params.id);
    if ((body.site_ids || []).some((id) => !data.sites.find((s) => s.id === id && s.is_active))) throw invalid([{ field: 'site_ids', issue: 'every id must be an active site' }]);
    state.guardSites[u.id] = body.site_ids || [];
    return { data: guardView(u) };
  }],
  ['POST', '/users/:id/reset-password', ADMIN, ({ params }) => {
    if (!data.users.find((u) => u.id === Number(params.id))) throw new MockError(404, 'NOT_FOUND', `User ${params.id} not found`);
    return { data: { id: Number(params.id), temporary_password: tempPassword() } };
  }],

  // ---- clients ----
  ['GET', '/clients', ['admin', 'ops_manager'], ({ query }) => {
    const q = String(query?.search || '').toLowerCase();
    return page(state.clients.filter((c) => !q || c.name.toLowerCase().includes(q)), query);
  }],
  ['POST', '/clients', ADMIN, ({ body }) => {
    if (!body.name) throw invalid([{ field: 'name', issue: 'is required' }]);
    if (body.contact_email && !EMAIL.test(body.contact_email)) throw invalid([{ field: 'contact_email', issue: 'must be a valid email' }]);
    const c = { id: state.next.client++, name: body.name, contact_name: body.contact_name || null, contact_phone: body.contact_phone || null, contact_email: body.contact_email || null, is_active: true };
    state.clients.push(c);
    return { data: c, status: 201 };
  }],
  ['PATCH', '/clients/:id', ADMIN, ({ params, body }) => {
    const c = state.clients.find((x) => x.id === Number(params.id));
    if (!c) throw new MockError(404, 'NOT_FOUND', `Client ${params.id} not found`);
    Object.assign(c, body);
    return { data: c };
  }],

  // ---- sites ----
  ['GET', '/sites', [], ({ user, query }) => {
    let rows = data.sites.filter((s) => siteVisible(user, s));
    if (query?.include_inactive !== 'true') rows = rows.filter((s) => s.is_active);
    if (query?.client_id) rows = rows.filter((s) => s.client_id === Number(query.client_id));
    return page(rows, query);
  }],
  ['GET', '/sites/:id', [], ({ user, params }) => ({ data: getSiteFor(user, params.id) })],
  ['POST', '/sites', ADMIN, ({ body }) => {
    checkSite(body, true);
    if (!state.clients.find((c) => c.id === body.client_id)) throw invalid([{ field: 'client_id', issue: 'client does not exist' }]);
    const s = { id: state.next.site++, client_id: body.client_id, name: body.name, address: body.address || null, latitude: body.latitude, longitude: body.longitude,
      geofence_radius_m: body.geofence_radius_m ?? state.settings.default_geofence_radius_m, guards_required_day: body.guards_required_day ?? 1,
      guards_required_night: body.guards_required_night ?? 1, patrols_per_night: body.patrols_per_night ?? 0, is_active: true };
    data.sites.push(s);
    return { data: s, status: 201 };
  }],
  ['PATCH', '/sites/:id', ADMIN, ({ user, params, body }) => {
    checkSite(body, false);
    const s = getSiteFor(user, params.id);
    Object.assign(s, body);
    return { data: s };
  }],
  ['PUT', '/sites/:id/supervisors', ADMIN, ({ user, params, body }) => {
    const s = getSiteFor(user, params.id);
    if ((body.user_ids || []).some((id) => !data.users.find((u) => u.id === id && u.role === 'supervisor'))) throw invalid([{ field: 'user_ids', issue: 'every id must be an active supervisor' }]);
    state.supervisors[s.id] = body.user_ids || [];
    return { data: { site_id: s.id, user_ids: state.supervisors[s.id] } };
  }],
  ['GET', '/sites/:id/supervisors', ['admin', 'ops_manager'], ({ user, params }) => {
    const s = getSiteFor(user, params.id);
    return { data: data.users.filter((u) => (state.supervisors[s.id] || []).includes(u.id)).map((u) => ({ id: u.id, full_name: u.full_name })) };
  }],
  ['GET', '/sites/:id/guards', STAFF_READ, ({ user, params }) => {
    const s = getSiteFor(user, params.id);
    return { data: data.users.filter((u) => u.role === 'guard' && (state.guardSites[u.id] || []).includes(s.id))
      .map((u) => ({ id: u.id, full_name: u.full_name, employee_no: state.employee[u.id] || null, phone: u.phone, is_active: u.is_active })) };
  }],

  // ---- checkpoints and routes ----
  ['GET', '/sites/:id/checkpoints/tag-sheet', ['admin', 'ops_manager'], ({ user, params }) => {
    const s = getSiteFor(user, params.id);
    return { data: { site: { id: s.id, name: s.name }, checkpoints: state.checkpoints.filter((c) => c.site_id === s.id && c.is_active)
      .map((c) => ({ id: c.id, name: c.name, tag_code: c.tag_code, qr_data_url: qrPlaceholder(c.tag_code) })) } };
  }],
  ['GET', '/sites/:id/checkpoints', [], ({ user, params }) => ({ data: state.checkpoints.filter((c) => c.site_id === getSiteFor(user, params.id).id) })],
  ['POST', '/sites/:id/checkpoints', ADMIN, ({ user, params, body }) => {
    const s = getSiteFor(user, params.id);
    const d = [];
    if (!body.name) d.push({ field: 'name', issue: 'is required' });
    if (typeof body.latitude !== 'number' || body.latitude < -90 || body.latitude > 90) d.push({ field: 'latitude', issue: 'must be a number between -90 and 90' });
    if (typeof body.longitude !== 'number' || body.longitude < -180 || body.longitude > 180) d.push({ field: 'longitude', issue: 'must be a number between -180 and 180' });
    if (d.length) throw invalid(d);
    const n = state.checkpoints.filter((c) => c.site_id === s.id).length + 1;
    const c = { id: state.next.cp++, site_id: s.id, name: body.name, tag_code: `CP-${s.id}-${n}-${rand(6)}`, latitude: body.latitude, longitude: body.longitude, is_active: true };
    state.checkpoints.push(c);
    return { data: c, status: 201 };
  }],
  ['PATCH', '/checkpoints/:id', ADMIN, ({ params, body }) => {
    const c = state.checkpoints.find((x) => x.id === Number(params.id));
    if (!c) throw new MockError(404, 'NOT_FOUND', `Checkpoint ${params.id} not found`);
    ['name', 'latitude', 'longitude', 'is_active'].forEach((f) => { if (body[f] !== undefined) c[f] = body[f]; });
    return { data: c };
  }],
  ['GET', '/sites/:id/routes', [], ({ user, params }) => ({ data: state.routes.filter((r) => r.site_id === getSiteFor(user, params.id).id && r.is_active).map(routeView) })],
  ['POST', '/sites/:id/routes', ['admin', 'ops_manager'], ({ user, params, body }) => {
    const s = getSiteFor(user, params.id);
    checkRoute(s, body, true);
    const r = { id: state.next.route++, site_id: s.id, name: body.name, max_round_minutes: body.max_round_minutes ?? 45, min_seconds_between_scans: body.min_seconds_between_scans ?? 60,
      is_active: true, checkpoint_ids: body.checkpoint_sequence, round_start_times: [...new Set(body.round_start_times)] };
    state.routes.push(r);
    return { data: routeView(r), status: 201 };
  }],
  ['PATCH', '/routes/:id', ['admin', 'ops_manager'], ({ params, body }) => {
    const r = state.routes.find((x) => x.id === Number(params.id));
    if (!r) throw new MockError(404, 'NOT_FOUND', `Route ${params.id} not found`);
    checkRoute(data.sites.find((s) => s.id === r.site_id), body, false);
    ['name', 'max_round_minutes', 'min_seconds_between_scans', 'is_active'].forEach((f) => { if (body[f] !== undefined) r[f] = body[f]; });
    if (body.checkpoint_sequence) r.checkpoint_ids = body.checkpoint_sequence;
    if (body.round_start_times) r.round_start_times = [...new Set(body.round_start_times)];
    return { data: routeView(r) };
  }],

  // ---- settings, holidays, templates ----
  ['GET', '/settings', ['admin', 'ops_manager'], () => ({ data: { ...state.settings } })],
  ['PATCH', '/settings', ADMIN, ({ body }) => {
    const limits = { default_geofence_radius_m: [1, 5000], late_checkin_minutes: [0, 240], no_show_minutes: [1, 480], min_rest_hours: [0, 24], max_consecutive_days: [1, 14],
      late_round_minutes: [0, 240], wrong_location_metres: [1, 5000], overtime_weekly_threshold_hours: [1, 168], overtime_multiplier: [1, 5], holiday_multiplier: [1, 5] };
    const d = [];
    Object.entries(body || {}).forEach(([k, v]) => {
      if (k === 'paid_early_arrival') { if (typeof v !== 'boolean') d.push({ field: k, issue: 'must be true or false' }); }
      else if (!limits[k]) d.push({ field: k, issue: 'unknown setting' });
      else if (typeof v !== 'number' || v < limits[k][0] || v > limits[k][1]) d.push({ field: k, issue: `must be a number between ${limits[k][0]} and ${limits[k][1]}` });
    });
    if (d.length) throw invalid(d);
    Object.assign(state.settings, body);
    return { data: { ...state.settings } };
  }],
  ['GET', '/public-holidays', ['admin', 'ops_manager'], () => ({ data: [...state.holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)) })],
  ['POST', '/public-holidays', ADMIN, ({ body }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.holiday_date || '')) throw invalid([{ field: 'holiday_date', issue: 'must be a date like 2026-12-25' }]);
    if (!body.name) throw invalid([{ field: 'name', issue: 'is required' }]);
    if (state.holidays.some((h) => h.holiday_date === body.holiday_date)) throw new MockError(409, 'CONFLICT', 'That record already exists');
    const h = { id: state.next.holiday++, holiday_date: body.holiday_date, name: body.name };
    state.holidays.push(h);
    return { data: h, status: 201 };
  }],
  ['DELETE', '/public-holidays/:id', ADMIN, ({ params }) => {
    const i = state.holidays.findIndex((h) => h.id === Number(params.id));
    if (i < 0) throw new MockError(404, 'NOT_FOUND', 'Holiday not found');
    state.holidays.splice(i, 1);
    return null;
  }],
  ['GET', '/shift-templates', STAFF_READ, () => ({ data: state.templates })],
  ['POST', '/shift-templates', ['admin', 'ops_manager'], ({ body }) => {
    const d = [];
    if (!body.name) d.push({ field: 'name', issue: 'is required' });
    ['start_time', 'end_time'].forEach((f) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body[f] || '')) d.push({ field: f, issue: 'must be a time like 18:00' }); });
    if (d.length) throw invalid(d);
    const t = { id: state.next.template++, name: body.name, start_time: body.start_time, end_time: body.end_time, is_night: body.is_night === true };
    state.templates.push(t);
    return { data: t, status: 201 };
  }],
];

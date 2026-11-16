// Fake backend for incidents. Follows the real API: list with filters and a status summary,
// detail, and PATCH where resolving needs a note. State is rebuilt by resetIncidentMocks().
import * as data from './data';
import { adminState } from './admin';
import { MockError, invalid, page } from './util';

const STAFF = ['admin', 'ops_manager', 'supervisor'];
const STATUSES = ['open', 'in_review', 'resolved'];
const CATEGORIES = ['suspicious_activity', 'theft', 'trespass', 'fire', 'injury', 'equipment', 'other'];
const KAMPALA = 3 * 3600e3;
let s;

export function resetIncidentMocks() {
  s = { incidents: [
    { id: 1, site_id: 1, reported_by: 4, category: 'suspicious_activity', description: 'Unknown person photographing the main gate at 21:40.', occurred_at: '2026-11-15T18:40:00Z', latitude: 0.3163, longitude: 32.5822, status: 'open', resolution_note: null },
    { id: 2, site_id: 1, reported_by: 5, category: 'theft', description: 'A laptop bag was reported missing from the reception desk.', occurred_at: '2026-11-14T07:15:00Z', latitude: null, longitude: null, status: 'in_review', resolution_note: null },
    { id: 3, site_id: 2, reported_by: 6, category: 'trespass', description: 'Two people climbed the back fence and left when challenged.', occurred_at: '2026-11-12T20:05:00Z', latitude: 0.3136, longitude: 32.5811, status: 'resolved', resolution_note: 'Fence repaired and extra patrol added at night.' },
    { id: 4, site_id: 2, reported_by: 4, category: 'equipment', description: 'Floodlight at loading bay 2 is not working.', occurred_at: '2026-11-11T17:30:00Z', latitude: null, longitude: null, status: 'open', resolution_note: null },
  ] };
}

const nameOf = (id) => (data.users.find((u) => u.id === id) || {}).full_name || `Guard ${id}`;
const siteName = (id) => (data.sites.find((x) => x.id === id) || {}).name || `Site ${id}`;
const visible = (user, siteId) => user.role !== 'supervisor' || (adminState().supervisors[siteId] || []).includes(user.id);
const view = (i) => ({ ...i, site_name: siteName(i.site_id), reported_by_name: nameOf(i.reported_by), shift_id: null, created_at: i.occurred_at, updated_at: i.occurred_at });
const dayOf = (iso) => new Date(new Date(iso).getTime() + KAMPALA).toISOString().slice(0, 10);
const find = (user, id) => s.incidents.find((x) => x.id === Number(id) && visible(user, x.site_id));

export const incidentRoutes = [
  ['GET', '/incidents/options', [], () => ({ data: { statuses: STATUSES, categories: CATEGORIES } })],
  ['GET', '/incidents', STAFF, ({ user, query = {} }) => {
    const base = s.incidents.filter((i) => visible(user, i.site_id)
      && (!query.site_id || i.site_id === Number(query.site_id))
      && (!query.category || i.category === query.category)
      && (!query.from || dayOf(i.occurred_at) >= query.from)
      && (!query.to || dayOf(i.occurred_at) <= query.to));
    const by_status = {};
    base.forEach((i) => { by_status[i.status] = (by_status[i.status] || 0) + 1; });
    const rows = base.filter((i) => !query.status || i.status === query.status)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).map(view);
    const res = page(rows, query);
    return { data: res.data, meta: { ...res.meta, by_status } };
  }],
  ['GET', '/incidents/:id', STAFF, ({ user, params }) => {
    const i = find(user, params.id);
    if (!i) throw new MockError(404, 'NOT_FOUND', `Incident ${params.id} not found`);
    return { data: view(i) };
  }],
  ['PATCH', '/incidents/:id', STAFF, ({ user, params, body = {} }) => {
    const i = find(user, params.id);
    if (!i) throw new MockError(404, 'NOT_FOUND', `Incident ${params.id} not found`);
    const issues = [];
    if (body.status === undefined && body.resolution_note === undefined) issues.push({ field: 'status', issue: 'send a status or a resolution_note' });
    if (body.status !== undefined && !STATUSES.includes(body.status)) issues.push({ field: 'status', issue: `must be one of: ${STATUSES.join(', ')}` });
    const note = body.resolution_note !== undefined ? (String(body.resolution_note || '').trim() || null) : i.resolution_note;
    const status = body.status !== undefined ? body.status : i.status;
    if (!issues.length && status === 'resolved' && !note) issues.push({ field: 'resolution_note', issue: 'is required to resolve an incident' });
    if (issues.length) throw invalid(issues);
    i.status = status; i.resolution_note = note;
    return { data: view(i) };
  }],
];

resetIncidentMocks();

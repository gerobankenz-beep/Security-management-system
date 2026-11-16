// Incidents: guards report them, supervisors and managers review and resolve them. (API contract section 11)
const { query } = require('../../config/db');
const { notFound, validationError } = require('../../utils/errors');
const { siteScope, assertSiteAccess } = require('../sites/access');
const { buildUpdate } = require('../../utils/sql');
const { notify } = require('../../utils/notify');
const { writeAudit } = require('../../utils/audit');

// Used only when the database has no CHECK rule listing the allowed values.
const FALLBACK = {
  statuses: ['open', 'in_review', 'resolved'],
  categories: ['suspicious_activity', 'theft', 'trespass', 'fire', 'injury', 'equipment', 'other'],
};

// The allowed status and category values are read from the database's own CHECK rules, so this
// code can never disagree with the table. Read once, then remembered.
let cached = null;
async function allowedValues() {
  if (cached) return cached;
  const found = { statuses: null, categories: null };
  try {
    const { rows } = await query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'incidents'::regclass AND contype = 'c'");
    for (const { def } of rows) {
      const values = [...def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      if (!values.length) continue;
      if (/\bstatus\b/.test(def)) found.statuses = values;
      else if (/\bcategory\b/.test(def)) found.categories = values;
    }
    cached = found;
  } catch (err) {
    return found; // do not remember a failed read
  }
  return cached;
}
const resetCache = () => { cached = null; };

async function options() {
  const a = await allowedValues();
  return { statuses: a.statuses || FALLBACK.statuses, categories: a.categories || FALLBACK.categories };
}

const toNum = (v) => (v === null || v === undefined ? null : Number(v));
const shape = (r) => ({ ...r, latitude: toNum(r.latitude), longitude: toNum(r.longitude) });

const SELECT = `SELECT i.id, i.site_id, s.name AS site_name, i.shift_id, i.reported_by, u.full_name AS reported_by_name,
    i.category, i.description, i.occurred_at, i.latitude, i.longitude, i.status, i.resolution_note, i.created_at, i.updated_at
  FROM incidents i JOIN sites s ON s.id = i.site_id LEFT JOIN users u ON u.id = i.reported_by`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function list(user, q, { perPage, offset }) {
  const issues = [];
  for (const k of ['from', 'to']) if (q[k] && !DAY.test(q[k])) issues.push({ field: k, issue: 'must be a date like 2026-11-16' });
  if (q.site_id && !/^\d+$/.test(q.site_id)) issues.push({ field: 'site_id', issue: 'must be a whole number' });
  if (issues.length) throw validationError(issues);

  const params = [];
  const where = [siteScope(user, params, 's').replace(/^AND /, '') || 'TRUE'];
  if (user.role === 'guard') { params.push(user.id); where.push(`i.reported_by = $${params.length}`); }
  if (q.site_id) { params.push(Number(q.site_id)); where.push(`i.site_id = $${params.length}`); }
  if (q.category) { params.push(q.category); where.push(`i.category = $${params.length}`); }
  const day = "(i.occurred_at AT TIME ZONE 'Africa/Kampala')::date";
  if (q.from) { params.push(q.from); where.push(`${day} >= $${params.length}::date`); }
  if (q.to) { params.push(q.to); where.push(`${day} <= $${params.length}::date`); }
  const base = `FROM incidents i JOIN sites s ON s.id = i.site_id WHERE ${where.join(' AND ')}`;

  const byStatus = {};
  for (const r of (await query(`SELECT i.status, count(*)::int AS n ${base} GROUP BY i.status`, params)).rows) byStatus[r.status] = r.n;

  const listWhere = [...where]; const listParams = [...params];
  if (q.status) { listParams.push(q.status); listWhere.push(`i.status = $${listParams.length}`); }
  const total = (await query(`SELECT count(*)::int AS n FROM incidents i JOIN sites s ON s.id = i.site_id WHERE ${listWhere.join(' AND ')}`, listParams)).rows[0].n;
  listParams.push(perPage, offset);
  const { rows } = await query(`${SELECT} WHERE ${listWhere.join(' AND ')} ORDER BY i.occurred_at DESC, i.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`, listParams);
  return { rows: rows.map(shape), total, by_status: byStatus };
}

async function getOne(user, id) {
  const params = [id];
  const filter = siteScope(user, params, 's');
  let guardOnly = '';
  if (user.role === 'guard') { params.push(user.id); guardOnly = `AND i.reported_by = $${params.length}`; }
  const { rows } = await query(`${SELECT} WHERE i.id = $1 ${filter} ${guardOnly}`, params);
  if (!rows[0]) throw notFound(`Incident ${id} not found`);   // out of scope is also a 404
  return shape(rows[0]);
}

async function create(user, body) {
  const a = await options();
  const allowed = await allowedValues();
  const issues = [];
  const siteId = body.site_id;
  if (!Number.isInteger(siteId)) issues.push({ field: 'site_id', issue: 'is required and must be a whole number' });
  const category = typeof body.category === 'string' ? body.category : '';
  if (!category) issues.push({ field: 'category', issue: 'is required' });
  else if (allowed.categories && !allowed.categories.includes(category)) issues.push({ field: 'category', issue: `must be one of: ${a.categories.join(', ')}` });
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length < 5) issues.push({ field: 'description', issue: 'must be at least 5 characters' });
  if (description.length > 2000) issues.push({ field: 'description', issue: 'must be at most 2000 characters' });
  let occurredAt = new Date();
  if (body.occurred_at !== undefined && body.occurred_at !== null && body.occurred_at !== '') {
    occurredAt = new Date(body.occurred_at);
    if (Number.isNaN(occurredAt.getTime())) issues.push({ field: 'occurred_at', issue: 'must be a date and time' });
    else if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) issues.push({ field: 'occurred_at', issue: 'cannot be in the future' });
  }
  for (const [f, lo, hi] of [['latitude', -90, 90], ['longitude', -180, 180]]) {
    const v = body[f];
    if (v !== undefined && v !== null && (typeof v !== 'number' || v < lo || v > hi)) issues.push({ field: f, issue: `must be a number between ${lo} and ${hi}` });
  }
  if (body.shift_id !== undefined && body.shift_id !== null && !Number.isInteger(body.shift_id)) issues.push({ field: 'shift_id', issue: 'must be a whole number' });
  if (issues.length) throw validationError(issues);

  await assertSiteAccess(user, siteId);   // a guard can only report at their own sites
  let id;
  try {
    id = (await query(
      `INSERT INTO incidents (site_id, shift_id, reported_by, category, description, occurred_at, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open') RETURNING id`,
      [siteId, body.shift_id ?? null, user.id, category, description, occurredAt.toISOString(), body.latitude ?? null, body.longitude ?? null])).rows[0].id;
  } catch (err) {
    if (err.code === '23503') throw validationError([{ field: 'shift_id', issue: 'shift not found' }]);
    if (err.code === '23514') throw validationError([{ field: 'category', issue: 'value is not allowed' }]);
    throw err;
  }
  const incident = await getOne(user, id);
  try {
    const sups = (await query('SELECT user_id FROM site_supervisors WHERE site_id = $1', [siteId])).rows.map((r) => r.user_id);
    const mgrs = (await query("SELECT id FROM users WHERE role = 'ops_manager' AND is_active")).rows.map((r) => r.id);
    const ids = [...sups, ...mgrs];
    if (ids.length) await notify(ids, 'incident_reported', `New incident at ${incident.site_name}: ${category.replace(/_/g, ' ')}.`, '/incidents');
    await writeAudit({ userId: user.id, action: 'incident.create', entityType: 'incident', entityId: id, details: { site_id: siteId, category } });
  } catch (err) { /* a notification problem must never lose the report */ }
  return incident;
}

async function update(user, id, body) {
  const current = await getOne(user, id);
  const a = await options();
  const issues = [];
  const has = (f) => body[f] !== undefined;
  if (!has('status') && !has('resolution_note')) issues.push({ field: 'status', issue: 'send a status or a resolution_note' });
  if (has('status') && !a.statuses.includes(body.status)) issues.push({ field: 'status', issue: `must be one of: ${a.statuses.join(', ')}` });
  let note = current.resolution_note;
  if (has('resolution_note')) {
    if (body.resolution_note !== null && typeof body.resolution_note !== 'string') issues.push({ field: 'resolution_note', issue: 'must be text' });
    else {
      note = body.resolution_note === null ? null : body.resolution_note.trim() || null;
      if (note && note.length > 2000) issues.push({ field: 'resolution_note', issue: 'must be at most 2000 characters' });
    }
  }
  const status = has('status') ? body.status : current.status;
  if (!issues.length && status === 'resolved' && !note) issues.push({ field: 'resolution_note', issue: 'is required to resolve an incident' });
  if (issues.length) throw validationError(issues);

  const input = {};
  if (has('status')) input.status = body.status;
  if (has('resolution_note')) input.resolution_note = note;
  const { sets, params } = buildUpdate(['status', 'resolution_note'], input);
  params.push(id);
  try {
    await query(`UPDATE incidents SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  } catch (err) {
    if (err.code === '23514') throw validationError([{ field: 'status', issue: 'value is not allowed' }]);
    throw err;
  }
  const updated = await getOne(user, id);
  try {
    await writeAudit({ userId: user.id, action: 'incident.update', entityType: 'incident', entityId: id, details: { status_from: current.status, status_to: updated.status } });
    if (updated.status !== current.status && updated.reported_by && updated.reported_by !== user.id) {
      await notify([updated.reported_by], 'incident_updated', `Your incident report at ${updated.site_name} is now ${updated.status.replace(/_/g, ' ')}.`);
    }
  } catch (err) { /* audit and notification problems must not undo the update */ }
  return updated;
}

module.exports = { list, getOne, create, update, options, resetCache };

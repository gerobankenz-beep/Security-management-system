// Clients, sites, checkpoints, routes (Task 4). Controllers live in routes.js.
const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool, query } = require('../../config/db');
const { notFound, conflict, validationError } = require('../../utils/errors');
const { buildUpdate } = require('../../utils/sql');
const { createChecker } = require('../../utils/check');
const { writeAudit } = require('../../utils/audit');
const { siteScope } = require('./access');

const touch = (sets) => [...sets, 'updated_at = now()'];

// ---------------- clients ----------------
async function createClient(actor, input) {
  const { rows } = await query(
    `INSERT INTO clients (name, contact_name, contact_phone, contact_email)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.name, input.contact_name || null, input.contact_phone || null, input.contact_email || null]
  );
  await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'client', entityId: rows[0].id });
  return rows[0];
}

async function listClients({ search, perPage, offset }) {
  const params = [];
  let where = '';
  if (search) { params.push(`%${search}%`); where = `WHERE name ILIKE $1`; }
  const total = (await query(`SELECT count(*) AS n FROM clients ${where}`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(
    `SELECT * FROM clients ${where} ORDER BY name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total };
}

async function updateClient(actor, id, input) {
  const { sets, params } = buildUpdate(['name', 'contact_name', 'contact_phone', 'contact_email', 'is_active'], input);
  if (!sets.length) throw validationError([{ field: 'body', issue: 'send at least one field to change' }]);
  params.push(id);
  const { rows } = await query(`UPDATE clients SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows[0]) throw notFound(`Client ${id} not found`);
  await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'client', entityId: id, details: input });
  return rows[0];
}

// ---------------- sites ----------------
async function createSite(actor, input) {
  const client = await query('SELECT id FROM clients WHERE id = $1', [input.client_id]);
  if (!client.rows[0]) throw validationError([{ field: 'client_id', issue: 'client does not exist' }]);
  let radius = input.geofence_radius_m;
  if (radius === undefined) {
    const s = await query("SELECT value FROM settings WHERE key = 'default_geofence_radius_m'");
    radius = s.rows[0] ? Number(s.rows[0].value) : 150;
  }
  const { rows } = await query(
    `INSERT INTO sites (client_id, name, address, latitude, longitude, geofence_radius_m,
                        guards_required_day, guards_required_night, patrols_per_night)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [input.client_id, input.name, input.address || null, input.latitude, input.longitude, radius,
      input.guards_required_day ?? 1, input.guards_required_night ?? 1, input.patrols_per_night ?? 0]
  );
  await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'site', entityId: rows[0].id });
  return rows[0];
}

async function updateSite(actor, id, input) {
  const { sets, params } = buildUpdate(
    ['name', 'address', 'latitude', 'longitude', 'geofence_radius_m', 'guards_required_day',
      'guards_required_night', 'patrols_per_night', 'is_active'], input);
  if (!sets.length) throw validationError([{ field: 'body', issue: 'send at least one field to change' }]);
  params.push(id);
  const { rows } = await query(`UPDATE sites SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows[0]) throw notFound(`Site ${id} not found`);
  await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'site', entityId: id, details: input });
  return rows[0];
}

async function setSiteSupervisors(actor, siteId, userIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const site = await client.query('SELECT id FROM sites WHERE id = $1', [siteId]);
    if (!site.rows[0]) throw notFound(`Site ${siteId} not found`);
    if (userIds.length) {
      const ok = await client.query("SELECT id FROM users WHERE id = ANY($1) AND role = 'supervisor' AND is_active", [userIds]);
      if (ok.rows.length !== new Set(userIds).size) throw validationError([{ field: 'user_ids', issue: 'every id must be an active supervisor' }]);
    }
    await client.query('DELETE FROM site_supervisors WHERE site_id = $1', [siteId]);
    for (const uid of new Set(userIds)) await client.query('INSERT INTO site_supervisors (site_id, user_id) VALUES ($1, $2)', [siteId, uid]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'site_supervisors', entityId: siteId, details: { user_ids: userIds } });
  return { site_id: siteId, user_ids: [...new Set(userIds)] };
}

async function listSiteSupervisors(siteId) {
  const { rows } = await query(
    `SELECT u.id, u.full_name FROM site_supervisors ss JOIN users u ON u.id = ss.user_id WHERE ss.site_id = $1 ORDER BY u.full_name`, [siteId]);
  return rows;
}

async function listSiteGuards(siteId) {
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.employee_no, u.phone, u.is_active
       FROM site_guards sg JOIN users u ON u.id = sg.guard_id WHERE sg.site_id = $1 ORDER BY u.full_name`, [siteId]);
  return rows;
}

// ---------------- checkpoints ----------------
const newTagCode = (siteId, seq) => `CP-${siteId}-${seq}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

async function createCheckpoint(actor, siteId, input) {
  const site = await query('SELECT id FROM sites WHERE id = $1', [siteId]);
  if (!site.rows[0]) throw notFound(`Site ${siteId} not found`);
  const count = (await query('SELECT count(*) AS n FROM checkpoints WHERE site_id = $1', [siteId])).rows[0].n;
  for (let attempt = 0; attempt < 5; attempt += 1) { // the random part makes a clash very unlikely; retry anyway
    try {
      const { rows } = await query(
        `INSERT INTO checkpoints (site_id, name, tag_code, latitude, longitude) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [siteId, input.name, newTagCode(siteId, count + 1 + attempt), input.latitude, input.longitude]);
      await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'checkpoint', entityId: rows[0].id });
      return rows[0];
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  throw conflict('Could not create a unique tag code, try again');
}

async function listCheckpoints(siteId) {
  const { rows } = await query('SELECT * FROM checkpoints WHERE site_id = $1 ORDER BY id', [siteId]);
  return rows;
}

async function updateCheckpoint(actor, id, input) {
  const { sets, params } = buildUpdate(['name', 'latitude', 'longitude', 'is_active'], input);
  if (!sets.length) throw validationError([{ field: 'body', issue: 'send at least one field to change' }]);
  params.push(id);
  const { rows } = await query(`UPDATE checkpoints SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows[0]) throw notFound(`Checkpoint ${id} not found`);
  await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'checkpoint', entityId: id, details: input });
  return rows[0];
}

// Data for a printable A4 sheet: each checkpoint with a QR image (PNG as a data URL).
async function tagSheet(siteId) {
  const site = (await query('SELECT id, name FROM sites WHERE id = $1', [siteId])).rows[0];
  if (!site) throw notFound(`Site ${siteId} not found`);
  const checkpoints = (await query('SELECT id, name, tag_code FROM checkpoints WHERE site_id = $1 AND is_active ORDER BY id', [siteId])).rows;
  const items = await Promise.all(checkpoints.map(async (c) => ({
    ...c, qr_data_url: await QRCode.toDataURL(c.tag_code, { margin: 2, width: 240 }),
  })));
  return { site, checkpoints: items };
}

// ---------------- routes ----------------
async function loadRoute(client, routeId) {
  const r = (await client.query('SELECT * FROM routes WHERE id = $1', [routeId])).rows[0];
  if (!r) return null;
  const cps = (await client.query(
    `SELECT c.id, c.name, c.tag_code, rc.sequence FROM route_checkpoints rc
       JOIN checkpoints c ON c.id = rc.checkpoint_id WHERE rc.route_id = $1 ORDER BY rc.sequence`, [routeId])).rows;
  const times = (await client.query('SELECT start_time FROM route_round_times WHERE route_id = $1 ORDER BY start_time', [routeId])).rows;
  return { ...r, checkpoints: cps, round_start_times: times.map((t) => String(t.start_time).slice(0, 5)) };
}

async function assertCheckpointsBelong(client, siteId, ids) {
  if (new Set(ids).size !== ids.length) throw validationError([{ field: 'checkpoint_sequence', issue: 'a checkpoint appears twice' }]);
  const ok = await client.query('SELECT id FROM checkpoints WHERE site_id = $1 AND id = ANY($2) AND is_active', [siteId, ids]);
  if (ok.rows.length !== ids.length) throw validationError([{ field: 'checkpoint_sequence', issue: 'every checkpoint must be an active checkpoint of this site' }]);
}

async function replaceRouteParts(client, routeId, siteId, input) {
  if (input.checkpoint_sequence) {
    await assertCheckpointsBelong(client, siteId, input.checkpoint_sequence);
    await client.query('DELETE FROM route_checkpoints WHERE route_id = $1', [routeId]);
    for (let i = 0; i < input.checkpoint_sequence.length; i += 1) {
      await client.query('INSERT INTO route_checkpoints (route_id, checkpoint_id, sequence) VALUES ($1,$2,$3)', [routeId, input.checkpoint_sequence[i], i + 1]);
    }
  }
  if (input.round_start_times) {
    await client.query('DELETE FROM route_round_times WHERE route_id = $1', [routeId]);
    for (const t of new Set(input.round_start_times)) await client.query('INSERT INTO route_round_times (route_id, start_time) VALUES ($1,$2)', [routeId, t]);
  }
}

async function createRoute(actor, siteId, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const site = await client.query('SELECT id FROM sites WHERE id = $1', [siteId]);
    if (!site.rows[0]) throw notFound(`Site ${siteId} not found`);
    const { rows } = await client.query(
      `INSERT INTO routes (site_id, name, max_round_minutes, min_seconds_between_scans) VALUES ($1,$2,$3,$4) RETURNING id`,
      [siteId, input.name, input.max_round_minutes ?? 45, input.min_seconds_between_scans ?? 60]);
    await replaceRouteParts(client, rows[0].id, siteId, input);
    const route = await loadRoute(client, rows[0].id);
    await client.query('COMMIT');
    await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'route', entityId: route.id });
    return route;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function listRoutes(siteId) {
  const ids = (await query('SELECT id FROM routes WHERE site_id = $1 AND is_active ORDER BY id', [siteId])).rows;
  const client = await pool.connect();
  try { return await Promise.all(ids.map((r) => loadRoute(client, r.id))); } finally { client.release(); }
}

async function updateRoute(actor, id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = (await client.query('SELECT * FROM routes WHERE id = $1', [id])).rows[0];
    if (!existing) throw notFound(`Route ${id} not found`);
    const { sets, params } = buildUpdate(['name', 'max_round_minutes', 'min_seconds_between_scans', 'is_active'], input);
    if (sets.length) { params.push(id); await client.query(`UPDATE routes SET ${sets.join(', ')} WHERE id = $${params.length}`, params); }
    await replaceRouteParts(client, id, existing.site_id, input);
    const route = await loadRoute(client, id);
    await client.query('COMMIT');
    await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'route', entityId: id, details: input });
    return route;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

function validateSiteInput(input, { creating }) {
  const c = createChecker();
  c.range('latitude', input.latitude, -90, 90);
  c.range('longitude', input.longitude, -180, 180);
  if (input.geofence_radius_m !== undefined && !(input.geofence_radius_m > 0)) c.add('geofence_radius_m', 'must be above 0');
  ['guards_required_day', 'guards_required_night', 'patrols_per_night'].forEach((f) => {
    if (input[f] !== undefined && !(Number.isInteger(input[f]) && input[f] >= 0)) c.add(f, 'must be 0 or more');
  });
  c.done();
  return creating;
}

module.exports = {
  createClient, listClients, updateClient, createSite, updateSite, setSiteSupervisors, listSiteSupervisors, listSiteGuards,
  createCheckpoint, listCheckpoints, updateCheckpoint, tagSheet, createRoute, listRoutes, updateRoute,
  validateSiteInput, touch, siteScope,
};

// Guards = users with role 'guard' + an employee number + a pay profile + eligible sites.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, query } = require('../../config/db');
const { notFound, validationError } = require('../../utils/errors');
const { writeAudit } = require('../../utils/audit');

const tempPassword = () => crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, 'x').slice(0, 10) + '9a';

// The guard as the API returns it (never includes password_hash)
const GUARD_SELECT = `
  SELECT u.id, u.full_name, u.email, u.phone, u.employee_no, u.is_active, u.created_at,
         COALESCE((SELECT array_agg(sg.site_id ORDER BY sg.site_id) FROM site_guards sg WHERE sg.guard_id = u.id), '{}') AS site_ids,
         (SELECT row_to_json(p) FROM (
            SELECT hourly_rate_ugx, night_allowance_ugx, overtime_multiplier, effective_from
              FROM pay_profiles WHERE guard_id = u.id AND effective_from <= CURRENT_DATE
              ORDER BY effective_from DESC LIMIT 1) p) AS pay_profile
    FROM users u`;

async function getGuard(id) {
  const { rows } = await query(`${GUARD_SELECT} WHERE u.id = $1 AND u.role = 'guard'`, [id]);
  if (!rows[0]) throw notFound(`Guard ${id} not found`);
  return rows[0];
}

async function setSites(client, guardId, siteIds) {
  const unique = [...new Set(siteIds)];
  if (unique.length) {
    const ok = await client.query('SELECT id FROM sites WHERE id = ANY($1) AND is_active', [unique]);
    if (ok.rows.length !== unique.length) throw validationError([{ field: 'site_ids', issue: 'every id must be an active site' }]);
  }
  await client.query('DELETE FROM site_guards WHERE guard_id = $1', [guardId]);
  for (const s of unique) await client.query('INSERT INTO site_guards (site_id, guard_id) VALUES ($1, $2)', [s, guardId]);
}

async function createGuard(actor, input) {
  const password = input.password || tempPassword();
  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, employee_no)
       VALUES ($1, $2, $3, $4, 'guard', $5) RETURNING id`,
      [input.full_name, input.email.toLowerCase(), input.phone || null, hash, input.employee_no || null]);
    const guardId = u.rows[0].id;
    await client.query(
      `INSERT INTO pay_profiles (guard_id, hourly_rate_ugx, night_allowance_ugx, overtime_multiplier, effective_from)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))`,
      [guardId, input.hourly_rate_ugx, input.night_allowance_ugx ?? 0, input.overtime_multiplier ?? null, input.effective_from || null]);
    if (input.site_ids) await setSites(client, guardId, input.site_ids);
    await client.query('COMMIT');
    await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'guard', entityId: guardId });
    const guard = await getGuard(guardId);
    return { ...guard, temporary_password: input.password ? undefined : password }; // shown once, never stored in plain text
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function listGuards(actor, { search, status, siteId, perPage, offset }) {
  const params = [];
  const where = ["u.role = 'guard'"];
  if (search) { params.push(`%${search}%`); where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.employee_no ILIKE $${params.length})`); }
  if (status === 'active') where.push('u.is_active');
  if (status === 'inactive') where.push('NOT u.is_active');
  if (siteId) { params.push(siteId); where.push(`u.id IN (SELECT guard_id FROM site_guards WHERE site_id = $${params.length})`); }
  if (actor.role === 'supervisor') { // supervisors only see guards eligible for their own sites
    params.push(actor.id);
    where.push(`u.id IN (SELECT sg.guard_id FROM site_guards sg JOIN site_supervisors ss ON ss.site_id = sg.site_id WHERE ss.user_id = $${params.length})`);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = (await query(`SELECT count(*) AS n FROM users u ${clause}`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(`${GUARD_SELECT} ${clause} ORDER BY u.full_name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total };
}

async function updateGuard(actor, id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'guard'", [id]);
    if (!exists.rows[0]) throw notFound(`Guard ${id} not found`);
    const sets = []; const params = [];
    for (const f of ['full_name', 'phone', 'employee_no']) if (input[f] !== undefined) { params.push(input[f]); sets.push(`${f} = $${params.length}`); }
    if (sets.length) { sets.push('updated_at = now()'); params.push(id); await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params); }
    const payFields = ['hourly_rate_ugx', 'night_allowance_ugx', 'overtime_multiplier'];
    if (payFields.some((f) => input[f] !== undefined) || input.effective_from) {
      const current = (await client.query(
        'SELECT hourly_rate_ugx, night_allowance_ugx, overtime_multiplier FROM pay_profiles WHERE guard_id = $1 ORDER BY effective_from DESC LIMIT 1', [id])).rows[0] || {};
      const v = (f, d) => (input[f] !== undefined ? input[f] : current[f] ?? d);
      await client.query(
        `INSERT INTO pay_profiles (guard_id, hourly_rate_ugx, night_allowance_ugx, overtime_multiplier, effective_from)
         VALUES ($1,$2,$3,$4, COALESCE($5::date, CURRENT_DATE))
         ON CONFLICT (guard_id, effective_from) DO UPDATE SET hourly_rate_ugx = EXCLUDED.hourly_rate_ugx,
           night_allowance_ugx = EXCLUDED.night_allowance_ugx, overtime_multiplier = EXCLUDED.overtime_multiplier`,
        [id, v('hourly_rate_ugx', 0), v('night_allowance_ugx', 0), v('overtime_multiplier', null), input.effective_from || null]);
    }
    if (input.site_ids) await setSites(client, id, input.site_ids);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'guard', entityId: id, details: input });
  return getGuard(id);
}

async function setActive(actor, id, active) {
  const { rowCount } = await query("UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2 AND role = 'guard'", [active, id]);
  if (!rowCount) throw notFound(`Guard ${id} not found`);
  await writeAudit({ userId: actor.id, action: active ? 'REACTIVATE' : 'DEACTIVATE', entityType: 'guard', entityId: id });
  return getGuard(id);
}

async function setGuardSites(actor, id, siteIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'guard'", [id]);
    if (!exists.rows[0]) throw notFound(`Guard ${id} not found`);
    await setSites(client, id, siteIds);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'guard_sites', entityId: id, details: { site_ids: siteIds } });
  return getGuard(id);
}

async function resetPassword(actor, userId) {
  const password = tempPassword();
  const { rowCount } = await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [await bcrypt.hash(password, 10), userId]);
  if (!rowCount) throw notFound(`User ${userId} not found`);
  await writeAudit({ userId: actor.id, action: 'RESET_PASSWORD', entityType: 'user', entityId: userId });
  return { id: userId, temporary_password: password };
}

module.exports = { createGuard, listGuards, getGuard, updateGuard, setActive, setGuardSites, resetPassword };

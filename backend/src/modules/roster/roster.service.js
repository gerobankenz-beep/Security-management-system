// Rosters: weekly shifts per site, rule checks, publishing, and the guard's own shifts.
const { pool, query } = require('../../config/db');
const { AppError, notFound, conflict, validationError } = require('../../utils/errors');
const { writeAudit } = require('../../utils/audit');
const { loadSettings } = require('../../utils/settings');
const { siteScope, assertSiteAccess } = require('../sites/access');
const { addDays, isMonday, isValidDate, shiftTimes, toKampalaDate, kampalaToUtc } = require('../../utils/time');
const { evaluateRoster } = require('./rules');
const { notify } = require('../../utils/notify');

const TEMPLATE_SQL = `SELECT id, name, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time, is_night FROM shift_templates`;

async function getRosterRow(id) {
  const { rows } = await query('SELECT * FROM rosters WHERE id = $1', [id]);
  if (!rows[0]) throw notFound(`Roster ${id} not found`);
  return rows[0];
}

async function createRoster(actor, { site_id, week_start }) {
  if (!isValidDate(week_start) || !isMonday(week_start)) throw validationError([{ field: 'week_start', issue: 'must be a Monday, like 2026-11-02' }]);
  const site = await query('SELECT id FROM sites WHERE id = $1 AND is_active', [site_id]);
  if (!site.rows[0]) throw validationError([{ field: 'site_id', issue: 'site does not exist or is inactive' }]);
  try {
    const { rows } = await query('INSERT INTO rosters (site_id, week_start, created_by) VALUES ($1, $2, $3) RETURNING *', [site_id, week_start, actor.id]);
    await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'roster', entityId: rows[0].id });
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw conflict('This site already has a roster for that week');
    throw e;
  }
}

async function listRosters(user, { siteId, weekStart, perPage, offset }) {
  const params = [];
  let filter = siteScope(user, params);
  if (siteId) { params.push(siteId); filter += ` AND s.id = $${params.length}`; }
  if (weekStart) { params.push(weekStart); filter += ` AND r.week_start = $${params.length}`; }
  const base = `FROM rosters r JOIN sites s ON s.id = r.site_id WHERE true ${filter}`;
  const total = (await query(`SELECT count(*) AS n ${base}`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(
    `SELECT r.id, r.site_id, s.name AS site_name, to_char(r.week_start, 'YYYY-MM-DD') AS week_start, r.status, r.published_at,
            (SELECT count(*) FROM shifts sh WHERE sh.roster_id = r.id) AS shift_count
       ${base} ORDER BY r.week_start DESC, s.name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total };
}

async function getRoster(user, id) {
  const r = await getRosterRow(id);
  await assertSiteAccess(user, r.site_id);
  const shifts = (await query(
    `SELECT sh.id, sh.guard_id, u.full_name AS guard_name, sh.shift_template_id, t.name AS template_name, t.is_night,
            to_char(sh.shift_date, 'YYYY-MM-DD') AS date, sh.start_at, sh.end_at, sh.status
       FROM shifts sh JOIN users u ON u.id = sh.guard_id JOIN shift_templates t ON t.id = sh.shift_template_id
      WHERE sh.roster_id = $1 ORDER BY sh.shift_date, t.start_time, u.full_name`, [id])).rows;
  return { ...r, week_start: weekStartString(r.week_start), shifts };
}
// pg returns DATE columns as JS dates at local midnight; format them without time zone surprises
function weekStartString(d) { return typeof d === 'string' ? d : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

async function addShift(actor, rosterId, { guard_id, shift_template_id, date }) {
  const roster = await getRosterRow(rosterId);
  if (roster.status === 'published') throw conflict('This roster is published. Unpublish it before changing shifts');
  const week = weekStartString(roster.week_start);
  if (!isValidDate(date) || date < week || date > addDays(week, 6)) throw validationError([{ field: 'date', issue: `must be a date between ${week} and ${addDays(week, 6)}` }]);
  const guard = await query("SELECT id FROM users WHERE id = $1 AND role = 'guard'", [guard_id]);
  if (!guard.rows[0]) throw validationError([{ field: 'guard_id', issue: 'guard does not exist' }]);
  const tpl = (await query(`${TEMPLATE_SQL} WHERE id = $1`, [shift_template_id])).rows[0];
  if (!tpl) throw validationError([{ field: 'shift_template_id', issue: 'shift template does not exist' }]);
  const { start_at, end_at } = shiftTimes(date, tpl);
  try {
    const { rows } = await query(
      `INSERT INTO shifts (roster_id, guard_id, shift_template_id, shift_date, start_at, end_at) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, roster_id, guard_id, shift_template_id, to_char(shift_date, 'YYYY-MM-DD') AS date, start_at, end_at, status`,
      [rosterId, guard_id, shift_template_id, date, start_at, end_at]);
    await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'shift', entityId: rows[0].id, details: { roster_id: rosterId, guard_id, date } });
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw conflict('That guard already has this shift on that day');
    throw e;
  }
}

async function removeShift(actor, rosterId, shiftId) {
  const roster = await getRosterRow(rosterId);
  if (roster.status === 'published') throw conflict('This roster is published. Unpublish it before changing shifts');
  const { rowCount } = await query('DELETE FROM shifts WHERE id = $1 AND roster_id = $2', [shiftId, rosterId]);
  if (!rowCount) throw notFound(`Shift ${shiftId} not found in this roster`);
  await writeAudit({ userId: actor.id, action: 'DELETE', entityType: 'shift', entityId: shiftId });
}

async function validateRoster(user, rosterId) {
  const roster = await getRosterRow(rosterId);
  await assertSiteAccess(user, roster.site_id);
  const week = weekStartString(roster.week_start);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const site = (await query('SELECT * FROM sites WHERE id = $1', [roster.site_id])).rows[0];
  const settings = await loadSettings();
  const toShift = (r) => ({ id: r.id, guard_id: r.guard_id, shift_date: r.date, start_at: r.start_at, end_at: r.end_at, is_night: r.is_night });
  const rows = (await query(
    `SELECT sh.id, sh.guard_id, to_char(sh.shift_date, 'YYYY-MM-DD') AS date, sh.start_at, sh.end_at, t.is_night
       FROM shifts sh JOIN shift_templates t ON t.id = sh.shift_template_id WHERE sh.roster_id = $1`, [rosterId])).rows;
  const guardIds = [...new Set(rows.map((r) => r.guard_id))];
  const other = guardIds.length ? (await query(
    `SELECT sh.id, sh.guard_id, to_char(sh.shift_date, 'YYYY-MM-DD') AS date, sh.start_at, sh.end_at, t.is_night
       FROM shifts sh JOIN shift_templates t ON t.id = sh.shift_template_id
      WHERE sh.guard_id = ANY($1) AND sh.roster_id <> $2 AND sh.status <> 'cancelled'
        AND sh.shift_date BETWEEN $3::date - 7 AND $4::date + 7`, [guardIds, rosterId, week, addDays(week, 6)])).rows : [];
  const users = guardIds.length ? (await query('SELECT id, full_name, is_active FROM users WHERE id = ANY($1)', [guardIds])).rows : [];
  const eligible = (await query('SELECT guard_id FROM site_guards WHERE site_id = $1', [roster.site_id])).rows.map((r) => r.guard_id);
  const violations = evaluateRoster({
    shifts: rows.map(toShift), otherShifts: other.map(toShift), site, eligibleGuardIds: eligible,
    inactiveGuardIds: users.filter((u) => !u.is_active).map((u) => u.id), settings, weekDates,
    guardNames: Object.fromEntries(users.map((u) => [u.id, u.full_name])),
  });
  return { roster_id: rosterId, valid: violations.length === 0, violations };
}

// Rounds are shared between the guards on the same shift: round 1 goes to the first guard, round 2 to the next, and so on.
async function createRounds(client, rosterId) {
  const roster = (await client.query('SELECT * FROM rosters WHERE id = $1', [rosterId])).rows[0];
  const shifts = (await client.query('SELECT id, guard_id, shift_template_id, to_char(shift_date, \'YYYY-MM-DD\') AS date, start_at, end_at FROM shifts WHERE roster_id = $1 ORDER BY id', [rosterId])).rows;
  const routes = (await client.query('SELECT * FROM routes WHERE site_id = $1 AND is_active ORDER BY id', [roster.site_id])).rows;
  let created = 0;
  for (const route of routes) {
    const times = (await client.query("SELECT to_char(start_time, 'HH24:MI') AS t FROM route_round_times WHERE route_id = $1 ORDER BY start_time", [route.id])).rows.map((r) => r.t);
    const count = (await client.query('SELECT count(*) AS n FROM route_checkpoints WHERE route_id = $1', [route.id])).rows[0].n;
    if (!count) continue;
    const groups = new Map();
    shifts.forEach((s) => { const k = `${s.date}|${s.shift_template_id}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    for (const group of groups.values()) {
      const { date, start_at, end_at } = group[0];
      // The rounds that fall inside this shift, numbered in the order they happen (a night shift starts at 20:00 = round 1)
      const rounds = times
        .map((t) => [kampalaToUtc(date, t), kampalaToUtc(addDays(date, 1), t)].find((c) => c >= start_at && c < end_at))
        .filter(Boolean)
        .sort((a, b) => a - b);
      for (let pos = 0; pos < rounds.length; pos += 1) {
        const shift = group[pos % group.length];
        await client.query(
          `INSERT INTO patrol_rounds (shift_id, route_id, round_index, window_start, window_end, scans_expected)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (shift_id, route_id, round_index) DO NOTHING`,
          [shift.id, route.id, pos + 1, rounds[pos], new Date(rounds[pos].getTime() + route.max_round_minutes * 60000), count]);
        created += 1;
      }
    }
  }
  return created;
}

async function publish(actor, rosterId) {
  const roster = await getRosterRow(rosterId);
  if (roster.status === 'published') throw conflict('This roster is already published');
  const result = await validateRoster(actor, rosterId);
  if (!result.valid) throw new AppError(409, 'ROSTER_INVALID', 'Fix the rule violations before publishing', result.violations);
  const client = await pool.connect();
  let rounds;
  try {
    await client.query('BEGIN');
    await client.query("UPDATE rosters SET status = 'published', published_at = now() WHERE id = $1", [rosterId]);
    rounds = await createRounds(client, rosterId);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await writeAudit({ userId: actor.id, action: 'PUBLISH', entityType: 'roster', entityId: rosterId, details: { rounds_created: rounds } });
  const guards = (await query('SELECT DISTINCT guard_id FROM shifts WHERE roster_id = $1', [rosterId])).rows.map((r) => r.guard_id);
  await notify(guards, 'roster_published', 'A new roster was published. Open My shifts to see your shifts.');
  return { ...(await getRosterRow(rosterId)), week_start: weekStartString(roster.week_start), rounds_created: rounds };
}

async function unpublish(actor, rosterId) {
  const roster = await getRosterRow(rosterId);
  if (roster.status !== 'published') throw conflict('This roster is not published');
  const used = await query(
    `SELECT (SELECT count(*) FROM attendance a JOIN shifts s ON s.id = a.shift_id WHERE s.roster_id = $1)
          + (SELECT count(*) FROM scans sc JOIN shifts s ON s.id = sc.shift_id WHERE s.roster_id = $1) AS n`, [rosterId]);
  if (used.rows[0].n > 0) throw conflict('Guards have already checked in or scanned on this roster, so it cannot be unpublished');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM patrol_rounds WHERE shift_id IN (SELECT id FROM shifts WHERE roster_id = $1)', [rosterId]);
    await client.query("UPDATE rosters SET status = 'draft', published_at = NULL WHERE id = $1", [rosterId]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await writeAudit({ userId: actor.id, action: 'UNPUBLISH', entityType: 'roster', entityId: rosterId });
  return { ...(await getRosterRow(rosterId)), week_start: weekStartString(roster.week_start) };
}

async function myShifts(user, { from, to }) {
  const start = from || addDays(toKampalaDate(new Date()), -1);
  const end = to || addDays(toKampalaDate(new Date()), 14);
  const { rows } = await query(
    `SELECT sh.id, sh.roster_id, sh.guard_id, r.site_id, s.name AS site_name, to_char(sh.shift_date, 'YYYY-MM-DD') AS date,
            sh.start_at, sh.end_at, sh.status, t.name AS template_name, t.is_night
       FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published'
       JOIN sites s ON s.id = r.site_id JOIN shift_templates t ON t.id = sh.shift_template_id
      WHERE sh.guard_id = $1 AND sh.shift_date BETWEEN $2 AND $3 AND sh.status <> 'cancelled' ORDER BY sh.start_at`, [user.id, start, end]);
  return rows;
}

module.exports = { createRoster, listRosters, getRoster, addShift, removeShift, validateRoster, publish, unpublish, myShifts, createRounds, weekStartString };

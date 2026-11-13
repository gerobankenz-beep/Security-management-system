// Runs the rules for a round, stores new flags once, keeps the round status up to date, and lets staff review flags.
const { query } = require('../../config/db');
const { notFound, validationError } = require('../../utils/errors');
const { writeAudit } = require('../../utils/audit');
const { loadSettings } = require('../../utils/settings');
const { notify } = require('../../utils/notify');
const { siteScope, assertSiteAccess } = require('../sites/access');
const { evaluateRound: runRules, roundStatus } = require('./rules');

async function refreshRoundStatus(roundId, now = new Date()) {
  const round = (await query('SELECT * FROM patrol_rounds WHERE id = $1', [roundId])).rows[0];
  if (!round) return null;
  const counts = (await query(
    `SELECT count(DISTINCT checkpoint_id) FILTER (WHERE validation_status = 'accepted') AS distinct_scanned,
            count(*) FILTER (WHERE validation_status = 'accepted') AS total FROM scans WHERE round_id = $1`, [roundId])).rows[0];
  const active = (await query("SELECT count(*) AS n FROM flags WHERE round_id = $1 AND status IN ('open', 'confirmed')", [roundId])).rows[0].n;
  const status = roundStatus({ round, distinctScanned: counts.distinct_scanned, expected: round.scans_expected, activeFlags: active, totalScans: counts.total, now });
  if (status !== round.status) await query('UPDATE patrol_rounds SET status = $2 WHERE id = $1', [roundId, status]);
  return status;
}

// Returns the flags that were created by this run (none if everything was already known).
async function evaluateRound(roundId, now = new Date()) {
  const round = (await query(
    `SELECT pr.*, sh.guard_id, u.full_name AS guard_name, r.site_id, s.name AS site_name, rt.min_seconds_between_scans
       FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN users u ON u.id = sh.guard_id JOIN rosters r ON r.id = sh.roster_id
       JOIN sites s ON s.id = r.site_id JOIN routes rt ON rt.id = pr.route_id WHERE pr.id = $1`, [roundId])).rows[0];
  if (!round) throw notFound(`Round ${roundId} not found`);
  const checkpoints = (await query(
    `SELECT c.id, c.name, c.latitude, c.longitude FROM route_checkpoints rc JOIN checkpoints c ON c.id = rc.checkpoint_id WHERE rc.route_id = $1 ORDER BY rc.sequence`, [round.route_id])).rows;
  const scans = (await query(
    `SELECT id, checkpoint_id, scanned_at, received_at, latitude, longitude FROM scans WHERE round_id = $1 AND validation_status = 'accepted'`, [roundId])).rows;
  const settings = await loadSettings();
  const found = runRules({ round, route: { min_seconds_between_scans: round.min_seconds_between_scans, checkpoints }, scans, settings, now });

  const created = [];
  for (const f of found) {
    const { rows } = await query(
      `INSERT INTO flags (round_id, shift_id, guard_id, site_id, rule, severity, details, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (round_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id`,
      [roundId, round.shift_id, round.guard_id, round.site_id, f.rule, f.severity, JSON.stringify({ ...f.details, message: f.message }), f.dedupe_key]);
    if (rows[0]) created.push({ id: rows[0].id, ...f });
  }
  const highs = created.filter((f) => f.severity === 'high');
  if (highs.length) {
    const sups = (await query('SELECT user_id FROM site_supervisors WHERE site_id = $1', [round.site_id])).rows.map((r) => r.user_id);
    if (sups.length) await notify(sups, 'flag_created', `${highs.length} high-severity flag${highs.length === 1 ? '' : 's'} at ${round.site_name} (${round.guard_name}): ${highs[0].message}`);
  }
  await refreshRoundStatus(roundId, now);
  return created;
}

// Called every minute: rounds whose window has ended need their final check (missed checkpoints, final status).
async function evaluateEndedRounds(now = new Date()) {
  const { rows } = await query(
    `SELECT id FROM patrol_rounds WHERE window_end < $1 AND window_end > $2 AND status IN ('pending', 'in_progress', 'flagged')`,
    [now, new Date(now.getTime() - 3 * 24 * 3600 * 1000)]);
  for (const r of rows) await evaluateRound(r.id, now);
  return rows.length;
}

const FLAG_SELECT = `
  SELECT f.id, f.rule, f.severity, f.status, f.round_id, f.shift_id, f.guard_id, u.full_name AS guard_name, f.site_id, s.name AS site_name,
         f.details, f.note, f.created_at, f.reviewed_at, f.reviewed_by
    FROM flags f JOIN users u ON u.id = f.guard_id JOIN sites s ON s.id = f.site_id WHERE true`;

async function listFlags(user, { siteId, status, rule, roundId, guardId, from, to, perPage, offset }) {
  const params = [];
  let filter = siteScope(user, params, 's');
  const add = (sql, v) => { params.push(v); filter += ` AND ${sql.replace('?', `$${params.length}`)}`; };
  if (siteId) add('f.site_id = ?', siteId);
  if (status) add('f.status = ?', status);
  if (rule) add('f.rule = ?', rule);
  if (roundId) add('f.round_id = ?', roundId);
  if (guardId) add('f.guard_id = ?', guardId);
  if (from) add('f.created_at >= ?', from);
  if (to) add('f.created_at <= ?', to);
  const total = (await query(`SELECT count(*) AS n FROM (${FLAG_SELECT} ${filter}) x`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(`${FLAG_SELECT} ${filter} ORDER BY f.created_at DESC, f.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total };
}

async function getFlag(user, id) {
  const flag = (await query(`${FLAG_SELECT} AND f.id = $1`, [id])).rows[0];
  if (!flag) throw notFound(`Flag ${id} not found`);
  await assertSiteAccess(user, flag.site_id);
  const round = (await query('SELECT id, round_index, window_start, window_end, status, scans_expected FROM patrol_rounds WHERE id = $1', [flag.round_id])).rows[0];
  const scans = (await query(
    `SELECT sc.id, sc.tag_code, c.name AS checkpoint_name, sc.scanned_at, sc.received_at, sc.latitude, sc.longitude, sc.validation_status
       FROM scans sc LEFT JOIN checkpoints c ON c.id = sc.checkpoint_id WHERE sc.round_id = $1 ORDER BY sc.scanned_at`, [flag.round_id])).rows;
  return { ...flag, round, scans };
}

async function reviewFlag(user, id, { status, note }) {
  const flag = (await query('SELECT id, site_id, round_id, status FROM flags WHERE id = $1', [id])).rows[0];
  if (!flag) throw notFound(`Flag ${id} not found`);
  await assertSiteAccess(user, flag.site_id);
  if (!['confirmed', 'dismissed'].includes(status)) throw validationError([{ field: 'status', issue: 'must be confirmed or dismissed' }]);
  await query('UPDATE flags SET status = $2, note = COALESCE($3, note), reviewed_by = $4, reviewed_at = now() WHERE id = $1', [id, status, note || null, user.id]);
  await writeAudit({ userId: user.id, action: status === 'confirmed' ? 'CONFIRM' : 'DISMISS', entityType: 'flag', entityId: id, details: { note } });
  if (flag.round_id) await refreshRoundStatus(flag.round_id);
  return getFlag(user, id);
}

module.exports = { evaluateRound, evaluateEndedRounds, refreshRoundStatus, listFlags, getFlag, reviewFlag };

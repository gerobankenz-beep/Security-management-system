// Scans (safe to resend), the shift's route and rounds.
//
// Rules: every scan has a client_scan_id made on the phone. Sending it again returns "duplicate", never a second row.
// A scan with an unknown tag is STORED as rejected (evidence), not thrown away.
const { query } = require('../../config/db');
const { notFound } = require('../../utils/errors');
const { siteScope, assertSiteAccess } = require('../sites/access');
const { listRoutes } = require('../sites/sites.service');
const anomaly = require('../anomaly/anomaly.service');
const rosterService = require('../roster/roster.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN = 60000;
const ROUND_GRACE_MIN = 5;      // a scan up to 5 minutes before a round starts or after it ends still belongs to it

function scanProblems(s) {
  const issues = [];
  if (!UUID.test(String(s.client_scan_id || ''))) issues.push({ field: 'client_scan_id', issue: 'must be a UUID made on the phone' });
  if (!Number.isInteger(s.shift_id)) issues.push({ field: 'shift_id', issue: 'must be a shift id' });
  if (typeof s.tag_code !== 'string' || !s.tag_code.trim()) issues.push({ field: 'tag_code', issue: 'is required' });
  if (!s.scanned_at || Number.isNaN(new Date(s.scanned_at).getTime())) issues.push({ field: 'scanned_at', issue: 'must be a date and time like 2026-11-08T20:05:00Z' });
  const hasLat = s.latitude !== undefined && s.latitude !== null; const hasLng = s.longitude !== undefined && s.longitude !== null;
  if (hasLat !== hasLng) issues.push({ field: hasLat ? 'longitude' : 'latitude', issue: 'send latitude and longitude together' });
  if (hasLat && (typeof s.latitude !== 'number' || s.latitude < -90 || s.latitude > 90)) issues.push({ field: 'latitude', issue: 'must be between -90 and 90' });
  if (hasLng && (typeof s.longitude !== 'number' || s.longitude < -180 || s.longitude > 180)) issues.push({ field: 'longitude', issue: 'must be between -180 and 180' });
  return issues;
}

// Handles ONE scan and returns { result, roundId }. `result` follows the API contract.
async function processScan(user, s) {
  const id = s.client_scan_id;
  const problems = scanProblems(s);
  if (problems.length) return { result: { client_scan_id: id, status: 'rejected', reason: `INVALID_SCAN: ${problems[0].field} ${problems[0].issue}` } };

  const prior = (await query('SELECT guard_id, round_id, validation_status, reject_reason FROM scans WHERE client_scan_id = $1', [id])).rows[0];
  if (prior) {
    if (prior.guard_id !== user.id) return { result: { client_scan_id: id, status: 'rejected', reason: 'ID_IN_USE' } };
    return { result: { client_scan_id: id, status: 'duplicate', ...(prior.round_id ? { round_id: prior.round_id } : {}) } };
  }

  const shift = (await query(
    `SELECT sh.id, sh.roster_id, sh.start_at, sh.end_at, r.site_id FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published'
      WHERE sh.id = $1 AND sh.guard_id = $2`, [s.shift_id, user.id])).rows[0];
  if (!shift) return { result: { client_scan_id: id, status: 'rejected', reason: 'NOT_YOUR_SHIFT' } };

  const at = new Date(s.scanned_at);
  const store = async (checkpointId, roundId, status, reason) => {
    await query(
      `INSERT INTO scans (client_scan_id, shift_id, guard_id, checkpoint_id, round_id, tag_code, scanned_at, latitude, longitude, accuracy_m, device_id, validation_status, reject_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, shift.id, user.id, checkpointId, roundId, s.tag_code.trim(), at, s.latitude ?? null, s.longitude ?? null,
        s.accuracy_m === undefined || s.accuracy_m === null ? null : Math.round(s.accuracy_m), s.device_id || null, status, reason || null]);
  };
  const reject = async (reason) => { await store(null, null, 'rejected', reason); return { result: { client_scan_id: id, status: 'rejected', reason } }; };

  if (at < new Date(shift.start_at.getTime() - 60 * MIN) || at > new Date(shift.end_at.getTime() + 60 * MIN)) return reject('OUTSIDE_SHIFT');
  const cp = (await query('SELECT id, site_id, is_active FROM checkpoints WHERE tag_code = $1', [s.tag_code.trim()])).rows[0];
  if (!cp) return reject('UNKNOWN_TAG');
  if (cp.site_id !== shift.site_id) return reject('WRONG_SITE');
  if (!cp.is_active) return reject('CHECKPOINT_INACTIVE');

  const findRound = async () => (await query(
    `SELECT pr.id FROM patrol_rounds pr JOIN route_checkpoints rc ON rc.route_id = pr.route_id AND rc.checkpoint_id = $2
      WHERE pr.shift_id = $1 AND $3 >= pr.window_start - make_interval(mins => $4) AND $3 <= pr.window_end + make_interval(mins => $4)
      ORDER BY pr.window_start LIMIT 1`, [shift.id, cp.id, at, ROUND_GRACE_MIN])).rows[0];
  let round = await findRound();
  if (!round) {
    // The roster may have been published before the site's route existed, so it has no rounds yet. Build them, then look again.
    try {
      if (await rosterService.ensureRounds(shift.roster_id, { notBefore: shift.start_at })) round = await findRound();
    } catch (e) { console.error('Could not build rounds for roster', shift.roster_id, e.message); }
  }
  await store(cp.id, round ? round.id : null, 'accepted', null);
  return { result: { client_scan_id: id, status: 'accepted', round_id: round ? round.id : null }, roundId: round ? round.id : null };
}

async function processBatch(user, scans, now = new Date()) {
  const results = []; const rounds = new Set();
  for (const s of scans) {
    const { result, roundId } = await processScan(user, s || {});
    results.push(result);
    if (roundId) rounds.add(roundId);
  }
  for (const roundId of rounds) {
    try { await anomaly.evaluateRound(roundId, now); } catch (e) { console.error('Flag evaluation failed for round', roundId, e); }
  }
  return results;
}

// Scans that were saved without a round (the round did not exist yet) get attached to the round they belong to.
// Returns the ids of the rounds that gained scans, so the caller can re-check them for flags.
async function relinkOrphanScans({ since } = {}) {
  const { rows } = await query(
    `UPDATE scans sc SET round_id = m.round_id
       FROM (SELECT s2.id AS scan_id,
                    (SELECT pr.id FROM patrol_rounds pr JOIN route_checkpoints rc ON rc.route_id = pr.route_id AND rc.checkpoint_id = s2.checkpoint_id
                      WHERE pr.shift_id = s2.shift_id
                        AND s2.scanned_at >= pr.window_start - make_interval(mins => $1) AND s2.scanned_at <= pr.window_end + make_interval(mins => $1)
                      ORDER BY pr.window_start LIMIT 1) AS round_id
               FROM scans s2
              WHERE s2.round_id IS NULL AND s2.validation_status = 'accepted' AND s2.checkpoint_id IS NOT NULL
                AND ($2::timestamptz IS NULL OR s2.scanned_at >= $2)) m
      WHERE sc.id = m.scan_id AND m.round_id IS NOT NULL
      RETURNING sc.round_id`, [ROUND_GRACE_MIN, since || null]);
  return [...new Set(rows.map((r) => r.round_id))];
}

// Who may look at a shift's route and rounds: its guard, or staff with access to the site.
async function accessibleShift(user, shiftId) {
  const shift = (await query(
    `SELECT sh.id, sh.guard_id, r.site_id FROM shifts sh JOIN rosters r ON r.id = sh.roster_id WHERE sh.id = $1`, [shiftId])).rows[0];
  if (!shift) throw notFound(`Shift ${shiftId} not found`);
  if (user.role === 'guard') { if (shift.guard_id !== user.id) throw notFound(`Shift ${shiftId} not found`); } else await assertSiteAccess(user, shift.site_id);
  return shift;
}

async function getShiftRoute(user, shiftId) {
  const shift = await accessibleShift(user, shiftId);
  const routes = await listRoutes(shift.site_id);
  if (!routes.length) throw notFound('This site has no route yet');
  const used = (await query('SELECT route_id FROM patrol_rounds WHERE shift_id = $1 ORDER BY window_start LIMIT 1', [shiftId])).rows[0];
  const route = (used && routes.find((r) => r.id === used.route_id)) || routes[0];
  return { id: route.id, name: route.name, max_round_minutes: route.max_round_minutes, min_seconds_between_scans: route.min_seconds_between_scans,
    round_start_times: route.round_start_times, checkpoints: route.checkpoints };
}

async function getShiftRounds(user, shiftId) {
  await accessibleShift(user, shiftId);
  const { rows } = await query(
    `SELECT pr.id, pr.round_index, pr.route_id, pr.window_start, pr.window_end, pr.status,
            (SELECT count(DISTINCT sc.checkpoint_id) FROM scans sc WHERE sc.round_id = pr.id AND sc.validation_status = 'accepted') AS scans_done,
            pr.scans_expected
       FROM patrol_rounds pr WHERE pr.shift_id = $1 ORDER BY pr.window_start, pr.id`, [shiftId]);
  return rows;
}

async function getRound(user, roundId) {
  const round = (await query(
    `SELECT pr.*, sh.guard_id, u.full_name AS guard_name, r.site_id, s.name AS site_name
       FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN users u ON u.id = sh.guard_id
       JOIN rosters r ON r.id = sh.roster_id JOIN sites s ON s.id = r.site_id WHERE pr.id = $1`, [roundId])).rows[0];
  if (!round) throw notFound(`Round ${roundId} not found`);
  await assertSiteAccess(user, round.site_id);
  const scans = (await query(
    `SELECT sc.id, sc.client_scan_id, sc.tag_code, c.name AS checkpoint_name, sc.scanned_at, sc.received_at, sc.latitude, sc.longitude,
            sc.validation_status, sc.reject_reason FROM scans sc LEFT JOIN checkpoints c ON c.id = sc.checkpoint_id
      WHERE sc.round_id = $1 ORDER BY sc.scanned_at`, [roundId])).rows;
  const flags = (await query('SELECT id, rule, severity, status, details, note FROM flags WHERE round_id = $1 ORDER BY id', [roundId])).rows;
  return { ...round, scans, flags };
}

module.exports = { processScan, processBatch, relinkOrphanScans, getShiftRoute, getShiftRounds, getRound, scanProblems };

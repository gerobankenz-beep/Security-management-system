// Live numbers for the admin dashboard. "Today" is the Kampala calendar day.
const { query } = require('../../config/db');
const { notFound } = require('../../utils/errors');
const { siteScope, assertSiteAccess } = require('../sites/access');
const { toKampalaDate, kampalaToUtc } = require('../../utils/time');

function dayRange(now) {
  const today = toKampalaDate(now);
  const start = kampalaToUtc(today, '00:00');
  return { today, start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

async function siteNumbers(siteIds, now) {
  const { start, end } = dayRange(now);
  if (!siteIds.length) return {};
  const rows = (await query(
    `SELECT s.id AS site_id,
       (SELECT count(*) FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published'
         WHERE r.site_id = s.id AND sh.status <> 'cancelled' AND sh.start_at <= $2 AND sh.end_at > $2) AS guards_required,
       (SELECT count(*) FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published' JOIN attendance a ON a.shift_id = sh.id
         WHERE r.site_id = s.id AND sh.status <> 'cancelled' AND sh.start_at <= $2 AND sh.end_at > $2
           AND a.checked_in_at IS NOT NULL AND a.checked_out_at IS NULL) AS guards_on_duty,
       (SELECT count(*) FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN rosters r ON r.id = sh.roster_id
         WHERE r.site_id = s.id AND pr.window_start >= $3 AND pr.window_start < $4) AS rounds_expected,
       (SELECT count(*) FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN rosters r ON r.id = sh.roster_id
         WHERE r.site_id = s.id AND pr.window_start >= $3 AND pr.window_start < $4 AND pr.status = 'complete') AS rounds_complete,
       (SELECT count(*) FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN rosters r ON r.id = sh.roster_id
         WHERE r.site_id = s.id AND pr.window_start >= $3 AND pr.window_start < $4 AND pr.status = 'missed') AS rounds_missed,
       (SELECT count(*) FROM flags f WHERE f.site_id = s.id AND f.status = 'open') AS open_flags
     FROM sites s WHERE s.id = ANY($1)`, [siteIds, now, start, end])).rows;
  return Object.fromEntries(rows.map((r) => [r.site_id, r]));
}

async function overview(user, now = new Date()) {
  const params = [];
  const filter = siteScope(user, params, 's');
  const sites = (await query(`SELECT s.id, s.name FROM sites s WHERE s.is_active ${filter} ORDER BY s.name`, params)).rows;
  const numbers = await siteNumbers(sites.map((s) => s.id), now);
  const perSite = sites.map((s) => {
    const n = numbers[s.id];
    return { site_id: s.id, name: s.name, guards_on_duty: n.guards_on_duty, guards_required: n.guards_required, rounds_expected: n.rounds_expected,
      rounds_complete: n.rounds_complete, rounds_missed: n.rounds_missed, open_flags: n.open_flags };
  });
  const sum = (f) => perSite.reduce((t, s) => t + Number(s[f]), 0);
  const openIncidents = sites.length
    ? (await query("SELECT count(*) AS n FROM incidents WHERE site_id = ANY($1) AND status <> 'resolved'", [sites.map((s) => s.id)])).rows[0].n : 0;
  return {
    date: toKampalaDate(now), guards_on_duty: sum('guards_on_duty'), guards_required: sum('guards_required'), rounds_expected: sum('rounds_expected'),
    rounds_complete: sum('rounds_complete'), rounds_missed: sum('rounds_missed'), open_flags: sum('open_flags'), open_incidents: openIncidents, sites: perSite,
  };
}

async function siteStatus(user, siteId, now = new Date()) {
  await assertSiteAccess(user, siteId);
  const site = (await query('SELECT id, name FROM sites WHERE id = $1', [siteId])).rows[0];
  if (!site) throw notFound(`Site ${siteId} not found`);
  const n = (await siteNumbers([siteId], now))[siteId];
  const guards = (await query(
    `SELECT sh.guard_id, u.full_name, a.checked_in_at FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published'
       JOIN attendance a ON a.shift_id = sh.id JOIN users u ON u.id = sh.guard_id
      WHERE r.site_id = $1 AND sh.start_at <= $2 AND sh.end_at > $2 AND a.checked_in_at IS NOT NULL AND a.checked_out_at IS NULL ORDER BY a.checked_in_at`, [siteId, now])).rows;
  return { site_id: site.id, name: site.name, guards_on_duty: n.guards_on_duty, guards_required: n.guards_required,
    rounds_expected_today: n.rounds_expected, rounds_complete: n.rounds_complete, rounds_missed: n.rounds_missed, open_flags: n.open_flags,
    current_guards: guards.map((g) => ({ guard_id: g.guard_id, full_name: g.full_name, checked_in_at: g.checked_in_at })) };
}

module.exports = { overview, siteStatus };

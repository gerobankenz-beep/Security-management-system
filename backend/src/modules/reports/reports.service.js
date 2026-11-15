// Weekly field report (staff) and proof of service (client-safe). Spec: Prompt Pack section 6.1.
const { query } = require('../../config/db');
const { validationError } = require('../../utils/errors');
const { loadSettings } = require('../../utils/settings');
const { siteScope } = require('../sites/access');
const { kampalaToUtc, addDays, isValidDate, isMonday, toKampalaDate, weekStartOf } = require('../../utils/time');

const MIN = 60000;
const pct = (done, total) => (total ? Math.round((done / total) * 1000) / 10 : null); // one decimal, null = dash

function weekOf(raw) {
  const ws = raw || weekStartOf(toKampalaDate(new Date()));
  if (!isValidDate(ws) || !isMonday(ws)) throw validationError([{ field: 'week_start', issue: 'must be a Monday like 2026-11-09' }]);
  return { ws, we: addDays(ws, 6), from: kampalaToUtc(ws, '00:00'), to: kampalaToUtc(addDays(ws, 7), '00:00') };
}

// Shared SQL pieces. `s` is the sites table; scope and filters become AND clauses.
function filters(user, q, { guardCol } = {}) {
  const params = [];
  let sql = siteScope(user, params, 's');
  if (q.site_id) { params.push(Number(q.site_id)); sql += ` AND s.id = $${params.length}`; }
  if (q.guard_id && guardCol) { params.push(Number(q.guard_id)); sql += ` AND ${guardCol} = $${params.length}`; }
  return { params, sql };
}

async function weeklyField(user, q) {
  const { ws, we, from, to } = weekOf(q.week_start);
  const settings = await loadSettings();
  const lateAfter = Number(settings.late_checkin_minutes) * MIN;

  const f1 = filters(user, q, { guardCol: 'sh.guard_id' });
  const shifts = (await query(
    `SELECT sh.id, sh.guard_id, u.full_name AS guard_name, u.employee_no, s.id AS site_id, s.name AS site_name, sh.start_at, sh.end_at,
            a.status AS att_status, a.checked_in_at, a.checked_out_at, a.verification_status
       FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published' JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = sh.guard_id LEFT JOIN attendance a ON a.shift_id = sh.id
      WHERE sh.shift_date BETWEEN '${ws}' AND '${we}' AND sh.status <> 'cancelled' ${f1.sql}`, f1.params)).rows;

  const f2 = filters(user, q, { guardCol: 'sh.guard_id' });
  f2.params.push(from, to);
  const rounds = (await query(
    `SELECT pr.id, pr.status, pr.round_index, pr.window_start, pr.window_end, sh.guard_id, s.id AS site_id, s.name AS site_name
       FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN rosters r ON r.id = sh.roster_id JOIN sites s ON s.id = r.site_id
      WHERE pr.window_end >= $${f2.params.length - 1} AND pr.window_end < $${f2.params.length} ${f2.sql}`, f2.params)).rows;

  const missedIds = rounds.filter((r) => r.status === 'missed' || r.status === 'flagged').map((r) => r.id);
  const missedCheckpoints = missedIds.length ? (await query(
    `SELECT pr.id AS round_id, c.name FROM patrol_rounds pr JOIN route_checkpoints rc ON rc.route_id = pr.route_id JOIN checkpoints c ON c.id = rc.checkpoint_id
      WHERE pr.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM scans sc WHERE sc.round_id = pr.id AND sc.checkpoint_id = c.id AND sc.validation_status = 'accepted')
      ORDER BY pr.id, rc.sequence`, [missedIds])).rows : [];

  const f3 = filters(user, q, { guardCol: 'f.guard_id' });
  const flags = (await query(
    `SELECT f.rule, f.status, f.site_id, f.guard_id FROM flags f JOIN sites s ON s.id = f.site_id JOIN shifts sh ON sh.id = f.shift_id
      WHERE sh.shift_date BETWEEN '${ws}' AND '${we}' ${f3.sql}`, f3.params)).rows;

  const f4 = filters(user, q, { guardCol: 'i.reported_by' });
  f4.params.push(from, to);
  const incidents = (await query(
    `SELECT i.id, i.site_id, i.category, i.status, i.occurred_at FROM incidents i JOIN sites s ON s.id = i.site_id
      WHERE i.occurred_at >= $${f4.params.length - 1} AND i.occurred_at < $${f4.params.length} ${f4.sql} ORDER BY i.occurred_at`, f4.params)).rows;

  // ---- fold the rows into per-site and per-guard tables ----
  const sites = new Map(); const guards = new Map();
  const site = (id, name) => { if (!sites.has(id)) sites.set(id, { site_id: id, site_name: name, guards_on_duty: new Set(), shifts_scheduled: 0, shifts_worked: 0, no_shows: 0, late: 0, pending_review: 0,
    rounds_expected: 0, rounds_complete: 0, rounds_missed: 0, rounds_flagged: 0, flags: 0, incidents: 0 }); return sites.get(id); };
  const guard = (sid, sname, g) => { const k = `${sid}:${g.id}`; if (!guards.has(k)) guards.set(k, { site_id: sid, site_name: sname, guard_id: g.id, guard_name: g.name, employee_no: g.emp,
    shifts_scheduled: 0, shifts_worked: 0, no_shows: 0, late: 0, scheduled_minutes: 0, actual_minutes: 0, rounds_expected: 0, rounds_complete: 0, rounds_missed: 0, flags: 0, incidents: 0 }); return guards.get(k); };
  const gInfo = new Map(shifts.map((s) => [s.guard_id, { id: s.guard_id, name: s.guard_name, emp: s.employee_no }]));

  for (const s of shifts) {
    const st = site(s.site_id, s.site_name); const g = guard(s.site_id, s.site_name, gInfo.get(s.guard_id));
    st.shifts_scheduled += 1; g.shifts_scheduled += 1; g.scheduled_minutes += Math.round((new Date(s.end_at) - new Date(s.start_at)) / MIN);
    st.guards_on_duty.add(s.guard_id);
    if (s.checked_in_at && s.checked_out_at) { st.shifts_worked += 1; g.shifts_worked += 1; g.actual_minutes += Math.round((new Date(s.checked_out_at) - new Date(s.checked_in_at)) / MIN); }
    if (s.att_status === 'no_show') { st.no_shows += 1; g.no_shows += 1; }
    if (s.checked_in_at && new Date(s.checked_in_at) - new Date(s.start_at) > lateAfter) { st.late += 1; g.late += 1; }
    if (s.verification_status === 'pending_review') st.pending_review += 1;
  }
  const gName = (id) => gInfo.get(id) || { id, name: null, emp: null };
  for (const r of rounds) {
    const st = site(r.site_id, r.site_name); const g = guard(r.site_id, r.site_name, gName(r.guard_id));
    st.rounds_expected += 1; g.rounds_expected += 1;
    if (r.status === 'complete') { st.rounds_complete += 1; g.rounds_complete += 1; }
    if (r.status === 'missed') { st.rounds_missed += 1; g.rounds_missed += 1; }
    if (r.status === 'flagged') st.rounds_flagged += 1;
  }
  const siteName = (id) => (sites.get(id) || {}).site_name || null;
  for (const f of flags) { site(f.site_id, siteName(f.site_id)).flags += 1; const k = [...guards.values()].find((x) => x.guard_id === f.guard_id && x.site_id === f.site_id); if (k) k.flags += 1; }
  for (const i of incidents) site(i.site_id, siteName(i.site_id)).incidents += 1;

  const bySite = [...sites.values()].map((s) => ({ ...s, guards_on_duty: s.guards_on_duty.size, compliance_percent: pct(s.rounds_complete, s.rounds_expected) })).sort((a, b) => a.site_id - b.site_id);
  const byGuard = [...guards.values()].map((g) => ({ ...g, scheduled_hours: Math.round(g.scheduled_minutes / 6) / 10, actual_hours: Math.round(g.actual_minutes / 6) / 10 })).sort((a, b) => a.site_id - b.site_id || a.guard_id - b.guard_id);
  const sum = (k) => bySite.reduce((t, s) => t + s[k], 0);
  const count = (arr, key) => arr.reduce((o, x) => { o[x[key]] = (o[x[key]] || 0) + 1; return o; }, {});
  const summary = { shifts_scheduled: sum('shifts_scheduled'), shifts_worked: sum('shifts_worked'), no_shows: sum('no_shows'), late_arrivals: sum('late'), pending_review: sum('pending_review'),
    rounds_expected: sum('rounds_expected'), rounds_complete: sum('rounds_complete'), rounds_missed: sum('rounds_missed'), rounds_flagged: sum('rounds_flagged'),
    compliance_percent: pct(sum('rounds_complete'), sum('rounds_expected')) };
  return {
    week_start: ws, week_end: we, data_as_of: new Date().toISOString(), summary, by_site: bySite, by_guard: byGuard,
    flags: { total: flags.length, by_rule: count(flags, 'rule'), by_status: count(flags, 'status') },
    incidents: { total: incidents.length, by_category: count(incidents, 'category'), list: incidents.map((i) => ({ id: i.id, site_id: i.site_id, category: i.category, status: i.status, occurred_at: i.occurred_at })) },
    missed_checkpoints: missedIds.map((id) => ({ round_id: id, site_name: rounds.find((r) => r.id === id).site_name, round_index: rounds.find((r) => r.id === id).round_index,
      checkpoints: missedCheckpoints.filter((m) => m.round_id === id).map((m) => m.name) })),
  };
}

const CSV_COLUMNS = ['week_start', 'site', 'guard', 'employee_no', 'shifts_scheduled', 'shifts_worked', 'no_shows', 'late', 'scheduled_hours', 'actual_hours',
  'rounds_expected', 'rounds_complete', 'rounds_missed', 'flags', 'incidents'];
const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function weeklyFieldCsv(user, q) {
  const r = await weeklyField(user, q);
  const rows = r.by_guard.map((g) => [r.week_start, g.site_name, g.guard_name, g.employee_no, g.shifts_scheduled, g.shifts_worked, g.no_shows, g.late, g.scheduled_hours, g.actual_hours,
    g.rounds_expected, g.rounds_complete, g.rounds_missed, g.flags, g.incidents].map(cell).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

// Client-safe view: rounds and scans only. No pay, no flag notes, no guard names or contact details.
async function proofOfService(user, q) {
  const { ws, we, from, to } = weekOf(q.week_start);
  const f = filters(user, q);
  f.params.push(from, to);
  const rounds = (await query(
    `SELECT pr.id, pr.round_index, pr.status, pr.window_start, pr.window_end, s.id AS site_id, s.name AS site_name
       FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN rosters r ON r.id = sh.roster_id JOIN sites s ON s.id = r.site_id
      WHERE pr.window_end >= $${f.params.length - 1} AND pr.window_end < $${f.params.length} ${f.sql} ORDER BY s.id, pr.window_start`, f.params)).rows;
  const ids = rounds.map((r) => r.id);
  const scans = ids.length ? (await query(
    `SELECT sc.round_id, c.name AS checkpoint_name, sc.scanned_at FROM scans sc JOIN checkpoints c ON c.id = sc.checkpoint_id
      WHERE sc.round_id = ANY($1) AND sc.validation_status = 'accepted' ORDER BY sc.scanned_at`, [ids])).rows : [];
  const bySite = new Map();
  for (const r of rounds) {
    if (!bySite.has(r.site_id)) bySite.set(r.site_id, { site_id: r.site_id, site_name: r.site_name, rounds_expected: 0, rounds_walked: 0, rounds: [] });
    const s = bySite.get(r.site_id);
    s.rounds_expected += 1;
    if (r.status === 'complete') s.rounds_walked += 1;
    s.rounds.push({ round_index: r.round_index, window_start: r.window_start, window_end: r.window_end, walked: r.status === 'complete',
      scans: scans.filter((x) => x.round_id === r.id).map((x) => ({ checkpoint_name: x.checkpoint_name, scanned_at: x.scanned_at })) });
  }
  const sites = [...bySite.values()].map((s) => ({ ...s, walked_percent: pct(s.rounds_walked, s.rounds_expected) }));
  return { week_start: ws, week_end: we, data_as_of: new Date().toISOString(), sites };
}

module.exports = { weeklyField, weeklyFieldCsv, proofOfService, CSV_COLUMNS };

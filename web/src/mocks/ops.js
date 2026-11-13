// Fake backend for update 3 (rosters, attendance, flags, notifications, dashboard).
// Follows docs/api-contract-additions-3.md. State is rebuilt by resetOpsMocks().
import * as data from './data';
import { adminState } from './admin';
import { MockError, invalid, page } from './util';

const STAFF = ['admin', 'ops_manager', 'supervisor'];
const MANAGE = ['admin', 'ops_manager'];
const KAMPALA = 3 * 3600e3;
const dayOf = (ms) => new Date(ms + KAMPALA).toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (date) => { const d = new Date(`${date}T00:00:00Z`); return addDays(date, -((d.getUTCDay() + 6) % 7)); };
const isMonday = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
// A shift in Kampala time as ISO UTC; a template that ends before it starts runs past midnight.
const shiftTimes = (date, t) => {
  const at = (d, hhmm) => new Date(`${d}T${hhmm}:00Z`).getTime() - KAMPALA;
  const start = at(date, t.start_time);
  let end = at(date, t.end_time);
  if (end <= start) end = at(addDays(date, 1), t.end_time);
  return { start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString() };
};

let s;
export const todayKampala = () => dayOf(Date.now());

export function resetOpsMocks() {
  const week = mondayOf(todayKampala());
  s = {
    next: { roster: 10, shift: 1000, flag: 500, notification: 50 },
    rosters: [{ id: 1, site_id: 1, week_start: addDays(week, 7), status: 'draft', published_at: null }],
    shifts: [],
    attendance: [],
    flags: [
      { id: 77, rule: 'TOO_FAST', severity: 'high', status: 'open', round_id: 540, shift_id: 88, guard_id: 4, site_id: 1, note: null, reviewed_at: null,
        details: { message: 'Checkpoints 2 and 3 were scanned 4 seconds apart (minimum 60).', seconds_apart: 4, minimum_seconds: 60 }, created_at: '2026-11-10T17:20:03Z',
        scans: [{ id: 1, tag_code: 'CP-1-2-C3D4', checkpoint_name: 'Back gate', scanned_at: '2026-11-10T17:20:00Z', validation_status: 'accepted' }, { id: 2, tag_code: 'CP-1-3-E5F6', checkpoint_name: 'Generator', scanned_at: '2026-11-10T17:20:04Z', validation_status: 'accepted' }] },
      { id: 78, rule: 'MISSED_CHECKPOINT', severity: 'medium', status: 'open', round_id: 552, shift_id: 91, guard_id: 5, site_id: 1, note: null, reviewed_at: null,
        details: { message: 'Roof access was not scanned before the round ended.', checkpoint: 'Roof access' }, created_at: '2026-11-10T19:50:00Z', scans: [] },
    ],
    notifications: [
      { id: 1, user_id: 2, type: 'flag_created', message: 'High-severity flag: TOO_FAST at Kololo Office Park', link: '/flags', is_read: false, created_at: '2026-11-10T17:21:00Z' },
      { id: 2, user_id: 2, type: 'shift_no_show', message: 'John M. did not check in at Kololo Office Park', link: '/attendance', is_read: false, created_at: '2026-11-10T06:31:00Z' },
      { id: 3, user_id: 3, type: 'attendance_review', message: 'A check-in needs review', link: '/attendance', is_read: false, created_at: '2026-11-10T06:05:00Z' },
    ],
  };
  const t = adminState().templates;
  const mk = (guard_id, template_id, date) => {
    const tpl = t.find((x) => x.id === template_id);
    s.shifts.push({ id: s.next.shift++, roster_id: 1, guard_id, shift_template_id: template_id, date, ...shiftTimes(date, tpl), status: 'scheduled' });
  };
  mk(4, 1, addDays(week, 7)); mk(5, 1, addDays(week, 7));
  // a published roster for this week gives the attendance screen something to show
  s.rosters.push({ id: 2, site_id: 1, week_start: week, status: 'published', published_at: `${week}T05:00:00Z` });
  const today = todayKampala();
  const mk2 = (guard_id, date, extra) => {
    const sh = { id: s.next.shift++, roster_id: 2, guard_id, shift_template_id: 1, date, ...shiftTimes(date, t[0]), status: 'scheduled' };
    s.shifts.push(sh);
    s.attendance.push({ id: sh.id, shift_id: sh.id, guard_id, site_id: 1, date, template_name: 'Day', scheduled_start: sh.start_at, scheduled_end: sh.end_at,
      checked_in_at: sh.start_at, checked_out_at: sh.end_at, status: 'on_time', verification_status: 'verified', distance_from_site_m: 12, overtime_approved: false, late_minutes: 0, ...extra });
  };
  mk2(4, today, {});
  mk2(5, today, { status: 'late', late_minutes: 14, checked_in_at: new Date(Date.parse(shiftTimes(today, t[0]).start_at) + 14 * 60000).toISOString() });
  mk2(6, today, { status: 'no_show', checked_in_at: null, checked_out_at: null, verification_status: 'verified', distance_from_site_m: null });
}

const nameOf = (id) => (data.users.find((u) => u.id === id) || {}).full_name || `Guard ${id}`;
const siteName = (id) => (data.sites.find((x) => x.id === id) || {}).name || `Site ${id}`;
const tplOf = (id) => adminState().templates.find((x) => x.id === id);
const visibleSite = (user, siteId) => user.role !== 'supervisor' || (adminState().supervisors[siteId] || []).includes(user.id);

const findRoster = (user, id) => {
  const r = s.rosters.find((x) => x.id === Number(id));
  if (!r || !visibleSite(user, r.site_id)) throw new MockError(404, 'NOT_FOUND', `Roster ${id} not found`);
  return r;
};
const shiftView = (sh) => { const t = tplOf(sh.shift_template_id); return { id: sh.id, guard_id: sh.guard_id, guard_name: nameOf(sh.guard_id), shift_template_id: sh.shift_template_id,
  template_name: t.name, is_night: t.is_night, date: sh.date, start_at: sh.start_at, end_at: sh.end_at, status: sh.status }; };
const rosterRow = (r) => ({ id: r.id, site_id: r.site_id, site_name: siteName(r.site_id), week_start: r.week_start, status: r.status, published_at: r.published_at,
  shift_count: s.shifts.filter((x) => x.roster_id === r.id).length });

function violations(r) {
  const out = [];
  const settings = adminState().settings;
  const site = data.sites.find((x) => x.id === r.site_id);
  const shifts = s.shifts.filter((x) => x.roster_id === r.id).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const eligible = adminState().guardSites;
  const guard = (id) => data.users.find((u) => u.id === id);
  const byGuard = {};
  shifts.forEach((sh) => { (byGuard[sh.guard_id] = byGuard[sh.guard_id] || []).push(sh); });
  Object.entries(byGuard).forEach(([gid, list]) => {
    const g = Number(gid);
    if (!(eligible[g] || []).includes(r.site_id)) out.push({ rule: 'GUARD_NOT_ELIGIBLE', message: `${nameOf(g)} is not assigned to ${siteName(r.site_id)}`, guard_id: g });
    if (guard(g) && !guard(g).is_active) out.push({ rule: 'GUARD_INACTIVE', message: `${nameOf(g)} is inactive`, guard_id: g });
    for (let i = 1; i < list.length; i++) {
      const gapH = (Date.parse(list[i].start_at) - Date.parse(list[i - 1].end_at)) / 3600e3;
      if (gapH < 0) out.push({ rule: 'DOUBLE_BOOKED', message: `${nameOf(g)} is booked twice at the same time on ${list[i].date}`, shift_id: list[i].id, guard_id: g, date: list[i].date });
      else if (gapH < settings.min_rest_hours) out.push({ rule: 'MIN_REST_HOURS', message: `${nameOf(g)} has only ${gapH} hours of rest before ${list[i].date} (minimum ${settings.min_rest_hours})`, shift_id: list[i].id, guard_id: g, date: list[i].date });
    }
    const days = [...new Set(list.map((x) => x.date))].sort();
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      run = days[i] === addDays(days[i - 1], 1) ? run + 1 : 1;
      if (run === settings.max_consecutive_days + 1) out.push({ rule: 'MAX_CONSECUTIVE_DAYS', message: `${nameOf(g)} would work more than ${settings.max_consecutive_days} days in a row`, guard_id: g, date: days[i] });
    }
  });
  for (let i = 0; i < 7; i++) {
    const date = addDays(r.week_start, i);
    adminState().templates.forEach((t) => {
      const required = t.is_night ? site.guards_required_night : site.guards_required_day;
      const assigned = shifts.filter((x) => x.date === date && x.shift_template_id === t.id).length;
      if (assigned < required) out.push({ rule: 'MIN_GUARDS_PER_SHIFT', message: `${t.name} shift on ${date} has ${assigned} of ${required} guards`, date, kind: t.is_night ? 'night' : 'day', required, assigned });
    });
  }
  return out;
}

// like the real API: id is 0 while no attendance record exists (nobody has checked in or been marked no-show)
const attendanceView = (a) => ({ ...a, id: a.status === 'pending' ? 0 : a.id, guard_name: nameOf(a.guard_id), site_name: siteName(a.site_id) });
const filterAttendance = (user, query, exceptionsOnly) => s.attendance.filter((a) => visibleSite(user, a.site_id))
  .filter((a) => !query?.site_id || a.site_id === Number(query.site_id))
  .filter((a) => !query?.date || a.date === query.date)
  .filter((a) => !query?.guard_id || a.guard_id === Number(query.guard_id))
  .filter((a) => !query?.status || a.status === query.status)
  .filter((a) => !exceptionsOnly || a.status === 'late' || a.status === 'no_show' || a.verification_status === 'pending_review')
  .sort((a, b) => b.date.localeCompare(a.date) || a.guard_id - b.guard_id).map(attendanceView);

const flagView = (f) => ({ id: f.id, rule: f.rule, severity: f.severity, status: f.status, round_id: f.round_id, shift_id: f.shift_id, guard_id: f.guard_id, guard_name: nameOf(f.guard_id),
  site_id: f.site_id, site_name: siteName(f.site_id), details: f.details, note: f.note, created_at: f.created_at, reviewed_at: f.reviewed_at });

function overview(user) {
  const open = (siteId) => s.flags.filter((f) => f.status === 'open' && f.site_id === siteId).length;
  const now = Date.now();
  const sites = data.sites.filter((x) => x.is_active && visibleSite(user, x.id)).map((x) => {
    const running = s.attendance.filter((a) => a.site_id === x.id && Date.parse(a.scheduled_start) <= now && Date.parse(a.scheduled_end) > now);
    return { site_id: x.id, name: x.name, guards_on_duty: running.filter((a) => a.checked_in_at && !a.checked_out_at).length, guards_required: running.length,
      rounds_expected: 0, rounds_complete: 0, rounds_missed: 0, open_flags: open(x.id) };
  });
  const sum = (k) => sites.reduce((n, x) => n + x[k], 0);
  return { date: todayKampala(), guards_on_duty: sum('guards_on_duty'), guards_required: sum('guards_required'), rounds_expected: sum('rounds_expected'), rounds_complete: sum('rounds_complete'),
    rounds_missed: sum('rounds_missed'), open_flags: sum('open_flags'), open_incidents: 0, sites };
}

export const opsRoutes = [
  ['GET', '/rosters', STAFF, ({ user, query }) => page(s.rosters.filter((r) => visibleSite(user, r.site_id)).filter((r) => !query?.site_id || r.site_id === Number(query.site_id))
    .filter((r) => !query?.week_start || r.week_start === query.week_start).sort((a, b) => b.week_start.localeCompare(a.week_start)).map(rosterRow), query)],
  ['POST', '/rosters', MANAGE, ({ body }) => {
    const details = [];
    if (!isMonday(body?.week_start)) details.push({ field: 'week_start', issue: 'must be a Monday, like 2026-11-02' });
    if (!data.sites.find((x) => x.id === Number(body?.site_id) && x.is_active)) details.push({ field: 'site_id', issue: 'site does not exist or is inactive' });
    if (details.length) throw invalid(details);
    if (s.rosters.some((r) => r.site_id === Number(body.site_id) && r.week_start === body.week_start)) throw new MockError(409, 'CONFLICT', 'This site already has a roster for that week');
    const r = { id: s.next.roster++, site_id: Number(body.site_id), week_start: body.week_start, status: 'draft', published_at: null };
    s.rosters.push(r);
    return { status: 201, data: rosterRow(r) };
  }],
  ['GET', '/rosters/:id', STAFF, ({ user, params }) => {
    const r = findRoster(user, params.id);
    return { data: { ...rosterRow(r), shifts: s.shifts.filter((x) => x.roster_id === r.id).sort((a, b) => a.start_at.localeCompare(b.start_at)).map(shiftView) } };
  }],
  ['POST', '/rosters/:id/shifts', MANAGE, ({ user, params, body }) => {
    const r = findRoster(user, params.id);
    if (r.status === 'published') throw new MockError(409, 'CONFLICT', 'This roster is published. Unpublish it before changing shifts');
    const t = tplOf(Number(body?.shift_template_id));
    const details = [];
    if (!data.users.find((u) => u.id === Number(body?.guard_id) && u.role === 'guard')) details.push({ field: 'guard_id', issue: 'guard does not exist' });
    if (!t) details.push({ field: 'shift_template_id', issue: 'shift template does not exist' });
    if (!body?.date || body.date < r.week_start || body.date > addDays(r.week_start, 6)) details.push({ field: 'date', issue: `must be a date between ${r.week_start} and ${addDays(r.week_start, 6)}` });
    if (details.length) throw invalid(details);
    if (s.shifts.some((x) => x.roster_id === r.id && x.guard_id === Number(body.guard_id) && x.shift_template_id === t.id && x.date === body.date)) throw new MockError(409, 'CONFLICT', 'That guard already has this shift');
    const sh = { id: s.next.shift++, roster_id: r.id, guard_id: Number(body.guard_id), shift_template_id: t.id, date: body.date, ...shiftTimes(body.date, t), status: 'scheduled' };
    s.shifts.push(sh);
    return { status: 201, data: shiftView(sh) };
  }],
  ['DELETE', '/rosters/:id/shifts/:shiftId', MANAGE, ({ user, params }) => {
    const r = findRoster(user, params.id);
    if (r.status === 'published') throw new MockError(409, 'CONFLICT', 'This roster is published. Unpublish it before changing shifts');
    const i = s.shifts.findIndex((x) => x.id === Number(params.shiftId) && x.roster_id === r.id);
    if (i < 0) throw new MockError(404, 'NOT_FOUND', 'Shift not found');
    s.shifts.splice(i, 1);
    return null;
  }],
  ['GET', '/rosters/:id/validate', STAFF, ({ user, params }) => { const v = violations(findRoster(user, params.id)); return { data: { valid: v.length === 0, violations: v } }; }],
  ['POST', '/rosters/:id/publish', MANAGE, ({ user, params }) => {
    const r = findRoster(user, params.id);
    const v = violations(r);
    if (v.length) throw new MockError(409, 'ROSTER_INVALID', `The roster breaks ${v.length} rule${v.length > 1 ? 's' : ''}`, v);
    r.status = 'published'; r.published_at = new Date().toISOString();
    s.shifts.filter((x) => x.roster_id === r.id).forEach((sh) => {
      if (!s.attendance.some((a) => a.id === sh.id)) s.attendance.push({ id: sh.id, shift_id: sh.id, guard_id: sh.guard_id, site_id: r.site_id, date: sh.date, template_name: tplOf(sh.shift_template_id).name,
        scheduled_start: sh.start_at, scheduled_end: sh.end_at, checked_in_at: null, checked_out_at: null, status: 'pending', verification_status: 'verified', distance_from_site_m: null, overtime_approved: false, late_minutes: null });
    });
    return { data: { ...rosterRow(r), rounds_created: 0 } };
  }],
  ['POST', '/rosters/:id/unpublish', MANAGE, ({ user, params }) => {
    const r = findRoster(user, params.id);
    const ids = s.shifts.filter((x) => x.roster_id === r.id).map((x) => x.id);
    if (s.attendance.some((a) => ids.includes(a.id) && (a.checked_in_at))) throw new MockError(409, 'CONFLICT', 'Someone has already checked in, so this roster cannot be unpublished');
    r.status = 'draft'; r.published_at = null;
    s.attendance = s.attendance.filter((a) => !ids.includes(a.id));
    return { data: rosterRow(r) };
  }],

  ['GET', '/attendance', STAFF, ({ user, query }) => page(filterAttendance(user, query, false), query)],
  ['GET', '/attendance/exceptions', STAFF, ({ user, query }) => page(filterAttendance(user, query, true), query)],
  ['POST', '/attendance/:id/corrections', STAFF, ({ user, params, body }) => {
    const a = s.attendance.find((x) => x.id === Number(params.id) && visibleSite(user, x.site_id));
    if (!a) throw new MockError(404, 'NOT_FOUND', 'Attendance record not found');
    if (!String(body?.reason || '').trim()) throw invalid([{ field: 'reason', issue: 'is required' }]);
    ['checked_in_at', 'checked_out_at', 'overtime_approved', 'verification_status', 'status'].forEach((k) => { if (body[k] !== undefined && body[k] !== '') a[k] = body[k]; });
    return { data: attendanceView(a) };
  }],

  ['GET', '/flags', STAFF, ({ user, query }) => page(s.flags.filter((f) => visibleSite(user, f.site_id))
    .filter((f) => !query?.status || f.status === query.status).filter((f) => !query?.rule || f.rule === query.rule)
    .filter((f) => !query?.site_id || f.site_id === Number(query.site_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(flagView), query)],
  ['GET', '/flags/:id', STAFF, ({ user, params }) => {
    const f = s.flags.find((x) => x.id === Number(params.id) && visibleSite(user, x.site_id));
    if (!f) throw new MockError(404, 'NOT_FOUND', 'Flag not found');
    return { data: { ...flagView(f), round: { id: f.round_id, round_index: 1, status: 'flagged' }, scans: f.scans } };
  }],
  ['PATCH', '/flags/:id', STAFF, ({ user, params, body }) => {
    const f = s.flags.find((x) => x.id === Number(params.id) && visibleSite(user, x.site_id));
    if (!f) throw new MockError(404, 'NOT_FOUND', 'Flag not found');
    if (!['confirmed', 'dismissed'].includes(body?.status)) throw invalid([{ field: 'status', issue: 'must be confirmed or dismissed' }]);
    f.status = body.status; f.note = body.note || null; f.reviewed_at = new Date().toISOString();
    return { data: flagView(f) };
  }],

  ['GET', '/notifications', [], ({ user, query }) => {
    const mine = s.notifications.filter((n) => n.user_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const rows = query?.unread === 'true' ? mine.filter((n) => !n.is_read) : mine;
    const out = page(rows.map(({ user_id, ...n }) => n), query);
    out.meta.unread = mine.filter((n) => !n.is_read).length;
    return out;
  }],
  ['PATCH', '/notifications/:id', [], ({ user, params, body }) => {
    const n = s.notifications.find((x) => x.id === Number(params.id) && x.user_id === user.id);
    if (!n) throw new MockError(404, 'NOT_FOUND', 'Notification not found');
    n.is_read = body?.is_read !== false;
    const { user_id, ...rest } = n;
    return { data: rest };
  }],

  ['GET', '/dashboard/overview', STAFF, ({ user }) => ({ data: overview(user) })],
];
resetOpsMocks();

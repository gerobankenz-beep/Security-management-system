// Check-in and check-out (safe to resend), the daily attendance list, exceptions and corrections.
//
// Offline rule: an event is NEVER thrown away because of the guard's location or because it arrived late.
// It is stored, and marked pending_review when it needs a supervisor's eyes (outside the geofence, no GPS, phone clock wrong).
const { query } = require('../../config/db');
const { AppError, notFound, conflict, validationError } = require('../../utils/errors');
const { writeAudit } = require('../../utils/audit');
const { loadSettings } = require('../../utils/settings');
const { distanceMetres } = require('../../utils/geo');
const { notify } = require('../../utils/notify');
const { siteScope, assertSiteAccess } = require('../sites/access');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN = 60000;

function parseEventTime(deviceTime) {
  if (deviceTime === undefined || deviceTime === null || deviceTime === '') return new Date();
  const t = new Date(deviceTime);
  if (Number.isNaN(t.getTime())) throw validationError([{ field: 'device_time', issue: 'must be a date and time like 2026-11-08T18:02:00Z' }]);
  return t;
}

function checkEventBody(body) {
  const issues = [];
  if (!UUID.test(String(body.client_event_id || ''))) issues.push({ field: 'client_event_id', issue: 'must be a UUID made on the phone' });
  const hasLat = body.latitude !== undefined && body.latitude !== null; const hasLng = body.longitude !== undefined && body.longitude !== null;
  if (hasLat !== hasLng) issues.push({ field: hasLat ? 'longitude' : 'latitude', issue: 'send latitude and longitude together' });
  if (hasLat && (body.latitude < -90 || body.latitude > 90)) issues.push({ field: 'latitude', issue: 'must be between -90 and 90' });
  if (hasLng && (body.longitude < -180 || body.longitude > 180)) issues.push({ field: 'longitude', issue: 'must be between -180 and 180' });
  if (issues.length) throw validationError(issues);
}

// The guard's own shift with its site. Someone else's shift looks like it does not exist (404).
async function ownShift(user, shiftId) {
  const { rows } = await query(
    `SELECT sh.*, r.status AS roster_status, r.site_id, s.name AS site_name, s.latitude AS site_lat, s.longitude AS site_lng, s.geofence_radius_m
       FROM shifts sh JOIN rosters r ON r.id = sh.roster_id JOIN sites s ON s.id = r.site_id WHERE sh.id = $1 AND sh.guard_id = $2`, [shiftId, user.id]);
  if (!rows[0]) throw notFound(`Shift ${shiftId} not found`);
  if (rows[0].roster_status !== 'published') throw new AppError(409, 'ROSTER_NOT_PUBLISHED', 'This shift is not published yet');
  return rows[0];
}

const view = (a, extra = {}) => ({
  id: a.id, shift_id: a.shift_id, checked_in_at: a.checked_in_at, checked_out_at: a.checked_out_at, status: a.status,
  verification_status: a.verification_status, distance_from_site_m: a.distance_from_site_m, ...extra,
});

async function notifySupervisors(siteId, type, message) {
  const ids = (await query('SELECT user_id FROM site_supervisors WHERE site_id = $1', [siteId])).rows.map((r) => r.user_id);
  if (ids.length) await notify(ids, type, message);
}

async function checkIn(user, body) {
  checkEventBody(body);
  const prior = (await query('SELECT * FROM attendance WHERE check_in_event_id = $1', [body.client_event_id])).rows[0];
  if (prior) {
    const owner = (await query('SELECT guard_id FROM shifts WHERE id = $1', [prior.shift_id])).rows[0];
    if (owner.guard_id !== user.id) throw conflict('That event id is already used');
    return { duplicate: true, status: 200, data: view(prior, { duplicate: true }) };
  }
  const shift = await ownShift(user, body.shift_id);
  const settings = await loadSettings();
  const now = new Date();
  const t = parseEventTime(body.device_time);
  if (t < new Date(shift.start_at.getTime() - 60 * MIN) || t > shift.end_at) {
    throw new AppError(409, 'OUTSIDE_SHIFT_WINDOW', 'This check-in time is outside the shift (check-in opens 60 minutes before the start)');
  }
  const existing = (await query('SELECT * FROM attendance WHERE shift_id = $1', [shift.id])).rows[0];
  if (existing && existing.checked_in_at) throw new AppError(409, 'ALREADY_CHECKED_IN', 'You have already checked in for this shift', [{ field: 'shift_id', issue: 'already checked in' }]);

  const hasGps = typeof body.latitude === 'number' && typeof body.longitude === 'number';
  const distance = hasGps ? Math.round(distanceMetres(body.latitude, body.longitude, Number(shift.site_lat), Number(shift.site_lng))) : null;
  let verification = distance !== null && distance <= shift.geofence_radius_m ? 'verified' : 'pending_review';
  if (t.getTime() > now.getTime() + 10 * MIN) verification = 'pending_review';          // phone clock is ahead
  if (existing && existing.status === 'no_show') verification = 'pending_review';       // arrived after being marked absent
  const lateMinutes = (t - shift.start_at) / MIN;
  const status = lateMinutes > settings.late_checkin_minutes ? 'late' : 'on_time';

  const cols = [shift.id, t, body.latitude ?? null, body.longitude ?? null, distance, status, verification, body.device_id || null, t, body.client_event_id];
  const { rows } = existing
    ? await query(
      `UPDATE attendance SET checked_in_at = $2, check_in_latitude = $3, check_in_longitude = $4, distance_from_site_m = $5, status = $6,
              verification_status = $7, device_id = $8, check_in_device_time = $9, check_in_event_id = $10 WHERE shift_id = $1 RETURNING *`, cols)
    : await query(
      `INSERT INTO attendance (shift_id, checked_in_at, check_in_latitude, check_in_longitude, distance_from_site_m, status, verification_status, device_id, check_in_device_time, check_in_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, cols);
  await query("UPDATE shifts SET status = 'in_progress' WHERE id = $1 AND status = 'scheduled'", [shift.id]);
  if (verification === 'pending_review') {
    await notifySupervisors(shift.site_id, 'attendance_review',
      `${user.full_name} checked in at ${shift.site_name} and needs review (${distance === null ? 'no GPS' : `${distance} m from the site`}).`);
  }
  return { duplicate: false, status: 201, data: view(rows[0], { duplicate: false, late_minutes: Math.max(Math.round(lateMinutes), 0) }) };
}

async function checkOut(user, body) {
  checkEventBody(body);
  const prior = (await query('SELECT * FROM attendance WHERE check_out_event_id = $1', [body.client_event_id])).rows[0];
  if (prior) {
    const owner = (await query('SELECT guard_id FROM shifts WHERE id = $1', [prior.shift_id])).rows[0];
    if (owner.guard_id !== user.id) throw conflict('That event id is already used');
    return { duplicate: true, status: 200, data: view(prior, { duplicate: true }) };
  }
  const shift = await ownShift(user, body.shift_id);
  const att = (await query('SELECT * FROM attendance WHERE shift_id = $1', [shift.id])).rows[0];
  if (!att || !att.checked_in_at) throw new AppError(409, 'NOT_CHECKED_IN', 'Check in before checking out');
  if (att.checked_out_at) throw new AppError(409, 'ALREADY_CHECKED_OUT', 'You have already checked out of this shift');
  const t = parseEventTime(body.device_time);
  if (t < att.checked_in_at) throw new AppError(409, 'BEFORE_CHECK_IN', 'The check-out time is before the check-in time');

  const hasGps = typeof body.latitude === 'number' && typeof body.longitude === 'number';
  const distance = hasGps ? Math.round(distanceMetres(body.latitude, body.longitude, Number(shift.site_lat), Number(shift.site_lng))) : null;
  let verification = att.verification_status;
  if (verification === 'verified' && (distance === null || distance > shift.geofence_radius_m)) verification = 'pending_review';
  if (t.getTime() > Date.now() + 10 * MIN) verification = 'pending_review';
  const { rows } = await query(
    `UPDATE attendance SET checked_out_at = $2, check_out_latitude = $3, check_out_longitude = $4, check_out_device_time = $2,
            check_out_event_id = $5, verification_status = $6 WHERE shift_id = $1 RETURNING *`,
    [shift.id, t, body.latitude ?? null, body.longitude ?? null, body.client_event_id, verification]);
  await query("UPDATE shifts SET status = 'completed' WHERE id = $1", [shift.id]);
  return { duplicate: false, status: 200, data: view(rows[0], { duplicate: false }) };
}

// ---- lists for managers and supervisors ----
const LIST_SELECT = `
  SELECT COALESCE(a.id, 0) AS id, sh.id AS shift_id, sh.guard_id, u.full_name AS guard_name, r.site_id, s.name AS site_name,
         to_char(sh.shift_date, 'YYYY-MM-DD') AS date, t.name AS template_name, sh.start_at AS scheduled_start, sh.end_at AS scheduled_end,
         a.checked_in_at, a.checked_out_at, COALESCE(a.status, 'pending') AS status, COALESCE(a.verification_status, 'verified') AS verification_status,
         a.distance_from_site_m, COALESCE(a.overtime_approved, false) AS overtime_approved,
         CASE WHEN a.checked_in_at IS NULL THEN NULL ELSE GREATEST(round(extract(epoch FROM (a.checked_in_at - sh.start_at)) / 60), 0) END AS late_minutes
    FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published' JOIN sites s ON s.id = r.site_id
    JOIN users u ON u.id = sh.guard_id JOIN shift_templates t ON t.id = sh.shift_template_id
    LEFT JOIN attendance a ON a.shift_id = sh.id WHERE sh.status <> 'cancelled'`;

async function listAttendance(user, { siteId, date, guardId, status, exceptionsOnly, perPage, offset }) {
  const params = [];
  let filter = siteScope(user, params, 's');
  if (siteId) { params.push(siteId); filter += ` AND s.id = $${params.length}`; }
  if (date) { params.push(date); filter += ` AND sh.shift_date = $${params.length}`; }
  if (guardId) { params.push(guardId); filter += ` AND sh.guard_id = $${params.length}`; }
  if (status) { params.push(status); filter += ` AND COALESCE(a.status, 'pending') = $${params.length}`; }
  if (exceptionsOnly) filter += " AND (a.status IN ('late', 'no_show') OR a.verification_status = 'pending_review')";
  const total = (await query(`SELECT count(*) AS n FROM (${LIST_SELECT} ${filter}) x`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(`${LIST_SELECT} ${filter} ORDER BY sh.start_at DESC, u.full_name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total };
}

// ---- corrections: always with a reason, always on the record ----
async function correct(user, attendanceId, input) {
  const att = (await query(
    `SELECT a.*, sh.start_at, r.site_id FROM attendance a JOIN shifts sh ON sh.id = a.shift_id JOIN rosters r ON r.id = sh.roster_id WHERE a.id = $1`, [attendanceId])).rows[0];
  if (!att) throw notFound(`Attendance ${attendanceId} not found`);
  await assertSiteAccess(user, att.site_id);
  const settings = await loadSettings();
  const changes = {};
  const sets = []; const params = [attendanceId];
  const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); changes[col] = { from: att[col] ?? null, to: val }; };
  for (const f of ['checked_in_at', 'checked_out_at']) {
    if (input[f] !== undefined) {
      const d = new Date(input[f]);
      if (Number.isNaN(d.getTime())) throw validationError([{ field: f, issue: 'must be a date and time' }]);
      set(f, d);
    }
  }
  const newIn = input.checked_in_at !== undefined ? new Date(input.checked_in_at) : att.checked_in_at;
  const newOut = input.checked_out_at !== undefined ? new Date(input.checked_out_at) : att.checked_out_at;
  if (newIn && newOut && newOut < newIn) throw validationError([{ field: 'checked_out_at', issue: 'must be after the check-in time' }]);
  if (input.overtime_approved !== undefined) set('overtime_approved', input.overtime_approved === true);
  if (input.verification_status !== undefined) set('verification_status', input.verification_status);
  if (input.status !== undefined) set('status', input.status);
  else if (input.checked_in_at !== undefined) set('status', (new Date(input.checked_in_at) - att.start_at) / MIN > settings.late_checkin_minutes ? 'late' : 'on_time');
  if (!sets.length) throw validationError([{ field: 'body', issue: 'send at least one thing to correct' }]);
  await query(`UPDATE attendance SET ${sets.join(', ')} WHERE id = $1`, params);
  await query('INSERT INTO attendance_corrections (attendance_id, changes, reason, created_by) VALUES ($1,$2,$3,$4)', [attendanceId, JSON.stringify(changes), input.reason.trim(), user.id]);
  await writeAudit({ userId: user.id, action: 'CORRECT', entityType: 'attendance', entityId: attendanceId, details: { reason: input.reason, changes } });
  const { rows } = await query('SELECT * FROM attendance WHERE id = $1', [attendanceId]);
  return view(rows[0], { overtime_approved: rows[0].overtime_approved });
}

module.exports = { checkIn, checkOut, listAttendance, correct };

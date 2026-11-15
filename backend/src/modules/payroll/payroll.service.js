// Monthly payroll runs: load the month's data, call the pure calculator, review, finalise, unlock.
const { query } = require('../../config/db');
const { AppError, conflict, notFound, validationError } = require('../../utils/errors');
const { writeAudit } = require('../../utils/audit');
const { loadSettings } = require('../../utils/settings');
const { weekStartOf, addDays } = require('../../utils/time');
const { calculatePayroll } = require('./calc');

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function checkMonth(month) {
  if (!MONTH.test(String(month || ''))) throw validationError([{ field: 'month', issue: 'must look like 2026-11' }]);
}
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last, gridStart: weekStartOf(first), gridEnd: addDays(last, 6) };
}

// Everything the calculator needs, read from the database.
async function loadInput(month) {
  const { first, last, gridStart, gridEnd } = monthRange(month);
  const settings = await loadSettings();
  const shifts = (await query(
    `SELECT sh.id, sh.guard_id, sh.shift_date, sh.start_at, sh.end_at, sh.status, t.is_night,
            a.checked_in_at, a.checked_out_at, COALESCE(a.overtime_approved, false) AS overtime_approved, a.verification_status
       FROM shifts sh
       JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published'
       JOIN shift_templates t ON t.id = sh.shift_template_id
       LEFT JOIN attendance a ON a.shift_id = sh.id
      WHERE sh.shift_date BETWEEN $1 AND $2`, [gridStart, gridEnd])).rows;
  const ids = [...new Set(shifts.map((s) => s.guard_id))];
  const guards = {};
  const profilesByGuard = {};
  if (ids.length) {
    for (const g of (await query('SELECT id, full_name, employee_no FROM users WHERE id = ANY($1)', [ids])).rows) guards[g.id] = g;
    for (const p of (await query(
      `SELECT guard_id, hourly_rate_ugx, night_allowance_ugx, overtime_multiplier, to_char(effective_from, 'YYYY-MM-DD') AS effective_from
         FROM pay_profiles WHERE guard_id = ANY($1)`, [ids])).rows) (profilesByGuard[p.guard_id] ||= []).push(p);
  }
  const holidays = (await query("SELECT to_char(holiday_date, 'YYYY-MM-DD') AS d FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2", [gridStart, gridEnd])).rows.map((r) => r.d);
  const adjustments = (await query('SELECT id, guard_id, type, amount_ugx, reason, created_at FROM payroll_adjustments WHERE month = $1 ORDER BY id', [month])).rows;
  return { month, settings, holidays, shifts, profilesByGuard, guards, adjustments, first, last };
}

const hours = (min) => Math.round((min / 60) * 100) / 100;
function present(line) {
  return { ...line, scheduled_hours: hours(line.scheduled_minutes), paid_hours: hours(line.paid_minutes), regular_hours: hours(line.regular_minutes),
    overtime_hours: hours(line.overtime_minutes), holiday_hours: hours(line.holiday_minutes) };
}
function totalsOf(lines) {
  const t = { guards: lines.length, gross: 0, net: 0, additions: 0, deductions: 0 };
  for (const l of lines) { t.gross += l.gross; t.net += l.net; t.additions += l.additions; t.deductions += l.deductions; }
  return t;
}

async function getRunRow(month) {
  return (await query('SELECT * FROM payroll_runs WHERE month = $1', [month])).rows[0];
}

async function view(month, row) {
  if (row.status === 'finalised' && row.snapshot) {
    const s = row.snapshot;
    return { month, status: row.status, finalised_at: row.finalised_at, locked: true, lines: s.lines.map(present), totals: s.totals, blockers: [], can_finalise: false, adjustments: s.adjustments || [] };
  }
  const input = await loadInput(month);
  const calc = calculatePayroll(input);
  const lines = calc.lines.map(present);
  return { month, status: row.status, locked: false, lines, totals: totalsOf(lines), blockers: calc.blockers, can_finalise: calc.can_finalise, adjustments: input.adjustments };
}

async function createRun(user, month) {
  checkMonth(month);
  let row = await getRunRow(month);
  let created = false;
  if (!row) {
    row = (await query("INSERT INTO payroll_runs (month) VALUES ($1) RETURNING *", [month])).rows[0];
    created = true;
    await writeAudit({ userId: user.id, action: 'CREATE', entityType: 'payroll_run', details: { month } });
  }
  return { created, data: await view(month, row) };
}

async function getRun(month) {
  checkMonth(month);
  const row = await getRunRow(month);
  if (!row) throw notFound(`No payroll run for ${month}. Create it first.`);
  return view(month, row);
}

async function recalculate(user, month) {
  checkMonth(month);
  const row = await getRunRow(month);
  if (!row) throw notFound(`No payroll run for ${month}. Create it first.`);
  if (row.status === 'finalised') throw new AppError(409, 'RUN_FINALISED', 'This payroll run is finalised. Unlock it first.');
  if (row.status === 'reviewed') await query("UPDATE payroll_runs SET status = 'draft', reviewed_by = NULL, updated_at = now() WHERE month = $1", [month]);
  await writeAudit({ userId: user.id, action: 'RECALCULATE', entityType: 'payroll_run', details: { month } });
  return getRun(month);
}

async function addAdjustment(user, body) {
  checkMonth(body.month);
  if (typeof body.reason !== 'string' || !body.reason.trim()) throw validationError([{ field: 'reason', issue: 'is required' }]);
  const guard = (await query("SELECT id FROM users WHERE id = $1 AND role = 'guard'", [body.guard_id])).rows[0];
  if (!guard) throw notFound(`Guard ${body.guard_id} not found`);
  const row = await getRunRow(body.month);
  if (row && row.status === 'finalised') throw new AppError(409, 'RUN_FINALISED', 'This payroll run is finalised. Unlock it first.');
  const { rows } = await query(
    `INSERT INTO payroll_adjustments (guard_id, month, type, amount_ugx, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, guard_id, month, type, amount_ugx, reason, created_at`, [body.guard_id, body.month, body.type, body.amount_ugx, body.reason.trim(), user.id]);
  if (row && row.status === 'reviewed') await query("UPDATE payroll_runs SET status = 'draft', reviewed_by = NULL, updated_at = now() WHERE month = $1", [body.month]);
  await writeAudit({ userId: user.id, action: 'CREATE', entityType: 'payroll_adjustment', entityId: rows[0].id, details: { month: body.month, type: body.type, amount_ugx: body.amount_ugx } });
  return rows[0];
}

async function listAdjustments(month) {
  checkMonth(month);
  return (await query('SELECT id, guard_id, month, type, amount_ugx, reason, created_at FROM payroll_adjustments WHERE month = $1 ORDER BY id', [month])).rows;
}

async function review(user, month) {
  checkMonth(month);
  const row = await getRunRow(month);
  if (!row) throw notFound(`No payroll run for ${month}. Create it first.`);
  if (row.status !== 'draft') throw new AppError(409, 'WRONG_STATUS', `Only a draft run can be reviewed (this one is ${row.status})`);
  await query("UPDATE payroll_runs SET status = 'reviewed', reviewed_by = $2, updated_at = now() WHERE month = $1", [month, user.id]);
  await writeAudit({ userId: user.id, action: 'REVIEW', entityType: 'payroll_run', details: { month } });
  return getRun(month);
}

async function finalise(user, month) {
  checkMonth(month);
  const row = await getRunRow(month);
  if (!row) throw notFound(`No payroll run for ${month}. Create it first.`);
  if (row.status === 'finalised') throw new AppError(409, 'RUN_FINALISED', 'This payroll run is already finalised');
  if (row.status !== 'reviewed') throw new AppError(409, 'NOT_REVIEWED', 'Mark the run as reviewed before finalising');
  const input = await loadInput(month);
  const calc = calculatePayroll(input);
  if (!calc.can_finalise) throw new AppError(409, 'BLOCKED', 'Fix the blocking shifts first (missing check-outs, records waiting for review, or missing pay profiles)', calc.blockers);
  const lines = calc.lines.map(present);
  const snapshot = { lines, totals: totalsOf(lines), adjustments: input.adjustments, settings: input.settings };
  await query("UPDATE payroll_runs SET status = 'finalised', finalised_by = $2, finalised_at = now(), snapshot = $3::jsonb, updated_at = now() WHERE month = $1", [month, user.id, JSON.stringify(snapshot)]);
  await writeAudit({ userId: user.id, action: 'FINALISE', entityType: 'payroll_run', details: { month, totals: snapshot.totals } });
  return getRun(month);
}

async function unlock(user, month, reason) {
  checkMonth(month);
  if (typeof reason !== 'string' || !reason.trim()) throw validationError([{ field: 'reason', issue: 'is required' }]);
  const row = await getRunRow(month);
  if (!row) throw notFound(`No payroll run for ${month}`);
  if (row.status !== 'finalised') throw new AppError(409, 'WRONG_STATUS', 'Only a finalised run can be unlocked');
  await query("UPDATE payroll_runs SET status = 'draft', reviewed_by = NULL, finalised_by = NULL, finalised_at = NULL, snapshot = NULL, updated_at = now() WHERE month = $1", [month]);
  await writeAudit({ userId: user.id, action: 'UNLOCK', entityType: 'payroll_run', details: { month, reason: reason.trim(), previous_totals: row.snapshot && row.snapshot.totals } });
  return getRun(month);
}

const CSV_COLUMNS = ['employee_no', 'name', 'days_worked', 'scheduled_hours', 'paid_hours', 'regular_hours', 'overtime_hours', 'holiday_hours', 'night_shifts',
  'late_minutes', 'regular_pay', 'overtime_pay', 'holiday_pay', 'night_allowance', 'additions', 'deductions', 'gross', 'net'];
const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function exportCsv(month) {
  const run = await getRun(month);
  const rows = run.lines.map((l) => CSV_COLUMNS.map((c) => cell(l[c])).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

module.exports = { createRun, getRun, recalculate, addAdjustment, listAdjustments, review, finalise, unlock, exportCsv, CSV_COLUMNS };

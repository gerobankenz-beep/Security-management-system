// Pure payroll calculation. No database, no clock: same input always gives the same result.
// Money is whole UGX. Time is stored as whole minutes. Spec: Prompt Pack section 6.2.
const { weekStartOf } = require('../../utils/time');

const MIN = 60000;
const DEFAULT_SETTINGS = {
  overtime_weekly_threshold_hours: 48, overtime_multiplier: 1.5, holiday_multiplier: 2, paid_early_arrival: false,
};
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const minutesBetween = (a, b) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / MIN);

// Work out what one shift earns in minutes, and whether it blocks finalising.
// shift: { id, guard_id, shift_date, start_at, end_at, is_night, status, checked_in_at, checked_out_at,
//          overtime_approved, verification_status, early_approved }
function shiftMinutes(shift, settings) {
  const base = { shift_id: shift.id, shift_date: shift.shift_date, is_night: Boolean(shift.is_night),
    scheduled_minutes: minutesBetween(shift.start_at, shift.end_at), paid_minutes: 0, late_minutes: 0, issue: null };
  if (shift.status === 'cancelled') return { ...base, skip: true };
  if (!shift.checked_in_at || shift.verification_status === 'rejected') return { ...base, skip: true }; // no attendance
  if (shift.verification_status === 'pending_review') return { ...base, issue: 'PENDING_REVIEW' };
  const checkIn = new Date(shift.checked_in_at);
  const start = new Date(shift.start_at);
  base.late_minutes = Math.max(0, minutesBetween(start, checkIn));
  if (!shift.checked_out_at) return { ...base, issue: 'MISSING_CHECKOUT' };
  const early = settings.paid_early_arrival || shift.early_approved === true;
  const paidStart = early || checkIn > start ? checkIn : start;
  const out = new Date(shift.checked_out_at);
  const end = new Date(shift.end_at);
  const paidEnd = shift.overtime_approved === true || out < end ? out : end;
  return { ...base, paid_minutes: Math.max(0, minutesBetween(paidStart, paidEnd)),
    paid_start: paidStart.toISOString(), paid_end: paidEnd.toISOString() };
}

// Pick the pay profile in force on the shift's start date (latest effective_from not after it).
function profileFor(profiles, shiftDate) {
  const ok = (profiles || []).filter((p) => p.effective_from <= shiftDate).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return ok[0] || null;
}

// input: { month: 'YYYY-MM', settings, holidays: ['YYYY-MM-DD'], shifts: [...], profilesByGuard: {id: [profile]},
//          guards: {id: {employee_no, full_name}}, adjustments: [{guard_id, type: 'addition'|'deduction', amount_ugx, reason}] }
// Pass shifts for every week that touches the month; only shifts starting in the month are paid in it.
function calculatePayroll(input) {
  const settings = { ...DEFAULT_SETTINGS, ...(input.settings || {}) };
  const holidays = new Set(input.holidays || []);
  const thresholdMin = Math.round(num(settings.overtime_weekly_threshold_hours) * 60);
  const byGuard = new Map();
  for (const sh of input.shifts) {
    if (!byGuard.has(sh.guard_id)) byGuard.set(sh.guard_id, []);
    byGuard.get(sh.guard_id).push(sh);
  }
  const lines = [];
  const blockers = [];
  for (const [guardId, shifts] of byGuard) {
    const detail = shifts.map((s) => ({ ...shiftMinutes(s, settings), start_at: new Date(s.start_at), holiday: holidays.has(s.shift_date),
      overtime_approved: s.overtime_approved === true })).filter((d) => !d.skip);
    // overtime per Monday to Sunday week, given to the latest shifts of that week
    const weeks = new Map();
    for (const d of detail) {
      if (d.holiday) continue;
      const wk = weekStartOf(d.shift_date);
      if (!weeks.has(wk)) weeks.set(wk, []);
      weeks.get(wk).push(d);
    }
    for (const d of detail) d.overtime_minutes = 0;
    for (const group of weeks.values()) {
      let over = Math.max(0, group.reduce((t, d) => t + d.paid_minutes, 0) - thresholdMin);
      for (const d of [...group].sort((a, b) => b.start_at - a.start_at)) {
        const take = Math.min(over, d.paid_minutes);
        d.overtime_minutes = take;
        over -= take;
        if (over <= 0) break;
      }
    }
    const inMonth = detail.filter((d) => d.shift_date.startsWith(input.month));
    if (!inMonth.length) continue;
    for (const d of inMonth) {
      d.holiday_minutes = d.holiday ? d.paid_minutes : 0;
      d.regular_minutes = d.holiday ? 0 : d.paid_minutes - d.overtime_minutes;
      const p = profileFor(input.profilesByGuard && input.profilesByGuard[guardId], d.shift_date);
      d.rate = p ? num(p.hourly_rate_ugx) : 0;
      d.night_allowance = d.is_night && d.paid_minutes > 0 && p ? num(p.night_allowance_ugx) : 0;
      d.ot_multiplier = p && p.overtime_multiplier ? num(p.overtime_multiplier) : num(settings.overtime_multiplier);
      if (!p) blockers.push({ guard_id: guardId, shift_id: d.shift_id, code: 'NO_PAY_PROFILE' });
      if (d.issue) blockers.push({ guard_id: guardId, shift_id: d.shift_id, code: d.issue });
    }
    // Round each pay line once per guard (not per shift) so the totals match the spec examples.
    const sum = (f) => inMonth.reduce((t, d) => t + f(d), 0);
    const regular_pay = Math.round(sum((d) => d.regular_minutes * d.rate / 60));
    const overtime_pay = Math.round(sum((d) => d.overtime_minutes * d.rate * d.ot_multiplier / 60));
    const holiday_pay = Math.round(sum((d) => d.holiday_minutes * d.rate * num(settings.holiday_multiplier) / 60));
    const night_allowance = sum((d) => d.night_allowance);
    const adj = (input.adjustments || []).filter((a) => a.guard_id === guardId);
    const additions = adj.filter((a) => a.type === 'addition').reduce((t, a) => t + a.amount_ugx, 0);
    const deductions = adj.filter((a) => a.type === 'deduction').reduce((t, a) => t + a.amount_ugx, 0);
    const gross = regular_pay + overtime_pay + holiday_pay + night_allowance + additions;
    const g = (input.guards && input.guards[guardId]) || {};
    lines.push({
      guard_id: guardId, employee_no: g.employee_no || null, name: g.full_name || null,
      days_worked: new Set(inMonth.filter((d) => d.paid_minutes > 0).map((d) => d.shift_date)).size,
      scheduled_minutes: sum((d) => d.scheduled_minutes), paid_minutes: sum((d) => d.paid_minutes),
      regular_minutes: sum((d) => d.regular_minutes), overtime_minutes: sum((d) => d.overtime_minutes), holiday_minutes: sum((d) => d.holiday_minutes),
      night_shifts: inMonth.filter((d) => d.night_allowance > 0).length, late_minutes: sum((d) => d.late_minutes),
      regular_pay, overtime_pay, holiday_pay, night_allowance, additions, deductions, gross, net: gross - deductions,
      shifts: inMonth.map((d) => ({ shift_id: d.shift_id, shift_date: d.shift_date, paid_minutes: d.paid_minutes, regular_minutes: d.regular_minutes,
        overtime_minutes: d.overtime_minutes, holiday_minutes: d.holiday_minutes, late_minutes: d.late_minutes, night_allowance: d.night_allowance, issue: d.issue })),
    });
  }
  lines.sort((a, b) => a.guard_id - b.guard_id);
  return { lines, blockers, can_finalise: blockers.length === 0 };
}

module.exports = { calculatePayroll, shiftMinutes, profileFor, DEFAULT_SETTINGS };

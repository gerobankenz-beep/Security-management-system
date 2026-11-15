// Mock data for the weekly report, proof of service and payroll screens.
import { MockError } from './util';

const asOf = () => new Date().toISOString();
const siteRow = { site_id: 1, site_name: 'Kololo Office Park', guards_on_duty: 3, shifts_scheduled: 14, shifts_worked: 12, no_shows: 1, late: 2, pending_review: 1, rounds_expected: 28, rounds_complete: 24, rounds_missed: 3, rounds_flagged: 1, flags: 4, incidents: 1, compliance_percent: 85.7 };
const weekly = (q) => ({
  week_start: q.week_start, week_end: q.week_start, data_as_of: asOf(),
  summary: { shifts_scheduled: 14, shifts_worked: 12, no_shows: 1, late_arrivals: 2, pending_review: 1, rounds_expected: 28, rounds_complete: 24, rounds_missed: 3, rounds_flagged: 1, compliance_percent: 85.7 },
  by_site: [siteRow],
  by_guard: [{ guard_id: 5, guard_name: 'Amina Nakato', site_name: 'Kololo Office Park', scheduled_hours: 48, actual_hours: 46.5, late: 1, no_shows: 0, rounds_missed: 1, flags: 1 }],
  flags: { total: 4, by_rule: { MISSED_CHECKPOINT: 3, LATE_ROUND: 1 }, by_status: { open: 2, confirmed: 1, dismissed: 1 } },
  incidents: { total: 1, by_category: { suspicious_activity: 1 }, list: [{ id: 1, site_id: 1, category: 'suspicious_activity', status: 'open', occurred_at: asOf() }] },
  missed_checkpoints: [{ round_id: 1, site_name: 'Kololo Office Park', round_index: 1, checkpoints: ['Back gate'] }],
});
const proof = (q) => ({ week_start: q.week_start, week_end: q.week_start, data_as_of: asOf(), sites: [{ site_id: 1, site_name: 'Kololo Office Park', rounds_expected: 2, rounds_walked: 1, walked_percent: 50,
  rounds: [{ round_index: 0, window_start: asOf(), window_end: asOf(), walked: true, scans: [{ checkpoint_name: 'Main gate', scanned_at: asOf() }] }, { round_index: 1, window_start: asOf(), window_end: asOf(), walked: false, scans: [] }] }] });

const shift = (id, d) => ({ shift_id: id, shift_date: d, paid_minutes: 720, regular_minutes: 720, overtime_minutes: 0, holiday_minutes: 0, late_minutes: 0, night_allowance: 3000, issue: null });
let adjustments = [];
let status = 'draft';
let created = false;
const build = (month) => {
  const shifts = [shift(1, `${month}-02`), shift(2, `${month}-03`)];
  const base = { guard_id: 5, employee_no: 'G001', name: 'Amina Nakato', days_worked: 2, paid_hours: 24, regular_hours: 24, overtime_hours: 0, holiday_hours: 0, night_shifts: 2,
    late_minutes: 0, regular_pay: 120000, overtime_pay: 0, holiday_pay: 0, night_allowance: 6000, shifts };
  const additions = adjustments.filter((a) => a.type === 'addition').reduce((t, a) => t + a.amount_ugx, 0);
  const deductions = adjustments.filter((a) => a.type === 'deduction').reduce((t, a) => t + a.amount_ugx, 0);
  const gross = 126000 + additions;
  const line = { ...base, additions, deductions, gross, net: gross - deductions };
  return { month, status, locked: status === 'finalised', lines: [line], totals: { guards: 1, gross, net: line.net, additions, deductions }, blockers: [], can_finalise: true, adjustments };
};
export const resetReportMocks = () => { adjustments = []; status = 'draft'; created = false; };
const need = () => { if (!created) throw new MockError(404, 'NOT_FOUND', 'No payroll run for this month. Create it first.'); };

export const reportRoutes = [
  ['GET', '/reports/weekly-field', ['admin', 'ops_manager', 'supervisor'], ({ query }) => ({ data: weekly(query) })],
  ['GET', '/reports/proof-of-service', ['admin', 'ops_manager', 'client'], ({ query }) => ({ data: proof(query) })],
  ['POST', '/payroll/runs', ['admin'], ({ body }) => { created = true; return { data: build(body.month) }; }],
  ['GET', '/payroll/runs/:month', ['admin'], ({ params }) => { need(); return { data: build(params.month) }; }],
  ['POST', '/payroll/runs/:month/recalculate', ['admin'], ({ params }) => { need(); return { data: build(params.month) }; }],
  ['POST', '/payroll/runs/:month/review', ['admin'], ({ params }) => { need(); status = 'reviewed'; return { data: build(params.month) }; }],
  ['POST', '/payroll/runs/:month/finalise', ['admin'], ({ params }) => { need(); status = 'finalised'; return { data: build(params.month) }; }],
  ['POST', '/payroll/runs/:month/unlock', ['admin'], ({ params }) => { need(); status = 'draft'; return { data: build(params.month) }; }],
  ['POST', '/payroll/adjustments', ['admin'], ({ body }) => {
    if (!body.reason || !String(body.reason).trim()) throw new MockError(400, 'VALIDATION_ERROR', 'Some fields are invalid', [{ field: 'reason', issue: 'is required' }]);
    adjustments = [...adjustments, { id: adjustments.length + 1, ...body }]; if (status === 'reviewed') status = 'draft';
    return { data: adjustments[adjustments.length - 1] };
  }],
];

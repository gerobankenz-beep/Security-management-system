// Unit tests for the pure roster rules (no database).
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateRoster } = require('../src/modules/roster/rules');

const at = (date, hour) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
const shift = (id, guard, date, startH, endH, night = false) => ({
  id, guard_id: guard, shift_date: date, start_at: at(date, startH),
  end_at: endH > startH ? at(date, endH) : new Date(at(date, endH).getTime() + 86400000), is_night: night });
const base = { site: { guards_required_day: 0, guards_required_night: 0 }, eligibleGuardIds: [1, 2], settings: { min_rest_hours: 10, max_consecutive_days: 6 }, weekDates: [] };
const rules = (v) => v.map((x) => x.rule);

test('a clean roster has no violations', () => {
  assert.deepStrictEqual(evaluateRoster({ ...base, shifts: [shift(1, 1, '2026-11-02', 6, 18), shift(2, 1, '2026-11-03', 6, 18)] }), []);
});

test('Night then Day the next morning breaks the rest rule (0 hours rest)', () => {
  const v = evaluateRoster({ ...base, shifts: [shift(1, 1, '2026-11-02', 18, 6, true), shift(2, 1, '2026-11-03', 6, 18)] });
  assert.deepStrictEqual(rules(v), ['MIN_REST_HOURS']);
  assert.strictEqual(v[0].shift_id, 2);
});

test('exactly the minimum rest is allowed', () => {
  const v = evaluateRoster({ ...base, shifts: [shift(1, 1, '2026-11-02', 6, 14), shift(2, 1, '2026-11-03', 0, 8)] });
  assert.deepStrictEqual(v, []);   // 14:00 to 00:00 next day = 10 hours
});

test('overlapping shifts are DOUBLE_BOOKED on both shifts', () => {
  const v = evaluateRoster({ ...base, shifts: [shift(1, 1, '2026-11-02', 6, 18), shift(2, 1, '2026-11-02', 10, 14)] });
  assert.deepStrictEqual(rules(v).filter((r) => r === 'DOUBLE_BOOKED'), ['DOUBLE_BOOKED', 'DOUBLE_BOOKED']);
});

test('double booking against another roster is found, and only roster shifts are reported', () => {
  const other = shift(99, 1, '2026-11-02', 6, 18);
  const v = evaluateRoster({ ...base, shifts: [shift(1, 1, '2026-11-02', 12, 20)], otherShifts: [other] });
  assert.ok(rules(v).includes('DOUBLE_BOOKED'));
  assert.ok(v.every((x) => x.shift_id === 1));
});

test('seven days in a row exceeds a maximum of six, on the seventh day only', () => {
  const days = ['02', '03', '04', '05', '06', '07', '08'].map((d, i) => shift(i + 1, 1, `2026-11-${d}`, 6, 14));
  const v = evaluateRoster({ ...base, shifts: days });
  assert.deepStrictEqual(v.map((x) => [x.rule, x.date]), [['MAX_CONSECUTIVE_DAYS', '2026-11-08']]);
});

test('a day off resets the consecutive-days count', () => {
  const days = ['02', '03', '04', '05', '06', '08', '09'].map((d, i) => shift(i + 1, 1, `2026-11-${d}`, 6, 14));
  assert.deepStrictEqual(evaluateRoster({ ...base, shifts: days }), []);
});

test('guards not assigned to the site, or deactivated, are reported', () => {
  const v = evaluateRoster({ ...base, eligibleGuardIds: [1], inactiveGuardIds: [1], shifts: [shift(1, 1, '2026-11-02', 6, 14), shift(2, 2, '2026-11-02', 6, 14)] });
  assert.deepStrictEqual(rules(v).sort(), ['GUARD_INACTIVE', 'GUARD_NOT_ELIGIBLE']);
});

test('MIN_GUARDS_PER_SHIFT counts distinct guards per day and per night', () => {
  const v = evaluateRoster({ ...base, eligibleGuardIds: [1, 2, 3], site: { guards_required_day: 2, guards_required_night: 1 }, weekDates: ['2026-11-02', '2026-11-03'],
    shifts: [shift(1, 1, '2026-11-02', 6, 18), shift(2, 2, '2026-11-02', 6, 18), shift(3, 3, '2026-11-02', 18, 6, true)] });
  assert.deepStrictEqual(v.map((x) => `${x.date} ${x.kind} ${x.assigned}/${x.required}`), ['2026-11-03 day 0/2', '2026-11-03 night 0/1']);
});


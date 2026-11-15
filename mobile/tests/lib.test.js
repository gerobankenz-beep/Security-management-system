import test from 'node:test';
import assert from 'node:assert/strict';
import { kampalaDate, kampalaDay, kampalaTime } from '../src/lib/time.js';
import { reasonText, shiftActions } from '../src/lib/shifts.js';

test('Kampala time is UTC+3, including across midnight', () => {
  assert.equal(kampalaTime('2026-11-13T05:30:00Z'), '08:30');
  assert.equal(kampalaDate('2026-11-13T22:00:00Z'), '2026-11-14');
  assert.equal(kampalaDay('2026-11-13T05:30:00Z'), 'Fri 13 Nov');
  assert.equal(kampalaTime(null), '-');
});

const shift = { start_at: '2026-11-13T05:00:00Z', end_at: '2026-11-13T13:00:00Z', status: 'scheduled' };
test('check-in opens 60 minutes before the shift and closes at the end', () => {
  assert.equal(shiftActions(shift, {}, new Date('2026-11-13T03:30:00Z')).canCheckIn, false);
  assert.match(shiftActions(shift, {}, new Date('2026-11-13T03:30:00Z')).checkInBlock, /opens at 07:00/);
  assert.equal(shiftActions(shift, {}, new Date('2026-11-13T04:01:00Z')).canCheckIn, true);
  assert.equal(shiftActions(shift, {}, new Date('2026-11-13T13:30:00Z')).canCheckIn, false);
});
test('a check-in saved on the phone counts, so the button cannot be pressed twice', () => {
  const a = shiftActions(shift, { checkIn: { id: 'x' } }, new Date('2026-11-13T06:00:00Z'));
  assert.equal(a.canCheckIn, false); assert.equal(a.canCheckOut, true); assert.equal(a.canScan, true);
});
test('after check-out nothing more can be done', () => {
  const a = shiftActions({ ...shift, status: 'completed' }, {}, new Date('2026-11-13T13:01:00Z'));
  assert.equal(a.canCheckOut, false); assert.equal(a.canScan, false);
});
test('reasons are shown in plain words', () => {
  assert.match(reasonText('UNKNOWN_TAG'), /not a known checkpoint/);
  assert.match(reasonText('INVALID_SCAN: tag_code is required'), /INVALID_SCAN/);
  assert.equal(reasonText(null), '');
});

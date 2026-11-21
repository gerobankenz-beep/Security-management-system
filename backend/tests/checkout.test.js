// Unit test, no database needed: minutes between the scheduled end and the real check-out.
const { test } = require('node:test');
const assert = require('node:assert');
const { checkoutDiff } = require('../src/modules/attendance/checkout');

const end = new Date('2026-11-17T18:00:00Z');
const at = (mins) => new Date(end.getTime() + mins * 60000);

test('checkoutDiff: nobody checked out yet gives nothing', () => {
  assert.deepStrictEqual(checkoutDiff(end, null), { minutes: null, status: null });
});
test('checkoutDiff: leaving within 5 minutes of the end is on time', () => {
  assert.deepStrictEqual(checkoutDiff(end, at(0)), { minutes: 0, status: 'on_time' });
  assert.deepStrictEqual(checkoutDiff(end, at(5)), { minutes: 5, status: 'on_time' });
  assert.deepStrictEqual(checkoutDiff(end, at(-5)), { minutes: -5, status: 'on_time' });
});
test('checkoutDiff: after the end is late, with the minutes', () => {
  assert.deepStrictEqual(checkoutDiff(end, at(23)), { minutes: 23, status: 'late' });
});
test('checkoutDiff: before the end is early, with negative minutes', () => {
  assert.deepStrictEqual(checkoutDiff(end, at(-40)), { minutes: -40, status: 'early' });
});

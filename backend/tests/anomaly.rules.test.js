// Unit tests for the anomaly rules (pure functions, no database).
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateRound, roundStatus } = require('../src/modules/anomaly/rules');

const T0 = new Date('2026-11-09T20:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);
const round = { id: 1, window_start: T0, window_end: at(45 * 60) };
// four checkpoints about 15 m apart along a line, around 0.31, 32.58
const cps = [1, 2, 3, 4].map((i) => ({ id: i, name: `CP${i}`, latitude: 0.31 + i * 0.0001, longitude: 32.58 }));
const route = { min_seconds_between_scans: 60, checkpoints: cps };
const settings = { late_round_minutes: 15, wrong_location_metres: 50 };
let n = 0;
const scan = (cp, sec, extra = {}) => ({ id: ++n, checkpoint_id: cp, scanned_at: at(sec), received_at: at(sec + 5), latitude: cps[cp - 1].latitude, longitude: cps[cp - 1].longitude, ...extra });
const run = (scans, now = at(600)) => evaluateRound({ round, route, scans, settings, now });
const rules = (f) => f.map((x) => x.rule);

test('a good round (in order, spaced out, at the right places) has no flags', () => {
  assert.deepStrictEqual(run([scan(1, 60), scan(2, 140), scan(3, 220), scan(4, 300)]), []);
});

test('MISSED_CHECKPOINT only appears after the round window ends, one flag per missed checkpoint', () => {
  const scans = [scan(1, 60), scan(2, 140)];
  assert.deepStrictEqual(run(scans, at(600)), []);
  const f = run(scans, at(46 * 60));
  assert.deepStrictEqual(f.map((x) => x.dedupe_key), ['MISSED_CHECKPOINT:3', 'MISSED_CHECKPOINT:4']);
  assert.ok(f.every((x) => x.severity === 'high'));
});

test('a round nobody scanned at all misses every checkpoint', () => {
  assert.strictEqual(run([], at(46 * 60)).length, 4);
});

test('TOO_FAST: different checkpoints less than the minimum apart; the same checkpoint twice is ignored', () => {
  const f = run([scan(1, 60), scan(2, 64), scan(3, 68), scan(4, 140)]);
  assert.deepStrictEqual(rules(f), ['TOO_FAST', 'TOO_FAST']);
  assert.strictEqual(f[0].details.seconds_apart, 4);
  assert.deepStrictEqual(run([scan(1, 60), scan(1, 62), scan(2, 140), scan(3, 220), scan(4, 300)]), []);
});

test('OUT_OF_SEQUENCE: reports the expected and the actual order once', () => {
  const f = run([scan(2, 60), scan(1, 140), scan(3, 220), scan(4, 300)]);
  assert.deepStrictEqual(rules(f), ['OUT_OF_SEQUENCE']);
  assert.deepStrictEqual(f[0].details.expected_order, ['CP1', 'CP2', 'CP3', 'CP4']);
  assert.deepStrictEqual(f[0].details.actual_order, ['CP2', 'CP1', 'CP3', 'CP4']);
});

test('skipping a checkpoint is not out of sequence by itself', () => {
  assert.deepStrictEqual(run([scan(1, 60), scan(3, 140), scan(4, 220)]), []);
});

test('WRONG_LOCATION: a scan far from its checkpoint is flagged, a scan without GPS is not judged', () => {
  const far = scan(2, 140, { latitude: 0.312, longitude: 32.58 });                 // about 130 m away
  const f = run([scan(1, 60), far, scan(3, 220, { latitude: null, longitude: null }), scan(4, 300)]);
  assert.deepStrictEqual(rules(f), ['WRONG_LOCATION']);
  assert.ok(f[0].details.distance_m > 100);
  assert.strictEqual(f[0].dedupe_key, `WRONG_LOCATION:${far.id}`);
});

test('LATE_ROUND: first scan more than the allowed minutes after the window starts', () => {
  assert.deepStrictEqual(rules(run([scan(1, 14 * 60)])), []);
  const f = run([scan(1, 20 * 60), scan(2, 21 * 60 + 10)], at(30 * 60));
  assert.deepStrictEqual(rules(f), ['LATE_ROUND']);
  assert.strictEqual(f[0].details.minutes_late, 20);
});

test('CLOCK_MISMATCH: scan time more than 10 minutes ahead of when the server received it', () => {
  const s = scan(1, 60, { received_at: at(60 - 15 * 60) });
  const f = run([s]);
  assert.deepStrictEqual(rules(f), ['CLOCK_MISMATCH']);
  assert.strictEqual(f[0].details.minutes_ahead, 15);
});

test('running the rules twice gives identical dedupe keys (so storing them is idempotent)', () => {
  const scans = [scan(2, 60), scan(1, 64), scan(3, 68)];
  assert.deepStrictEqual(run(scans).map((f) => f.dedupe_key), run(scans).map((f) => f.dedupe_key));
});

test('round status: missed beats flagged beats complete; no scans is pending', () => {
  const base = { round, expected: 4, now: at(600) };
  assert.strictEqual(roundStatus({ ...base, distinctScanned: 0, activeFlags: 0, totalScans: 0 }), 'pending');
  assert.strictEqual(roundStatus({ ...base, distinctScanned: 2, activeFlags: 0, totalScans: 2 }), 'in_progress');
  assert.strictEqual(roundStatus({ ...base, distinctScanned: 4, activeFlags: 0, totalScans: 4 }), 'complete');
  assert.strictEqual(roundStatus({ ...base, distinctScanned: 4, activeFlags: 1, totalScans: 4 }), 'flagged');
  assert.strictEqual(roundStatus({ ...base, now: at(46 * 60), distinctScanned: 3, activeFlags: 1, totalScans: 3 }), 'missed');
  assert.strictEqual(roundStatus({ ...base, now: at(46 * 60), distinctScanned: 4, activeFlags: 0, totalScans: 4 }), 'complete');
});


// The anomaly rules as PURE functions: a round and its scans in, a list of flags out. No database.
//
// round  = { id, window_start: Date, window_end: Date }
// route  = { min_seconds_between_scans, checkpoints: [{ id, name, latitude, longitude }] }   (checkpoints in walking order)
// scans  = accepted scans of this round: { id, checkpoint_id, scanned_at: Date, received_at: Date, latitude, longitude }
// A flag = { rule, severity, dedupe_key, message, details }. The dedupe_key makes re-evaluation safe: the same problem never creates a second flag.
const { distanceMetres } = require('../../utils/geo');

const MIN = 60000;

function evaluateRound({ round, route, scans, settings, now }) {
  const flags = [];
  const sorted = [...scans].sort((a, b) => a.scanned_at - b.scanned_at);
  const cpName = (id) => (route.checkpoints.find((c) => c.id === id) || {}).name || `checkpoint ${id}`;

  // 1. A checkpoint nobody scanned, once the round is over
  if (now > round.window_end) {
    const scanned = new Set(sorted.map((s) => s.checkpoint_id));
    route.checkpoints.filter((c) => !scanned.has(c.id)).forEach((c) => flags.push({
      rule: 'MISSED_CHECKPOINT', severity: 'high', dedupe_key: `MISSED_CHECKPOINT:${c.id}`,
      message: `${c.name} was not scanned during the round`, details: { checkpoint_id: c.id, checkpoint_name: c.name } }));
  }

  // 2. The round started too late
  if (sorted.length) {
    const lateBy = (sorted[0].scanned_at - round.window_start) / MIN;
    if (lateBy > settings.late_round_minutes) {
      flags.push({ rule: 'LATE_ROUND', severity: 'low', dedupe_key: 'LATE_ROUND',
        message: `The first scan was ${Math.round(lateBy)} minutes after the round started`, details: { minutes_late: Math.round(lateBy), allowed_minutes: settings.late_round_minutes } });
    }
  }

  // 3. Two different checkpoints scanned too quickly one after the other (cannot have walked between them)
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]; const b = sorted[i];
    if (a.checkpoint_id === b.checkpoint_id) continue;
    const seconds = (b.scanned_at - a.scanned_at) / 1000;
    if (seconds < route.min_seconds_between_scans) {
      flags.push({ rule: 'TOO_FAST', severity: 'high', dedupe_key: `TOO_FAST:${a.id}:${b.id}`,
        message: `${cpName(a.checkpoint_id)} and ${cpName(b.checkpoint_id)} were scanned only ${Math.round(seconds)} seconds apart (minimum ${route.min_seconds_between_scans})`,
        details: { seconds_apart: Math.round(seconds), minimum_seconds: route.min_seconds_between_scans, scan_ids: [a.id, b.id] } });
    }
  }

  // 4. Checkpoints visited in a different order from the route
  const firstSeen = new Map();
  sorted.forEach((s) => { if (!firstSeen.has(s.checkpoint_id)) firstSeen.set(s.checkpoint_id, s.scanned_at); });
  if (firstSeen.size >= 2) {
    const visited = [...firstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const expected = route.checkpoints.map((c) => c.id).filter((id) => firstSeen.has(id));
    if (visited.some((id, i) => id !== expected[i])) {
      flags.push({ rule: 'OUT_OF_SEQUENCE', severity: 'medium', dedupe_key: 'OUT_OF_SEQUENCE',
        message: 'Checkpoints were scanned in a different order from the route',
        details: { expected_order: expected.map(cpName), actual_order: visited.map(cpName) } });
    }
  }

  // 5. A scan taken far from its checkpoint (scans with no GPS are not judged)
  sorted.forEach((s) => {
    const cp = route.checkpoints.find((c) => c.id === s.checkpoint_id);
    if (!cp || s.latitude === null || s.latitude === undefined || s.longitude === null || s.longitude === undefined) return;
    const d = Math.round(distanceMetres(Number(s.latitude), Number(s.longitude), Number(cp.latitude), Number(cp.longitude)));
    if (d > settings.wrong_location_metres) {
      flags.push({ rule: 'WRONG_LOCATION', severity: 'high', dedupe_key: `WRONG_LOCATION:${s.id}`,
        message: `${cp.name} was scanned ${d} m away from the checkpoint (allowed ${settings.wrong_location_metres} m)`,
        details: { scan_id: s.id, checkpoint_id: cp.id, distance_m: d, allowed_m: settings.wrong_location_metres } });
    }
  });

  // 6. The phone clock is ahead of the server clock
  sorted.forEach((s) => {
    if (s.scanned_at - s.received_at > 10 * MIN) {
      flags.push({ rule: 'CLOCK_MISMATCH', severity: 'medium', dedupe_key: `CLOCK_MISMATCH:${s.id}`,
        message: `The phone clock was ${Math.round((s.scanned_at - s.received_at) / MIN)} minutes ahead of the server when scanning ${cpName(s.checkpoint_id)}`,
        details: { scan_id: s.id, minutes_ahead: Math.round((s.scanned_at - s.received_at) / MIN) } });
    }
  });

  return flags;
}

// What status should the round have? (flags = the round's flags that are still open or confirmed)
function roundStatus({ round, distinctScanned, expected, activeFlags, totalScans, now }) {
  if (now > round.window_end && distinctScanned < expected) return 'missed';
  if (activeFlags > 0) return 'flagged';
  if (distinctScanned >= expected && expected > 0) return 'complete';
  if (totalScans > 0) return 'in_progress';
  return 'pending';
}

module.exports = { evaluateRound, roundStatus };

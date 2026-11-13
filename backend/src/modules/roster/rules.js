// Roster rules as PURE functions: data in, list of violations out. No database, easy to test.
//
// shift = { id, guard_id, shift_date: 'YYYY-MM-DD', start_at: Date, end_at: Date, is_night: boolean }
// A violation = { rule, message, shift_id?, guard_id?, date? }
const { addDays } = require('../../utils/time');

const HOUR = 3600 * 1000;
const overlaps = (a, b) => a.start_at < b.end_at && b.start_at < a.end_at;

function groupByGuard(shifts) {
  const map = new Map();
  shifts.forEach((s) => { if (!map.has(s.guard_id)) map.set(s.guard_id, []); map.get(s.guard_id).push(s); });
  map.forEach((list) => list.sort((a, b) => a.start_at - b.start_at));
  return map;
}

function evaluateRoster({ shifts, otherShifts = [], site, eligibleGuardIds, inactiveGuardIds = [], settings, weekDates, guardNames = {} }) {
  const out = [];
  const name = (id) => guardNames[id] || `Guard ${id}`;
  const inRoster = new Set(shifts.map((s) => s.id));

  // Not allowed to work at this site / account switched off
  for (const s of shifts) {
    if (!eligibleGuardIds.includes(s.guard_id)) out.push({ rule: 'GUARD_NOT_ELIGIBLE', shift_id: s.id, guard_id: s.guard_id, date: s.shift_date, message: `${name(s.guard_id)} is not assigned to this site` });
    if (inactiveGuardIds.includes(s.guard_id)) out.push({ rule: 'GUARD_INACTIVE', shift_id: s.id, guard_id: s.guard_id, date: s.shift_date, message: `${name(s.guard_id)} is deactivated` });
  }

  const byGuard = groupByGuard([...shifts, ...otherShifts.filter((o) => !inRoster.has(o.id))]);
  byGuard.forEach((list, guardId) => {
    // Overlapping shifts (also against other sites and neighbouring weeks)
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length && list[j].start_at < list[i].end_at; j += 1) {
        if (overlaps(list[i], list[j])) {
          const mine = [list[i], list[j]].filter((s) => inRoster.has(s.id));
          mine.forEach((s) => out.push({ rule: 'DOUBLE_BOOKED', shift_id: s.id, guard_id: guardId, date: s.shift_date, message: `${name(guardId)} is booked on two overlapping shifts on ${s.shift_date}` }));
        }
      }
    }
    // Rest between shifts
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]; const next = list[i];
      if (overlaps(prev, next)) continue;
      const restHours = (next.start_at - prev.end_at) / HOUR;
      if (restHours < settings.min_rest_hours && (inRoster.has(next.id) || inRoster.has(prev.id))) {
        const target = inRoster.has(next.id) ? next : prev;
        out.push({ rule: 'MIN_REST_HOURS', shift_id: target.id, guard_id: guardId, date: target.shift_date,
          message: `${name(guardId)} has only ${Math.round(restHours * 10) / 10} hours rest before the shift on ${next.shift_date} (minimum ${settings.min_rest_hours})` });
      }
    }
    // Too many days in a row
    const dates = [...new Set(list.map((s) => s.shift_date))].sort();
    let run = 0; let prevDate = null;
    dates.forEach((d) => {
      run = prevDate && addDays(prevDate, 1) === d ? run + 1 : 1;
      prevDate = d;
      if (run > settings.max_consecutive_days) {
        const s = list.find((x) => x.shift_date === d && inRoster.has(x.id));
        if (s) out.push({ rule: 'MAX_CONSECUTIVE_DAYS', shift_id: s.id, guard_id: guardId, date: d, message: `${name(guardId)} would work ${run} days in a row on ${d} (maximum ${settings.max_consecutive_days})` });
      }
    });
  });

  // Enough guards on every day and night of the week
  for (const date of weekDates) {
    for (const night of [false, true]) {
      const required = night ? site.guards_required_night : site.guards_required_day;
      const assigned = new Set(shifts.filter((s) => s.shift_date === date && Boolean(s.is_night) === night).map((s) => s.guard_id)).size;
      if (assigned < required) {
        out.push({ rule: 'MIN_GUARDS_PER_SHIFT', date, kind: night ? 'night' : 'day', required, assigned,
          message: `${date} ${night ? 'night' : 'day'}: ${assigned} guard${assigned === 1 ? '' : 's'} assigned, ${required} needed` });
      }
    }
  }
  return out;
}

module.exports = { evaluateRoster, overlaps };

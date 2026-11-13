// Africa/Kampala is UTC+3 all year (no daylight saving), so a fixed offset is exact.
// Dates are 'YYYY-MM-DD' strings; instants are JavaScript Dates (UTC inside).
const OFFSET_MS = 3 * 3600 * 1000;

const toKampalaDate = (d) => new Date(new Date(d).getTime() + OFFSET_MS).toISOString().slice(0, 10);

function kampalaToUtc(dateStr, hhmm) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) - OFFSET_MS);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const weekday = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const isMonday = (dateStr) => weekday(dateStr) === 1;
const weekStartOf = (dateStr) => addDays(dateStr, -((weekday(dateStr) + 6) % 7));
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Start and end instants of a shift made from a template on a date. A template whose end is not
// after its start runs past midnight.
function shiftTimes(dateStr, template) {
  const start = kampalaToUtc(dateStr, template.start_time);
  let end = kampalaToUtc(dateStr, template.end_time);
  if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
  return { start_at: start, end_at: end };
}

module.exports = { OFFSET_MS, toKampalaDate, kampalaToUtc, addDays, weekday, isMonday, weekStartOf, isValidDate, shiftTimes };

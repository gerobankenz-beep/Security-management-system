// Monday of the current week in Kampala, like the roster rules expect.
export function mondayOfToday() {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

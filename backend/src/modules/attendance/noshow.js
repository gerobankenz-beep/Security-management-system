// Marks shifts as no-show when nobody checked in. Called every minute by jobs/scheduler.js.
// `now` is a parameter so tests can move the clock.
const { query } = require('../../config/db');
const { loadSettings } = require('../../utils/settings');
const { notify } = require('../../utils/notify');

async function markNoShows(now = new Date()) {
  const settings = await loadSettings();
  const cutoff = new Date(now.getTime() - settings.no_show_minutes * 60000);
  const lookback = new Date(now.getTime() - 3 * 24 * 3600 * 1000);     // never go back further than 3 days
  const { rows } = await query(
    `SELECT sh.id, sh.guard_id, u.full_name, s.id AS site_id, s.name AS site_name, t.name AS template_name
       FROM shifts sh JOIN rosters r ON r.id = sh.roster_id AND r.status = 'published' JOIN sites s ON s.id = r.site_id
       JOIN users u ON u.id = sh.guard_id JOIN shift_templates t ON t.id = sh.shift_template_id
       LEFT JOIN attendance a ON a.shift_id = sh.id
      WHERE sh.status = 'scheduled' AND sh.start_at <= $1 AND sh.start_at >= $2 AND (a.id IS NULL OR (a.checked_in_at IS NULL AND a.status <> 'no_show'))`,
    [cutoff, lookback]);
  for (const s of rows) {
    await query(
      `INSERT INTO attendance (shift_id, status) VALUES ($1, 'no_show')
       ON CONFLICT (shift_id) DO UPDATE SET status = 'no_show' WHERE attendance.checked_in_at IS NULL`, [s.id]);
    const supervisors = (await query('SELECT user_id FROM site_supervisors WHERE site_id = $1', [s.site_id])).rows.map((r) => r.user_id);
    const managers = (await query("SELECT id FROM users WHERE role = 'ops_manager' AND is_active")).rows.map((r) => r.id);
    await notify([...supervisors, ...managers], 'shift_no_show', `${s.full_name} did not check in for the ${s.template_name} shift at ${s.site_name}.`);
  }
  return rows.length;
}

module.exports = { markNoShows };

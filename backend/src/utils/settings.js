// Company settings with safe defaults (the same placeholders as the migration).
const { query } = require('../config/db');

const DEFAULTS = {
  default_geofence_radius_m: 150, late_checkin_minutes: 10, no_show_minutes: 30, min_rest_hours: 10, max_consecutive_days: 6,
  late_round_minutes: 15, wrong_location_metres: 50, overtime_weekly_threshold_hours: 48, overtime_multiplier: 1.5,
  holiday_multiplier: 2, paid_early_arrival: false,
};

async function loadSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

module.exports = { loadSettings, DEFAULTS };

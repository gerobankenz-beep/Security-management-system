// Company settings (thresholds, payroll rules) and public holidays.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, created } = require('../../utils/response');
const { notFound, validationError } = require('../../utils/errors');
const { query } = require('../../config/db');
const { writeAudit } = require('../../utils/audit');

const router = express.Router();

// Allowed keys and their limits. Anything else is refused.
const SETTING_RULES = {
  default_geofence_radius_m: { min: 1, max: 5000 }, late_checkin_minutes: { min: 0, max: 240 }, no_show_minutes: { min: 1, max: 480 },
  min_rest_hours: { min: 0, max: 24 }, max_consecutive_days: { min: 1, max: 14 }, late_round_minutes: { min: 0, max: 240 },
  wrong_location_metres: { min: 1, max: 5000 }, overtime_weekly_threshold_hours: { min: 1, max: 168 },
  overtime_multiplier: { min: 1, max: 5 }, holiday_multiplier: { min: 1, max: 5 }, paid_early_arrival: { boolean: true },
};

async function readSettings() {
  const { rows } = await query('SELECT key, value FROM settings ORDER BY key');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

router.get('/settings', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => ok(res, await readSettings())));

router.patch('/settings', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const issues = [];
  const entries = Object.entries(req.body || {});
  if (!entries.length) issues.push({ field: 'body', issue: 'send at least one setting' });
  for (const [key, value] of entries) {
    const rule = SETTING_RULES[key];
    if (!rule) issues.push({ field: key, issue: 'unknown setting' });
    else if (rule.boolean) { if (typeof value !== 'boolean') issues.push({ field: key, issue: 'must be true or false' }); }
    else if (typeof value !== 'number' || value < rule.min || value > rule.max) issues.push({ field: key, issue: `must be a number between ${rule.min} and ${rule.max}` });
  }
  if (issues.length) throw validationError(issues);
  for (const [key, value] of entries) {
    await query(`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(value)]);
  }
  await writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'settings', details: req.body });
  ok(res, await readSettings());
}));

router.get('/public-holidays', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT id, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, name FROM public_holidays ORDER BY holiday_date");
  ok(res, rows);
}));

router.post('/public-holidays', authenticate, requireRole('admin'),
  validateBody({ holiday_date: { type: 'string', required: true }, name: { type: 'string', required: true, maxLength: 120 } }),
  asyncHandler(async (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.holiday_date) || Number.isNaN(Date.parse(req.body.holiday_date))) {
      throw validationError([{ field: 'holiday_date', issue: 'must be a date like 2026-12-25' }]);
    }
    const { rows } = await query(
      "INSERT INTO public_holidays (holiday_date, name) VALUES ($1, $2) RETURNING id, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, name",
      [req.body.holiday_date, req.body.name]);
    await writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'public_holiday', entityId: rows[0].id });
    created(res, rows[0]);
  }));

router.delete('/public-holidays/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM public_holidays WHERE id = $1', [Number(req.params.id)]);
  if (!rowCount) throw notFound('Holiday not found');
  await writeAudit({ userId: req.user.id, action: 'DELETE', entityType: 'public_holiday', entityId: Number(req.params.id) });
  res.status(204).end();
}));

module.exports = router;

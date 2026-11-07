// Task 5: shift templates, rosters, shifts, validation rules, publish. (API contract section 6)
// Tip: write the rules (rest hours, double booking...) as plain functions in rules.js and unit test them first.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, created } = require('../../utils/response');
const { createChecker } = require('../../utils/check');
const { writeAudit } = require('../../utils/audit');
const { query } = require('../../config/db');
const { stub } = require('../../utils/stub');
const router = express.Router();

// ---- Shift templates (built) ----
router.get('/shift-templates', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time, is_night FROM shift_templates ORDER BY start_time`);
  ok(res, rows);
}));
router.post('/shift-templates', authenticate, requireRole('admin', 'ops_manager'),
  validateBody({ name: { type: 'string', required: true, maxLength: 60 }, start_time: { type: 'string', required: true }, end_time: { type: 'string', required: true }, is_night: { type: 'boolean' } }),
  asyncHandler(async (req, res) => {
    const c = createChecker(); c.times('start_time', [req.body.start_time]); c.times('end_time', [req.body.end_time]); c.done();
    const { rows } = await query(
      `INSERT INTO shift_templates (name, start_time, end_time, is_night) VALUES ($1,$2,$3,$4)
       RETURNING id, name, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time, is_night`,
      [req.body.name, req.body.start_time, req.body.end_time, req.body.is_night === true]);
    await writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'shift_template', entityId: rows[0].id });
    created(res, rows[0]);
  }));
stub(router, 'post', '/rosters', ['ops_manager']);
stub(router, 'get', '/rosters', ['ops_manager', 'supervisor']);
stub(router, 'get', '/rosters/:id', ['ops_manager', 'supervisor']);
stub(router, 'post', '/rosters/:id/shifts', ['ops_manager']);
stub(router, 'delete', '/rosters/:id/shifts/:shiftId', ['ops_manager']);
stub(router, 'get', '/rosters/:id/validate', ['ops_manager']);
stub(router, 'post', '/rosters/:id/publish', ['ops_manager']);
stub(router, 'get', '/me/shifts', ['guard']);
stub(router, 'post', '/rosters/:id/auto-fill', ['ops_manager'], 'stretch goal');

module.exports = router;

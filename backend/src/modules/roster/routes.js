// Task 5: shift templates, rosters, shifts, rule checks, publish, and the guard's own shifts.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, created, list } = require('../../utils/response');
const { parsePagination } = require('../../utils/pagination');
const { createChecker } = require('../../utils/check');
const { writeAudit } = require('../../utils/audit');
const { isValidDate } = require('../../utils/time');
const { validationError } = require('../../utils/errors');
const { query } = require('../../config/db');
const { stub } = require('../../utils/stub');
const svc = require('./roster.service');

const router = express.Router();
const id = (req, n = 'id') => Number(req.params[n]);

// ---- Shift templates ----
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

// ---- Rosters ----
router.post('/rosters', authenticate, requireRole('admin', 'ops_manager'),
  validateBody({ site_id: { type: 'integer', required: true }, week_start: { type: 'string', required: true } }),
  asyncHandler(async (req, res) => created(res, await svc.createRoster(req.user, req.body))));

router.get('/rosters', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  if (req.query.week_start && !isValidDate(req.query.week_start)) throw validationError([{ field: 'week_start', issue: 'must be a date like 2026-11-02' }]);
  const { rows, total } = await svc.listRosters(req.user, {
    siteId: req.query.site_id ? Number(req.query.site_id) : undefined, weekStart: req.query.week_start, perPage, offset });
  list(res, rows, { page, per_page: perPage, total });
}));

router.get('/rosters/:id', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => ok(res, await svc.getRoster(req.user, id(req)))));

router.post('/rosters/:id/shifts', authenticate, requireRole('admin', 'ops_manager'),
  validateBody({ guard_id: { type: 'integer', required: true }, shift_template_id: { type: 'integer', required: true }, date: { type: 'string', required: true } }),
  asyncHandler(async (req, res) => created(res, await svc.addShift(req.user, id(req), req.body))));

router.delete('/rosters/:id/shifts/:shiftId', authenticate, requireRole('admin', 'ops_manager'),
  asyncHandler(async (req, res) => { await svc.removeShift(req.user, id(req), id(req, 'shiftId')); res.status(204).end(); }));

router.get('/rosters/:id/validate', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => ok(res, await svc.validateRoster(req.user, id(req)))));
router.post('/rosters/:id/publish', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => ok(res, await svc.publish(req.user, id(req)))));
router.post('/rosters/:id/unpublish', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => ok(res, await svc.unpublish(req.user, id(req)))));

// ---- Guard: my shifts ----
router.get('/me/shifts', authenticate, requireRole('guard'), asyncHandler(async (req, res) => {
  ['from', 'to'].forEach((f) => { if (req.query[f] && !isValidDate(req.query[f])) throw validationError([{ field: f, issue: 'must be a date like 2026-11-02' }]); });
  ok(res, await svc.myShifts(req.user, { from: req.query.from, to: req.query.to }));
}));

stub(router, 'post', '/rosters/:id/auto-fill', ['ops_manager'], 'stretch goal');

module.exports = router;

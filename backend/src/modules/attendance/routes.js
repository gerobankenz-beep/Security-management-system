// Task 6: check-in and check-out (safe to resend), attendance lists, exceptions, corrections.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, list } = require('../../utils/response');
const { parsePagination } = require('../../utils/pagination');
const { isValidDate } = require('../../utils/time');
const { validationError } = require('../../utils/errors');
const { stub } = require('../../utils/stub');
const svc = require('./attendance.service');

const router = express.Router();

const eventRules = {
  client_event_id: { type: 'string', required: true }, shift_id: { type: 'integer', required: true }, device_time: { type: 'string' },
  latitude: { type: 'number' }, longitude: { type: 'number' }, accuracy_m: { type: 'number' }, device_id: { type: 'string', maxLength: 80 },
};
const send = (res, result) => res.status(result.status).json({ data: result.data });

router.post('/attendance/check-in', authenticate, requireRole('guard'), validateBody(eventRules), asyncHandler(async (req, res) => send(res, await svc.checkIn(req.user, req.body))));
router.post('/attendance/check-out', authenticate, requireRole('guard'), validateBody(eventRules), asyncHandler(async (req, res) => send(res, await svc.checkOut(req.user, req.body))));

const listHandler = (exceptionsOnly) => asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  if (req.query.date && !isValidDate(req.query.date)) throw validationError([{ field: 'date', issue: 'must be a date like 2026-11-02' }]);
  const { rows, total } = await svc.listAttendance(req.user, {
    siteId: req.query.site_id ? Number(req.query.site_id) : undefined, date: req.query.date, guardId: req.query.guard_id ? Number(req.query.guard_id) : undefined,
    status: req.query.status, exceptionsOnly, perPage, offset });
  list(res, rows, { page, per_page: perPage, total });
});
router.get('/attendance', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), listHandler(false));
router.get('/attendance/exceptions', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), listHandler(true));

router.post('/attendance/:id/corrections', authenticate, requireRole('admin', 'ops_manager', 'supervisor'),
  validateBody({ reason: { type: 'string', required: true, maxLength: 500 }, checked_in_at: { type: 'string' }, checked_out_at: { type: 'string' },
    overtime_approved: { type: 'boolean' }, verification_status: { type: 'string', enum: ['verified', 'accepted', 'rejected'] }, status: { type: 'string', enum: ['on_time', 'late', 'no_show'] } }),
  asyncHandler(async (req, res) => ok(res, await svc.correct(req.user, Number(req.params.id), req.body))));

// Stretch goals
stub(router, 'post', '/swap-requests', ['guard'], 'stretch goal');
stub(router, 'patch', '/swap-requests/:id', ['supervisor'], 'stretch goal');
stub(router, 'post', '/leave-requests', ['guard'], 'stretch goal');
stub(router, 'patch', '/leave-requests/:id', ['supervisor'], 'stretch goal');

module.exports = router;

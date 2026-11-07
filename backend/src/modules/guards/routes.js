// Admin: add and manage guards (and reset any user's password).
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, created, list } = require('../../utils/response');
const { parsePagination } = require('../../utils/pagination');
const { createChecker } = require('../../utils/check');
const svc = require('./guards.service');

const router = express.Router();
const id = (req) => Number(req.params.id);

const payRules = {
  hourly_rate_ugx: { type: 'integer', min: 0 }, night_allowance_ugx: { type: 'integer', min: 0 },
  overtime_multiplier: { type: 'number', min: 1, max: 5 },
};
const checkSites = (body) => { const c = createChecker(); c.intArray('site_ids', body.site_ids); c.done(); };

router.post('/guards', authenticate, requireRole('admin'),
  validateBody({
    full_name: { type: 'string', required: true, maxLength: 120 }, email: { type: 'email', required: true },
    phone: { type: 'string' }, employee_no: { type: 'string', maxLength: 30 }, password: { type: 'string', minLength: 8 },
    ...payRules, hourly_rate_ugx: { type: 'integer', required: true, min: 0 },
  }),
  asyncHandler(async (req, res) => { checkSites(req.body); created(res, await svc.createGuard(req.user, req.body)); }));

router.get('/guards', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  const { rows, total } = await svc.listGuards(req.user, {
    search: req.query.search, status: req.query.status, siteId: req.query.site_id ? Number(req.query.site_id) : undefined, perPage, offset });
  list(res, rows, { page, per_page: perPage, total });
}));

router.get('/guards/:id', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => ok(res, await svc.getGuard(id(req)))));

router.patch('/guards/:id', authenticate, requireRole('admin'),
  validateBody({ full_name: { type: 'string', maxLength: 120 }, phone: { type: 'string' }, employee_no: { type: 'string', maxLength: 30 }, ...payRules }),
  asyncHandler(async (req, res) => { checkSites(req.body); ok(res, await svc.updateGuard(req.user, id(req), req.body)); }));

router.post('/guards/:id/deactivate', authenticate, requireRole('admin'), asyncHandler(async (req, res) => ok(res, await svc.setActive(req.user, id(req), false))));
router.post('/guards/:id/reactivate', authenticate, requireRole('admin'), asyncHandler(async (req, res) => ok(res, await svc.setActive(req.user, id(req), true))));

router.put('/guards/:id/sites', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const c = createChecker(); c.intArray('site_ids', req.body.site_ids, { required: true }); c.done();
  ok(res, await svc.setGuardSites(req.user, id(req), req.body.site_ids));
}));

router.post('/users/:id/reset-password', authenticate, requireRole('admin'), asyncHandler(async (req, res) => ok(res, await svc.resetPassword(req.user, id(req)))));

module.exports = router;

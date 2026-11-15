// Payroll (admin only). The run is identified by its month, like 2026-11.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, created } = require('../../utils/response');
const svc = require('./payroll.service');

const router = express.Router();
const admin = [authenticate, requireRole('admin')];

router.post('/payroll/runs', ...admin, validateBody({ month: { type: 'string', required: true } }),
  asyncHandler(async (req, res) => { const r = await svc.createRun(req.user, req.body.month); return r.created ? created(res, r.data) : ok(res, r.data); }));
router.get('/payroll/runs/:month', ...admin, asyncHandler(async (req, res) => ok(res, await svc.getRun(req.params.month))));
router.post('/payroll/runs/:month/recalculate', ...admin, asyncHandler(async (req, res) => ok(res, await svc.recalculate(req.user, req.params.month))));
router.post('/payroll/runs/:month/review', ...admin, asyncHandler(async (req, res) => ok(res, await svc.review(req.user, req.params.month))));
router.post('/payroll/runs/:month/finalise', ...admin, asyncHandler(async (req, res) => ok(res, await svc.finalise(req.user, req.params.month))));
router.post('/payroll/runs/:month/unlock', ...admin, validateBody({ reason: { type: 'string', required: true, maxLength: 500 } }),
  asyncHandler(async (req, res) => ok(res, await svc.unlock(req.user, req.params.month, req.body.reason))));
router.get('/payroll/runs/:month/export', ...admin, asyncHandler(async (req, res) => {
  if (req.query.format && req.query.format !== 'csv') return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Only format=csv is available', details: [{ field: 'format', issue: 'must be csv' }] } });
  const csv = await svc.exportCsv(req.params.month);
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="payroll-${req.params.month}.csv"`).send(csv);
}));

router.get('/payroll/adjustments', ...admin, asyncHandler(async (req, res) => ok(res, await svc.listAdjustments(req.query.month))));
router.post('/payroll/adjustments', ...admin,
  validateBody({ guard_id: { type: 'integer', required: true }, month: { type: 'string', required: true }, type: { type: 'string', required: true, enum: ['addition', 'deduction'] },
    amount_ugx: { type: 'integer', required: true, min: 1 }, reason: { type: 'string', required: true, maxLength: 300 } }),
  asyncHandler(async (req, res) => created(res, await svc.addAdjustment(req.user, req.body))));

module.exports = router;

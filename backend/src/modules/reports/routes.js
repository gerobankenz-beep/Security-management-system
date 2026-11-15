// Weekly field report (admin, manager, supervisor) and proof of service (client-safe).
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { ok } = require('../../utils/response');
const svc = require('./reports.service');

const router = express.Router();
const STAFF = ['admin', 'ops_manager', 'supervisor'];

router.get('/reports/weekly-field', authenticate, requireRole(...STAFF), asyncHandler(async (req, res) => ok(res, await svc.weeklyField(req.user, req.query))));
router.get('/reports/weekly-field/export', authenticate, requireRole(...STAFF), asyncHandler(async (req, res) => {
  if (req.query.format && req.query.format !== 'csv') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Only format=csv is available', details: [{ field: 'format', issue: 'must be csv' }] } });
  }
  const csv = await svc.weeklyFieldCsv(req.user, req.query);
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="weekly-field-${req.query.week_start || 'current'}.csv"`).send(csv);
}));
router.get('/reports/proof-of-service', authenticate, requireRole('admin', 'ops_manager', 'client'), asyncHandler(async (req, res) => ok(res, await svc.proofOfService(req.user, req.query))));

module.exports = router;

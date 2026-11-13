// Task 9: dashboard numbers (built) and reports (area 6).
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { ok } = require('../../utils/response');
const { stub } = require('../../utils/stub');
const svc = require('./dashboard.service');

const router = express.Router();
const STAFF = ['admin', 'ops_manager', 'supervisor'];

router.get('/dashboard/overview', authenticate, requireRole(...STAFF), asyncHandler(async (req, res) => ok(res, await svc.overview(req.user))));
router.get('/dashboard/sites/:id/status', authenticate, requireRole(...STAFF), asyncHandler(async (req, res) => ok(res, await svc.siteStatus(req.user, Number(req.params.id)))));

// ---- Reports: built in area 6 ----
stub(router, 'get', '/reports/patrol-compliance', ['admin', 'ops_manager', 'supervisor']);
stub(router, 'get', '/reports/proof-of-service', ['admin', 'client', 'ops_manager']);

module.exports = router;

// Task 7: the shift's route and rounds, and scan upload (single and batch, both safe to resend).
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { ok } = require('../../utils/response');
const { validationError } = require('../../utils/errors');
const svc = require('./patrol.service');

const router = express.Router();
const MAX_BATCH = 100;

router.get('/shifts/:id/route', authenticate, requireRole('guard', 'admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => ok(res, await svc.getShiftRoute(req.user, Number(req.params.id)))));
router.get('/shifts/:id/rounds', authenticate, requireRole('guard', 'admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => ok(res, await svc.getShiftRounds(req.user, Number(req.params.id)))));
router.get('/rounds/:id', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => ok(res, await svc.getRound(req.user, Number(req.params.id)))));

// One scan. A badly formed scan is a 400 here (in a batch it becomes a rejected result instead).
router.post('/scans', authenticate, requireRole('guard'), asyncHandler(async (req, res) => {
  const problems = svc.scanProblems(req.body || {});
  if (problems.length) throw validationError(problems);
  const [result] = await svc.processBatch(req.user, [req.body]);
  ok(res, result);
}));

// Many scans: always answers 200 with one result per scan, in the same order.
router.post('/scans/batch', authenticate, requireRole('guard'), asyncHandler(async (req, res) => {
  const scans = req.body && req.body.scans;
  if (!Array.isArray(scans) || scans.length === 0) throw validationError([{ field: 'scans', issue: 'must be a list with at least one scan' }]);
  if (scans.length > MAX_BATCH) throw validationError([{ field: 'scans', issue: `send at most ${MAX_BATCH} scans at a time` }]);
  ok(res, { results: await svc.processBatch(req.user, scans) });
}));

module.exports = router;

// Task 8: flags (suspicious patrols) and their review. The rules live in rules.js.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, list } = require('../../utils/response');
const { parsePagination } = require('../../utils/pagination');
const { assertSiteAccess } = require('../sites/access');
const { query } = require('../../config/db');
const { notFound } = require('../../utils/errors');
const svc = require('./anomaly.service');

const router = express.Router();
const STAFF = ['admin', 'ops_manager', 'supervisor'];

router.get('/flags', authenticate, requireRole(...STAFF), asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  const num = (v) => (v ? Number(v) : undefined);
  const { rows, total } = await svc.listFlags(req.user, { siteId: num(req.query.site_id), status: req.query.status, rule: req.query.rule,
    roundId: num(req.query.round_id), guardId: num(req.query.guard_id), from: req.query.from, to: req.query.to, perPage, offset });
  list(res, rows, { page, per_page: perPage, total });
}));

router.get('/flags/:id', authenticate, requireRole(...STAFF), asyncHandler(async (req, res) => ok(res, await svc.getFlag(req.user, Number(req.params.id)))));

router.patch('/flags/:id', authenticate, requireRole(...STAFF),
  validateBody({ status: { type: 'string', required: true, enum: ['confirmed', 'dismissed'] }, note: { type: 'string', maxLength: 500 } }),
  asyncHandler(async (req, res) => ok(res, await svc.reviewFlag(req.user, Number(req.params.id), req.body))));

// Run the rules again for one round (managers and admin). Safe: it never creates the same flag twice.
router.post('/rounds/:id/evaluate', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => {
  const r = (await query(
    'SELECT r.site_id FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id JOIN rosters r ON r.id = sh.roster_id WHERE pr.id = $1', [Number(req.params.id)])).rows[0];
  if (!r) throw notFound('Round not found');
  await assertSiteAccess(req.user, r.site_id);
  const created = await svc.evaluateRound(Number(req.params.id));
  ok(res, { round_id: Number(req.params.id), new_flags: created.length, status: (await query('SELECT status FROM patrol_rounds WHERE id = $1', [Number(req.params.id)])).rows[0].status });
}));

module.exports = router;

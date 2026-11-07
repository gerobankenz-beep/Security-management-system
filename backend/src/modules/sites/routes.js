// Task 4: clients, sites, checkpoints, routes, QR sheet.
// Pattern: route (URL + who may call it + validation) -> service (SQL and logic).
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, created, list } = require('../../utils/response');
const { parsePagination } = require('../../utils/pagination');
const { notFound } = require('../../utils/errors');
const { createChecker } = require('../../utils/check');
const { query } = require('../../config/db');
const { siteScope, assertSiteAccess } = require('./access');
const svc = require('./sites.service');

const router = express.Router();
const id = (req, name = 'id') => Number(req.params[name]);

// ---------- clients ----------
router.post('/clients', authenticate, requireRole('admin'),
  validateBody({ name: { type: 'string', required: true, maxLength: 160 }, contact_name: { type: 'string' },
    contact_phone: { type: 'string' }, contact_email: { type: 'email' } }),
  asyncHandler(async (req, res) => created(res, await svc.createClient(req.user, req.body))));

router.get('/clients', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  const { rows, total } = await svc.listClients({ search: req.query.search, perPage, offset });
  list(res, rows, { page, per_page: perPage, total });
}));

router.patch('/clients/:id', authenticate, requireRole('admin'),
  validateBody({ name: { type: 'string', maxLength: 160 }, contact_email: { type: 'email' }, is_active: { type: 'boolean' } }),
  asyncHandler(async (req, res) => ok(res, await svc.updateClient(req.user, id(req), req.body))));

// ---------- sites ----------
const siteRules = {
  name: { type: 'string', maxLength: 160 }, address: { type: 'string' },
  latitude: { type: 'number' }, longitude: { type: 'number' }, geofence_radius_m: { type: 'integer' },
  guards_required_day: { type: 'integer' }, guards_required_night: { type: 'integer' }, patrols_per_night: { type: 'integer' },
};

router.get('/sites', authenticate, asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  const params = [];
  let filter = siteScope(req.user, params);
  if (req.query.client_id) { params.push(Number(req.query.client_id)); filter += ` AND s.client_id = $${params.length}`; }
  if (req.query.include_inactive !== 'true') filter += ' AND s.is_active';
  const total = (await query(`SELECT count(*) AS n FROM sites s WHERE true ${filter}`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(
    `SELECT s.* FROM sites s WHERE true ${filter} ORDER BY s.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  list(res, rows, { page, per_page: perPage, total });
}));

router.get('/sites/:id', authenticate, asyncHandler(async (req, res) => {
  const params = [id(req)];
  const filter = siteScope(req.user, params);
  const { rows } = await query(`SELECT s.* FROM sites s WHERE s.id = $1 ${filter}`, params);
  if (!rows[0]) throw notFound(`Site ${req.params.id} not found`); // 404, not 403: ids stay hidden
  ok(res, rows[0]);
}));

router.post('/sites', authenticate, requireRole('admin'),
  validateBody({ ...siteRules, client_id: { type: 'integer', required: true }, name: { type: 'string', required: true, maxLength: 160 },
    latitude: { type: 'number', required: true }, longitude: { type: 'number', required: true } }),
  asyncHandler(async (req, res) => { svc.validateSiteInput(req.body, { creating: true }); created(res, await svc.createSite(req.user, req.body)); }));

router.patch('/sites/:id', authenticate, requireRole('admin'),
  validateBody({ ...siteRules, is_active: { type: 'boolean' } }),
  asyncHandler(async (req, res) => { svc.validateSiteInput(req.body, { creating: false }); ok(res, await svc.updateSite(req.user, id(req), req.body)); }));

router.put('/sites/:id/supervisors', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const c = createChecker(); c.intArray('user_ids', req.body.user_ids, { required: true }); c.done();
  ok(res, await svc.setSiteSupervisors(req.user, id(req), req.body.user_ids));
}));

router.get('/sites/:id/supervisors', authenticate, requireRole('admin', 'ops_manager'), asyncHandler(async (req, res) => {
  await assertSiteAccess(req.user, id(req));
  ok(res, await svc.listSiteSupervisors(id(req)));
}));

router.get('/sites/:id/guards', authenticate, requireRole('admin', 'ops_manager', 'supervisor'), asyncHandler(async (req, res) => {
  await assertSiteAccess(req.user, id(req));
  ok(res, await svc.listSiteGuards(id(req)));
}));

// ---------- checkpoints ----------
router.post('/sites/:id/checkpoints', authenticate, requireRole('admin'),
  validateBody({ name: { type: 'string', required: true, maxLength: 120 }, latitude: { type: 'number', required: true }, longitude: { type: 'number', required: true } }),
  asyncHandler(async (req, res) => {
    const c = createChecker(); c.range('latitude', req.body.latitude, -90, 90); c.range('longitude', req.body.longitude, -180, 180); c.done();
    created(res, await svc.createCheckpoint(req.user, id(req), req.body));
  }));

// the tag sheet route must come before nothing that could capture it
router.get('/sites/:id/checkpoints/tag-sheet', authenticate, requireRole('admin', 'ops_manager'),
  asyncHandler(async (req, res) => ok(res, await svc.tagSheet(id(req)))));

router.get('/sites/:id/checkpoints', authenticate, asyncHandler(async (req, res) => {
  await assertSiteAccess(req.user, id(req));
  ok(res, await svc.listCheckpoints(id(req)));
}));

router.patch('/checkpoints/:id', authenticate, requireRole('admin'),
  validateBody({ name: { type: 'string', maxLength: 120 }, latitude: { type: 'number' }, longitude: { type: 'number' }, is_active: { type: 'boolean' } }),
  asyncHandler(async (req, res) => {
    const c = createChecker(); c.range('latitude', req.body.latitude, -90, 90); c.range('longitude', req.body.longitude, -180, 180); c.done();
    ok(res, await svc.updateCheckpoint(req.user, id(req), req.body));
  }));

// ---------- routes ----------
const routeRules = { name: { type: 'string', maxLength: 120 }, max_round_minutes: { type: 'integer', min: 1 }, min_seconds_between_scans: { type: 'integer', min: 0 } };

router.post('/sites/:id/routes', authenticate, requireRole('admin', 'ops_manager'),
  validateBody({ ...routeRules, name: { type: 'string', required: true, maxLength: 120 } }),
  asyncHandler(async (req, res) => {
    const c = createChecker();
    c.intArray('checkpoint_sequence', req.body.checkpoint_sequence, { required: true });
    if (Array.isArray(req.body.checkpoint_sequence) && req.body.checkpoint_sequence.length === 0) c.add('checkpoint_sequence', 'needs at least one checkpoint');
    c.times('round_start_times', req.body.round_start_times, { required: true });
    c.done();
    created(res, await svc.createRoute(req.user, id(req), req.body));
  }));

router.get('/sites/:id/routes', authenticate, asyncHandler(async (req, res) => {
  await assertSiteAccess(req.user, id(req));
  ok(res, await svc.listRoutes(id(req)));
}));

router.patch('/routes/:id', authenticate, requireRole('admin', 'ops_manager'),
  validateBody({ ...routeRules, is_active: { type: 'boolean' } }),
  asyncHandler(async (req, res) => {
    const c = createChecker(); c.intArray('checkpoint_sequence', req.body.checkpoint_sequence); c.times('round_start_times', req.body.round_start_times); c.done();
    ok(res, await svc.updateRoute(req.user, id(req), req.body));
  }));

module.exports = router;

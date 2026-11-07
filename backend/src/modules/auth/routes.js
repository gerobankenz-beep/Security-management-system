// Task 3: login, current user, user management, audit log.
// Pattern for every module:  routes (URLs) -> controller (request/response) -> service (logic + SQL)
// To keep this skeleton short, controller code is written inline here as small functions.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const { ok, created, list } = require('../../utils/response');
const { parsePagination } = require('../../utils/pagination');
const { writeAudit } = require('../../utils/audit');
const authService = require('./auth.service');
const usersService = require('./users.service');

const router = express.Router();
const ROLES = ['admin', 'ops_manager', 'supervisor', 'guard', 'client'];

// --- Public: no token needed ---
router.post(
  '/auth/login',
  validateBody({ email: { type: 'email', required: true }, password: { type: 'string', required: true } }),
  asyncHandler(async (req, res) => ok(res, await authService.login(req.body.email, req.body.password)))
);

// --- Any logged-in user ---
router.post('/auth/logout', authenticate, asyncHandler(async (req, res) => {
  // Tokens are stateless, so the server has nothing to delete. The app must throw its token away.
  await writeAudit({ userId: req.user.id, action: 'LOGOUT', entityType: 'user', entityId: req.user.id });
  res.status(204).end();
}));

router.get('/auth/me', authenticate, (req, res) => {
  const { id, full_name, email, role, client_id } = req.user;
  ok(res, { id, full_name, email, role, client_id });
});

// --- Admin only ---
router.post(
  '/users', authenticate, requireRole('admin'),
  validateBody({
    full_name: { type: 'string', required: true, maxLength: 120 },
    email: { type: 'email', required: true },
    phone: { type: 'string' },
    role: { type: 'string', required: true, enum: ROLES },
    password: { type: 'string', required: true, minLength: 8 },
    client_id: { type: 'integer' },
  }),
  asyncHandler(async (req, res) => created(res, await usersService.createUser(req.user, req.body)))
);

router.get('/users', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  const { rows, total } = await usersService.listUsers({ role: req.query.role, perPage, offset });
  list(res, rows, { page, per_page: perPage, total });
}));

router.get('/users/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  ok(res, await usersService.getUser(Number(req.params.id)));
}));

router.patch(
  '/users/:id', authenticate, requireRole('admin'),
  validateBody({
    full_name: { type: 'string', maxLength: 120 },
    phone: { type: 'string' },
    role: { type: 'string', enum: ROLES },
    is_active: { type: 'boolean' },
  }),
  asyncHandler(async (req, res) => ok(res, await usersService.updateUser(req.user, Number(req.params.id), req.body)))
);

router.get('/audit-logs', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  const { rows, total } = await usersService.listAuditLogs({
    userId: req.query.user_id ? Number(req.query.user_id) : undefined,
    from: req.query.from, to: req.query.to, perPage, offset,
  });
  list(res, rows, { page, per_page: perPage, total });
}));

module.exports = router;

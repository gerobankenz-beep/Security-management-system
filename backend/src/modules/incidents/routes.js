// Task 10: incidents and notifications. (API contract section 11)
// Suggested: export a notify(userIds, type, message) function from notifications.service.js
// so every other module can create notifications with one call.
const express = require('express');
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const { ok, list } = require('../../utils/response');
const { parsePagination } = require('../../utils/pagination');
const { notFound } = require('../../utils/errors');
const { query } = require('../../config/db');
const { stub } = require('../../utils/stub');
const router = express.Router();

// ---- Notifications (built): every user reads and marks their own ----
router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  const { page, perPage, offset } = parsePagination(req.query);
  const unreadOnly = req.query.unread === 'true' ? 'AND NOT is_read' : '';
  const total = (await query(`SELECT count(*) AS n FROM notifications WHERE user_id = $1 ${unreadOnly}`, [req.user.id])).rows[0].n;
  const unread = (await query('SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND NOT is_read', [req.user.id])).rows[0].n;
  const { rows } = await query(
    `SELECT id, type, message, link, is_read, created_at FROM notifications WHERE user_id = $1 ${unreadOnly}
      ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [req.user.id, perPage, offset]);
  list(res, rows, { page, per_page: perPage, total, unread });
}));

router.patch('/notifications/:id', authenticate, validateBody({ is_read: { type: 'boolean', required: true } }), asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE notifications SET is_read = $1 WHERE id = $2 AND user_id = $3 RETURNING id, type, message, link, is_read, created_at',
    [req.body.is_read, Number(req.params.id), req.user.id]);
  if (!rows[0]) throw notFound('Notification not found');   // someone else's notification is also a 404
  ok(res, rows[0]);
}));

stub(router, 'post', '/incidents', ['guard']);
stub(router, 'get', '/incidents', ['supervisor', 'ops_manager']);
stub(router, 'get', '/incidents/:id', ['supervisor', 'ops_manager', 'guard']);
stub(router, 'patch', '/incidents/:id', ['supervisor', 'ops_manager']);
stub(router, 'post', '/incidents/:id/photos', ['guard'], 'stretch goal');

module.exports = router;

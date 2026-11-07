// Checks the Authorization: Bearer <token> header and puts the logged-in user on req.user.
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');
const { unauthorized } = require('../utils/errors');
const asyncHandler = require('./asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw unauthorized('Missing token');

  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret);
  } catch (err) {
    throw unauthorized('Invalid or expired token');
  }

  // Look the user up every time so a deactivated user is locked out immediately.
  const { rows } = await query(
    'SELECT id, full_name, email, role, client_id, is_active FROM users WHERE id = $1',
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw unauthorized('Account not found or inactive');

  req.user = user;
  next();
});

module.exports = { authenticate };

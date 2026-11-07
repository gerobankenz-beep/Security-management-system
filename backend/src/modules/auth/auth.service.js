// The "service" layer holds the real logic and SQL. Controllers call services.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { query } = require('../../config/db');
const { unauthorized } = require('../../utils/errors');
const { writeAudit } = require('../../utils/audit');

// A fake hash used when the email does not exist, so the response time is about the same
// whether or not the account exists (this makes guessing email addresses harder).
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4n1rKQ0bQ2Z0m3QWv9p6J9o5gH2y';

async function login(email, password) {
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];

  const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !user.is_active || !passwordOk) {
    // One generic message for every failure: never reveal which part was wrong.
    throw unauthorized('Wrong email or password');
  }

  // The token says who the user is and their role. It is signed with JWT_SECRET so it cannot be faked.
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresInSeconds });

  await writeAudit({ userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id });

  return {
    token,
    expires_in: env.jwtExpiresInSeconds,
    user: { id: user.id, full_name: user.full_name, role: user.role },
  };
}

module.exports = { login };

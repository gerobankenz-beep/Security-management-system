// Allows only the listed roles. With no roles listed, any logged-in user is allowed.
// Usage: router.get('/users', authenticate, requireRole('admin'), handler)
const { forbidden } = require('../utils/errors');

function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(forbidden(`Role '${req.user.role}' cannot access this`));
    }
    next();
  };
}

module.exports = { requireRole };

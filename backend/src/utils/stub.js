// Registers a placeholder route that answers 501 NOT_IMPLEMENTED.
// Each task owner replaces the stubs in their module with real code.
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { notImplemented } = require('./errors');

function stub(router, method, path, roles = [], note = '') {
  router[method](path, authenticate, requireRole(...roles), (req, res, next) => {
    next(notImplemented(`TODO: ${method.toUpperCase()} ${path}${note ? ' (' + note + ')' : ''} is not built yet`));
  });
}

module.exports = { stub };

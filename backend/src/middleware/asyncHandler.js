// Express 4 does not catch errors thrown inside async functions.
// Wrap async route handlers with this so errors reach the error handler.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

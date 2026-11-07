// Turns every error into the standard error JSON. Must be registered LAST in app.js.
const env = require('../config/env');
const { AppError } = require('../utils/errors');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }
  // Bad JSON sent by the client
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } });
  }
  // PostgreSQL errors: https://www.postgresql.org/docs/current/errcodes-appendix.html
  if (err.code === '23505') return res.status(409).json({ error: { code: 'CONFLICT', message: 'That record already exists' } });
  if (err.code === '23503') return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A referenced record does not exist or is still in use' } });
  if (err.code === '23514' || err.code === '22P02') return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A value is not allowed' } });

  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: env.isProduction ? 'Something went wrong' : err.message } });
}

module.exports = { errorHandler, notFoundHandler };

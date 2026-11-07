// Errors we throw on purpose. The error handler turns them into the standard error JSON
// from the API contract: { "error": { "code", "message", "details" } }
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  AppError,
  validationError: (details, message = 'Some fields are invalid') => new AppError(400, 'VALIDATION_ERROR', message, details),
  unauthorized: (message = 'You are not logged in') => new AppError(401, 'UNAUTHENTICATED', message),
  forbidden: (message = 'You are not allowed to do this') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message = 'Conflict') => new AppError(409, 'CONFLICT', message),
  notImplemented: (message) => new AppError(501, 'NOT_IMPLEMENTED', message),
};

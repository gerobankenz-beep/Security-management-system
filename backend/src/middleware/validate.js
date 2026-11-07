// A tiny request-body validator so beginners can read it in two minutes.
// Usage:
//   validateBody({ email: { type: 'email', required: true }, age: { type: 'integer', min: 0 } })
// Supported: required, type (string|email|integer|number|boolean), minLength, maxLength, min, max, enum.
const { validationError } = require('../utils/errors');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkField(name, value, rule) {
  const issues = [];
  const empty = value === undefined || value === null || value === '';
  if (empty) {
    if (rule.required) issues.push({ field: name, issue: 'is required' });
    return issues;
  }
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') issues.push({ field: name, issue: 'must be text' });
      break;
    case 'email':
      if (typeof value !== 'string' || !EMAIL.test(value)) issues.push({ field: name, issue: 'must be a valid email' });
      break;
    case 'integer':
      if (!Number.isInteger(value)) issues.push({ field: name, issue: 'must be a whole number' });
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) issues.push({ field: name, issue: 'must be a number' });
      break;
    case 'boolean':
      if (typeof value !== 'boolean') issues.push({ field: name, issue: 'must be true or false' });
      break;
    default:
      break;
  }
  if (issues.length > 0) return issues;
  if (rule.minLength && String(value).length < rule.minLength) issues.push({ field: name, issue: `must be at least ${rule.minLength} characters` });
  if (rule.maxLength && String(value).length > rule.maxLength) issues.push({ field: name, issue: `must be at most ${rule.maxLength} characters` });
  if (rule.min !== undefined && value < rule.min) issues.push({ field: name, issue: `must be at least ${rule.min}` });
  if (rule.max !== undefined && value > rule.max) issues.push({ field: name, issue: `must be at most ${rule.max}` });
  if (rule.enum && !rule.enum.includes(value)) issues.push({ field: name, issue: `must be one of: ${rule.enum.join(', ')}` });
  return issues;
}

function validateBody(rules) {
  return (req, res, next) => {
    const body = req.body || {};
    const details = Object.entries(rules).flatMap(([name, rule]) => checkField(name, body[name], rule));
    if (details.length > 0) return next(validationError(details));
    next();
  };
}

module.exports = { validateBody };

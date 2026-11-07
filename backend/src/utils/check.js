// Collects field problems and throws one VALIDATION_ERROR with all of them.
const { validationError } = require('./errors');

function createChecker() {
  const issues = [];
  return {
    add: (field, issue) => issues.push({ field, issue }),
    range(field, value, min, max) {
      if (value !== undefined && value !== null && (typeof value !== 'number' || value < min || value > max)) {
        issues.push({ field, issue: `must be a number between ${min} and ${max}` });
      }
    },
    intArray(field, value, { required = false } = {}) {
      if (value === undefined) { if (required) issues.push({ field, issue: 'is required' }); return; }
      if (!Array.isArray(value) || value.some((v) => !Number.isInteger(v))) issues.push({ field, issue: 'must be a list of ids' });
    },
    times(field, value, { required = false } = {}) {
      if (value === undefined) { if (required) issues.push({ field, issue: 'is required' }); return; }
      if (!Array.isArray(value) || value.length === 0 || value.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
        issues.push({ field, issue: 'must be a list of times like 20:00' });
      }
    },
    done() { if (issues.length) throw validationError(issues); },
  };
}

module.exports = { createChecker };

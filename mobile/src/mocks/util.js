export class MockError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status; this.code = code; this.details = details; this.isMock = true;
  }
}

export function page(rows, query = {}) {
  const per = Number(query.per_page) || 20;
  const current = Number(query.page) || 1;
  return { data: rows.slice((current - 1) * per, current * per), meta: { page: current, per_page: per, total: rows.length } };
}

export const invalid = (details) => new MockError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);

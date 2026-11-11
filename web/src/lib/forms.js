// Helpers shared by the forms.

// Turns an ApiError into { fieldName: 'message' } so each message appears under its input.
export function fieldErrors(err) {
  const out = {};
  if (err && Array.isArray(err.details)) err.details.forEach((d) => { if (d.field && !out[d.field]) out[d.field] = d.issue; });
  return out;
}

// '' -> undefined, '5000' -> 5000. Keeps blanks out of the request body.
export const toInt = (v) => (v === '' || v === undefined || v === null ? undefined : Number(v));

export const ugx = (n) => (n === null || n === undefined ? '-' : `${Number(n).toLocaleString('en-US')} UGX`);

export const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

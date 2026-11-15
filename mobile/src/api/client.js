// One place that talks to the backend. A request that cannot reach the server throws a NetworkError
// (the app treats that as "offline"). An answer from the server with an error throws an ApiError.
import { API_URL, REQUEST_TIMEOUT_MS, USE_MOCKS } from '../config.js';
import { mockRequest } from '../mocks/index.js';

export class NetworkError extends Error {
  constructor(message) { super(message || 'No connection'); this.name = 'NetworkError'; this.network = true; }
}
export class ApiError extends Error {
  constructor(status, code, message, details) { super(message || code || 'Request failed'); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details; }
}

let token = null;
let onUnauthorized = null;
export const setToken = (t) => { token = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function request(path, { method = 'GET', body, query, auth = true } = {}) {
  if (USE_MOCKS) return mockRequest(path, { method, body, query, auth, token });

  const qs = query ? Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    throw new NetworkError(e && e.name === 'AbortError' ? 'The server took too long to answer' : 'Cannot reach the server');
  } finally { clearTimeout(timer); }

  if (res.status === 204) return null;
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const err = (json && json.error) || {};
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, err.code, err.message || `Server answered ${res.status}`, err.details);
  }
  return json;
}

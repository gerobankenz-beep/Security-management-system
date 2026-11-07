// The ONLY place that talks to the network. Pages never call fetch() directly.
// Every call returns the JSON body from the API contract: { data, meta? }.
import { mockRequest } from '../mocks';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
export const USE_MOCKS = String(import.meta.env.VITE_USE_MOCKS) === 'true';

const TOKEN_KEY = 'patrol_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// The AuthContext registers a function here so any 401 logs the user out.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// Same shape as the backend error JSON: { error: { code, message, details } }
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request(path, { method = 'GET', body, query } = {}) {
  const token = getToken();

  try {
    if (USE_MOCKS) {
      try {
        return await mockRequest({ method, path, body, query, token });
      } catch (e) {
        // Turn the mock's error into the same ApiError the real backend would produce.
        if (e.isMock) throw new ApiError(e.status, e.code, e.message);
        throw e;
      }
    }

    const url = new URL(API_URL + path);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Is the backend running?');
    }

    if (res.status === 204) return null;
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const e = json && json.error ? json.error : {};
      throw new ApiError(res.status, e.code || 'SERVER_ERROR', e.message || `Request failed (${res.status})`, e.details);
    }
    return json;
  } catch (err) {
    // A 401 on a request that carried a token means the token expired or is invalid.
    if (err instanceof ApiError && err.status === 401 && token && path !== '/auth/login') onUnauthorized();
    throw err;
  }
}

import { request } from './client.js';

export const login = (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }).then((r) => r.data);
export const getMyShifts = () => request('/me/shifts').then((r) => r.data);
export const getShiftRoute = (shiftId) => request(`/shifts/${shiftId}/route`).then((r) => r.data);
export const getShiftRounds = (shiftId) => request(`/shifts/${shiftId}/rounds`).then((r) => r.data);

// Used by the sync step. client_event_id / client_scan_id make a resend harmless.
export const checkIn = (body) => request('/attendance/check-in', { method: 'POST', body }).then((r) => r.data);
export const checkOut = (body) => request('/attendance/check-out', { method: 'POST', body }).then((r) => r.data);
export const scansBatch = (scans) => request('/scans/batch', { method: 'POST', body: { scans } }).then((r) => r.data.results);

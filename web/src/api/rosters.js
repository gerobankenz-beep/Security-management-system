import { request } from './client';

export const listRosters = (params) => request('/rosters', { query: params });
export const getRoster = (id) => request(`/rosters/${id}`);
export const createRoster = (body) => request('/rosters', { method: 'POST', body });
export const addShift = (id, body) => request(`/rosters/${id}/shifts`, { method: 'POST', body });
export const removeShift = (id, shiftId) => request(`/rosters/${id}/shifts/${shiftId}`, { method: 'DELETE' });
export const validateRoster = (id) => request(`/rosters/${id}/validate`);
export const publishRoster = (id) => request(`/rosters/${id}/publish`, { method: 'POST' });
export const unpublishRoster = (id) => request(`/rosters/${id}/unpublish`, { method: 'POST' });

import { request } from './client';

export const listGuards = (params) => request('/guards', { query: params });
export const getGuard = (id) => request(`/guards/${id}`);
export const createGuard = (body) => request('/guards', { method: 'POST', body });
export const updateGuard = (id, body) => request(`/guards/${id}`, { method: 'PATCH', body });
export const deactivateGuard = (id) => request(`/guards/${id}/deactivate`, { method: 'POST' });
export const reactivateGuard = (id) => request(`/guards/${id}/reactivate`, { method: 'POST' });
export const setGuardSites = (id, siteIds) => request(`/guards/${id}/sites`, { method: 'PUT', body: { site_ids: siteIds } });
export const resetPassword = (userId) => request(`/users/${userId}/reset-password`, { method: 'POST' });

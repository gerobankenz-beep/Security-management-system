import { request } from './client';

export const listSites = (params) => request('/sites', { query: params });
export const getSite = (id) => request(`/sites/${id}`);
export const createSite = (body) => request('/sites', { method: 'POST', body });
export const updateSite = (id, body) => request(`/sites/${id}`, { method: 'PATCH', body });
export const setSiteSupervisors = (id, userIds) => request(`/sites/${id}/supervisors`, { method: 'PUT', body: { user_ids: userIds } });
export const listSiteSupervisors = (id) => request(`/sites/${id}/supervisors`);
export const listSiteGuards = (id) => request(`/sites/${id}/guards`);

export const listCheckpoints = (siteId) => request(`/sites/${siteId}/checkpoints`);
export const createCheckpoint = (siteId, body) => request(`/sites/${siteId}/checkpoints`, { method: 'POST', body });
export const updateCheckpoint = (id, body) => request(`/checkpoints/${id}`, { method: 'PATCH', body });
export const getTagSheet = (siteId) => request(`/sites/${siteId}/checkpoints/tag-sheet`);

export const listRoutes = (siteId) => request(`/sites/${siteId}/routes`);
export const createRoute = (siteId, body) => request(`/sites/${siteId}/routes`, { method: 'POST', body });
export const updateRoute = (id, body) => request(`/routes/${id}`, { method: 'PATCH', body });

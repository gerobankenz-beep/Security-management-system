import { request } from './client';

export const listSites = (params) => request('/sites', { query: params });
export const getSite = (id) => request(`/sites/${id}`);

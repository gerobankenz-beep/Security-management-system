import { request } from './client';

export const listFlags = (params) => request('/flags', { query: params });
export const getFlag = (id) => request(`/flags/${id}`);
export const reviewFlag = (id, body) => request(`/flags/${id}`, { method: 'PATCH', body });

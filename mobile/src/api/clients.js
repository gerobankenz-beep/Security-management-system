import { request } from './client';

export const listClients = (params) => request('/clients', { query: params });
export const createClient = (body) => request('/clients', { method: 'POST', body });
export const updateClient = (id, body) => request(`/clients/${id}`, { method: 'PATCH', body });

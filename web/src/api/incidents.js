import { request } from './client';

export const listIncidents = (params) => request('/incidents', { query: params });
export const getIncident = (id) => request(`/incidents/${id}`);
export const updateIncident = (id, body) => request(`/incidents/${id}`, { method: 'PATCH', body });
export const getIncidentOptions = () => request('/incidents/options');

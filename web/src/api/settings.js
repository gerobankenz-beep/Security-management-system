import { request } from './client';

export const getSettings = () => request('/settings');
export const saveSettings = (body) => request('/settings', { method: 'PATCH', body });
export const listHolidays = () => request('/public-holidays');
export const createHoliday = (body) => request('/public-holidays', { method: 'POST', body });
export const deleteHoliday = (id) => request(`/public-holidays/${id}`, { method: 'DELETE' });
export const listShiftTemplates = () => request('/shift-templates');
export const createShiftTemplate = (body) => request('/shift-templates', { method: 'POST', body });

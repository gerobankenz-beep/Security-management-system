import { request } from './client';

export const listAttendance = (params) => request('/attendance', { query: params });
export const listExceptions = (params) => request('/attendance/exceptions', { query: params });
export const correctAttendance = (id, body) => request(`/attendance/${id}/corrections`, { method: 'POST', body });

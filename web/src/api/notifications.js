import { request } from './client';

export const listNotifications = (params) => request('/notifications', { query: params });
export const markNotification = (id, isRead = true) => request(`/notifications/${id}`, { method: 'PATCH', body: { is_read: isRead } });

import { request } from './client';

export const listUsers = (params) => request('/users', { query: params });
export const listAuditLogs = (params) => request('/audit-logs', { query: params });

import { request } from './client';

export const getWeeklyField = (params) => request('/reports/weekly-field', { query: params });
export const getProofOfService = (params) => request('/reports/proof-of-service', { query: params });

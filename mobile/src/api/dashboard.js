import { request } from './client';

export const getOverview = () => request('/dashboard/overview');
export const getSiteStatus = (siteId) => request(`/dashboard/sites/${siteId}/status`);
export const getCompliance = (params) => request('/reports/patrol-compliance', { query: params });
export const getProofOfService = (params) => request('/reports/proof-of-service', { query: params });

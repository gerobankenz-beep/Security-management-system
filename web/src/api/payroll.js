import { request } from './client';

export const createPayrollRun = (month) => request('/payroll/runs', { method: 'POST', body: { month } });
export const getPayrollRun = (month) => request(`/payroll/runs/${month}`);
export const recalculatePayroll = (month) => request(`/payroll/runs/${month}/recalculate`, { method: 'POST' });
export const reviewPayroll = (month) => request(`/payroll/runs/${month}/review`, { method: 'POST' });
export const finalisePayroll = (month) => request(`/payroll/runs/${month}/finalise`, { method: 'POST' });
export const unlockPayroll = (month, reason) => request(`/payroll/runs/${month}/unlock`, { method: 'POST', body: { reason } });
export const addAdjustment = (body) => request('/payroll/adjustments', { method: 'POST', body });

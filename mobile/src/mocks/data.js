// Fake data shaped exactly like the API Contract Draft. Keep this in step with the contract.
export const MOCK_PASSWORD = 'Password123!';

export const users = [
  { id: 1, full_name: 'Sam Admin', email: 'admin@example.com', phone: '+256700000010', role: 'admin', client_id: null, is_active: true },
  { id: 2, full_name: 'Olivia Manager', email: 'manager@example.com', phone: '+256700000011', role: 'ops_manager', client_id: null, is_active: true },
  { id: 3, full_name: 'Peter Supervisor', email: 'supervisor@example.com', phone: '+256700000012', role: 'supervisor', client_id: null, is_active: true },
  { id: 4, full_name: 'Amina K.', email: 'amina@example.com', phone: '+256700000013', role: 'guard', client_id: null, is_active: true },
  { id: 5, full_name: 'John M.', email: 'john@example.com', phone: '+256700000014', role: 'guard', client_id: null, is_active: true },
  { id: 6, full_name: 'Ruth N.', email: 'ruth@example.com', phone: '+256700000015', role: 'guard', client_id: null, is_active: true },
  { id: 7, full_name: 'Grace Namuli', email: 'grace@example.com', phone: '+256700000001', role: 'client', client_id: 1, is_active: true },
];

export const sites = [
  { id: 1, client_id: 1, name: 'Kololo Office Park', address: 'Plot 14, Kololo, Kampala', latitude: 0.3345, longitude: 32.5921,
    geofence_radius_m: 150, guards_required_day: 2, guards_required_night: 2, patrols_per_night: 4, is_active: true },
  { id: 2, client_id: 2, name: 'Nakasero Warehouse', address: 'Plot 3, Nakasero, Kampala', latitude: 0.3190, longitude: 32.5810,
    geofence_radius_m: 200, guards_required_day: 1, guards_required_night: 2, patrols_per_night: 3, is_active: true },
];

export const auditLogs = [
  { id: 3, user_id: 2, action: 'UPDATE', entity_type: 'roster', entity_id: 14, details: null, created_at: '2026-10-20T08:12:00Z' },
  { id: 2, user_id: 1, action: 'CREATE', entity_type: 'user', entity_id: 6, details: { role: 'guard' }, created_at: '2026-10-19T14:03:00Z' },
  { id: 1, user_id: 1, action: 'LOGIN', entity_type: 'user', entity_id: 1, details: null, created_at: '2026-10-19T14:00:00Z' },
];

// NOTE: the contract does not fix the exact shape of /dashboard/overview yet.
// The Task 9 and backend owners must agree on it, then update the contract and this mock.
export const overview = {
  date: '2026-10-20',
  guards_on_duty: 3, guards_required: 4,
  rounds_expected: 7, rounds_complete: 4, rounds_missed: 1, open_flags: 2,
  sites: [
    { site_id: 1, name: 'Kololo Office Park', guards_on_duty: 2, guards_required: 2, rounds_expected: 4, rounds_complete: 3, rounds_missed: 0, open_flags: 1 },
    { site_id: 2, name: 'Nakasero Warehouse', guards_on_duty: 1, guards_required: 2, rounds_expected: 3, rounds_complete: 1, rounds_missed: 1, open_flags: 1 },
  ],
};

export const siteStatus = {
  site_id: 1, name: 'Kololo Office Park', guards_on_duty: 2, guards_required: 2,
  rounds_expected_today: 4, rounds_complete: 3, rounds_missed: 0, open_flags: 1,
  current_guards: [
    { guard_id: 4, full_name: 'Amina K.', checked_in_at: '2026-10-20T14:58:12Z' },
    { guard_id: 5, full_name: 'John M.', checked_in_at: '2026-10-20T15:03:40Z' },
  ],
};

export const compliance = {
  site_id: 1, from: '2026-10-14', to: '2026-10-20',
  days: [
    { date: '2026-10-19', expected_rounds: 4, complete: 3, missed: 1, flagged: 0, compliance_pct: 75.0 },
    { date: '2026-10-20', expected_rounds: 4, complete: 3, missed: 0, flagged: 1, compliance_pct: 75.0 },
  ],
  totals: { expected_rounds: 28, complete: 24, compliance_pct: 85.7 },
};

export const flags = [
  { id: 77, rule: 'TOO_FAST', severity: 'high', status: 'open', round_id: 540, shift_id: 88, guard_id: 4, site_id: 1,
    details: { seconds_apart: 4, minimum_seconds: 60 }, created_at: '2026-10-20T17:20:03Z' },
  { id: 78, rule: 'MISSED_CHECKPOINT', severity: 'medium', status: 'open', round_id: 552, shift_id: 91, guard_id: 5, site_id: 2,
    details: { checkpoint: 'Roof access' }, created_at: '2026-10-20T19:50:00Z' },
];

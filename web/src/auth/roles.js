// Which roles may see which screens. The menu and the route guard both read this one list.
// REMEMBER: hiding a menu item is only for convenience. The backend must still check the role.
export const ROLES = {
  admin: 'Admin',
  ops_manager: 'Operations Manager',
  supervisor: 'Site Supervisor',
  guard: 'Guard',
  client: 'Client',
};

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', roles: ['admin', 'ops_manager', 'supervisor'] },
  { to: '/sites', label: 'Sites', roles: ['admin', 'ops_manager', 'supervisor', 'client'] },
  { to: '/rosters', label: 'Rosters', roles: ['admin', 'ops_manager', 'supervisor'] },
  { to: '/attendance', label: 'Attendance', roles: ['admin', 'ops_manager', 'supervisor'] },
  { to: '/flags', label: 'Patrol flags', roles: ['admin', 'ops_manager', 'supervisor'] },
  { to: '/incidents', label: 'Incidents', roles: ['admin', 'ops_manager', 'supervisor'] },
  { to: '/reports', label: 'Reports', roles: ['admin', 'ops_manager', 'supervisor', 'client'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
  { to: '/audit-logs', label: 'Audit log', roles: ['admin'] },
];

// Where each role lands after logging in
export const homeFor = (role) => (role === 'client' ? '/reports' : role === 'guard' ? '/mobile-only' : '/');

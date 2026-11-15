import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Building2, ShieldCheck, Briefcase, CalendarDays, ClipboardCheck, Flag,
  TriangleAlert, ChartColumn, Wallet, Users, ScrollText, Settings, LogOut, Circle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS, ROLES } from '../auth/roles';
import { USE_MOCKS } from '../api/client';
import { APP_NAME } from '../brand';
import Logo from '../components/Logo';
import OfflineBanner from '../components/OfflineBanner';
import NotificationBell from '../components/NotificationBell';

// Menu icons, matched by route so roles.js stays a plain list.
const ICONS = {
  '/': LayoutDashboard, '/sites': Building2, '/guards': ShieldCheck, '/clients': Briefcase, '/rosters': CalendarDays,
  '/attendance': ClipboardCheck, '/flags': Flag, '/incidents': TriangleAlert, '/reports': ChartColumn,
  '/payroll': Wallet, '/users': Users, '/audit-logs': ScrollText, '/settings': Settings,
};

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Kampala' });

export default function Layout() {
  const { user, logout } = useAuth();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <div className="brand-name"><span>The Nova</span>{' '}<span>Protective Systems</span></div>
        </div>
        <nav aria-label="Main">
          {items.map((item) => {
            const Icon = ICONS[item.to] || Circle;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Icon className="icon" size={19} strokeWidth={1.9} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="muted small" title={APP_NAME}>
            {USE_MOCKS ? <span className="badge badge-warn">Mock data</span> : today()}
          </div>
          <div className="user-box">
            <NotificationBell />
            <span className="avatar" aria-hidden="true">{initials(user.full_name)}</span>
            <span className="user-meta">
              <span className="user-name">{user.full_name}</span>
              <span className="user-role">{ROLES[user.role] || user.role}</span>
            </span>
            <button className="btn" onClick={logout}><LogOut size={16} aria-hidden="true" />Log out</button>
          </div>
        </header>
        <OfflineBanner />
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}

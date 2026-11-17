import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building2, ShieldCheck, Briefcase, CalendarDays, ClipboardCheck, Flag,
  TriangleAlert, ChartColumn, Wallet, Users, ScrollText, Settings, LogOut, Circle, Menu, X, ChevronRight,
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

// How the menu is grouped. roles.js still decides who sees what; this only decides where an item sits.
const GROUPS = [
  { label: 'Overview', tone: 'blue', paths: ['/'] },
  { label: 'Operations', tone: 'teal', paths: ['/rosters', '/attendance', '/flags', '/incidents', '/sites'] },
  { label: 'People', tone: 'violet', paths: ['/guards', '/clients', '/users'] },
  { label: 'Insights and pay', tone: 'amber', paths: ['/reports', '/payroll'] },
  { label: 'Administration', tone: 'slate', paths: ['/audit-logs', '/settings'] },
];

const isCurrent = (item, pathname) => (item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`));

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const known = GROUPS.flatMap((g) => g.paths);
  const groups = [
    ...GROUPS.map((g) => ({ label: g.label, tone: g.tone, items: items.filter((i) => g.paths.includes(i.to)) })),
    { label: 'More', tone: 'slate', items: items.filter((i) => !known.includes(i.to)) },
  ].filter((g) => g.items.length > 0);
  const current = items.filter((i) => isCurrent(i, pathname)).sort((a, b) => b.to.length - a.to.length)[0];
  const currentGroup = current && GROUPS.find((g) => g.paths.includes(current.to));

  // The menu is a drawer on small screens: close it after navigating or on Escape.
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className={menuOpen ? 'shell menu-open' : 'shell'}>
      {menuOpen && <button type="button" className="scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <aside className="sidebar" id="app-sidebar">
        <div className="brand">
          <Logo />
          <div className="brand-name"><span>The Nova</span><span>Protective Systems</span></div>
          <button type="button" className="icon-btn drawer-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Main">
          {groups.map((group) => (
            <div className="nav-group" key={group.label} data-tone={group.tone}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = ICONS[item.to] || Circle;
                return (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                    <Icon className="icon" size={18} strokeWidth={1.9} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={USE_MOCKS ? 'status-dot is-sample' : 'status-dot'} aria-hidden="true" />
          <span><strong>{USE_MOCKS ? 'Mock data' : 'Live system'}</strong><small>{USE_MOCKS ? 'Sample records only' : 'Connected to the backend'}</small></span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="app-sidebar" onClick={() => setMenuOpen(true)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="crumbs" title={APP_NAME}>
            {currentGroup && <><span className="crumb-parent">{currentGroup.label}</span><ChevronRight size={14} aria-hidden="true" /></>}
            <span className="crumb-current">{current ? current.label : APP_NAME}</span>
          </div>
          <span className="topbar-date">{today()}</span>
          <div className="user-box">
            <NotificationBell />
            <span className="user-chip">
              <span className="avatar" aria-hidden="true">{initials(user.full_name)}</span>
              <span className="user-meta">
                <span className="user-name">{user.full_name}</span>
                <span className="user-role">{ROLES[user.role] || user.role}</span>
              </span>
            </span>
            <button type="button" className="btn logout-btn" aria-label="Log out" onClick={logout}><LogOut size={16} aria-hidden="true" /><span>Log out</span></button>
          </div>
        </header>
        <OfflineBanner />
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}

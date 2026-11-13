import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NAV_ITEMS, ROLES } from '../auth/roles';
import { USE_MOCKS } from '../api/client';
import OfflineBanner from '../components/OfflineBanner';
import NotificationBell from '../components/NotificationBell';

export default function Layout() {
  const { user, logout } = useAuth();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Patrol System</div>
        <nav aria-label="Main">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>{USE_MOCKS && <span className="badge badge-warn">Mock data</span>}</div>
          <div className="user-box">
            <NotificationBell />
            <span>{user.full_name}</span>
            <span className="badge">{ROLES[user.role] || user.role}</span>
            <button className="btn" onClick={logout}>Log out</button>
          </div>
        </header>
        <OfflineBanner />
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}

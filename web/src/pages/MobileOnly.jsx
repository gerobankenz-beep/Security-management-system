import { Smartphone, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';

export default function MobileOnly() {
  const { logout } = useAuth();
  return (
    <div className="login-page">
      <div className="login-card">
        <Logo />
        <h1>Please use the mobile app</h1>
        <p className="muted">
          <Smartphone size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
          Guards check in, scan checkpoints and report incidents in the guard mobile app.
        </p>
        <button className="btn" onClick={logout}><LogOut size={16} aria-hidden="true" />Log out</button>
      </div>
    </div>
  );
}

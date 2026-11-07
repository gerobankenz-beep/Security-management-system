import { useAuth } from '../auth/AuthContext';

export default function MobileOnly() {
  const { logout } = useAuth();
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Please use the mobile app</h1>
        <p className="muted">Guards check in, scan checkpoints and report incidents in the guard mobile app.</p>
        <button className="btn" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}

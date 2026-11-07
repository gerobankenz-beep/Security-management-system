import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeFor } from '../auth/roles';
import { USE_MOCKS } from '../api/client';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    setError(null);
    setBusy(true);
    try {
      const loggedIn = await login(email, password);
      const from = location.state && location.state.from;
      navigate(from && from !== '/login' ? from : homeFor(loggedIn.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Patrol System</h1>
        <p className="muted">Guard rostering and patrol verification</p>

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />

        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />

        {error && <div className="error-box" role="alert">{error.message}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>

        {USE_MOCKS && (
          <p className="muted small">
            Mock mode. Try admin@example.com, manager@example.com, supervisor@example.com or grace@example.com
            (client) with password Password123!
          </p>
        )}
      </form>
    </div>
  );
}

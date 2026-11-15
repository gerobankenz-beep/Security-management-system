import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, CalendarCheck, MapPinCheck, BellRing, LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { homeFor } from '../auth/roles';
import { USE_MOCKS } from '../api/client';
import { APP_NAME, APP_TAGLINE } from '../brand';
import Logo from '../components/Logo';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="login-split">
      <section className="login-brand" aria-label={APP_NAME}>
        <Logo className="login-watermark" />
        <div className="login-logo">
          <Logo />
        </div>
        <div className="login-hero">
          <h1>{APP_NAME}</h1>
          <p>{APP_TAGLINE}. Know who is on duty, and know every round was walked.</p>
          <ul className="login-points">
            <li><span className="pt-icon"><CalendarCheck size={19} aria-hidden="true" /></span>Rosters that follow rest and coverage rules</li>
            <li><span className="pt-icon"><MapPinCheck size={19} aria-hidden="true" /></span>Checkpoint scans that prove patrols were walked</li>
            <li><span className="pt-icon"><BellRing size={19} aria-hidden="true" /></span>Alerts for no-shows and missed rounds</li>
          </ul>
        </div>
        <div className="login-foot">&copy; {new Date().getFullYear()} {APP_NAME}</div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to your account to continue.</p>

          <label htmlFor="email">Email</label>
          <div className="input-icon">
            <Mail size={17} aria-hidden="true" />
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@company.com" required />
          </div>

          <label htmlFor="password">Password</label>
          <div className="input-icon">
            <Lock size={17} aria-hidden="true" />
            <input id="password" className="has-peek" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button type="button" className="peek" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              <span className="sr-only">{showPassword ? 'Hide' : 'Show'}</span>
            </button>
          </div>

          {error && <div className="error-box" role="alert">{error.message}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            <LogIn size={17} aria-hidden="true" />{busy ? 'Signing in...' : 'Sign in'}
          </button>

          {USE_MOCKS && (
            <p className="muted small">
              Mock mode. Try admin@example.com, manager@example.com, supervisor@example.com or grace@example.com
              (client) with password Password123!
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

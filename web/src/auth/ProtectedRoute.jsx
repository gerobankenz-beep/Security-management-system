import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Loading from '../components/Loading';
import Forbidden from '../pages/Forbidden';

// Wrap a page with <ProtectedRoute roles={[...]}> to require login (and optionally certain roles).
export default function ProtectedRoute({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Forbidden />;
  return children;
}

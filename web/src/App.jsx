// All the screens and who may open them. Add a <Route> here when you add a page.
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { homeFor } from './auth/roles';
import ProtectedRoute from './auth/ProtectedRoute';
import Layout from './layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sites from './pages/Sites';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import MobileOnly from './pages/MobileOnly';
import NotFound from './pages/NotFound';
import { Attendance, Flags, Incidents, Reports, Rosters } from './pages/Placeholders';

const STAFF = ['admin', 'ops_manager', 'supervisor'];

// "/" shows the dashboard to staff; clients and guards are sent to their own start page.
function Home() {
  const { user } = useAuth();
  return STAFF.includes(user.role) ? <Dashboard /> : <Navigate to={homeFor(user.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/mobile-only" element={<ProtectedRoute roles={['guard']}><MobileOnly /></ProtectedRoute>} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/sites" element={<ProtectedRoute roles={[...STAFF, 'client']}><Sites /></ProtectedRoute>} />
        <Route path="/rosters" element={<ProtectedRoute roles={STAFF}><Rosters /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute roles={STAFF}><Attendance /></ProtectedRoute>} />
        <Route path="/flags" element={<ProtectedRoute roles={STAFF}><Flags /></ProtectedRoute>} />
        <Route path="/incidents" element={<ProtectedRoute roles={STAFF}><Incidents /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={[...STAFF, 'client']}><Reports /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute roles={['admin']}><Users /></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute roles={['admin']}><AuditLogs /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

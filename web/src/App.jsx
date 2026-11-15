// All the screens and who may open them. Add a <Route> here when you add a page.
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { homeFor } from './auth/roles';
import ProtectedRoute from './auth/ProtectedRoute';
import Layout from './layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sites from './pages/Sites';
import SiteForm from './pages/SiteForm';
import SiteDetail from './pages/SiteDetail';
import PrintQr from './pages/PrintQr';
import Guards from './pages/Guards';
import GuardForm from './pages/GuardForm';
import Clients from './pages/Clients';
import Settings from './pages/Settings';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import MobileOnly from './pages/MobileOnly';
import NotFound from './pages/NotFound';
import Rosters from './pages/Rosters';
import RosterBuilder from './pages/RosterBuilder';
import Attendance from './pages/Attendance';
import Flags from './pages/Flags';
import { Incidents } from './pages/Placeholders';
import Reports from './pages/Reports';
import Payroll from './pages/Payroll';

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
        <Route path="/sites/new" element={<ProtectedRoute roles={['admin']}><SiteForm /></ProtectedRoute>} />
        <Route path="/sites/:id" element={<ProtectedRoute roles={[...STAFF, 'client']}><SiteDetail /></ProtectedRoute>} />
        <Route path="/sites/:id/edit" element={<ProtectedRoute roles={['admin']}><SiteForm /></ProtectedRoute>} />
        <Route path="/sites/:id/qr" element={<ProtectedRoute roles={['admin', 'ops_manager']}><PrintQr /></ProtectedRoute>} />
        <Route path="/guards" element={<ProtectedRoute roles={['admin']}><Guards /></ProtectedRoute>} />
        <Route path="/guards/new" element={<ProtectedRoute roles={['admin']}><GuardForm /></ProtectedRoute>} />
        <Route path="/guards/:id" element={<ProtectedRoute roles={['admin']}><GuardForm /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute roles={['admin']}><Clients /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={['admin']}><Settings /></ProtectedRoute>} />
        <Route path="/rosters" element={<ProtectedRoute roles={STAFF}><Rosters /></ProtectedRoute>} />
        <Route path="/rosters/:id" element={<ProtectedRoute roles={STAFF}><RosterBuilder /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute roles={STAFF}><Attendance /></ProtectedRoute>} />
        <Route path="/flags" element={<ProtectedRoute roles={STAFF}><Flags /></ProtectedRoute>} />
        <Route path="/incidents" element={<ProtectedRoute roles={STAFF}><Incidents /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={[...STAFF, 'client']}><Reports /></ProtectedRoute>} />
        <Route path="/payroll" element={<ProtectedRoute roles={['admin']}><Payroll /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute roles={['admin']}><Users /></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute roles={['admin']}><AuditLogs /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

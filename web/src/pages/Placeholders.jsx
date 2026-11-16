// One placeholder per unbuilt screen. When you build yours, create its own file
// (for example src/pages/Incidents.jsx) and change the import in App.jsx.
import ComingSoon from '../components/ComingSoon';

export const Reports = () => (
  <ComingSoon title="Reports" task="Task 9"
    endpoints={['GET /reports/patrol-compliance', 'GET /reports/proof-of-service']}
    notes="Clients land here after login and should see only proof of service for their own sites. Mocks for compliance data already exist." />
);

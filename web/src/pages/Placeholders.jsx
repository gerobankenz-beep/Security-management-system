// One placeholder per unbuilt screen. When you build yours, create its own file
// (for example src/pages/Rosters.jsx) and change the import in App.jsx.
import ComingSoon from '../components/ComingSoon';

export const Rosters = () => (
  <ComingSoon title="Rosters" task="Tasks 5 and 9 (roster builder screen)"
    endpoints={['GET /rosters', 'GET /rosters/{id}', 'POST /rosters/{id}/shifts', 'GET /rosters/{id}/validate', 'POST /rosters/{id}/publish']} />
);

export const Attendance = () => (
  <ComingSoon title="Attendance" task="Task 6"
    endpoints={['GET /attendance', 'GET /attendance/exceptions']} />
);

export const Flags = () => (
  <ComingSoon title="Patrol flags" task="Tasks 8 and 9"
    endpoints={['GET /flags', 'GET /flags/{id}', 'PATCH /flags/{id}']}
    notes="A mock for GET /flags already exists in src/mocks." />
);

export const Incidents = () => (
  <ComingSoon title="Incidents" task="Task 10"
    endpoints={['GET /incidents', 'GET /incidents/{id}', 'PATCH /incidents/{id}']} />
);

export const Reports = () => (
  <ComingSoon title="Reports" task="Task 9"
    endpoints={['GET /reports/patrol-compliance', 'GET /reports/proof-of-service']}
    notes="Clients land here after login and should see only proof of service for their own sites. Mocks for compliance data already exist." />
);

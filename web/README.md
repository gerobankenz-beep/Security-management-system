# Web dashboard (React + Vite)

The shell for the manager, supervisor, admin and client web app. It already has:

- Login, logout, and a saved session (the token is kept in the browser's localStorage)
- A menu that changes with the user's role, and pages protected by role
- One API layer (`src/api/client.js`) with a **mock mode**, so you can build screens before the backend endpoints exist
- Working screens: Dashboard (mock until the backend builds it), Sites, Users, Audit log, and the admin screens:
  **Guards** (add, edit, search, deactivate, reset password, assign sites), **Clients**, **Sites** (add, edit, detail with
  checkpoints, routes and people, **printable QR sheet**) and **Settings** (company rules, public holidays, shift templates).
- Offline behaviour: an offline banner appears when the connection drops, and lists without pay data (sites, clients,
  checkpoints, routes) show their last saved copy. Guards and pay data are never saved in the browser. Saved data is cleared on log out.
- The remaining screens (Rosters, Attendance, Flags, Incidents, Reports) are placeholders that list the endpoints to build.

## Run it

```
npm install
cp .env.example .env     # on Windows: copy .env.example .env
npm run dev              # opens at http://localhost:5173
```

`.env` has two settings:

| Setting | Meaning |
|---|---|
| `VITE_USE_MOCKS=true` | Use fake data from `src/mocks`. Works with no backend. This is the default. |
| `VITE_USE_MOCKS=false` | Call the real backend at `VITE_API_URL` (default `http://localhost:4000/api/v1`). |

Restart `npm run dev` after changing `.env`.

Log in with `admin@example.com`, `manager@example.com`, `supervisor@example.com`, `grace@example.com` (client)
or `amina@example.com` (guard). Password: `Password123!`. These match the seed data in the database.

In real mode the Dashboard shows "Not built yet" until the backend owner finishes `GET /dashboard/overview`. That is expected.

## Tests

```
npm test            # screens and login flow, uses mock data
npm run test:live   # checks the API layer against the REAL backend (start the backend first)
```

## Folder guide

```
src/
  main.jsx, App.jsx    the app and its list of routes
  api/                 client.js (all network calls), one file per module (auth, users, sites, dashboard)
  mocks/               data.js (fake data), index.js (fake backend)
  auth/                AuthContext (who is logged in), ProtectedRoute, roles.js (menu + role names)
  layout/              Layout.jsx (sidebar and top bar)
  components/          DataTable, Pagination, StatCard, PageHeader, ErrorBox, Loading, ComingSoon
  hooks/useApi.js      loads data for a screen
  pages/               one file per screen
  test/                tests
```

## How to build a new screen (the pattern)

1. **API function.** Add it in `src/api/<module>.js`, for example `export const listIncidents = (p) => request('/incidents', { query: p });`
2. **Mock.** Add fake data to `src/mocks/data.js` and a route in `src/mocks/index.js`, shaped exactly like the API contract.
3. **Screen.** Create `src/pages/Incidents.jsx`. Copy `Sites.jsx`: it uses `useApi`, `DataTable`, `Pagination`, `ErrorBox`.
4. **Route.** In `App.jsx`, replace the placeholder import with your page. If you add a new page, add a `<Route>` and, if needed, a line in `NAV_ITEMS` in `auth/roles.js`.
5. **Test.** Add a test in `src/test/`.

Rules: never call `fetch` in a page (use `src/api`), never edit another owner's page without telling them, and keep mocks in step with the API contract.

## Who builds what

| Screens | Owner |
|---|---|
| Shell, Dashboard, Reports, roster builder screen | Task 9 |
| Sites and checkpoints pages | Task 4 |
| Attendance page | Task 6 |
| Flags page | Task 8 (with Task 9) |
| Incidents page | Task 10 |

Agree this split on Day 1.

## Things to know

- **Hiding a menu item is not security.** The backend checks the role on every request. The menu only makes the app tidy.
- **Token storage:** the token sits in localStorage, which is fine for coursework. A real product would use httpOnly cookies, because any script injected into the page can read localStorage.
- **Guards** use the mobile app. If a guard logs in here, they see a "please use the mobile app" page.
- **Unfinished contract detail:** the API contract does not yet fix the exact JSON shape of `GET /dashboard/overview`. The mock in `src/mocks/data.js` is a proposal. The Task 9 and backend owners must agree on the final shape and update the contract.
- **Clients** land on Reports. The Reports screen must show only that client's own sites (the backend enforces this; the screen should not assume it).

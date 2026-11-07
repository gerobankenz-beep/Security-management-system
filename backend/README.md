# Backend (Node.js + Express + PostgreSQL)

This is the starting point for the API described in the API Contract Draft.
It already works: login, current user, user management, audit log, and a worked example of
role-scoped data (`GET /sites`). Every other endpoint exists as a stub that answers `501 NOT_IMPLEMENTED`,
so each task owner can see exactly what to build.

## Run it

1. Install Node.js 20+ and PostgreSQL 14+.
2. Create the database and load the schema and sample data (see the Database and Repository Guide):
   ```
   psql -U postgres -c "CREATE DATABASE patrol_dev;"
   psql -U postgres -d patrol_dev -f ../database/schema.sql
   psql -U postgres -d patrol_dev -f ../database/seed.sql
   ```
3. Copy `.env.example` to `.env` and put your real database password in `DATABASE_URL`.
4. Install and prepare:
   ```
   npm install
   npm run set-passwords     # gives every sample user the password Password123!
   npm run dev               # starts the API with auto-restart
   ```
5. Check it: open http://localhost:4000/api/v1/health
6. Run the tests: `npm test`

## Try it in Postman

1. `POST http://localhost:4000/api/v1/auth/login` with body
   `{ "email": "admin@example.com", "password": "Password123!" }`
2. Copy the `token` from the response.
3. Call `GET http://localhost:4000/api/v1/users` with header `Authorization: Bearer <token>`.

Sample logins (password `Password123!`): admin@example.com, manager@example.com, supervisor@example.com,
amina@example.com (guard), john@example.com (guard), grace@example.com (client).

## How the code is organised

```
src/
  server.js            starts the server
  app.js               builds the Express app (middleware, routes, error handler)
  config/              env.js (settings), db.js (PostgreSQL pool)
  middleware/          auth.js (who are you), requireRole.js (are you allowed), validate.js, errorHandler.js
  utils/               errors, response shapes, pagination, geo (distance), audit log, stub helper
  modules/             one folder per task, each with routes.js (add controller/service files as it grows)
  jobs/                scheduled background tasks
tests/                 node:test integration and unit tests
scripts/               set-passwords.js (development only)
```

## Who builds what

| Folder | Task |
|---|---|
| modules/auth | 3 (done: login, users, audit log) |
| modules/sites | 4 (GET /sites done as an example) |
| modules/roster | 5 |
| modules/attendance | 6 |
| modules/patrol | 7 |
| modules/anomaly | 8 |
| modules/dashboard | 9 |
| modules/incidents | 10 |

## How to add an endpoint (the pattern)

1. Find its stub in your module's `routes.js`.
2. Replace the `stub(...)` line with a real route:
   ```js
   router.post('/clients', authenticate, requireRole('admin'),
     validateBody({ name: { type: 'string', required: true } }),
     asyncHandler(async (req, res) => created(res, await clientsService.create(req.body))));
   ```
3. Put the SQL and logic in a `*.service.js` file next to it. Use `$1, $2` placeholders, never string joining.
4. Return data with `ok`, `created` or `list` from `utils/response.js`; throw errors from `utils/errors.js`.
5. Add a test in `tests/`, and update the contract first if you changed any field.

## Rules everyone follows

- Match the API Contract exactly (paths, field names, status codes, error shape).
- Check the role on the server with `requireRole`. Scope data by user (see `GET /sites`).
- Never return `password_hash`. Never commit `.env`.

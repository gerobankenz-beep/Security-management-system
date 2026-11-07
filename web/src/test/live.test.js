// OPTIONAL: checks the web API layer against the REAL backend.
// Start the backend first (port 4000, seeded database, `npm run set-passwords` done), then:  npm run test:live
import { describe, expect, it } from 'vitest';
import { request, USE_MOCKS, setToken } from '../api/client';

describe.skipIf(USE_MOCKS)('real backend', () => {
  it('logs in, reads /auth/me and lists users and sites', async () => {
    const login = await request('/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'Password123!' } });
    expect(login.data.user.role).toBe('admin');
    setToken(login.data.token);
    expect((await request('/auth/me')).data.role).toBe('admin');
    const users = await request('/users', { query: { page: 1, per_page: 3 } });
    expect(users.data).toHaveLength(3);
    expect(users.meta.total).toBeGreaterThanOrEqual(7);
    const sites = await request('/sites');
    expect(sites.data[0]).toHaveProperty('geofence_radius_m');
  });

  it('turns backend errors into ApiError and reports unbuilt endpoints as 501', async () => {
    await expect(request('/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'bad-password' } }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    const login = await request('/auth/login', { method: 'POST', body: { email: 'manager@example.com', password: 'Password123!' } });
    setToken(login.data.token);
    await expect(request('/dashboard/overview')).rejects.toMatchObject({ status: 501, code: 'NOT_IMPLEMENTED' });
  });
});

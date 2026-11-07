// OPTIONAL: checks the web API layer against the REAL backend.
// Start the backend first (port 4000, seeded database with 002_admin_payroll.sql applied, `npm run set-passwords` done), then:  npm run test:live
import { describe, expect, it } from 'vitest';
import { request, USE_MOCKS, setToken } from '../api/client';
import * as guards from '../api/guards';
import * as sites from '../api/sites';
import * as clients from '../api/clients';
import * as settings from '../api/settings';

const stamp = Date.now();
const as = async (email) => { const r = await request('/auth/login', { method: 'POST', body: { email, password: 'Password123!' } }); setToken(r.data.token); return r.data.user; };

describe.skipIf(USE_MOCKS)('real backend', () => {
  it('logs in, reads /auth/me and lists users and sites', async () => {
    const user = await as('admin@example.com');
    expect(user.role).toBe('admin');
    expect((await request('/auth/me')).data.role).toBe('admin');
    expect((await request('/users', { query: { page: 1, per_page: 3 } })).data).toHaveLength(3);
    expect((await sites.listSites()).data[0]).toHaveProperty('geofence_radius_m');
  });

  it('turns backend errors into ApiError and reports unbuilt endpoints as 501', async () => {
    await expect(request('/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'bad-password' } }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    await as('manager@example.com');
    await expect(request('/dashboard/overview')).rejects.toMatchObject({ status: 501, code: 'NOT_IMPLEMENTED' });
  });

  it('admin flow through the same functions the screens use: guard, client, site, checkpoints, route, QR sheet', async () => {
    await as('admin@example.com');
    const g = (await guards.createGuard({ full_name: 'Live Guard', email: `live.${stamp}@example.com`, hourly_rate_ugx: 5000, night_allowance_ugx: 3000 })).data;
    expect(g.temporary_password).toBeTruthy();
    expect(g.password_hash).toBeUndefined();
    await expect(guards.createGuard({ full_name: 'Dup', email: `live.${stamp}@example.com`, hourly_rate_ugx: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(guards.createGuard({ phone: '1' })).rejects.toMatchObject({ status: 400, details: expect.arrayContaining([expect.objectContaining({ field: 'full_name' })]) });
    expect((await guards.listGuards({ search: 'Live Guard' })).data.some((x) => x.id === g.id)).toBe(true);
    expect((await guards.deactivateGuard(g.id)).data.is_active).toBe(false);
    expect((await guards.reactivateGuard(g.id)).data.is_active).toBe(true);
    expect((await guards.resetPassword(g.id)).data.temporary_password).toBeTruthy();

    const c = (await clients.createClient({ name: `Live Client ${stamp}` })).data;
    const s = (await sites.createSite({ client_id: c.id, name: `Live Site ${stamp}`, latitude: 0.31, longitude: 32.58 })).data;
    await expect(sites.createSite({ client_id: c.id, name: 'Bad', latitude: 95, longitude: 0 })).rejects.toMatchObject({ status: 400 });
    const cps = [];
    for (const n of ['A', 'B', 'C']) cps.push((await sites.createCheckpoint(s.id, { name: n, latitude: 0.31, longitude: 32.58 })).data);
    const route = (await sites.createRoute(s.id, { name: 'Walk', checkpoint_sequence: [cps[1].id, cps[0].id, cps[2].id], round_start_times: ['20:00', '22:00'] })).data;
    expect(route.checkpoints.map((x) => x.name)).toEqual(['B', 'A', 'C']);
    expect(route.round_start_times).toEqual(['20:00', '22:00']);
    expect((await sites.listRoutes(s.id)).data).toHaveLength(1);
    const sheet = (await sites.getTagSheet(s.id)).data;
    expect(sheet.checkpoints).toHaveLength(3);
    expect(sheet.checkpoints[0].qr_data_url.startsWith('data:image/png;base64,')).toBe(true);
    expect((await guards.setGuardSites(g.id, [s.id])).data.site_ids).toEqual([s.id]);
    expect((await sites.listSiteGuards(s.id)).data.map((x) => x.id)).toContain(g.id);
    expect((await sites.listSiteSupervisors(s.id)).data).toEqual([]);
  });

  it('settings, holidays and shift templates round-trip', async () => {
    await as('admin@example.com');
    expect((await settings.saveSettings({ late_checkin_minutes: 11 })).data.late_checkin_minutes).toBe(11);
    await settings.saveSettings({ late_checkin_minutes: 10 });
    await expect(settings.saveSettings({ overtime_multiplier: 0.5 })).rejects.toMatchObject({ status: 400 });
    const date = `2032-0${(stamp % 9) + 1}-2${stamp % 8}`;
    const h = (await settings.createHoliday({ holiday_date: date, name: 'Live holiday' })).data;
    expect((await settings.listHolidays()).data.some((x) => x.id === h.id)).toBe(true);
    await settings.deleteHoliday(h.id);
    expect((await settings.listShiftTemplates()).data.find((t) => t.name === 'Night').is_night).toBe(true);
  });
});

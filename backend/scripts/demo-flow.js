// Creates a small LIVE demo through the real API, so the dashboard and flags have something to show:
//   a client and site with 4 checkpoints and a route, 4 guards, a published roster for right now,
//   check-ins, one clean patrol, one patrol scanned far too fast (raises flags), one guard who never arrives.
// Needs the backend running (npm run dev) and the seeded database.      Run:  npm run demo:flow
const crypto = require('crypto');
const BASE = process.env.API_URL || 'http://localhost:4000/api/v1';
const MIN = 60000;
const stamp = String(Date.now()).slice(-6);
const hhmm = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(11, 16);
const dayOf = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
const mondayOf = (date) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json && json.error)}`);
  return json && json.data;
}
const login = async (email, password = 'Password123!') => (await call('POST', '/auth/login', null, { email, password })).token;
const say = (msg) => console.log(`  ${msg}`);

(async () => {
  console.log(`Building the demo against ${BASE}`);
  const admin = await login('admin@example.com'); const manager = await login('manager@example.com');
  const now = new Date();

  const client = await call('POST', '/clients', admin, { name: `Demo Client ${stamp}` });
  const site = await call('POST', '/sites', admin, { client_id: client.id, name: `Demo Site ${stamp}`, address: 'Kololo, Kampala', latitude: 0.3345, longitude: 32.5921, guards_required_day: 0, guards_required_night: 0, patrols_per_night: 1 });
  const cps = [];
  for (const [i, name] of ['Main gate', 'Back gate', 'Generator', 'Roof'].entries()) cps.push(await call('POST', `/sites/${site.id}/checkpoints`, admin, { name, latitude: 0.3345 + (i + 1) * 0.0001, longitude: 32.5921 }));
  await call('POST', `/sites/${site.id}/routes`, admin, { name: 'Demo walk', checkpoint_sequence: cps.map((c) => c.id), round_start_times: [hhmm(new Date(now.getTime() - 5 * MIN))], max_round_minutes: 45, min_seconds_between_scans: 60 });
  const supervisor = (await call('GET', '/users?role=supervisor', admin))[0];
  await call('PUT', `/sites/${site.id}/supervisors`, admin, { user_ids: [supervisor.id] });
  say(`site "${site.name}" with ${cps.length} checkpoints and a route`);

  const date = dayOf(new Date(now.getTime() - 30 * MIN));
  const roster = await call('POST', '/rosters', manager, { site_id: site.id, week_start: mondayOf(date) });
  const guards = {};
  // One shift template per guard: guards on the SAME shift share the patrol rounds between them, and this demo wants each guard to have a round of their own.
  for (const name of ['Careful', 'Rushed', 'Absent', 'Late']) {
    const tpl = await call('POST', '/shift-templates', admin, { name: `Demo ${name} ${stamp}`, start_time: hhmm(new Date(now.getTime() - 30 * MIN)), end_time: hhmm(new Date(now.getTime() + 7.5 * 60 * MIN)) });
    const g = await call('POST', '/guards', admin, { full_name: `Demo ${name} ${stamp}`, email: `demo.${name.toLowerCase()}.${stamp}@example.com`, hourly_rate_ugx: 5000, night_allowance_ugx: 3000, site_ids: [site.id] });
    await call('POST', `/rosters/${roster.id}/shifts`, manager, { guard_id: g.id, shift_template_id: tpl.id, date });
    guards[name] = { ...g, token: await login(g.email, g.temporary_password) };
  }
  const published = await call('POST', `/rosters/${roster.id}/publish`, manager);
  say(`roster published for ${date}: 4 guards, ${published.rounds_created} patrol rounds created`);

  for (const g of Object.values(guards)) g.shift = (await call('GET', `/me/shifts?from=${date}&to=${date}`, g.token)).find((s) => s.site_id === site.id);
  const at = { latitude: 0.3345, longitude: 32.5921, accuracy_m: 8, device_id: 'demo-phone' };
  for (const name of ['Careful', 'Rushed']) await call('POST', '/attendance/check-in', guards[name].token, { client_event_id: crypto.randomUUID(), shift_id: guards[name].shift.id, ...at });
  await call('POST', '/attendance/check-in', guards.Late.token, { client_event_id: crypto.randomUUID(), shift_id: guards.Late.shift.id, device_time: new Date(now.getTime() - 20 * MIN).toISOString(), latitude: 0.3345 + 0.005, longitude: 32.5921 });
  say('Careful and Rushed checked in; Late checked in 20 minutes late from 550 m away (needs review); Absent never arrives');

  const scan = (g, cp, sec) => ({ client_scan_id: crypto.randomUUID(), shift_id: g.shift.id, tag_code: cp.tag_code, scanned_at: new Date(now.getTime() + sec * 1000).toISOString(), latitude: Number(cp.latitude), longitude: Number(cp.longitude), device_id: 'demo-phone' });
  const careful = await call('POST', '/scans/batch', guards.Careful.token, { scans: cps.map((cp, i) => scan(guards.Careful, cp, -240 + i * 70)) });
  const rushed = await call('POST', '/scans/batch', guards.Rushed.token, { scans: cps.map((cp, i) => scan(guards.Rushed, cp, -60 + i * 4)) });
  say(`Careful: ${careful.results.map((r) => r.status).join(', ')} (clean round)`);
  say(`Rushed:  ${rushed.results.map((r) => r.status).join(', ')} (scanned 4 seconds apart: flags raised)`);

  const overview = await call('GET', '/dashboard/overview', manager);
  const mine = overview.sites.find((s) => s.site_id === site.id);
  console.log('\nDashboard for the demo site:', JSON.stringify(mine));
  const flags = await call('GET', `/flags?site_id=${site.id}`, manager);
  console.log(`Flags raised: ${flags.length}  (${[...new Set(flags.map((f) => f.rule))].join(', ')})`);
  console.log('\nOpen the web app dashboard: you should see the numbers above.');
  console.log(`Log in as the guard app would:  ${guards.Careful.email}  with the temporary password ${guards.Careful.temporary_password}`);
})().catch((e) => { console.error('Demo failed:', e.message); process.exit(1); });

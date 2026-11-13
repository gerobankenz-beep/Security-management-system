// Times come from the API as ISO UTC. People read them in Kampala time.
const TZ = 'Africa/Kampala';
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '-');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const kampalaToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
export const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayName = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const label = (code) => String(code || '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

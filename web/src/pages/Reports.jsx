// Weekly field report (staff) and proof of service (client-safe). Spec: Prompt Pack section 6.1.
import { useState } from 'react';
import { getProofOfService, getWeeklyField } from '../api/reports';
import { listSites } from '../api/sites';
import { downloadFile } from '../api/download';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { addDays, fmtDateTime, fmtTime, kampalaToday, label } from '../lib/format';
import { mondayOf, pctText } from '../lib/money';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import FormField from '../components/FormField';
import Tabs from '../components/Tabs';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';
import StaleNotice from '../components/StaleNotice';
import { Download } from 'lucide-react';

function WeekPicker({ week, setWeek }) {
  return (
    <div className="inline-form">
      <button className="btn" onClick={() => setWeek(addDays(week, -7))}>Previous week</button>
      <FormField id="week" label="Week (any day; snaps to Monday)">
        <input id="week" type="date" value={week} onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))} />
      </FormField>
      <button className="btn" onClick={() => setWeek(addDays(week, 7))}>Next week</button>
    </div>
  );
}

const asOf = (iso) => <p className="muted">Data as of {fmtDateTime(iso)}</p>;

function Weekly({ week }) {
  const [siteId, setSiteId] = useState('');
  const [msg, setMsg] = useState('');
  const sites = useApi(() => listSites({ per_page: 100 }), []);
  const { data: r, loading, error, reload } = useApi(() => getWeeklyField({ week_start: week, site_id: siteId }), [week, siteId], { cacheKey: `weekly-${week}-${siteId}` });

  async function exportCsv() {
    setMsg('');
    try { await downloadFile('/reports/weekly-field/export', { week_start: week, site_id: siteId, format: 'csv' }, `weekly-field-${week}.csv`); }
    catch (e) { setMsg(e.message); }
  }

  return (
    <>
      <div className="card">
        <div className="inline-form">
          <FormField id="rep-site" label="Site">
            <select id="rep-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">All my sites</option>
              {(sites.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
          <button className="btn btn-primary" onClick={exportCsv}><Download size={16} aria-hidden="true" />Export CSV</button>
        </div>
        {msg && <div className="error-box" role="alert">{msg}</div>}
      </div>
      {loading && !r && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {r && (
        <>
          {asOf(r.data_as_of)}
          <div className="stat-grid">
            <StatCard label="Shifts scheduled" value={r.summary.shifts_scheduled} hint={`${r.summary.shifts_worked} worked`} />
            <StatCard label="No-shows" value={r.summary.no_shows} tone={r.summary.no_shows ? 'bad' : 'good'} />
            <StatCard label="Late arrivals" value={r.summary.late_arrivals} tone={r.summary.late_arrivals ? 'warn' : 'good'} />
            <StatCard label="Pending review" value={r.summary.pending_review} tone={r.summary.pending_review ? 'warn' : 'good'} />
            <StatCard label="Rounds complete" value={`${r.summary.rounds_complete} of ${r.summary.rounds_expected}`} hint={`${r.summary.rounds_missed} missed, ${r.summary.rounds_flagged} flagged`} />
            <StatCard label="Compliance" value={pctText(r.summary.compliance_percent)} tone={r.summary.compliance_percent >= 90 ? 'good' : 'warn'} />
          </div>
          <div className="card">
            <h3>By site</h3>
            <DataTable rows={r.by_site} empty="No shifts or rounds this week."
              columns={[{ key: 'site_name', label: 'Site' }, { key: 'guards_on_duty', label: 'Guards' }, { key: 'rounds_expected', label: 'Rounds expected' },
                { key: 'rounds_complete', label: 'Complete' }, { key: 'rounds_missed', label: 'Missed' },
                { key: 'compliance_percent', label: 'Compliance', render: (x) => pctText(x.compliance_percent) }, { key: 'flags', label: 'Flags' }, { key: 'incidents', label: 'Incidents' }]} />
          </div>
          <div className="card">
            <h3>By guard</h3>
            <DataTable rows={r.by_guard} empty="No guards on shift this week."
              columns={[{ key: 'guard_name', label: 'Guard' }, { key: 'site_name', label: 'Site' }, { key: 'scheduled_hours', label: 'Scheduled h' }, { key: 'actual_hours', label: 'Actual h' },
                { key: 'late', label: 'Late' }, { key: 'no_shows', label: 'No-shows' }, { key: 'rounds_missed', label: 'Missed rounds' }, { key: 'flags', label: 'Flags' }]} />
          </div>
          <div className="card">
            <h3>Missed checkpoints</h3>
            <DataTable rows={r.missed_checkpoints.map((m) => ({ ...m, id: m.round_id }))} empty="No missed checkpoints."
              columns={[{ key: 'site_name', label: 'Site' }, { key: 'round_index', label: 'Round', render: (m) => m.round_index + 1 }, { key: 'checkpoints', label: 'Not scanned', render: (m) => m.checkpoints.join(', ') || '-' }]} />
          </div>
          <div className="card">
            <h3>Flags and incidents</h3>
            <p>Flags: {r.flags.total}. {Object.entries(r.flags.by_status).map(([k, v]) => `${label(k)} ${v}`).join(', ')}</p>
            <p>Incidents: {r.incidents.total}. {Object.entries(r.incidents.by_category).map(([k, v]) => `${label(k)} ${v}`).join(', ')}</p>
            <DataTable rows={r.incidents.list} empty="No incidents this week."
              columns={[{ key: 'category', label: 'Category', render: (i) => label(i.category) }, { key: 'status', label: 'Status', render: (i) => label(i.status) }, { key: 'occurred_at', label: 'When', render: (i) => fmtDateTime(i.occurred_at) }]} />
          </div>
        </>
      )}
    </>
  );
}

function Proof({ week }) {
  const { data: r, staleAt, loading, error, reload } = useApi(() => getProofOfService({ week_start: week }), [week], { cacheKey: `proof-${week}` });
  return (
    <>
      <StaleNotice at={staleAt} />
      {loading && !r && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {r && (
        <>
          {asOf(r.data_as_of)}
          {r.sites.length === 0 && <p className="muted">No patrol rounds this week.</p>}
          {r.sites.map((s) => (
            <div className="card" key={s.site_id}>
              <h3>{s.site_name}</h3>
              <p>{s.rounds_walked} of {s.rounds_expected} rounds walked ({pctText(s.walked_percent)})</p>
              <DataTable rows={s.rounds.map((x) => ({ ...x, id: x.window_start }))}
                columns={[{ key: 'window_start', label: 'Round window', render: (x) => `${fmtDateTime(x.window_start)} to ${fmtTime(x.window_end)}` },
                  { key: 'walked', label: 'Result', render: (x) => (x.walked ? 'Walked' : 'Not completed') },
                  { key: 'scans', label: 'Checkpoints scanned', render: (x) => x.scans.map((c) => `${c.checkpoint_name} ${fmtTime(c.scanned_at)}`).join(', ') || '-' }]} />
            </div>
          ))}
        </>
      )}
    </>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const isClient = user.role === 'client';
  const [tab, setTab] = useState(isClient ? 'proof' : 'weekly');
  const [week, setWeek] = useState(mondayOf(kampalaToday()));
  return (
    <>
      <PageHeader title="Reports" subtitle="Weeks run Monday to Sunday, Kampala time." />
      {!isClient && <Tabs tabs={[{ key: 'weekly', label: 'Weekly field report' }, { key: 'proof', label: 'Client version' }]} active={tab} onChange={setTab} />}
      <div className="card"><WeekPicker week={week} setWeek={setWeek} /></div>
      {tab === 'weekly' && !isClient ? <Weekly week={week} /> : <Proof week={week} />}
    </>
  );
}

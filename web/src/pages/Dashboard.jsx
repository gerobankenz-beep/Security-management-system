// Live numbers for today. Refreshes itself every 30 seconds.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverview } from '../api/dashboard';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';
import { CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Flag, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';

const REFRESH_MS = 30000;
const needsAttention = (s) => s.rounds_missed > 0 || s.open_flags > 0 || s.guards_on_duty < s.guards_required;
const percent = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Why a site needs attention, in plain words.
const reasonsFor = (s) => [
  s.guards_on_duty < s.guards_required && `${plural(s.guards_required - s.guards_on_duty, 'guard')} short`,
  s.rounds_missed > 0 && `${plural(s.rounds_missed, 'missed round')}`,
  s.open_flags > 0 && `${plural(s.open_flags, 'open flag')}`,
].filter(Boolean);

// A "3 / 4" figure with a thin bar underneath, for the sites table.
function Ratio({ done, total }) {
  const pct = percent(done, total);
  return (
    <div className="ratio">
      <span>{done} / {total}</span>
      <div className="meter" aria-hidden="true"><span className={pct < 100 ? 'is-short' : ''} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(() => getOverview());
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => { if (data) setUpdatedAt(new Date()); }, [data]);
  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const flagged = data ? data.sites.filter(needsAttention) : [];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={data ? `Today: ${data.date}${updatedAt ? `, updated ${updatedAt.toLocaleTimeString('en-GB')}` : ''}` : 'Live status across your sites'}
        actions={<button className="btn" onClick={reload}><RefreshCw size={15} aria-hidden="true" />Refresh</button>} />
      {loading && !data && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <section className={flagged.length > 0 ? 'status-banner is-warn' : 'status-banner is-ok'} aria-label="Overall status">
            <span className="status-banner-icon">
              {flagged.length > 0 ? <ShieldAlert size={22} strokeWidth={1.8} aria-hidden="true" /> : <ShieldCheck size={22} strokeWidth={1.8} aria-hidden="true" />}
            </span>
            <div>
              <strong>{flagged.length > 0 ? `${flagged.length} of ${plural(data.sites.length, 'site')} need${flagged.length === 1 ? 's' : ''} attention` : 'All sites are on track'}</strong>
              <span>
                {data.guards_on_duty} of {data.guards_required} guards covering today, {percent(data.rounds_complete, data.rounds_expected)}% of expected rounds complete.
              </span>
            </div>
          </section>

          <div className="stat-grid">
            <StatCard label="Guards on duty" value={`${data.guards_on_duty} / ${data.guards_required}`} tone={data.guards_on_duty < data.guards_required ? 'warn' : 'good'} progress={percent(data.guards_on_duty, data.guards_required)} to="/attendance" />
            <StatCard label="Rounds complete" value={`${data.rounds_complete} / ${data.rounds_expected}`} progress={percent(data.rounds_complete, data.rounds_expected)} to="/reports" />
            <StatCard label="Rounds missed" value={data.rounds_missed} tone={data.rounds_missed > 0 ? 'bad' : 'good'} to="/flags?rule=MISSED_CHECKPOINT" />
            <StatCard label="Open flags" value={data.open_flags} tone={data.open_flags > 0 ? 'warn' : 'good'} to="/flags" />
          </div>

          <div className="dash-grid">
            <div className="card dash-main">
              <h2>Sites today</h2>
              <DataTable
                rows={data.sites.map((s) => ({ ...s, id: s.site_id }))}
                empty="No active sites."
                columns={[
                  { key: 'name', label: 'Site' },
                  { key: 'guards', label: 'Guards', render: (s) => <Ratio done={s.guards_on_duty} total={s.guards_required} /> },
                  { key: 'rounds', label: 'Rounds done', render: (s) => <Ratio done={s.rounds_complete} total={s.rounds_expected} /> },
                  { key: 'rounds_missed', label: 'Missed' },
                  { key: 'open_flags', label: 'Open flags' },
                  { key: 'status', label: 'Status', render: (s) => <span className={needsAttention(s) ? 'badge badge-warn' : 'badge badge-good'}>{needsAttention(s) ? 'Needs attention' : 'OK'}</span> },
                ]}
              />
            </div>

            <div className="dash-side">
              <div className="card">
                <h2>Needs a look</h2>
                {flagged.length === 0 ? (
                  <div className="empty-state is-compact">
                    <CheckCircle2 size={22} strokeWidth={1.7} aria-hidden="true" />
                    <p>Nothing needs attention right now.</p>
                  </div>
                ) : (
                  <ul className="attention-list">
                    {flagged.map((s) => (
                      <li key={s.site_id}>
                        <Link to={`/sites/${s.site_id}`}>
                          <span className="attention-body">
                            <strong>{s.name}</strong>
                            <span>{reasonsFor(s).join(', ')}</span>
                          </span>
                          <ChevronRight size={16} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card" aria-label="Quick links">
                <h2>Quick links</h2>
                <div className="quick-links">
                  <Link className="quick-link" to="/rosters"><CalendarDays size={17} aria-hidden="true" />Rosters<ChevronRight size={15} aria-hidden="true" /></Link>
                  <Link className="quick-link" to="/attendance"><ClipboardCheck size={17} aria-hidden="true" />Attendance<ChevronRight size={15} aria-hidden="true" /></Link>
                  <Link className="quick-link" to="/flags"><Flag size={17} aria-hidden="true" />Flags to review ({data.open_flags})<ChevronRight size={15} aria-hidden="true" /></Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

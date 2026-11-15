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
import { CalendarDays, ClipboardCheck, Flag, RefreshCw } from 'lucide-react';

const REFRESH_MS = 30000;
const needsAttention = (s) => s.rounds_missed > 0 || s.open_flags > 0 || s.guards_on_duty < s.guards_required;

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(() => getOverview());
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => { if (data) setUpdatedAt(new Date()); }, [data]);
  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle={data ? `Today: ${data.date}${updatedAt ? `, updated ${updatedAt.toLocaleTimeString('en-GB')}` : ''}` : 'Live status across your sites'}
        actions={<button className="btn" onClick={reload}><RefreshCw size={15} aria-hidden="true" />Refresh</button>} />
      {loading && !data && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Guards on duty" value={`${data.guards_on_duty} / ${data.guards_required}`} tone={data.guards_on_duty < data.guards_required ? 'warn' : 'good'} />
            <StatCard label="Rounds complete" value={`${data.rounds_complete} / ${data.rounds_expected}`} />
            <StatCard label="Rounds missed" value={data.rounds_missed} tone={data.rounds_missed > 0 ? 'bad' : 'good'} />
            <StatCard label="Open flags" value={data.open_flags} tone={data.open_flags > 0 ? 'warn' : 'good'} />
          </div>

          <div className="card" aria-label="Quick links">
            <h2>Quick links</h2>
            <div className="row-actions">
              <Link className="btn" to="/rosters"><CalendarDays size={16} aria-hidden="true" />Rosters</Link>
              <Link className="btn" to="/attendance"><ClipboardCheck size={16} aria-hidden="true" />Attendance</Link>
              <Link className="btn" to="/flags"><Flag size={16} aria-hidden="true" />Flags to review ({data.open_flags})</Link>
            </div>
          </div>

          <div className="card">
            <h2>Sites today</h2>
            <DataTable
              rows={data.sites.map((s) => ({ ...s, id: s.site_id }))}
              empty="No active sites."
              columns={[
                { key: 'name', label: 'Site' },
                { key: 'guards', label: 'Guards', render: (s) => `${s.guards_on_duty} / ${s.guards_required}` },
                { key: 'rounds', label: 'Rounds done', render: (s) => `${s.rounds_complete} / ${s.rounds_expected}` },
                { key: 'rounds_missed', label: 'Missed' },
                { key: 'open_flags', label: 'Open flags' },
                { key: 'status', label: 'Status', render: (s) => <span className={needsAttention(s) ? 'badge badge-warn' : 'badge badge-good'}>{needsAttention(s) ? 'Needs attention' : 'OK'}</span> },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
}

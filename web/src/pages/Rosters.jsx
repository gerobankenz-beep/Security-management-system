// Weekly rosters: see them all and start a new one.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createRoster, listRosters } from '../api/rosters';
import { listSites } from '../api/sites';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { addDays, kampalaToday, label } from '../lib/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import FormField from '../components/FormField';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const nextMonday = () => { const t = kampalaToday(); const dow = new Date(`${t}T00:00:00Z`).getUTCDay(); return addDays(t, ((8 - dow) % 7) || 7); };

export default function Rosters() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = ['admin', 'ops_manager'].includes(user.role);
  const [pageNo, setPageNo] = useState(1);
  const [siteId, setSiteId] = useState('');
  const [weekStart, setWeekStart] = useState(nextMonday());
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const sites = useApi(() => listSites({ per_page: 100 }));
  const list = useApi(() => listRosters({ page: pageNo }), [pageNo]);

  async function create(e) {
    e.preventDefault();
    setErrors({}); setFormError(null);
    if (!siteId) { setErrors({ site_id: 'is required' }); return; }
    try {
      const { data } = await createRoster({ site_id: Number(siteId), week_start: weekStart });
      navigate(`/rosters/${data.id}`);
    } catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.issue])));
      else setFormError(err);
    }
  }

  return (
    <>
      <PageHeader title="Rosters" subtitle="One roster per site and week. Build it as a draft, then publish." />
      {canEdit && (
        <form className="card" onSubmit={create} noValidate>
          <h2>New roster</h2>
          <div className="inline-form">
            <FormField id="roster-site" label="Site" error={errors.site_id}>
              <select id="roster-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Choose a site</option>
                {(sites.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </FormField>
            <FormField id="roster-week" label="Week starting (a Monday)" error={errors.week_start}>
              <input id="roster-week" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </FormField>
            <button className="btn btn-primary" type="submit">Create roster</button>
          </div>
          <ErrorBox error={formError} />
        </form>
      )}
      <div className="card">
        {list.loading && <Loading />}
        <ErrorBox error={list.error} onRetry={list.reload} />
        {list.data && (
          <>
            <DataTable rows={list.data} empty="No rosters yet."
              columns={[
                { key: 'site_name', label: 'Site' },
                { key: 'week_start', label: 'Week starting' },
                { key: 'status', label: 'Status', render: (r) => <span className={r.status === 'published' ? 'badge badge-good' : 'badge'}>{label(r.status)}</span> },
                { key: 'shift_count', label: 'Shifts' },
                { key: 'open', label: '', render: (r) => <Link to={`/rosters/${r.id}`}>Open</Link> },
              ]} />
            <Pagination meta={list.meta} onChange={setPageNo} />
          </>
        )}
      </div>
    </>
  );
}

// Guards eligible at the site (read-only) and, for admin, the supervisors assigned to it.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSiteGuards, listSiteSupervisors, setSiteSupervisors } from '../../api/sites';
import { listUsers } from '../../api/users';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';

export default function PeopleTab({ siteId, isAdmin, canSeeGuards }) {
  const guards = useApi(() => (canSeeGuards ? listSiteGuards(siteId) : Promise.resolve({ data: [] })), [siteId]);
  const [supervisors, setSupervisors] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setSupervisors((await listUsers({ role: 'supervisor', per_page: 100 })).data.filter((u) => u.is_active));
        setAssigned((await listSiteSupervisors(siteId)).data.map((u) => u.id));
      } catch (e) { setError(e); }
    })();
  }, [siteId, isAdmin]);

  async function save() {
    setError(null); setMessage('');
    try { await setSiteSupervisors(siteId, assigned); setMessage('Supervisors saved.'); } catch (e) { setError(e); }
  }

  return (
    <>
      {canSeeGuards && (
        <div className="card">
          <h2>Guards who may work here</h2>
          {guards.loading && <Loading />}
          <ErrorBox error={guards.error} onRetry={guards.reload} />
          {guards.data && <DataTable rows={guards.data} empty="No guards assigned yet." columns={[
            { key: 'full_name', label: 'Name' }, { key: 'employee_no', label: 'Employee no' }, { key: 'phone', label: 'Phone' },
            { key: 'status', label: 'Status', render: (g) => (g.is_active ? 'Active' : 'Inactive') },
          ]} />}
          {isAdmin && <p className="hint">To change who may work here, edit the guard on the <Link to="/guards">Guards</Link> page.</p>}
        </div>
      )}
      {isAdmin && (
        <div className="card">
          <h2>Supervisors for this site</h2>
          {message && <div className="success-box" role="status">{message}</div>}
          <ErrorBox error={error} />
          {supervisors.length === 0 ? <p className="muted">No supervisors yet. Add one on the Users page.</p> : (
            <div className="check-list">
              {supervisors.map((s) => (
                <label key={s.id}>
                  <input type="checkbox" checked={assigned.includes(s.id)} onChange={() => setAssigned((a) => (a.includes(s.id) ? a.filter((x) => x !== s.id) : [...a, s.id]))} />{s.full_name}
                </label>
              ))}
            </div>
          )}
          <div className="form-actions"><button className="btn btn-primary" onClick={save}>Save supervisors</button></div>
        </div>
      )}
    </>
  );
}

// List of sites. Everyone sees the sites they are allowed to see; admin can add sites.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listSites } from '../api/sites';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import StaleNotice from '../components/StaleNotice';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

export default function Sites() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [page, setPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);
  const { data, meta, loading, error, staleAt, reload } = useApi(
    () => listSites({ page, per_page: 10, include_inactive: showInactive ? 'true' : undefined }), [page, showInactive], { cacheKey: `sites:${page}:${showInactive}` });

  return (
    <>
      <PageHeader title="Sites" subtitle="Locations covered by guards"
        actions={isAdmin ? <Link className="btn btn-primary" to="/sites/new">Add site</Link> : null} />
      <StaleNotice at={staleAt} />
      {isAdmin && (
        <label className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); setPage(1); }} /> Show inactive sites
        </label>
      )}
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <DataTable
            rows={data}
            empty="No sites yet."
            columns={[
              { key: 'name', label: 'Name', render: (s) => <Link to={`/sites/${s.id}`}>{s.name}</Link> },
              { key: 'address', label: 'Address' },
              { key: 'guards', label: 'Guards (day / night)', render: (s) => `${s.guards_required_day} / ${s.guards_required_night}` },
              { key: 'patrols_per_night', label: 'Patrols per night' },
              { key: 'geofence_radius_m', label: 'Geofence (m)' },
              { key: 'status', label: 'Status', render: (s) => <span className={s.is_active ? 'badge badge-good' : 'badge pill-off'}>{s.is_active ? 'Active' : 'Inactive'}</span> },
            ]}
          />
          <Pagination meta={meta} onChange={setPage} />
        </div>
      )}
    </>
  );
}

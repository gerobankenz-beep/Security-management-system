// A complete list screen: loads from GET /sites, shows a table with pagination.
// Copy this pattern for other list screens (users, rosters, incidents...).
import { useState } from 'react';
import { listSites } from '../api/sites';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

export default function Sites() {
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi(() => listSites({ page, per_page: 10 }), [page]);

  return (
    <>
      <PageHeader title="Sites" subtitle="Locations covered by guards" />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <DataTable
            rows={data}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'address', label: 'Address' },
              { key: 'guards', label: 'Guards (day / night)', render: (s) => `${s.guards_required_day} / ${s.guards_required_night}` },
              { key: 'patrols_per_night', label: 'Patrols per night' },
              { key: 'geofence_radius_m', label: 'Geofence (m)' },
            ]}
          />
          <Pagination meta={meta} onChange={setPage} />
        </div>
      )}
    </>
  );
}

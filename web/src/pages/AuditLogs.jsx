import { useState } from 'react';
import { listAuditLogs } from '../api/users';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi(() => listAuditLogs({ page, per_page: 15 }), [page]);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who changed what, newest first" />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <DataTable
            rows={data}
            columns={[
              { key: 'created_at', label: 'When', render: (r) => new Date(r.created_at).toLocaleString() },
              { key: 'user_id', label: 'User id' },
              { key: 'action', label: 'Action' },
              { key: 'entity_type', label: 'Entity' },
              { key: 'entity_id', label: 'Entity id' },
            ]}
          />
          <Pagination meta={meta} onChange={setPage} />
        </div>
      )}
    </>
  );
}

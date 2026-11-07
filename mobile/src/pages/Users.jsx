import { useState } from 'react';
import { listUsers } from '../api/users';
import { ROLES } from '../auth/roles';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

export default function Users() {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const { data, meta, loading, error, reload } = useApi(() => listUsers({ page, per_page: 10, role }), [page, role]);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Everyone who can log in"
        actions={
          <select aria-label="Filter by role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        }
      />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <DataTable
            rows={data}
            columns={[
              { key: 'full_name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'role', label: 'Role', render: (u) => ROLES[u.role] || u.role },
              { key: 'is_active', label: 'Active', render: (u) => (u.is_active ? 'Yes' : 'No') },
            ]}
          />
          <Pagination meta={meta} onChange={setPage} />
        </div>
      )}
    </>
  );
}

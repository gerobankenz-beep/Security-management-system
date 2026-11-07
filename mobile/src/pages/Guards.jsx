// Admin: list of guards with search and status filter.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listGuards } from '../api/guards';
import { ugx } from '../lib/forms';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

export default function Guards() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');       // what is typed
  const [search, setSearch] = useState('');   // what is searched (after pressing Search)
  // No cacheKey on purpose: this list contains pay rates, which must not be saved in the browser.
  const { data, meta, loading, error, reload } = useApi(() => listGuards({ page, per_page: 10, search, status }), [page, search, status]);

  return (
    <>
      <PageHeader title="Guards" subtitle="Everyone who works shifts" actions={<Link className="btn btn-primary" to="/guards/new">Add guard</Link>} />
      <div className="card">
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(text.trim()); }}>
          <div className="field">
            <label htmlFor="search">Search</label>
            <input id="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, email or employee number" />
          </div>
          <div className="field" style={{ flex: '0 0 160px' }}>
            <label htmlFor="status">Status</label>
            <select id="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
          <button className="btn" type="submit">Search</button>
        </form>
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <DataTable
            rows={data}
            empty="No guards match."
            columns={[
              { key: 'full_name', label: 'Name', render: (g) => <Link to={`/guards/${g.id}`}>{g.full_name}</Link> },
              { key: 'employee_no', label: 'Employee no' },
              { key: 'phone', label: 'Phone' },
              { key: 'sites', label: 'Sites', render: (g) => g.site_ids.length },
              { key: 'rate', label: 'Hourly rate', render: (g) => ugx(g.pay_profile && g.pay_profile.hourly_rate_ugx) },
              { key: 'status', label: 'Status', render: (g) => <span className={g.is_active ? 'badge badge-good' : 'badge pill-off'}>{g.is_active ? 'Active' : 'Inactive'}</span> },
            ]}
          />
          <Pagination meta={meta} onChange={setPage} />
        </div>
      )}
    </>
  );
}

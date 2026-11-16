// Incidents reported by guards: filter, read the report, change its status, resolve it with a note.
import { useState } from 'react';
import { Activity, CircleCheck, Eye, MapPin, TriangleAlert } from 'lucide-react';
import { getIncident, getIncidentOptions, listIncidents, updateIncident } from '../api/incidents';
import { listSites } from '../api/sites';
import { useApi } from '../hooks/useApi';
import { fmtDateTime, label } from '../lib/format';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import FormField from '../components/FormField';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const BADGE = { open: 'badge badge-bad', in_review: 'badge badge-warn', resolved: 'badge badge-good' };
const TONE = { open: 'bad', in_review: 'warn', resolved: 'good' };
const ICON = { open: TriangleAlert, in_review: Eye, resolved: CircleCheck };
const statusBadge = (st) => <span className={BADGE[st] || 'badge'}>{label(st)}</span>;

function IncidentDetail({ id, options, onSaved, onClose }) {
  const { data: inc, loading, error } = useApi(() => getIncident(id), [id]);
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState(null);
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);

  const shownStatus = status ?? (inc ? inc.status : '');
  const shownNote = note ?? (inc ? inc.resolution_note || '' : '');
  const changed = inc && (shownStatus !== inc.status || shownNote.trim() !== (inc.resolution_note || ''));

  async function save() {
    setFailure(null); setSaving(true);
    try { await updateIncident(id, { status: shownStatus, resolution_note: shownNote.trim() || null }); onSaved(`Incident ${id} updated`); }
    catch (err) { setFailure(err); } finally { setSaving(false); }
  }

  return (
    <div className="card" aria-label="Incident details">
      <div className="page-header"><h2>Incident #{id}</h2><button className="btn" onClick={onClose}>Close</button></div>
      {loading && <Loading />}
      <ErrorBox error={error} />
      {inc && (
        <>
          <dl className="details">
            <dt>Category</dt><dd>{label(inc.category)}</dd>
            <dt>Site</dt><dd>{inc.site_name}</dd>
            <dt>Reported by</dt><dd>{inc.reported_by_name || 'Unknown'}</dd>
            <dt>Happened</dt><dd>{fmtDateTime(inc.occurred_at)}</dd>
            <dt>Status</dt><dd>{statusBadge(inc.status)}</dd>
            <dt>What happened</dt><dd>{inc.description}</dd>
            {inc.latitude !== null && inc.longitude !== null && (
              <><dt>Location</dt><dd><a href={`https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`} target="_blank" rel="noreferrer"><MapPin size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />Open on map</a></dd></>
            )}
          </dl>
          <h3 style={{ marginTop: 18 }}>Review</h3>
          <div className="form-grid">
            <FormField id="inc-status" label="Status">
              <select id="inc-status" value={shownStatus} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%' }}>
                {options.statuses.map((x) => <option key={x} value={x}>{label(x)}</option>)}
              </select>
            </FormField>
          </div>
          <FormField id="inc-note" label="Resolution note" hint="Required when the status is Resolved.">
            <textarea id="inc-note" rows={4} value={shownNote} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <ErrorBox error={failure} />
          <div className="form-actions">
            <button className="btn btn-primary" disabled={saving || !changed} onClick={save}>{saving ? 'Saving...' : 'Save changes'}</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Incidents() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [siteId, setSiteId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [message, setMessage] = useState('');
  const opts = useApi(() => getIncidentOptions(), []);
  const sites = useApi(() => listSites({ per_page: 100 }), []);
  const { data, meta, loading, error, reload } = useApi(
    () => listIncidents({ status, category, site_id: siteId, from, to, page: pageNo }), [status, category, siteId, from, to, pageNo]);
  const options = opts.data || { statuses: ['open', 'in_review', 'resolved'], categories: [] };
  const counts = (meta && meta.by_status) || {};
  const reset = (setter) => (e) => { setter(e.target.value); setPageNo(1); };

  return (
    <>
      <PageHeader title="Incidents" subtitle="Reports from guards in the field. Review each one and close it with a note." />
      <div className="stat-grid">
        {options.statuses.map((st) => <StatCard key={st} label={label(st)} value={counts[st] || 0} tone={(counts[st] || 0) > 0 ? TONE[st] || 'default' : 'default'} icon={ICON[st] || Activity} />)}
      </div>
      <div className="card">
        <div className="inline-form">
          <FormField id="inc-f-status" label="Status">
            <select id="inc-f-status" value={status} onChange={reset(setStatus)}>
              <option value="">All</option>{options.statuses.map((x) => <option key={x} value={x}>{label(x)}</option>)}
            </select>
          </FormField>
          <FormField id="inc-f-category" label="Category">
            <select id="inc-f-category" value={category} onChange={reset(setCategory)}>
              <option value="">All categories</option>{options.categories.map((x) => <option key={x} value={x}>{label(x)}</option>)}
            </select>
          </FormField>
          <FormField id="inc-f-site" label="Site">
            <select id="inc-f-site" value={siteId} onChange={reset(setSiteId)}>
              <option value="">All sites</option>{(sites.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </FormField>
          <FormField id="inc-f-from" label="From"><input id="inc-f-from" type="date" value={from} onChange={reset(setFrom)} /></FormField>
          <FormField id="inc-f-to" label="To"><input id="inc-f-to" type="date" value={to} onChange={reset(setTo)} /></FormField>
        </div>
        {message && <div className="success-box" role="status">{message}</div>}
        {loading && !data && <Loading />}
        <ErrorBox error={error} onRetry={reload} />
        {data && (
          <DataTable rows={data} empty="No incidents match. Reports from guards will appear here."
            columns={[
              { key: 'category', label: 'Category', render: (i) => label(i.category) },
              { key: 'site_name', label: 'Site' },
              { key: 'reported_by_name', label: 'Reported by' },
              { key: 'occurred_at', label: 'Happened', render: (i) => fmtDateTime(i.occurred_at) },
              { key: 'status', label: 'Status', render: (i) => statusBadge(i.status) },
              { key: 'act', label: '', render: (i) => <button className="link-btn" onClick={() => { setMessage(''); setOpenId(i.id); }}>Review incident {i.id}</button> },
            ]} />
        )}
        <Pagination meta={meta} onChange={setPageNo} />
      </div>
      {openId && <IncidentDetail key={openId} id={openId} options={options} onClose={() => setOpenId(null)} onSaved={(m) => { setOpenId(null); setMessage(m); reload(); }} />}
    </>
  );
}

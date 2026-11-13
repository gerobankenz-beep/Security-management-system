// Patrol flags: filter, look at the evidence, confirm or dismiss.
import { useState } from 'react';
import { getFlag, listFlags, reviewFlag } from '../api/flags';
import { useApi } from '../hooks/useApi';
import { fmtDateTime, fmtTime, label } from '../lib/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import FormField from '../components/FormField';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const RULES = ['MISSED_CHECKPOINT', 'LATE_ROUND', 'TOO_FAST', 'OUT_OF_SEQUENCE', 'WRONG_LOCATION', 'CLOCK_MISMATCH'];
const SEV = { high: 'badge badge-warn', medium: 'badge', low: 'badge' };

function FlagDetail({ id, onReviewed, onClose }) {
  const { data: flag, loading, error } = useApi(() => getFlag(id), [id]);
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);

  async function review(status) {
    setFailure(null); setSaving(true);
    try { await reviewFlag(id, { status, note: note.trim() || undefined }); onReviewed(status); }
    catch (err) { setFailure(err); } finally { setSaving(false); }
  }

  return (
    <div className="card" aria-label="Flag details">
      <div className="page-header"><h2>Flag #{id}</h2><button className="btn" onClick={onClose}>Close</button></div>
      {loading && <Loading />}
      <ErrorBox error={error} />
      {flag && (
        <>
          <dl className="details">
            <dt>Rule</dt><dd>{label(flag.rule)} ({flag.severity})</dd>
            <dt>Guard</dt><dd>{flag.guard_name}</dd>
            <dt>Site</dt><dd>{flag.site_name}</dd>
            <dt>What happened</dt><dd>{flag.details && flag.details.message}</dd>
            <dt>Raised</dt><dd>{fmtDateTime(flag.created_at)}</dd>
          </dl>
          <h3>Evidence</h3>
          <DataTable rows={flag.scans || []} empty="No scans are attached to this flag."
            columns={[{ key: 'checkpoint', label: 'Checkpoint', render: (x) => x.checkpoint_name || x.tag_code }, { key: 'scanned_at', label: 'Scanned', render: (x) => fmtTime(x.scanned_at) }, { key: 'validation_status', label: 'Result', render: (x) => label(x.validation_status) }]} />
          {flag.status === 'open' ? (
            <>
              <FormField id="flag-note" label="Note (optional)"><input id="flag-note" value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
              <ErrorBox error={failure} />
              <div className="form-actions">
                <button className="btn btn-primary" disabled={saving} onClick={() => review('confirmed')}>Confirm flag</button>
                <button className="btn" disabled={saving} onClick={() => review('dismissed')}>Dismiss flag</button>
              </div>
            </>
          ) : <p className="muted">Already {flag.status}{flag.note ? `: ${flag.note}` : ''}.</p>}
        </>
      )}
    </div>
  );
}

export default function Flags() {
  const [status, setStatus] = useState('open');
  const [rule, setRule] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [message, setMessage] = useState('');
  const { data, meta, loading, error, reload } = useApi(() => listFlags({ status, rule, page: pageNo }), [status, rule, pageNo]);

  return (
    <>
      <PageHeader title="Patrol flags" subtitle="Anomalies the system found in patrol rounds. Review each one." />
      <div className="card">
        <div className="inline-form">
          <FormField id="flag-status" label="Status">
            <select id="flag-status" value={status} onChange={(e) => { setStatus(e.target.value); setPageNo(1); }}>
              <option value="open">Waiting for review</option><option value="confirmed">Confirmed</option><option value="dismissed">Dismissed</option><option value="">All</option>
            </select>
          </FormField>
          <FormField id="flag-rule" label="Rule">
            <select id="flag-rule" value={rule} onChange={(e) => { setRule(e.target.value); setPageNo(1); }}>
              <option value="">All rules</option>{RULES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
            </select>
          </FormField>
        </div>
        {message && <div className="success-box" role="status">{message}</div>}
        {loading && !data && <Loading />}
        <ErrorBox error={error} onRetry={reload} />
        {data && (
          <DataTable rows={data} empty="No flags match."
            columns={[
              { key: 'rule', label: 'Rule', render: (f) => label(f.rule) },
              { key: 'severity', label: 'Severity', render: (f) => <span className={SEV[f.severity] || 'badge'}>{label(f.severity)}</span> },
              { key: 'guard_name', label: 'Guard' },
              { key: 'site_name', label: 'Site' },
              { key: 'status', label: 'Status', render: (f) => label(f.status) },
              { key: 'created_at', label: 'Raised', render: (f) => fmtDateTime(f.created_at) },
              { key: 'act', label: '', render: (f) => <button className="link-btn" onClick={() => { setMessage(''); setOpenId(f.id); }}>Review flag {f.id}</button> },
            ]} />
        )}
        <Pagination meta={meta} onChange={setPageNo} />
      </div>
      {openId && <FlagDetail key={openId} id={openId} onClose={() => setOpenId(null)} onReviewed={(s) => { setOpenId(null); setMessage(`Flag ${s}`); reload(); }} />}
    </>
  );
}

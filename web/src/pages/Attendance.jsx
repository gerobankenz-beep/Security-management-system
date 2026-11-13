// Daily attendance, with an exceptions view and corrections (a reason is always required).
import { useState } from 'react';
import { correctAttendance, listAttendance, listExceptions } from '../api/attendance';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { fmtTime, kampalaToday, label } from '../lib/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import Tabs from '../components/Tabs';
import FormField from '../components/FormField';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const STATUS_TONE = { on_time: 'badge badge-good', late: 'badge badge-warn', no_show: 'badge badge-warn', pending: 'badge' };
const toIso = (local) => (local ? new Date(`${local}:00+03:00`).toISOString() : undefined); // the box holds Kampala time

function CorrectionForm({ row, onDone, onCancel }) {
  const [form, setForm] = useState({ reason: '', status: '', verification_status: '', overtime_approved: row.overtime_approved, checked_in_local: '', checked_out_local: '' });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setErrors({}); setFailure(null);
    if (!form.reason.trim()) { setErrors({ reason: 'is required' }); return; }
    const body = { reason: form.reason.trim(), overtime_approved: form.overtime_approved };
    if (form.status) body.status = form.status;
    if (form.verification_status) body.verification_status = form.verification_status;
    if (form.checked_in_local) body.checked_in_at = toIso(form.checked_in_local);
    if (form.checked_out_local) body.checked_out_at = toIso(form.checked_out_local);
    setSaving(true);
    try { await correctAttendance(row.attendance_id, body); onDone(); }
    catch (err) {
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.issue]))); else setFailure(err);
    } finally { setSaving(false); }
  }

  return (
    <form className="card" onSubmit={save} noValidate aria-label="Correct attendance">
      <h2>Correct: {row.guard_name}, {row.date}</h2>
      <div className="form-grid">
        <FormField id="corr-reason" label="Reason for the correction" error={errors.reason} hint="Saved with the history. Required.">
          <input id="corr-reason" value={form.reason} onChange={set('reason')} />
        </FormField>
        <FormField id="corr-status" label="Status">
          <select id="corr-status" value={form.status} onChange={set('status')}>
            <option value="">Keep as is</option><option value="on_time">On time</option><option value="late">Late</option><option value="no_show">No show</option>
          </select>
        </FormField>
        <FormField id="corr-verify" label="Location check">
          <select id="corr-verify" value={form.verification_status} onChange={set('verification_status')}>
            <option value="">Keep as is</option><option value="verified">Verified</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option>
          </select>
        </FormField>
        <FormField id="corr-in" label="Checked in at (Kampala time)" error={errors.checked_in_at}>
          <input id="corr-in" type="datetime-local" value={form.checked_in_local} onChange={set('checked_in_local')} />
        </FormField>
        <FormField id="corr-out" label="Checked out at (Kampala time)" error={errors.checked_out_at}>
          <input id="corr-out" type="datetime-local" value={form.checked_out_local} onChange={set('checked_out_local')} />
        </FormField>
        <div className="field"><label><input type="checkbox" checked={!!form.overtime_approved} onChange={set('overtime_approved')} /> Overtime approved</label></div>
      </div>
      <ErrorBox error={failure} />
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={saving}>Save correction</button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const canCorrect = ['admin', 'ops_manager', 'supervisor'].includes(user.role);
  const [tab, setTab] = useState('all');
  const [date, setDate] = useState(kampalaToday());
  const [pageNo, setPageNo] = useState(1);
  const [editing, setEditing] = useState(null);
  const [saved, setSaved] = useState(false);
  const { data, meta, loading, error, reload } = useApi(
    () => (tab === 'exceptions' ? listExceptions({ date, page: pageNo }) : listAttendance({ date, page: pageNo })), [tab, date, pageNo]);

  const columns = [
    { key: 'guard_name', label: 'Guard' },
    { key: 'site_name', label: 'Site' },
    { key: 'template_name', label: 'Shift' },
    { key: 'scheduled', label: 'Scheduled', render: (r) => `${fmtTime(r.scheduled_start)} to ${fmtTime(r.scheduled_end)}` },
    { key: 'in', label: 'In', render: (r) => fmtTime(r.checked_in_at) },
    { key: 'out', label: 'Out', render: (r) => fmtTime(r.checked_out_at) },
    { key: 'status', label: 'Status', render: (r) => <span className={STATUS_TONE[r.status] || 'badge'}>{label(r.status)}{r.status === 'late' && r.late_minutes ? ` (${r.late_minutes} min)` : ''}</span> },
    { key: 'verification_status', label: 'Location', render: (r) => (r.verification_status === 'pending_review' ? <span className="badge badge-warn">Needs review</span> : label(r.verification_status)) },
    // id 0 means nobody has checked in yet, so there is no attendance record to correct
    ...(canCorrect ? [{ key: 'act', label: '', render: (r) => (r.attendance_id
      ? <button className="link-btn" onClick={() => { setSaved(false); setEditing(r); }}>Correct {r.guard_name}</button>
      : <span className="muted">No record yet</span>) }] : []),
  ];

  return (
    <>
      <PageHeader title="Attendance" subtitle="Who was on shift, who was late, and who never arrived." />
      <div className="card">
        <div className="inline-form">
          <FormField id="att-date" label="Day"><input id="att-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPageNo(1); setEditing(null); }} /></FormField>
        </div>
        <Tabs tabs={[{ key: 'all', label: 'All shifts' }, { key: 'exceptions', label: 'Exceptions' }]} active={tab} onChange={(k) => { setTab(k); setPageNo(1); setEditing(null); }} />
        {saved && <div className="success-box" role="status">Correction saved</div>}
        {loading && !data && <Loading />}
        <ErrorBox error={error} onRetry={reload} />
        {data && <DataTable rows={data.map((a) => ({ ...a, attendance_id: a.id, id: a.shift_id }))} columns={columns} empty={tab === 'exceptions' ? 'No exceptions for this day.' : 'No shifts for this day.'} />}
        <Pagination meta={meta} onChange={setPageNo} />
      </div>
      {editing && <CorrectionForm key={editing.shift_id} row={editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); setSaved(true); reload(); }} />}
    </>
  );
}

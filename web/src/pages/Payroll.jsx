// Monthly payroll (admin only). Spec: Prompt Pack section 6.2. Pay data is never cached for offline use.
import { useCallback, useEffect, useState } from 'react';
import { addAdjustment, createPayrollRun, finalisePayroll, getPayrollRun, recalculatePayroll, reviewPayroll, unlockPayroll } from '../api/payroll';
import { downloadFile } from '../api/download';
import { dayName, label } from '../lib/format';
import { ugx } from '../lib/money';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import FormField from '../components/FormField';
import ConfirmButton from '../components/ConfirmButton';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const STEPS = ['draft', 'reviewed', 'finalised'];
const thisMonth = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7);
const mins = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

function Stepper({ status }) {
  return (
    <p>{STEPS.map((s, i) => <span key={s} className={s === status ? 'badge badge-warn' : 'badge'} style={{ marginRight: 8 }}>{i + 1}. {label(s)}</span>)}</p>
  );
}

function Drawer({ line, onClose }) {
  return (
    <div className="card" aria-label="Pay calculation">
      <div className="page-header"><h2>{line.name} ({line.employee_no}) shift by shift</h2><button className="btn" onClick={onClose}>Close</button></div>
      <DataTable rows={line.shifts.map((s) => ({ ...s, id: s.shift_id }))} empty="No paid shifts."
        columns={[{ key: 'shift_date', label: 'Shift', render: (s) => dayName(s.shift_date) }, { key: 'paid_minutes', label: 'Paid', render: (s) => mins(s.paid_minutes) },
          { key: 'regular_minutes', label: 'Regular', render: (s) => mins(s.regular_minutes) }, { key: 'overtime_minutes', label: 'Overtime', render: (s) => mins(s.overtime_minutes) },
          { key: 'holiday_minutes', label: 'Holiday', render: (s) => mins(s.holiday_minutes) }, { key: 'late_minutes', label: 'Late min' },
          { key: 'night_allowance', label: 'Night allowance', render: (s) => ugx(s.night_allowance) }, { key: 'issue', label: 'Issue', render: (s) => (s.issue ? label(s.issue) : '') }]} />
      <dl className="details">
        <dt>Regular pay</dt><dd>{ugx(line.regular_pay)}</dd><dt>Overtime pay</dt><dd>{ugx(line.overtime_pay)}</dd><dt>Holiday pay</dt><dd>{ugx(line.holiday_pay)}</dd>
        <dt>Night allowance</dt><dd>{ugx(line.night_allowance)}</dd><dt>Additions</dt><dd>{ugx(line.additions)}</dd><dt>Gross</dt><dd>{ugx(line.gross)}</dd>
        <dt>Deductions</dt><dd>{ugx(line.deductions)}</dd><dt>Net pay</dt><dd><strong>{ugx(line.net)}</strong></dd>
      </dl>
    </div>
  );
}

function AdjustmentForm({ month, guards, onSaved, onClose }) {
  const [f, setF] = useState({ guard_id: guards[0] ? String(guards[0].guard_id) : '', type: 'deduction', amount_ugx: '', reason: '' });
  const [err, setErr] = useState(null); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr(null);
    const amount = Number(f.amount_ugx);
    if (!f.reason.trim()) return setErr({ message: 'A reason is required', details: [{ field: 'reason', issue: 'is required' }] });
    if (!f.guard_id) return setErr({ message: 'Choose a guard' });
    if (!Number.isInteger(amount) || amount < 1) return setErr({ message: 'Amount must be a whole number of UGX, at least 1' });
    setSaving(true);
    try { await addAdjustment({ guard_id: Number(f.guard_id), month, type: f.type, amount_ugx: amount, reason: f.reason.trim() }); onSaved(); }
    catch (x) { setErr(x); } finally { setSaving(false); }
  }
  return (
    <form className="card" onSubmit={save} aria-label="Add adjustment">
      <h3>Add adjustment</h3>
      <div className="inline-form">
        <FormField id="adj-guard" label="Guard"><select id="adj-guard" value={f.guard_id} onChange={set('guard_id')}>{guards.map((g) => <option key={g.guard_id} value={g.guard_id}>{g.name}</option>)}</select></FormField>
        <FormField id="adj-type" label="Type"><select id="adj-type" value={f.type} onChange={set('type')}><option value="deduction">Deduction</option><option value="addition">Addition</option></select></FormField>
        <FormField id="adj-amount" label="Amount (UGX)"><input id="adj-amount" inputMode="numeric" value={f.amount_ugx} onChange={set('amount_ugx')} /></FormField>
        <FormField id="adj-reason" label="Reason (required)"><input id="adj-reason" value={f.reason} onChange={set('reason')} /></FormField>
      </div>
      <ErrorBox error={err} />
      <div className="form-actions"><button className="btn btn-primary" disabled={saving}>Save adjustment</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
    </form>
  );
}

export default function Payroll() {
  const [month, setMonth] = useState(thisMonth());
  const [run, setRun] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openLine, setOpenLine] = useState(null);
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null); setOpenLine(null);
    try { setRun((await getPayrollRun(month)).data); setMissing(false); }
    catch (e) { setRun(null); if (e.status === 404) setMissing(true); else setError(e); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, msg) {
    setError(null); setNote('');
    try { const r = await fn(); if (r && r.data) setRun(r.data); setNote(msg); }
    catch (e) { setError(e); }
  }
  async function exportCsv() { try { await downloadFile(`/payroll/runs/${month}/export`, { format: 'csv' }, `payroll-${month}.csv`); } catch (e) { setError(e); } }

  const guards = run ? run.lines.map((l) => ({ guard_id: l.guard_id, name: l.name })) : [];
  const t = run && run.totals;
  const finalised = run && run.locked;

  return (
    <>
      <PageHeader title="Monthly payroll" subtitle="Admin only. All money is whole UGX. Statutory deductions are added as adjustments by the accountant." />
      <div className="card">
        <div className="inline-form">
          <FormField id="pay-month" label="Month"><input id="pay-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></FormField>
          {missing && <button className="btn btn-primary" onClick={() => act(() => createPayrollRun(month), 'Payroll run created')}>Create run for {month}</button>}
        </div>
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} />
      {note && <div className="success-box" role="status">{note}</div>}
      {missing && !loading && <p className="muted">No payroll run for {month} yet.</p>}
      {run && !loading && (
        <>
          <Stepper status={run.status} />
          {run.blockers.length > 0 && (
            <div className="notice" role="alert">
              <strong>Cannot finalise yet.</strong> {run.blockers.length} problem(s): {[...new Set(run.blockers.map((b) => label(b.code)))].join(', ')}. Fix them in Attendance, then Recalculate.
            </div>
          )}
          <div className="stat-grid">
            <StatCard label="Guards paid" value={t.guards} /><StatCard label="Gross" value={ugx(t.gross)} />
            <StatCard label="Deductions" value={ugx(t.deductions)} /><StatCard label="Net pay" value={ugx(t.net)} tone="good" />
          </div>
          <div className="card">
            <div className="row-actions">
              {!finalised && <button className="btn" onClick={() => act(() => recalculatePayroll(month), 'Recalculated')}>Recalculate</button>}
              {!finalised && <button className="btn" onClick={() => setAdding(true)}>Add adjustment</button>}
              {run.status === 'draft' && <button className="btn" onClick={() => act(() => reviewPayroll(month), 'Marked as reviewed')}>Mark reviewed</button>}
              {run.status === 'reviewed' && <ConfirmButton className="btn btn-primary" label="Finalise run" confirmLabel="Click again to lock this month" onConfirm={() => act(() => finalisePayroll(month), 'Payroll finalised and locked')} />}
              <button className="btn" onClick={exportCsv}>Export CSV</button>
            </div>
            {finalised && (
              <div className="inline-form" style={{ marginTop: 12 }}>
                <FormField id="unlock-reason" label="Unlock reason (required)"><input id="unlock-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
                <button className="btn btn-danger" disabled={!reason.trim()} onClick={() => act(() => unlockPayroll(month, reason.trim()), 'Run unlocked and back to draft')}>Unlock</button>
              </div>
            )}
          </div>
          {adding && <AdjustmentForm month={month} guards={guards} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNote('Adjustment saved'); load(); }} />}
          <div className="card">
            <DataTable rows={run.lines.map((l) => ({ ...l, id: l.guard_id }))} empty="No paid shifts in this month."
              columns={[{ key: 'employee_no', label: 'No.' }, { key: 'name', label: 'Guard' }, { key: 'days_worked', label: 'Days' }, { key: 'paid_hours', label: 'Paid h' },
                { key: 'overtime_hours', label: 'OT h' }, { key: 'holiday_hours', label: 'Holiday h' }, { key: 'night_shifts', label: 'Nights' },
                { key: 'gross', label: 'Gross', render: (l) => ugx(l.gross) }, { key: 'deductions', label: 'Deductions', render: (l) => ugx(l.deductions) }, { key: 'net', label: 'Net', render: (l) => <strong>{ugx(l.net)}</strong> },
                { key: 'act', label: '', render: (l) => <button className="link-btn" onClick={() => setOpenLine(l)}>View {l.name}</button> }]} />
          </div>
          {openLine && <Drawer line={openLine} onClose={() => setOpenLine(null)} />}
          <div className="card">
            <h3>Adjustments this month</h3>
            <DataTable rows={run.adjustments} empty="No adjustments."
              columns={[{ key: 'guard_id', label: 'Guard', render: (a) => (guards.find((g) => g.guard_id === a.guard_id) || {}).name || `#${a.guard_id}` }, { key: 'type', label: 'Type', render: (a) => label(a.type) },
                { key: 'amount_ugx', label: 'Amount', render: (a) => ugx(a.amount_ugx) }, { key: 'reason', label: 'Reason' }]} />
          </div>
        </>
      )}
    </>
  );
}

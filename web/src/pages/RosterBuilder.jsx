// One roster as a week grid: rows are shift templates, columns are days.
// The checks panel re-runs the rules after every change.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addShift, getRoster, publishRoster, removeShift, unpublishRoster, validateRoster } from '../api/rosters';
import { listShiftTemplates } from '../api/settings';
import { listSiteGuards } from '../api/sites';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { addDays, dayName, label } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';
import ConfirmButton from '../components/ConfirmButton';

export default function RosterBuilder() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = ['admin', 'ops_manager'].includes(user.role);
  const [version, setVersion] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const roster = useApi(() => getRoster(id), [id, version]);
  const checks = useApi(() => validateRoster(id), [id, version]);
  const templates = useApi(() => listShiftTemplates());
  const siteId = roster.data ? roster.data.site_id : null;
  const guards = useApi(() => (siteId ? listSiteGuards(siteId) : Promise.resolve(null)), [siteId]);

  const r = roster.data;
  const draft = r && r.status === 'draft';
  const editable = canEdit && draft;
  const days = r ? Array.from({ length: 7 }, (_, i) => addDays(r.week_start, i)) : [];
  const refresh = () => setVersion((v) => v + 1);

  async function run(action, doneMessage) {
    setActionError(null); setMessage(''); setBusy(true);
    try { await action(); if (doneMessage) setMessage(doneMessage); refresh(); }
    catch (err) { setActionError(err); }
    finally { setBusy(false); }
  }

  const add = (template, date, guardId) => guardId && run(() => addShift(id, { guard_id: Number(guardId), shift_template_id: template.id, date }));
  const remove = (shift) => run(() => removeShift(id, shift.id));
  const violations = checks.data ? checks.data.violations : [];
  const valid = checks.data ? checks.data.valid : false;

  return (
    <>
      <PageHeader title={r ? `${r.site_name}: week of ${r.week_start}` : 'Roster'}
        subtitle={r ? `Status: ${label(r.status)}` : ''}
        actions={<Link className="btn" to="/rosters">Back to rosters</Link>} />
      {roster.loading && !r && <Loading />}
      <ErrorBox error={roster.error} onRetry={roster.reload} />
      {message && <div className="success-box" role="status">{message}</div>}
      {actionError && (
        <div className="error-box" role="alert">
          <strong>{actionError.code === 'ROSTER_INVALID' ? 'The roster cannot be published yet' : 'That did not work'}</strong>
          <p>{actionError.message}</p>
          {Array.isArray(actionError.details) && actionError.details.map((d, i) => <p key={i}>{d.message || `${d.field}: ${d.issue}`}</p>)}
        </div>
      )}

      {r && (
        <>
          <div className="card">
            <h2>Week grid</h2>
            {!draft && <p className="muted">This roster is published. Unpublish it to change shifts.</p>}
            <div className="table-wrap">
              <table className="roster-grid">
                <thead>
                  <tr><th>Shift</th>{days.map((d) => <th key={d}>{dayName(d)}</th>)}</tr>
                </thead>
                <tbody>
                  {(templates.data || []).map((t) => (
                    <tr key={t.id}>
                      <th scope="row">{t.name}<div className="muted">{t.start_time} to {t.end_time}</div></th>
                      {days.map((d) => {
                        const here = r.shifts.filter((s) => s.date === d && s.shift_template_id === t.id);
                        return (
                          <td key={d}>
                            <ul className="chip-list">
                              {here.map((s) => (
                                <li key={s.id} className="chip">
                                  <span>{s.guard_name}</span>
                                  {editable && <button type="button" className="chip-x" aria-label={`Remove ${s.guard_name} from ${t.name} on ${d}`} disabled={busy} onClick={() => remove(s)}>x</button>}
                                </li>
                              ))}
                            </ul>
                            {editable && (
                              <select aria-label={`Add guard to ${t.name} on ${d}`} value="" disabled={busy} onChange={(e) => add(t, d, e.target.value)}>
                                <option value="">+ Add</option>
                                {(guards.data || []).filter((g) => g.is_active && !here.some((s) => s.guard_id === g.id)).map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                              </select>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" aria-label="Live checks">
            <h2>Live checks</h2>
            {checks.loading && !checks.data && <Loading text="Checking the rules..." />}
            <ErrorBox error={checks.error} onRetry={checks.reload} />
            {checks.data && valid && <p role="status" className="badge badge-good">All checks pass. This roster can be published.</p>}
            {checks.data && !valid && (
              <>
                <p role="status"><strong>{violations.length} rule{violations.length === 1 ? '' : 's'} broken</strong></p>
                <ul className="violations">
                  {violations.map((v, i) => <li key={i}><span className="badge badge-warn">{label(v.rule)}</span> {v.message}</li>)}
                </ul>
              </>
            )}
            {canEdit && (
              <div className="form-actions">
                {draft && <button className="btn btn-primary" disabled={busy || !valid} onClick={() => run(() => publishRoster(id), 'Roster published. The guards have been notified.')}>Publish roster</button>}
                {r.status === 'published' && <ConfirmButton label="Unpublish roster" disabled={busy} onConfirm={() => run(() => unpublishRoster(id), 'Roster is a draft again.')} />}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

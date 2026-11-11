import { useState } from 'react';
import { createRoute, listCheckpoints, listRoutes } from '../../api/sites';
import { fieldErrors, toInt } from '../../lib/forms';
import { useApi } from '../../hooks/useApi';
import FormField from '../../components/FormField';
import StaleNotice from '../../components/StaleNotice';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';

export default function RoutesTab({ siteId, canEdit }) {
  const routes = useApi(() => listRoutes(siteId), [siteId], { cacheKey: `routes:${siteId}` });
  const cps = useApi(() => listCheckpoints(siteId), [siteId], { cacheKey: `checkpoints:${siteId}` });
  const [form, setForm] = useState({ name: '', times: '', max_round_minutes: '45', min_seconds_between_scans: '60' });
  const [chosen, setChosen] = useState([]);       // checkpoint ids in walking order
  const [pick, setPick] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [message, setMessage] = useState('');
  const set = (n) => (e) => setForm((f) => ({ ...f, [n]: e.target.value }));

  const active = (cps.data || []).filter((c) => c.is_active);
  const available = active.filter((c) => !chosen.includes(c.id));
  const nameOf = (cid) => (cps.data || []).find((c) => c.id === cid)?.name || cid;
  const move = (i, d) => setChosen((list) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; return next; });

  async function add(event) {
    event.preventDefault();
    setApiError(null); setMessage('');
    const times = form.times.split(',').map((t) => t.trim()).filter(Boolean);
    const e = {};
    if (!form.name.trim()) e.name = 'is required';
    if (chosen.length === 0) e.checkpoint_sequence = 'add at least one checkpoint';
    if (times.length === 0 || times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) e.round_start_times = 'enter times like 20:00, 22:00';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await createRoute(siteId, { name: form.name.trim(), checkpoint_sequence: chosen, round_start_times: times,
        max_round_minutes: toInt(form.max_round_minutes), min_seconds_between_scans: toInt(form.min_seconds_between_scans) });
      setForm({ name: '', times: '', max_round_minutes: '45', min_seconds_between_scans: '60' }); setChosen([]); setMessage('Route added.');
      routes.reload();
    } catch (err) { setErrors(fieldErrors(err)); setApiError(err); }
  }

  return (
    <>
      <StaleNotice at={routes.staleAt} />
      {message && <div className="success-box" role="status">{message}</div>}
      {routes.loading && <Loading />}
      <ErrorBox error={routes.error} onRetry={routes.reload} />
      {routes.data && (routes.data.length === 0 ? <p className="muted">No routes yet.</p> : routes.data.map((r) => (
        <div className="card" key={r.id}>
          <h2>{r.name}</h2>
          <p className="muted">Rounds start at {r.round_start_times.join(', ')} | up to {r.max_round_minutes} minutes per round | at least {r.min_seconds_between_scans} seconds between scans</p>
          <ol>{r.checkpoints.map((c) => <li key={c.id}>{c.name} <code>{c.tag_code}</code></li>)}</ol>
        </div>
      )))}
      {canEdit && (
        <form className="card" onSubmit={add} noValidate>
          <h2>Add route</h2>
          <div className="form-grid">
            <FormField id="route_name" label="Route name" error={errors.name}><input id="route_name" value={form.name} onChange={set('name')} placeholder="Night perimeter walk" /></FormField>
            <FormField id="route_times" label="Round start times" error={errors.round_start_times} hint="Separate with commas, 24-hour time"><input id="route_times" value={form.times} onChange={set('times')} placeholder="20:00, 22:00, 00:00" /></FormField>
            <FormField id="route_max" label="Max minutes per round" error={errors.max_round_minutes}><input id="route_max" inputMode="numeric" value={form.max_round_minutes} onChange={set('max_round_minutes')} /></FormField>
            <FormField id="route_min" label="Min seconds between scans" error={errors.min_seconds_between_scans}><input id="route_min" inputMode="numeric" value={form.min_seconds_between_scans} onChange={set('min_seconds_between_scans')} /></FormField>
          </div>
          <div className="field">
            <label htmlFor="route_pick">Checkpoints in walking order</label>
            <ul className="chosen-list">
              {chosen.map((cid, i) => (
                <li key={cid}>
                  <span>{i + 1}. {nameOf(cid)}</span>
                  <button type="button" className="link-btn" disabled={i === 0} onClick={() => move(i, -1)}>Up</button>
                  <button type="button" className="link-btn" disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>Down</button>
                  <button type="button" className="link-btn" onClick={() => setChosen((l) => l.filter((x) => x !== cid))}>Remove</button>
                </li>
              ))}
            </ul>
            <div className="inline-form">
              <div className="field">
                <select id="route_pick" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose a checkpoint</option>
                  {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button type="button" className="btn" disabled={!pick} onClick={() => { setChosen((l) => [...l, Number(pick)]); setPick(''); }}>Add to route</button>
            </div>
            {errors.checkpoint_sequence && <div className="field-error" role="alert">{errors.checkpoint_sequence}</div>}
          </div>
          <ErrorBox error={apiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError : null} />
          <button className="btn btn-primary" type="submit">Add route</button>
        </form>
      )}
    </>
  );
}

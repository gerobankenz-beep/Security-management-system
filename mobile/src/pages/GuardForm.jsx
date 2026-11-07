// Admin: add a new guard (/guards/new) or edit one (/guards/:id).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createGuard, deactivateGuard, getGuard, reactivateGuard, resetPassword, setGuardSites, updateGuard } from '../api/guards';
import { listSites } from '../api/sites';
import { EMAIL_RE, clean, fieldErrors, toInt } from '../lib/forms';
import PageHeader from '../components/PageHeader';
import FormField from '../components/FormField';
import ConfirmButton from '../components/ConfirmButton';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const EMPTY = { full_name: '', email: '', phone: '', employee_no: '', hourly_rate_ugx: '', night_allowance_ugx: '', overtime_multiplier: '', password: '' };

export default function GuardForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [siteIds, setSiteIds] = useState([]);
  const [sites, setSites] = useState([]);
  const [guard, setGuard] = useState(null);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [result, setResult] = useState(null);   // { message, password? }
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);

  const load = async () => {
    try {
      const s = await listSites({ per_page: 100 });
      setSites(s.data);
      if (editing) {
        const g = (await getGuard(id)).data;
        setGuard(g);
        setForm({ ...EMPTY, full_name: g.full_name, email: g.email, phone: g.phone || '', employee_no: g.employee_no || '',
          hourly_rate_ugx: g.pay_profile ? String(g.pay_profile.hourly_rate_ugx) : '', night_allowance_ugx: g.pay_profile ? String(g.pay_profile.night_allowance_ugx) : '',
          overtime_multiplier: g.pay_profile && g.pay_profile.overtime_multiplier ? String(g.pay_profile.overtime_multiplier) : '' });
        setSiteIds(g.site_ids);
      }
    } catch (e) { setApiError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const toggleSite = (sid) => setSiteIds((ids) => (ids.includes(sid) ? ids.filter((x) => x !== sid) : [...ids, sid]));

  function validate() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'is required';
    if (!editing) {
      if (!form.email.trim()) e.email = 'is required'; else if (!EMAIL_RE.test(form.email)) e.email = 'must be a valid email';
      if (form.password && form.password.length < 8) e.password = 'must be at least 8 characters';
    }
    if (form.hourly_rate_ugx === '') e.hourly_rate_ugx = 'is required';
    else if (!(Number(form.hourly_rate_ugx) >= 0) || !Number.isInteger(Number(form.hourly_rate_ugx))) e.hourly_rate_ugx = 'must be a whole number, 0 or more';
    if (form.overtime_multiplier !== '' && !(Number(form.overtime_multiplier) >= 1 && Number(form.overtime_multiplier) <= 5)) e.overtime_multiplier = 'must be between 1 and 5';
    return e;
  }

  async function submit(event) {
    event.preventDefault();
    setApiError(null); setResult(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = clean({
        full_name: form.full_name.trim(), phone: form.phone.trim(), employee_no: form.employee_no.trim(),
        hourly_rate_ugx: toInt(form.hourly_rate_ugx), night_allowance_ugx: toInt(form.night_allowance_ugx),
        overtime_multiplier: form.overtime_multiplier === '' ? undefined : Number(form.overtime_multiplier),
      });
      if (editing) {
        const updated = (await updateGuard(id, body)).data;
        await setGuardSites(id, siteIds);
        setGuard({ ...updated, site_ids: siteIds });
        setResult({ message: 'Guard saved.' });
      } else {
        const created = (await createGuard({ ...body, email: form.email.trim(), password: form.password || undefined, site_ids: siteIds })).data;
        setResult({ message: `Guard ${created.full_name} was added.`, password: created.temporary_password });
        setForm(EMPTY); setSiteIds([]);
      }
    } catch (err) {
      setErrors(err.status === 409 ? { email: 'This email is already used by another account' } : fieldErrors(err));
      setApiError(err);
    } finally { setBusy(false); }
  }

  async function toggleActive() {
    setApiError(null); setResult(null);
    try {
      const g = (guard.is_active ? await deactivateGuard(id) : await reactivateGuard(id)).data;
      setGuard(g);
      setResult({ message: g.is_active ? 'Guard reactivated.' : 'Guard deactivated. They can no longer log in.' });
    } catch (err) { setApiError(err); }
  }

  async function doReset() {
    setApiError(null); setResult(null);
    try {
      const r = (await resetPassword(id)).data;
      setResult({ message: 'Password reset.', password: r.temporary_password });
    } catch (err) { setApiError(err); }
  }

  if (loading) return <Loading />;
  return (
    <>
      <PageHeader title={editing ? `Guard: ${guard ? guard.full_name : ''}` : 'Add guard'} subtitle={editing ? 'Edit details, pay and sites' : 'Creates a login for the guard mobile app'}
        actions={<Link className="btn" to="/guards">Back to list</Link>} />
      {result && (
        <div className="success-box" role="status">
          {result.message}
          {result.password && <p>Temporary password: <code>{result.password}</code><br />Shown only once. Give it to the guard and ask them to keep it private.</p>}
        </div>
      )}
      <ErrorBox error={apiError && apiError.status !== 409 && Object.keys(fieldErrors(apiError)).length === 0 ? apiError : null} />
      <form className="card" onSubmit={submit} noValidate>
        <div className="form-grid">
          <FormField id="full_name" label="Full name" error={errors.full_name}><input id="full_name" value={form.full_name} onChange={set('full_name')} /></FormField>
          <FormField id="email" label="Email (used to log in)" error={errors.email}>
            <input id="email" type="email" value={form.email} onChange={set('email')} disabled={editing} />
          </FormField>
          <FormField id="phone" label="Phone" error={errors.phone}><input id="phone" value={form.phone} onChange={set('phone')} /></FormField>
          <FormField id="employee_no" label="Employee number" error={errors.employee_no}><input id="employee_no" value={form.employee_no} onChange={set('employee_no')} /></FormField>
          <FormField id="hourly_rate_ugx" label="Hourly rate (UGX)" error={errors.hourly_rate_ugx}>
            <input id="hourly_rate_ugx" inputMode="numeric" value={form.hourly_rate_ugx} onChange={set('hourly_rate_ugx')} />
          </FormField>
          <FormField id="night_allowance_ugx" label="Night allowance per night shift (UGX)" error={errors.night_allowance_ugx}>
            <input id="night_allowance_ugx" inputMode="numeric" value={form.night_allowance_ugx} onChange={set('night_allowance_ugx')} />
          </FormField>
          <FormField id="overtime_multiplier" label="Overtime multiplier" error={errors.overtime_multiplier} hint="Leave blank to use the company setting">
            <input id="overtime_multiplier" inputMode="decimal" value={form.overtime_multiplier} onChange={set('overtime_multiplier')} />
          </FormField>
          {!editing && (
            <FormField id="password" label="Password" error={errors.password} hint="Leave blank to generate a temporary password">
              <input id="password" type="text" value={form.password} onChange={set('password')} autoComplete="off" />
            </FormField>
          )}
        </div>
        <div className="field">
          <label>Sites this guard may work at</label>
          {sites.length === 0 ? <p className="muted">No sites yet. Add a site first.</p> : (
            <div className="check-list">
              {sites.map((s) => (
                <label key={s.id}><input type="checkbox" checked={siteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />{s.name}</label>
              ))}
            </div>
          )}
          {errors.site_ids && <div className="field-error" role="alert">{errors.site_ids}</div>}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Add guard'}</button>
        </div>
      </form>
      {editing && guard && (
        <div className="card">
          <h2>Account</h2>
          <p className="muted">Status: {guard.is_active ? 'Active' : 'Inactive (cannot log in)'}</p>
          <div className="row-actions">
            <ConfirmButton label={guard.is_active ? 'Deactivate guard' : 'Reactivate guard'} onConfirm={toggleActive} />
            <ConfirmButton label="Reset password" onConfirm={doReset} />
          </div>
        </div>
      )}
    </>
  );
}

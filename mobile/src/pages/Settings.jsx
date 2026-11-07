// Admin: company rules (thresholds and payroll defaults), public holidays and shift templates.
import { useEffect, useState } from 'react';
import { createHoliday, createShiftTemplate, deleteHoliday, getSettings, listHolidays, listShiftTemplates, saveSettings } from '../api/settings';
import { fieldErrors } from '../lib/forms';
import PageHeader from '../components/PageHeader';
import FormField from '../components/FormField';
import ConfirmButton from '../components/ConfirmButton';
import DataTable from '../components/DataTable';
import Tabs from '../components/Tabs';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

// [key, label, hint]. Defaults are placeholders: confirm them with the company.
const FIELDS = [
  ['default_geofence_radius_m', 'Default geofence radius (metres)', 'Used when a site has none'],
  ['late_checkin_minutes', 'Late check-in after (minutes)', ''],
  ['no_show_minutes', 'No-show after (minutes)', 'Shift marked no-show if nobody checked in'],
  ['min_rest_hours', 'Minimum rest between shifts (hours)', 'Roster rule'],
  ['max_consecutive_days', 'Maximum working days in a row', 'Roster rule'],
  ['late_round_minutes', 'Late patrol round after (minutes)', 'Anomaly rule'],
  ['wrong_location_metres', 'Wrong-location scan distance (metres)', 'Anomaly rule'],
  ['overtime_weekly_threshold_hours', 'Overtime starts after (hours per week)', 'Payroll'],
  ['overtime_multiplier', 'Overtime pay multiplier', 'Payroll, for example 1.5'],
  ['holiday_multiplier', 'Public holiday pay multiplier', 'Payroll, for example 2'],
];

function RulesTab() {
  const [values, setValues] = useState(null);
  const [early, setEarly] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getSettings().then(({ data }) => {
      setValues(Object.fromEntries(FIELDS.map(([k]) => [k, String(data[k] ?? '')])));
      setEarly(Boolean(data.paid_early_arrival));
    }).catch(setApiError);
  }, []);

  async function save(event) {
    event.preventDefault();
    setApiError(null); setMessage('');
    const e = {};
    const body = { paid_early_arrival: early };
    FIELDS.forEach(([k]) => {
      if (values[k] === '' || Number.isNaN(Number(values[k]))) e[k] = 'must be a number'; else body[k] = Number(values[k]);
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    try { await saveSettings(body); setMessage('Settings saved.'); } catch (err) { setErrors(fieldErrors(err)); setApiError(err); }
  }

  if (!values) return apiError ? <ErrorBox error={apiError} /> : <Loading />;
  return (
    <form className="card" onSubmit={save} noValidate>
      <p className="muted">These defaults are placeholders. Confirm each one with the company before using them for real pay.</p>
      {message && <div className="success-box" role="status">{message}</div>}
      <ErrorBox error={apiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError : null} />
      <div className="form-grid">
        {FIELDS.map(([k, label, hint]) => (
          <FormField key={k} id={k} label={label} hint={hint} error={errors[k]}>
            <input id={k} inputMode="decimal" value={values[k]} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
          </FormField>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={early} onChange={(e) => setEarly(e.target.checked)} /> Pay minutes before the scheduled start
      </label>
      <button className="btn btn-primary" type="submit">Save settings</button>
    </form>
  );
}

function HolidaysTab() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ holiday_date: '', name: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const load = () => listHolidays().then(({ data }) => setRows(data)).catch(setApiError);
  useEffect(() => { load(); }, []);

  async function add(event) {
    event.preventDefault();
    const e = {};
    if (!form.holiday_date) e.holiday_date = 'choose a date';
    if (!form.name.trim()) e.name = 'is required';
    setErrors(e); setApiError(null);
    if (Object.keys(e).length) return;
    try { await createHoliday({ holiday_date: form.holiday_date, name: form.name.trim() }); setForm({ holiday_date: '', name: '' }); load(); }
    catch (err) { setErrors(fieldErrors(err)); setApiError(err); if (err.status === 409) setErrors({ holiday_date: 'that date is already a holiday' }); }
  }
  async function remove(id) { try { await deleteHoliday(id); load(); } catch (err) { setApiError(err); } }

  return (
    <>
      <div className="card">
        <p className="muted">Hours worked on these days are paid at the public holiday multiplier.</p>
        {!rows ? <Loading /> : <DataTable rows={rows} empty="No holidays yet." columns={[
          { key: 'holiday_date', label: 'Date' }, { key: 'name', label: 'Name' },
          { key: 'x', label: '', render: (h) => <ConfirmButton className="link-btn" label="Delete" onConfirm={() => remove(h.id)} /> },
        ]} />}
      </div>
      <form className="card" onSubmit={add} noValidate>
        <h2>Add holiday</h2>
        <ErrorBox error={apiError && Object.keys(fieldErrors(apiError)).length === 0 && apiError.status !== 409 ? apiError : null} />
        <div className="inline-form">
          <FormField id="holiday_date" label="Date" error={errors.holiday_date}><input id="holiday_date" type="date" value={form.holiday_date} onChange={(e) => setForm((f) => ({ ...f, holiday_date: e.target.value }))} /></FormField>
          <FormField id="holiday_name" label="Name" error={errors.name}><input id="holiday_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
          <button className="btn btn-primary" type="submit">Add holiday</button>
        </div>
      </form>
    </>
  );
}

function TemplatesTab() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ name: '', start_time: '', end_time: '', is_night: false });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const load = () => listShiftTemplates().then(({ data }) => setRows(data)).catch(setApiError);
  useEffect(() => { load(); }, []);

  async function add(event) {
    event.preventDefault();
    const e = {};
    if (!form.name.trim()) e.name = 'is required';
    ['start_time', 'end_time'].forEach((f) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form[f])) e[f] = 'use a time like 18:00'; });
    setErrors(e); setApiError(null);
    if (Object.keys(e).length) return;
    try { await createShiftTemplate({ ...form, name: form.name.trim() }); setForm({ name: '', start_time: '', end_time: '', is_night: false }); load(); }
    catch (err) { setErrors(fieldErrors(err)); setApiError(err); }
  }

  return (
    <>
      <div className="card">
        <p className="muted">If the end time is not after the start time, the shift runs past midnight. Night shifts earn the night allowance.</p>
        {!rows ? <Loading /> : <DataTable rows={rows} columns={[
          { key: 'name', label: 'Name' }, { key: 'start_time', label: 'Starts' }, { key: 'end_time', label: 'Ends' },
          { key: 'is_night', label: 'Night shift', render: (t) => (t.is_night ? 'Yes' : 'No') },
        ]} />}
      </div>
      <form className="card" onSubmit={add} noValidate>
        <h2>Add shift template</h2>
        <ErrorBox error={apiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError : null} />
        <div className="inline-form">
          <FormField id="tpl_name" label="Name" error={errors.name}><input id="tpl_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
          <FormField id="tpl_start" label="Starts (HH:MM)" error={errors.start_time}><input id="tpl_start" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} placeholder="14:00" /></FormField>
          <FormField id="tpl_end" label="Ends (HH:MM)" error={errors.end_time}><input id="tpl_end" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} placeholder="22:00" /></FormField>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={form.is_night} onChange={(e) => setForm((f) => ({ ...f, is_night: e.target.checked }))} /> Night shift</label>
          <button className="btn btn-primary" type="submit">Add template</button>
        </div>
      </form>
    </>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('rules');
  return (
    <>
      <PageHeader title="Settings" subtitle="Company rules that the roster, flags and payroll use" />
      <Tabs tabs={[{ key: 'rules', label: 'Rules' }, { key: 'holidays', label: 'Public holidays' }, { key: 'templates', label: 'Shift templates' }]} active={tab} onChange={setTab} />
      {tab === 'rules' && <RulesTab />}
      {tab === 'holidays' && <HolidaysTab />}
      {tab === 'templates' && <TemplatesTab />}
    </>
  );
}

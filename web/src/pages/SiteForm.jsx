// Admin: add a site (/sites/new) or edit one (/sites/:id/edit).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listClients } from '../api/clients';
import { createSite, getSite, updateSite } from '../api/sites';
import { clean, fieldErrors, toInt } from '../lib/forms';
import PageHeader from '../components/PageHeader';
import FormField from '../components/FormField';
import ConfirmButton from '../components/ConfirmButton';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const EMPTY = { client_id: '', name: '', address: '', latitude: '', longitude: '', geofence_radius_m: '', guards_required_day: '1', guards_required_night: '1', patrols_per_night: '0' };

export default function SiteForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [clients, setClients] = useState([]);
  const [site, setSite] = useState(null);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setClients((await listClients({ per_page: 100 })).data.filter((c) => c.is_active));
        if (editing) {
          const s = (await getSite(id)).data;
          setSite(s);
          setForm({ client_id: String(s.client_id), name: s.name, address: s.address || '', latitude: String(s.latitude), longitude: String(s.longitude),
            geofence_radius_m: String(s.geofence_radius_m), guards_required_day: String(s.guards_required_day), guards_required_night: String(s.guards_required_night), patrols_per_night: String(s.patrols_per_night) });
        }
      } catch (e) { setApiError(e); } finally { setLoading(false); }
    })();
  }, [id, editing]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function useMyLocation() {
    if (!navigator.geolocation) { setErrors((e) => ({ ...e, latitude: 'This browser cannot give your location' })); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })),
      () => setErrors((e) => ({ ...e, latitude: 'Could not get your location. Type the coordinates instead.' })));
  }

  function validate() {
    const e = {};
    if (!editing && !form.client_id) e.client_id = 'choose a client';
    if (!form.name.trim()) e.name = 'is required';
    const lat = Number(form.latitude); const lng = Number(form.longitude);
    if (form.latitude === '' || Number.isNaN(lat) || lat < -90 || lat > 90) e.latitude = 'must be a number between -90 and 90';
    if (form.longitude === '' || Number.isNaN(lng) || lng < -180 || lng > 180) e.longitude = 'must be a number between -180 and 180';
    if (form.geofence_radius_m !== '' && !(Number(form.geofence_radius_m) > 0)) e.geofence_radius_m = 'must be above 0';
    ['guards_required_day', 'guards_required_night', 'patrols_per_night'].forEach((f) => { if (form[f] === '' || !(Number.isInteger(Number(form[f])) && Number(form[f]) >= 0)) e[f] = 'must be 0 or more'; });
    return e;
  }

  async function submit(event) {
    event.preventDefault();
    setApiError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = clean({ name: form.name.trim(), address: form.address.trim(), latitude: Number(form.latitude), longitude: Number(form.longitude),
        geofence_radius_m: toInt(form.geofence_radius_m), guards_required_day: toInt(form.guards_required_day),
        guards_required_night: toInt(form.guards_required_night), patrols_per_night: toInt(form.patrols_per_night) });
      const saved = editing ? (await updateSite(id, body)).data : (await createSite({ ...body, client_id: Number(form.client_id) })).data;
      navigate(`/sites/${saved.id}`);
    } catch (err) { setErrors(fieldErrors(err)); setApiError(err); } finally { setBusy(false); }
  }

  async function toggleActive() {
    try { const s = (await updateSite(id, { is_active: !site.is_active })).data; setSite(s); } catch (err) { setApiError(err); }
  }

  if (loading) return <Loading />;
  return (
    <>
      <PageHeader title={editing ? `Edit site: ${site ? site.name : ''}` : 'Add site'} subtitle="Where guards work and how they are checked in"
        actions={<Link className="btn" to={editing ? `/sites/${id}` : '/sites'}>Cancel</Link>} />
      <ErrorBox error={apiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError : null} />
      <form className="card" onSubmit={submit} noValidate>
        <div className="form-grid">
          {!editing && (
            <FormField id="client_id" label="Client" error={errors.client_id}>
              <select id="client_id" value={form.client_id} onChange={set('client_id')}>
                <option value="">Choose a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
          )}
          <FormField id="name" label="Site name" error={errors.name}><input id="name" value={form.name} onChange={set('name')} /></FormField>
          <FormField id="address" label="Address" error={errors.address}><input id="address" value={form.address} onChange={set('address')} /></FormField>
          <FormField id="latitude" label="Latitude" error={errors.latitude} hint="For example 0.3345"><input id="latitude" inputMode="decimal" value={form.latitude} onChange={set('latitude')} /></FormField>
          <FormField id="longitude" label="Longitude" error={errors.longitude} hint="For example 32.5921"><input id="longitude" inputMode="decimal" value={form.longitude} onChange={set('longitude')} /></FormField>
          <FormField id="geofence_radius_m" label="Geofence radius (metres)" error={errors.geofence_radius_m} hint="Blank uses the company default">
            <input id="geofence_radius_m" inputMode="numeric" value={form.geofence_radius_m} onChange={set('geofence_radius_m')} />
          </FormField>
          <FormField id="guards_required_day" label="Guards needed by day" error={errors.guards_required_day}><input id="guards_required_day" inputMode="numeric" value={form.guards_required_day} onChange={set('guards_required_day')} /></FormField>
          <FormField id="guards_required_night" label="Guards needed by night" error={errors.guards_required_night}><input id="guards_required_night" inputMode="numeric" value={form.guards_required_night} onChange={set('guards_required_night')} /></FormField>
          <FormField id="patrols_per_night" label="Patrols per night" error={errors.patrols_per_night}><input id="patrols_per_night" inputMode="numeric" value={form.patrols_per_night} onChange={set('patrols_per_night')} /></FormField>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Add site'}</button>
          <button className="btn" type="button" onClick={useMyLocation}>Use my current location</button>
          {editing && site && <ConfirmButton label={site.is_active ? 'Deactivate site' : 'Reactivate site'} onConfirm={toggleActive} />}
        </div>
      </form>
    </>
  );
}

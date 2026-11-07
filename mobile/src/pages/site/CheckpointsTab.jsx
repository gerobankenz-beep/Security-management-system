import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createCheckpoint, listCheckpoints, updateCheckpoint } from '../../api/sites';
import { fieldErrors } from '../../lib/forms';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/DataTable';
import FormField from '../../components/FormField';
import StaleNotice from '../../components/StaleNotice';
import Loading from '../../components/Loading';
import ErrorBox from '../../components/ErrorBox';

export default function CheckpointsTab({ siteId, canEdit, canSheet }) {
  const { data, loading, error, staleAt, reload } = useApi(() => listCheckpoints(siteId), [siteId], { cacheKey: `checkpoints:${siteId}` });
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const set = (n) => (e) => setForm((f) => ({ ...f, [n]: e.target.value }));

  async function add(event) {
    event.preventDefault();
    const e = {};
    if (!form.name.trim()) e.name = 'is required';
    const lat = Number(form.latitude); const lng = Number(form.longitude);
    if (form.latitude === '' || Number.isNaN(lat) || lat < -90 || lat > 90) e.latitude = 'must be between -90 and 90';
    if (form.longitude === '' || Number.isNaN(lng) || lng < -180 || lng > 180) e.longitude = 'must be between -180 and 180';
    setErrors(e); setApiError(null);
    if (Object.keys(e).length) return;
    try {
      await createCheckpoint(siteId, { name: form.name.trim(), latitude: lat, longitude: lng });
      setForm({ name: '', latitude: '', longitude: '' });
      reload();
    } catch (err) { setErrors(fieldErrors(err)); setApiError(err); }
  }

  async function toggle(c) {
    try { await updateCheckpoint(c.id, { is_active: !c.is_active }); reload(); } catch (err) { setApiError(err); }
  }

  return (
    <>
      <StaleNotice at={staleAt} />
      {canSheet && <p><Link className="btn" to={`/sites/${siteId}/qr`}>Print QR sheet</Link></p>}
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={apiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError : null} />
      {data && (
        <DataTable rows={data} empty="No checkpoints yet." columns={[
          { key: 'name', label: 'Name' },
          { key: 'tag_code', label: 'Tag code (in the QR)', render: (c) => <code>{c.tag_code}</code> },
          { key: 'pos', label: 'Latitude, longitude', render: (c) => `${c.latitude}, ${c.longitude}` },
          { key: 'status', label: 'Status', render: (c) => <span className={c.is_active ? 'badge badge-good' : 'badge pill-off'}>{c.is_active ? 'Active' : 'Inactive'}</span> },
          ...(canEdit ? [{ key: 'actions', label: '', render: (c) => <button className="link-btn" onClick={() => toggle(c)}>{c.is_active ? 'Deactivate' : 'Reactivate'}</button> }] : []),
        ]} />
      )}
      {canEdit && (
        <form className="card" style={{ marginTop: 16 }} onSubmit={add} noValidate>
          <h2>Add checkpoint</h2>
          <div className="inline-form">
            <FormField id="cp_name" label="Name" error={errors.name}><input id="cp_name" value={form.name} onChange={set('name')} placeholder="Back gate" /></FormField>
            <FormField id="cp_lat" label="Latitude" error={errors.latitude}><input id="cp_lat" inputMode="decimal" value={form.latitude} onChange={set('latitude')} /></FormField>
            <FormField id="cp_lng" label="Longitude" error={errors.longitude}><input id="cp_lng" inputMode="decimal" value={form.longitude} onChange={set('longitude')} /></FormField>
            <button className="btn btn-primary" type="submit">Add checkpoint</button>
          </div>
          <p className="hint">The tag code is created automatically. Print the QR sheet after adding all checkpoints.</p>
        </form>
      )}
    </>
  );
}

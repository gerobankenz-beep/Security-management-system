import { useState } from 'react';
import { createClient, listClients, updateClient } from '../api/clients';
import { EMAIL_RE, clean, fieldErrors } from '../lib/forms';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import FormField from '../components/FormField';
import StaleNotice from '../components/StaleNotice';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';

const EMPTY = { name: '', contact_name: '', contact_phone: '', contact_email: '' };

export default function Clients() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);   // null = closed, 'new' or a client id
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [message, setMessage] = useState('');
  const { data, meta, loading, error, staleAt, reload } = useApi(() => listClients({ page, per_page: 10 }), [page], { cacheKey: `clients:${page}` });

  const open = (client) => { setEditing(client ? client.id : 'new'); setForm(client ? { name: client.name, contact_name: client.contact_name || '', contact_phone: client.contact_phone || '', contact_email: client.contact_email || '' } : EMPTY); setErrors({}); setApiError(null); setMessage(''); };
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    const e = {};
    if (!form.name.trim()) e.name = 'is required';
    if (form.contact_email && !EMAIL_RE.test(form.contact_email)) e.contact_email = 'must be a valid email';
    setErrors(e); setApiError(null);
    if (Object.keys(e).length) return;
    try {
      const body = clean({ name: form.name.trim(), contact_name: form.contact_name.trim(), contact_phone: form.contact_phone.trim(), contact_email: form.contact_email.trim() });
      if (editing === 'new') await createClient(body); else await updateClient(editing, body);
      setMessage(editing === 'new' ? 'Client added.' : 'Client saved.');
      setEditing(null); reload();
    } catch (err) { setErrors(fieldErrors(err)); setApiError(err); }
  }

  async function toggle(client) {
    try { await updateClient(client.id, { is_active: !client.is_active }); reload(); } catch (err) { setApiError(err); }
  }

  return (
    <>
      <PageHeader title="Clients" subtitle="Companies that buy security" actions={<button className="btn btn-primary" onClick={() => open(null)}>Add client</button>} />
      {message && <div className="success-box" role="status">{message}</div>}
      <StaleNotice at={staleAt} />
      {editing && (
        <form className="card" onSubmit={submit} noValidate>
          <h2>{editing === 'new' ? 'New client' : 'Edit client'}</h2>
          <div className="form-grid">
            <FormField id="name" label="Company name" error={errors.name}><input id="name" value={form.name} onChange={set('name')} /></FormField>
            <FormField id="contact_name" label="Contact person"><input id="contact_name" value={form.contact_name} onChange={set('contact_name')} /></FormField>
            <FormField id="contact_phone" label="Contact phone"><input id="contact_phone" value={form.contact_phone} onChange={set('contact_phone')} /></FormField>
            <FormField id="contact_email" label="Contact email" error={errors.contact_email}><input id="contact_email" type="email" value={form.contact_email} onChange={set('contact_email')} /></FormField>
          </div>
          <ErrorBox error={apiError && Object.keys(fieldErrors(apiError)).length === 0 ? apiError : null} />
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">Save client</button>
            <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="card">
          <DataTable rows={data} empty="No clients yet." columns={[
            { key: 'name', label: 'Company' }, { key: 'contact_name', label: 'Contact' }, { key: 'contact_phone', label: 'Phone' },
            { key: 'status', label: 'Status', render: (c) => <span className={c.is_active ? 'badge badge-good' : 'badge pill-off'}>{c.is_active ? 'Active' : 'Inactive'}</span> },
            { key: 'actions', label: '', render: (c) => (
              <div className="row-actions">
                <button className="link-btn" onClick={() => open(c)}>Edit</button>
                <button className="link-btn" onClick={() => toggle(c)}>{c.is_active ? 'Deactivate' : 'Reactivate'}</button>
              </div>) },
          ]} />
          <Pagination meta={meta} onChange={setPage} />
        </div>
      )}
    </>
  );
}

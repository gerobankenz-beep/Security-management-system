// Printable sheet of checkpoint QR codes for one site. Use the browser's Print (Ctrl+P): the menu is hidden.
import { Link, useParams } from 'react-router-dom';
import { getTagSheet } from '../api/sites';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';
import { Printer } from 'lucide-react';

export default function PrintQr() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi(() => getTagSheet(id), [id]);

  return (
    <>
      <div className="no-print">
        <PageHeader title={data ? `QR sheet: ${data.site.name}` : 'QR sheet'} subtitle="Print this page and fix each code at its checkpoint"
          actions={<><Link className="btn" to={`/sites/${id}`}>Back to site</Link> <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print</button></>} />
      </div>
      {data && <h2 className="print-title" style={{ display: 'none' }}>{data.site.name}</h2>}
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (data.checkpoints.length === 0 ? <p className="muted">This site has no active checkpoints yet.</p> : (
        <div className="qr-grid">
          {data.checkpoints.map((c) => (
            <div className="qr-card" key={c.id}>
              <img src={c.qr_data_url} alt={`QR code for ${c.name}`} />
              <div className="qr-name">{c.name}</div>
              <div className="qr-code">{c.tag_code}</div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

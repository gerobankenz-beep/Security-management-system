import { CircleAlert, RefreshCw } from 'lucide-react';
import { USE_MOCKS } from '../api/client';

// Shows a friendly message for an ApiError. 501 means "the backend owner has not built this yet".
export default function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  const notBuilt = error.status === 501;
  return (
    <div className="error-box" role="alert">
      <strong className="error-title"><CircleAlert size={18} aria-hidden="true" />{notBuilt ? 'Not built yet' : 'Something went wrong'}</strong>
      <p>{error.message}</p>
      {notBuilt && !USE_MOCKS && <p>The backend endpoint is still a stub. Set VITE_USE_MOCKS=true in .env to see sample data.</p>}
      {error.details && error.details.map((d, i) => <p key={i}>{d.field}: {d.issue}</p>)}
      {onRetry && <button className="btn" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Try again</button>}
    </div>
  );
}

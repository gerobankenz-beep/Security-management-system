import { WifiOff } from 'lucide-react';

// Shown when a list is displayed from saved data because the internet is down.
export default function StaleNotice({ at }) {
  if (!at) return null;
  return (
    <div className="notice" role="status">
      <WifiOff size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
      <span>
      Showing saved data from {new Date(at).toLocaleString()}. You are offline or the server is unreachable. Changes cannot be saved until you reconnect.</span>
    </div>
  );
}

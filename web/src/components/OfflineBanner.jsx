import { useOnline } from '../hooks/useOnline';

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      You are offline. Your changes won't be saved until you reconnect.
    </div>
  );
}

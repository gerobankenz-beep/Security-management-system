import { WifiOff } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={17} aria-hidden="true" />
      You are offline. You can look at saved lists, but changes cannot be saved until you reconnect.
    </div>
  );
}

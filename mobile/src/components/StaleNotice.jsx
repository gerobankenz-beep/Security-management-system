// Shown when a list is displayed from saved data because the internet is down.
export default function StaleNotice({ at }) {
  if (!at) return null;
  return (
    <div className="notice" role="status">
      Showing saved data from {new Date(at).toLocaleString()}. You are offline or the server is unreachable. Changes cannot be saved until you reconnect.
    </div>
  );
}

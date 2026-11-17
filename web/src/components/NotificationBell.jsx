import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { listNotifications, markNotification } from '../api/notifications';
import { useApi } from '../hooks/useApi';
import { fmtDateTime } from '../lib/format';

const REFRESH_MS = 60000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data, meta, reload } = useApi(() => listNotifications({ per_page: 10 }));

  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const unread = meta ? meta.unread : 0;

  async function openItem(n) {
    try { if (!n.is_read) await markNotification(n.id, true); } catch { /* the link still works */ }
    setOpen(false);
    reload();
    if (n.link) navigate(n.link);
  }

  return (
    <div className="bell">
      <button type="button" className="icon-btn bell-btn" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell size={18} aria-hidden="true" />{unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="region" aria-label="Notification list">
          <div className="bell-title">Notifications</div>
          {(!data || data.length === 0) && <p className="muted bell-empty">No notifications.</p>}
          <ul>
            {(data || []).map((n) => (
              <li key={n.id} className={n.is_read ? 'read' : 'unread'}>
                <button type="button" className="link-btn" onClick={() => openItem(n)}>{n.message}</button>
                <div className="muted">{fmtDateTime(n.created_at)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

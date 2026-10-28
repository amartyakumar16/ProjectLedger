import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { Empty } from '../components/ui.jsx';
import { fmtDateTime } from '../lib/util.js';

export default function Notifications() {
  const { state, user, run, A } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const list = state.notifications.filter((n) => n.userId === user.id && (filter === 'all' || !n.read)).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <div className="page-head">
        <div><h1>Notifications</h1><p className="muted">In-app alerts. Email delivery and digest frequency are configurable in production.</p></div>
        <div className="btn-row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 140 }}><option value="all">All</option><option value="unread">Unread</option></select>
          <button className="btn" onClick={() => run(A.markNotifications, {}, { success: 'All marked as read' })}>Mark all read</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {!list.length ? <Empty title="No notifications" icon="🔔" /> : list.map((n) => (
          <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`}>
            {!n.read ? <span className="dot" /> : <span style={{ width: 8 }} />}
            <div style={{ flex: 1 }}>
              <strong>{n.title}</strong>
              <div className="small">{n.body}</div>
              <div className="small muted">{fmtDateTime(n.at)}</div>
            </div>
            <div className="btn-row">
              {n.link && <button className="btn sm" onClick={() => { run(A.markNotifications, { ids: [n.id] }); navigate(n.link); }}>Open</button>}
              <button className="btn sm" onClick={() => run(A.markNotifications, { ids: [n.id], read: !n.read })}>{n.read ? 'Mark unread' : 'Mark read'}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

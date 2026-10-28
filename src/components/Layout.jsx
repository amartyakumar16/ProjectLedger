import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, ROLES } from '../lib/permissions.js';
import { currentApprover } from '../store/actions.js';
import { Avatar } from './ui.jsx';
import BrandMark from './BrandMark.jsx';

export default function Layout() {
  const { state, user, run, A } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const loc = useLocation();

  const unread = state.notifications.filter((n) => n.userId === user.id && !n.read).length;
  const pendingFunding = state.fundingRequests.filter((r) => currentApprover(r) === user.id).length;
  const pendingExpenses = can(user, 'expense.approve')
    ? state.expenses.filter((e) => e.state === 'Submitted' && e.submitterId !== user.id && (user.role !== 'pm' || state.projects.find((p) => p.id === e.projectId)?.managerId === user.id)).length
    : 0;

  const nav = [
    { to: '/closed-requests', label: 'Closed Requests', ico: '✓', show: true },
    { to: '/pdf-to-excel', label: 'PDF to Excel', ico: '▦', show: true },
    { to: '/', label: 'Dashboard', ico: '◧', show: true, end: true },
    { to: '/projects', label: 'Projects', ico: '▤', show: true },
    { to: '/worker-progress', label: 'Worker daily progress', ico: '▦', show: can(user, 'log.create') },
    { to: '/expenses', label: 'Expenses', ico: '₹', show: true, count: pendingExpenses },
    { to: '/daily-update', label: 'Daily update', ico: '✎', show: can(user, 'log.create') },
    { to: '/funding', label: 'Funding requests', ico: '⇪', show: can(user, 'funding.create') || can(user, 'funding.decide') || can(user, 'reports.view') },
    { to: '/approvals', label: 'Approver inbox', ico: '✓', show: can(user, 'funding.decide') || can(user, 'expense.approve'), count: pendingFunding },
    { to: '/people', label: 'People & time', ico: '☺', show: true },
    { to: '/payroll', label: 'Payroll costs', ico: '¤', show: can(user, 'payroll.manage') },
    { section: 'Insights' },
    { to: '/reports', label: 'Reports', ico: '▦', show: can(user, 'reports.view') },
    { to: '/notifications', label: 'Notifications', ico: '🔔', show: true, count: unread },
    { to: '/audit', label: 'Audit explorer', ico: '⌕', show: can(user, 'audit.view') },
    { to: '/admin', label: 'Administration', ico: '⚙', show: can(user, 'admin.manage') },
  ];

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="brand-logo"><BrandMark /></div>
          <div>ProjectLedger<small>{state.org.name}</small></div>
        </div>
        <nav className="nav" aria-label="Main">
          {nav.map((n, i) =>
            n.section ? (
              <div key={i} className="nav-section">{n.section}</div>
            ) : (
              n.show && (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  <span className="ico" aria-hidden>{n.ico}</span>
                  {n.label}
                  {n.count ? <span className="count">{n.count}</span> : null}
                </NavLink>
              )
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          Currency: INR (₹) · v1.0
          <br />
          Demo build — data stored in this browser
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn sm menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/search?q=${encodeURIComponent(q)}`);
            }}
          >
            <input type="search" placeholder="Search projects, expenses, vendors, people, tasks…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global search" />
          </form>
          <div className="user">
            <NavLink to="/notifications" className="btn sm" aria-label="Notifications">🔔 {unread ? <span className="badge red">{unread}</span> : null}</NavLink>
            <Avatar name={user.name} />
            <div className="small" style={{ lineHeight: 1.2 }}>
              <strong>{user.name}</strong>
              <div className="muted">{ROLES[user.role].short}</div>
            </div>
            <button className="btn sm" onClick={() => { run(A.logout); navigate('/'); }}>Switch user</button>
          </div>
        </header>
        <main className="content" key={loc.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

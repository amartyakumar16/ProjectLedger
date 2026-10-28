import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { Badge, Empty } from '../components/ui.jsx';
import { formatINR, paiseToRupeeString } from '../lib/money.js';
import { fmtDate } from '../lib/util.js';

/** Cross-entity search (FR-006): projects, expenses, people, tasks, funding requests, logs. */
export default function Search() {
  const [params] = useSearchParams();
  const q = (params.get('q') || '').toLowerCase().trim();
  const { state, user } = useStore();
  const projects = visibleProjects(state, user);
  const ids = new Set(projects.map((p) => p.id));
  const has = (...xs) => xs.some((x) => String(x ?? '').toLowerCase().includes(q));
  const code = (pid) => state.projects.find((p) => p.id === pid)?.code;
  if (!q) return <Empty title="Type something in the search bar" />;
  const groups = [
    ['Projects', projects.filter((p) => has(p.code, p.name, p.sponsor, p.department)).map((p) => <Link key={p.id} to={`/projects/${p.id}`}>{p.code} — {p.name}</Link>)],
    ['Expenses', state.expenses.filter((e) => ids.has(e.projectId) && (user.role !== 'employee' || e.submitterId === user.id) && has(e.id, e.vendor, e.category, e.notes, paiseToRupeeString(e.amount))).slice(0, 30).map((e) => <Link key={e.id} to={`/expenses?focus=${e.id}`}>{fmtDate(e.date)} · {code(e.projectId)} · {e.category} · {e.vendor} · {formatINR(e.amount, { decimals: true })} <Badge>{e.state}</Badge></Link>)],
    ['Tasks', state.tasks.filter((t) => ids.has(t.projectId) && has(t.title)).map((t) => <Link key={t.id} to={`/projects/${t.projectId}?tab=tasks`}>{code(t.projectId)} · {t.title} <Badge>{t.status}</Badge></Link>)],
    ['People', user.role === 'employee' ? [] : state.employees.filter((e) => has(e.name, e.title, e.department)).map((e) => <Link key={e.id} to="/people">{e.name} · {e.title}</Link>)],
    ['Funding requests', (can(user, 'budget.view') || can(user, 'funding.create')) ? state.fundingRequests.filter((r) => ids.has(r.projectId) && has(r.number, r.reason)).map((r) => <Link key={r.id} to={`/funding/${r.id}`}>{r.number} · {code(r.projectId)} · {formatINR(r.amount)} <Badge>{r.state}</Badge></Link>) : []],
    ['Daily logs', state.dailyLogs.filter((l) => ids.has(l.projectId) && has(l.summary, l.blockers, l.completed)).slice(0, 20).map((l) => <Link key={l.id} to={`/projects/${l.projectId}?tab=logs`}>{fmtDate(l.date)} · {code(l.projectId)} · {l.summary}</Link>)],
  ];
  const total = groups.reduce((t, g) => t + g[1].length, 0);
  return (
    <>
      <h1>Search: “{params.get('q')}”</h1>
      <p className="muted">{total} result(s) within your access</p>
      {!total && <Empty title="No matches" />}
      {groups.filter((g) => g[1].length).map(([label, items]) => (
        <div className="card" key={label}>
          <h2>{label} ({items.length})</h2>
          {items.map((it, i) => <div key={i} style={{ padding: '4px 0' }}>{it}</div>)}
        </div>
      ))}
    </>
  );
}

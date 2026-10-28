import { Link } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects, employeeForUser } from '../lib/permissions.js';
import { projectFinancials, healthOf, overdueTasks, portfolioTotals, categoryBreakdown, EXPENSE_ACTUAL_STATES, PAYROLL_ACTUAL_STATES, payrollCost, dailyLogAdoption } from '../lib/finance.js';
import { Stat, Badge, BudgetBar, ProgressBar, HBarChart, LineChart, Money, Empty } from '../components/ui.jsx';
import { formatINR, formatINRCompact, sum } from '../lib/money.js';
import { todayISO, addDays, fmtDate, isWeekday } from '../lib/util.js';
import { currentApprover } from '../store/actions.js';

export default function Dashboard() {
  const { state, user } = useStore();
  const projects = visibleProjects(state, user).filter((p) => p.status !== 'Archived');
  const showMoney = can(user, 'budget.view');
  const today = todayISO();
  const lastWorkday = (() => {
    let d = today;
    while (!isWeekday(d)) d = addDays(d, -1);
    return d;
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
          <p className="muted">{roleBlurb(user.role)} · {fmtDate(today)}</p>
        </div>
        <div className="btn-row">
          {can(user, 'expense.create') && <Link className="btn" to="/expenses?new=1">+ Expense</Link>}
          {can(user, 'log.create') && <Link className="btn" to="/daily-update">+ Daily update</Link>}
          {can(user, 'funding.create') && <Link className="btn primary" to="/funding/new">Request funding</Link>}
        </div>
      </div>

      {showMoney ? <PortfolioStats state={state} projects={projects} /> : <EmployeePanel />}

      <Alerts state={state} user={user} projects={projects} lastWorkday={lastWorkday} />

      {showMoney && (
        <div className="card">
          <div className="card-head">
            <h2>Project health</h2>
            <div className="legend">
              <span><i style={{ background: 'var(--teal)' }} />Actual</span>
              <span><i style={{ background: '#f59e0b' }} />Committed</span>
              <span><i style={{ background: 'var(--red)' }} />Over budget</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th><th>Health</th><th>Progress</th><th style={{ minWidth: 160 }}>Budget use</th>
                  <th className="num">Approved</th><th className="num">Actual</th><th className="num">Committed</th><th className="num">Available</th><th className="num">Runway</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const f = projectFinancials(state, p.id);
                  const h = healthOf(state, p);
                  return (
                    <tr key={p.id}>
                      <td><Link to={`/projects/${p.id}`}><strong>{p.code}</strong></Link><div className="small muted">{p.name}</div></td>
                      <td><Badge tone={h.tone}>{h.label}</Badge><div className="small muted">{p.status}</div></td>
                      <td style={{ minWidth: 110 }}><ProgressBar value={f.progress} /><div className="small muted">{f.progress}%</div></td>
                      <td><BudgetBar approved={f.approved} actual={f.actual} committed={f.committed} /><div className="small muted">{f.utilization}% spent · {f.utilizationWithCommitted}% incl. committed</div></td>
                      <td className="num">{formatINRCompact(f.approved)}</td>
                      <td className="num">{formatINRCompact(f.actual)}</td>
                      <td className="num">{formatINRCompact(f.committed)}</td>
                      <td className={`num ${f.available < 0 ? 'neg' : ''}`} style={{ color: f.available < 0 ? 'var(--red)' : undefined }}>{formatINRCompact(f.available)}</td>
                      <td className="num">{f.runwayDays === null ? '—' : `${f.runwayDays} d`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showMoney && <Trends state={state} projects={projects} />}
    </>
  );
}

function roleBlurb(role) {
  return {
    owner: 'Executive portfolio view',
    finance: 'Finance overview: spending, claims, allocations and exceptions',
    pm: 'Your projects: progress, blockers, burn rate and remaining funds',
    employee: 'Your tasks, daily reports, time and expenses',
    approver: 'Pending decisions and project financial context',
    hr: 'Staffing and payroll cost allocation',
    auditor: 'Read-only portfolio and evidence view',
  }[role];
}

function PortfolioStats({ state, projects }) {
  const t = portfolioTotals(state, projects);
  return (
    <div className="grid g5" style={{ marginBottom: 16 }}>
      <Stat kind="approved" label="Approved budget" value={t.approved} sub={`${projects.length} active projects`} />
      <Stat kind="actual" label="Actual cost" value={t.actual} sub={`${t.approved ? Math.round((t.actual / t.approved) * 100) : 0}% of approved`} />
      <Stat kind="committed" label="Committed" value={t.committed} />
      <Stat kind="available" label="Available (uncommitted)" value={t.available} sub="Approved − actual − committed" />
      <Stat kind="forecast" label="Forecast at completion" value={t.forecast} sub={t.forecast > t.approved ? `${formatINR(t.forecast - t.approved)} over` : 'Within budget'} />
    </div>
  );
}

function Alerts({ state, user, projects, lastWorkday }) {
  const items = [];
  projects.filter((p) => p.status === 'Active').forEach((p) => {
    if (lastWorkday >= p.startDate && !state.dailyLogs.some((l) => l.projectId === p.id && l.date === lastWorkday) && (user.role !== 'employee')) {
      items.push({ tone: 'warn', text: <>Daily log missing for <Link to={`/projects/${p.id}?tab=logs`}>{p.code}</Link> on {fmtDate(lastWorkday)}</> });
    }
    const od = overdueTasks(state, p.id);
    if (od.length) items.push({ tone: 'warn', text: <><Link to={`/projects/${p.id}?tab=tasks`}>{p.code}</Link>: {od.length} overdue task(s) — {od.slice(0, 2).map((t) => t.title).join(', ')}</> });
    if (can(user, 'budget.view')) {
      const f = projectFinancials(state, p.id);
      if (f.approved && f.available < 0) items.push({ tone: 'danger', text: <><Link to={`/projects/${p.id}`}>{p.code}</Link> is over committed budget by {formatINR(-f.available)}</> });
      else if (f.runwayDays !== null && f.runwayDays < 21) items.push({ tone: 'danger', text: <><Link to={`/projects/${p.id}`}>{p.code}</Link>: budget runway ≈ {f.runwayDays} days at current burn ({formatINR(f.burnPerDay)}/day)</> });
    }
  });
  const myDecisions = state.fundingRequests.filter((r) => currentApprover(r) === user.id);
  if (myDecisions.length) items.unshift({ tone: 'info', text: <>{myDecisions.length} funding request(s) await your decision — <Link to="/approvals">open approver inbox</Link></> });
  if (!items.length) return null;
  return (
    <div className="card">
      <h2>Needs attention</h2>
      {items.slice(0, 8).map((a, i) => (
        <div key={i} className={`alert ${a.tone}`}>{a.text}</div>
      ))}
    </div>
  );
}

function Trends({ state, projects }) {
  const ids = new Set(projects.map((p) => p.id));
  const days = 120;
  const today = todayISO();
  const points = [];
  for (let i = days; i >= 0; i -= 5) {
    const d = addDays(today, -i);
    const budget = sum(state.allocations.filter((a) => ids.has(a.projectId) && a.effectiveDate <= d), (a) => a.amount);
    const exp = sum(state.expenses.filter((e) => ids.has(e.projectId) && EXPENSE_ACTUAL_STATES.includes(e.state) && e.date <= d), (e) => e.amount);
    const pay = sum(state.payrollEntries.filter((p) => ids.has(p.projectId) && PAYROLL_ACTUAL_STATES.includes(p.state) && p.postedOn && p.postedOn <= d), payrollCost);
    points.push({ x: fmtDate(d).slice(0, 5), budget, actual: exp + pay });
  }
  const cats = {};
  projects.forEach((p) => categoryBreakdown(state, p.id).forEach((c) => {
    cats[c.category] ??= { value: 0, value2: 0 };
    cats[c.category].value += c.actual;
    cats[c.category].value2 += c.committed;
  }));
  const catRows = Object.entries(cats).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value).slice(0, 8);
  const pipeline = state.fundingRequests.filter((r) => ids.has(r.projectId));
  return (
    <div className="grid g2">
      <div className="card">
        <h2>Cumulative budget vs actual (last 4 months)</h2>
        <LineChart series={[
          { label: 'Approved budget', color: 'var(--brand-deep)', points: points.map((p) => ({ x: p.x, y: p.budget })) },
          { label: 'Actual cost', color: 'var(--brand-primary)', points: points.map((p) => ({ x: p.x, y: p.actual })) },
        ]} format={formatINRCompact} />
      </div>
      <div className="card">
        <h2>Spend by category</h2>
        {catRows.length ? <HBarChart rows={catRows} /> : <Empty title="No spending yet" />}
      </div>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-head"><h2>Funding pipeline</h2><Link to="/funding">View all</Link></div>
        <div className="grid g5">
          {['Draft', 'Under review', 'Changes requested', 'Approved', 'Rejected'].map((st) => {
            const list = pipeline.filter((r) => r.state === st);
            return <Stat key={st} label={st} value={sum(list, (r) => r.amount)} sub={`${list.length} request(s)`} />;
          })}
        </div>
      </div>
    </div>
  );
}

function EmployeePanel() {
  const { state, user } = useStore();
  const emp = employeeForUser(state, user);
  const myTasks = state.tasks.filter((t) => emp && t.assigneeId === emp.id && t.status !== 'Done');
  const myTime = state.timesheets.filter((t) => emp && t.employeeId === emp.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const myExp = state.expenses.filter((e) => e.submitterId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  return (
    <div className="grid g3" style={{ marginBottom: 16 }}>
      <div className="card">
        <h2>My open tasks</h2>
        {myTasks.length ? myTasks.map((t) => (
          <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <strong>{t.title}</strong> <Badge>{t.status}</Badge>
            <div className="small muted">{state.projects.find((p) => p.id === t.projectId)?.code} · due {fmtDate(t.dueDate)}{t.dueDate < todayISO() ? ' · overdue' : ''}</div>
          </div>
        )) : <Empty title="No open tasks" icon="✅" />}
      </div>
      <div className="card">
        <h2>My recent time</h2>
        {myTime.length ? (
          <table><tbody>{myTime.map((t) => <tr key={t.id}><td>{fmtDate(t.date)}</td><td>{state.projects.find((p) => p.id === t.projectId)?.code}</td><td className="num">{t.hours} h</td><td><Badge>{t.status}</Badge></td></tr>)}</tbody></table>
        ) : <Empty title="No time logged" />}
        <Link to="/people?tab=time">Log time →</Link>
      </div>
      <div className="card">
        <h2>My expenses</h2>
        {myExp.length ? (
          <table><tbody>{myExp.map((e) => <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{e.category}</td><td className="num"><Money value={e.amount} /></td><td><Badge>{e.state}</Badge></td></tr>)}</tbody></table>
        ) : <Empty title="No expenses yet" />}
        <Link to="/expenses?new=1">Submit an expense →</Link>
      </div>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Daily log adoption on my projects (last 30 days)</h2>
        {visibleProjects(state, user).map((p) => (
          <div key={p.id} className="hbar-row"><div className="small">{p.code}</div><ProgressBar value={dailyLogAdoption(state, p.id)} tone="actual" /><div className="num small">{dailyLogAdoption(state, p.id)}%</div></div>
        ))}
      </div>
    </div>
  );
}

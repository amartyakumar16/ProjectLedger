import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, canSeeProject } from '../lib/permissions.js';
import { projectFinancials, healthOf, overdueTasks, dailyLogAdoption, projectProgress } from '../lib/finance.js';
import { Stat, Badge, Tabs, ProgressBar, Empty, UserName, Modal, Field, BudgetBar } from '../components/ui.jsx';
import { formatINR } from '../lib/money.js';
import { fmtDate, fmtDateTime, todayISO, addDays, isWeekday } from '../lib/util.js';
import { ProjectForm } from './Projects.jsx';
import { ExpenseTable, ExpenseForm } from './Expenses.jsx';
import { DailyLogList } from './DailyUpdate.jsx';
import BudgetTab from './project/BudgetTab.jsx';
import TasksTab from './project/TasksTab.jsx';
import PeopleTab from './project/PeopleTab.jsx';
import TimelineTab from './project/TimelineTab.jsx';
import { FundingTable } from './Funding.jsx';

export default function ProjectWorkspace() {
  const { id } = useParams();
  const { state, user } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const p = state.projects.find((x) => x.id === id);
  if (!p) return <Empty title="Project not found" />;
  if (!canSeeProject(state, user, id)) return <Empty icon="🔒" title="Access restricted">You are not a member of this project.</Empty>;
  const showMoney = can(user, 'budget.view');
  const tabs = [
    { id: 'overview', label: 'Overview' },
    showMoney && { id: 'budget', label: 'Budget & commitments' },
    { id: 'expenses', label: 'Expenses', count: state.expenses.filter((e) => e.projectId === id && e.state === 'Submitted').length },
    { id: 'tasks', label: 'Tasks & milestones' },
    { id: 'people', label: 'People & time' },
    { id: 'logs', label: 'Daily logs' },
    (showMoney || can(user, 'funding.create')) && { id: 'funding', label: 'Funding' },
    { id: 'timeline', label: 'Timeline & history' },
  ].filter(Boolean);
  const h = healthOf(state, p);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted"><Link to="/projects">Projects</Link> / {p.code}</div>
          <h1>{p.code} · {p.name}</h1>
          <div className="btn-row"><Badge>{p.status}</Badge><Badge tone={h.tone}>{h.label}</Badge><Badge>{p.priority}</Badge><span className="small muted">{fmtDate(p.startDate)} → {fmtDate(p.endDate)} · PM <UserName id={p.managerId} /></span></div>
        </div>
        <ProjectActions p={p} />
      </div>
      <Tabs tabs={tabs} active={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'overview' && <Overview p={p} />}
      {tab === 'budget' && showMoney && <BudgetTab p={p} />}
      {tab === 'expenses' && <ProjectExpenses p={p} />}
      {tab === 'tasks' && <TasksTab p={p} />}
      {tab === 'people' && <PeopleTab p={p} />}
      {tab === 'logs' && <><LogCalendar p={p} /><DailyLogList projectId={p.id} /></>}
      {tab === 'funding' && <ProjectFunding p={p} />}
      {tab === 'timeline' && <TimelineTab p={p} />}
    </>
  );
}

function ProjectActions({ p }) {
  const { user, run, A } = useStore();
  const [edit, setEdit] = useState(false);
  const canEdit = can(user, 'project.edit') && (user.role !== 'pm' || p.managerId === user.id);
  return (
    <div className="btn-row">
      {canEdit && <button className="btn" onClick={() => setEdit(true)}>Edit</button>}
      {canEdit && p.status === 'Active' && <button className="btn" onClick={() => run(A.setProjectStatus, { projectId: p.id, status: 'On hold', reason: 'Paused' }, { success: 'Project on hold' })}>Put on hold</button>}
      {canEdit && p.status === 'On hold' && <button className="btn" onClick={() => run(A.setProjectStatus, { projectId: p.id, status: 'Active', reason: 'Resumed' }, { success: 'Project resumed' })}>Resume</button>}
      {can(user, 'project.archive') && p.status !== 'Archived' && <button className="btn danger" onClick={() => window.confirm(`Archive ${p.code}? It will become read-only.`) && run(A.setProjectStatus, { projectId: p.id, status: 'Archived', reason: 'Archived by owner' }, { success: 'Project archived' })}>Archive</button>}
      {can(user, 'funding.create') && <Link className="btn primary" to={`/funding/new?project=${p.id}`}>Request funding</Link>}
      {edit && <ProjectForm project={p} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
    </div>
  );
}

function Overview({ p }) {
  const { state, user, run, A } = useStore();
  const f = projectFinancials(state, p.id);
  const prog = projectProgress(state, p.id);
  const [override, setOverride] = useState(false);
  const [ov, setOv] = useState({ value: f.progress, reason: '' });
  const showMoney = can(user, 'budget.view');
  const tasks = state.tasks.filter((t) => t.projectId === p.id);
  const overdue = overdueTasks(state, p.id);
  const blocked = tasks.filter((t) => t.status === 'Blocked');
  const upcoming = tasks.filter((t) => t.status !== 'Done' && t.dueDate >= todayISO()).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const emp = (id) => state.employees.find((e) => e.id === id)?.name || '—';
  const recent = state.audit.filter((a) => a.projectId === p.id).slice(-8).reverse();
  return (
    <>
      {showMoney && (
        <div className="grid g5" style={{ marginBottom: 16 }}>
          <Stat kind="approved" label="Approved budget" value={f.approved} sub={`${state.allocations.filter((a) => a.projectId === p.id).length} allocation event(s)`} />
          <Stat kind="actual" label="Actual cost" value={f.actual} sub={`${f.utilization}% · payroll ${formatINR(f.payroll)}`} />
          <Stat kind="committed" label="Committed" value={f.committed} sub="Not yet actual" />
          <Stat kind="available" label="Available (uncommitted)" value={f.available} sub={`Remaining after actuals ${formatINR(f.remaining)}`} />
          <Stat kind="forecast" label="Forecast at completion" value={f.forecast} sub={f.forecastVariance < 0 ? `${formatINR(-f.forecastVariance)} over budget` : `${formatINR(f.forecastVariance)} headroom`} />
        </div>
      )}
      <div className="grid g2">
        <div className="card">
          <h2>Progress</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)' }}>{f.progress}%</div>
            <div style={{ flex: 1 }}><ProgressBar value={f.progress} /><div className="small muted">{prog.method}{p.progressOverride ? ` — “${p.progressOverride.reason}”` : ''}</div></div>
          </div>
          {showMoney && <div style={{ marginTop: 12 }}><BudgetBar approved={f.approved} actual={f.actual} committed={f.committed} /><div className="small muted">Budget used {f.utilization}% vs work complete {f.progress}%{f.burnPerDay ? ` · burn ${formatINR(f.burnPerDay)}/day · runway ${f.runwayDays ?? '—'} days` : ''}</div></div>}
          {can(user, 'project.edit') && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={() => setOverride(true)}>Manual override…</button>
              {p.progressOverride && <button className="btn sm" onClick={() => run(A.setProgressOverride, { projectId: p.id, value: null }, { success: 'Override cleared' })}>Clear override</button>}
            </div>
          )}
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>Sponsor</dt><dd>{p.sponsor || '—'}</dd>
            <dt>Department / portfolio</dt><dd>{p.department} / {p.portfolio}</dd>
            <dt>Daily log adoption (30d)</dt><dd>{dailyLogAdoption(state, p.id)}%</dd>
            <dt>Baseline scope</dt><dd>{p.description || '—'}</dd>
            <dt>Deliverables</dt><dd>{(p.deliverables || '').split(';').filter(Boolean).map((d) => <div key={d}>• {d.trim()}</div>)}</dd>
          </dl>
          {p.revisions?.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>Baseline revisions</h3>
              {p.revisions.map((r, i) => <div key={i} className="small">{fmtDateTime(r.at)} — <UserName id={r.by} />: {r.reason} (was {fmtDate(r.before.startDate)} → {fmtDate(r.before.endDate)})</div>)}
            </>
          )}
        </div>
        <div className="card">
          <h2>Next actions</h2>
          {overdue.length > 0 && <><h3 style={{ color: 'var(--red)' }}>Overdue</h3>{overdue.map((t) => <div key={t.id} className="small">• {t.title} — {emp(t.assigneeId)} (due {fmtDate(t.dueDate)})</div>)}</>}
          {blocked.length > 0 && <><h3 style={{ color: 'var(--amber)', marginTop: 8 }}>Blocked</h3>{blocked.map((t) => <div key={t.id} className="small">• {t.title} — {emp(t.assigneeId)}</div>)}</>}
          <h3 style={{ marginTop: 8 }}>Upcoming</h3>
          {upcoming.length ? upcoming.map((t) => <div key={t.id} className="small">• {t.title} — {emp(t.assigneeId)} · due {fmtDate(t.dueDate)} <Badge>{t.status}</Badge></div>) : <div className="small muted">Nothing scheduled</div>}
          <h3 style={{ marginTop: 16 }}>Recent activity</h3>
          <ul className="timeline">
            {recent.map((a) => <li key={a.id}><span className="small muted">{fmtDateTime(a.at)}</span><div className="small"><UserName id={a.actorId} /> · <span className="mono">{a.action}</span>{a.reason ? ` — ${a.reason}` : ''}</div></li>)}
          </ul>
        </div>
      </div>
      {override && (
        <Modal title="Manual progress override" onClose={() => setOverride(false)} footer={<><button className="btn" onClick={() => setOverride(false)}>Cancel</button><button className="btn primary" onClick={() => run(A.setProgressOverride, { projectId: p.id, value: Number(ov.value), reason: ov.reason }, { success: 'Progress overridden' }).ok && setOverride(false)}>Save</button></>}>
          <Field label="Progress %"><input type="number" min="0" max="100" value={ov.value} onChange={(e) => setOv({ ...ov, value: e.target.value })} /></Field>
          <Field label="Reason *" hint="Required by FR-032"><textarea value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}

function ProjectExpenses({ p }) {
  const { state, user } = useStore();
  const [adding, setAdding] = useState(false);
  const list = state.expenses.filter((e) => e.projectId === p.id && (user.role !== 'employee' || e.submitterId === user.id)).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="card">
      <div className="card-head"><h2>Expenses</h2>{can(user, 'expense.create') && <button className="btn primary" onClick={() => setAdding(true)}>+ New expense</button>}</div>
      <ExpenseTable expenses={list} />
      {adding && <ExpenseForm defaultProjectId={p.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

function ProjectFunding({ p }) {
  const { state, user } = useStore();
  const list = state.fundingRequests.filter((r) => r.projectId === p.id);
  return (
    <div className="card">
      <div className="card-head"><h2>Funding requests</h2>{can(user, 'funding.create') && <Link className="btn primary" to={`/funding/new?project=${p.id}`}>+ Request funding</Link>}</div>
      <FundingTable list={list} />
    </div>
  );
}

function LogCalendar({ p }) {
  const { state } = useStore();
  const days = [];
  const start = p.startDate > addDays(todayISO(), -120) ? p.startDate : addDays(todayISO(), -120);
  for (let d = start; d <= todayISO(); d = addDays(d, 1)) days.push(d);
  const logged = new Set(state.dailyLogs.filter((l) => l.projectId === p.id).map((l) => l.date));
  return (
    <div className="card">
      <div className="card-head"><h3>Log coverage since {fmtDate(start)}</h3><span className="small muted">Adoption (30d): {dailyLogAdoption(state, p.id)}%</span></div>
      <div className="calendar">
        {days.map((d) => <span key={d} title={`${fmtDate(d)}${logged.has(d) ? ' — logged' : ''}`} className={!isWeekday(d) ? 'weekend' : logged.has(d) ? 'on' : ''} />)}
      </div>
    </div>
  );
}

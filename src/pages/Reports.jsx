import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { Field, Badge, Empty, HBarChart } from '../components/ui.jsx';
import { formatINR, paiseToRupeeString, sum, pct } from '../lib/money.js';
import { fmtDate, todayISO, addDays, toCSV, downloadFile } from '../lib/util.js';
import { projectFinancials, categoryBreakdown, projectLedger, payrollCost, EXPENSE_ACTUAL_STATES, PAYROLL_ACTUAL_STATES, weekdaysBetween } from '../lib/finance.js';

const REPORTS = [
  { id: 'statement', label: 'Project financial statement' },
  { id: 'utilization', label: 'Budget utilization' },
  { id: 'ledger', label: 'Transaction ledger' },
  { id: 'vendor', label: 'Expense category & vendor analysis' },
  { id: 'payroll', label: 'Payroll cost allocation' },
  { id: 'progress', label: 'Progress report (daily / weekly / monthly)' },
  { id: 'milestones', label: 'Milestone variance' },
  { id: 'staffing', label: 'Staffing utilization (planned vs actual hours)' },
  { id: 'funding', label: 'Funding register & allocation history' },
  { id: 'closure', label: 'Project closure & audit package' },
];

/** Restrict financial records to an as-of date so exports reconcile to the ledger (AC-10). */
function asOf(state, date) {
  return {
    ...state,
    allocations: state.allocations.filter((a) => a.effectiveDate <= date),
    expenses: state.expenses.filter((e) => e.date <= date),
    payrollEntries: state.payrollEntries.filter((p) => !p.postedOn || p.postedOn <= date),
    commitments: state.commitments.filter((c) => c.createdAt.slice(0, 10) <= date),
  };
}

export default function Reports() {
  const { state, user } = useStore();
  const projects = visibleProjects(state, user);
  const [rid, setRid] = useState('statement');
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState(addDays(todayISO(), -120));
  const [to, setTo] = useState(todayISO());
  const [group, setGroup] = useState('week');
  if (!can(user, 'reports.view')) return <Empty icon="🔒" title="Reports are not available for your role" />;
  const sel = projectId ? projects.filter((p) => p.id === projectId) : projects;
  const s = asOf(state, to);
  const props = { state, s, sel, from, to, group };
  return (
    <>
      <div className="page-head"><div><h1>Reports</h1><p className="muted">Filtered by project, date range and your access. Export CSV or print to PDF.</p></div></div>
      <div className="card no-print">
        <div className="filters">
          <Field label="Report"><select value={rid} onChange={(e) => setRid(e.target.value)} style={{ minWidth: 300 }}>{REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
          <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All accessible</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To / as-of"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {rid === 'progress' && <Field label="Group"><select value={group} onChange={(e) => setGroup(e.target.value)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></Field>}
          <button className="btn" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>
      <div className="card">
        <h2>{REPORTS.find((r) => r.id === rid).label}</h2>
        <p className="small muted">{state.org.name} · {projectId ? sel[0]?.code : `${sel.length} projects`} · {fmtDate(from)} → {fmtDate(to)} · generated {new Date().toLocaleString('en-IN')} by {user.name}</p>
        {rid === 'statement' && <Statement {...props} />}
        {rid === 'utilization' && <Utilization {...props} />}
        {rid === 'ledger' && <Ledger {...props} />}
        {rid === 'vendor' && <Vendor {...props} />}
        {rid === 'payroll' && <PayrollReport {...props} />}
        {rid === 'progress' && <Progress {...props} />}
        {rid === 'milestones' && <Milestones {...props} />}
        {rid === 'staffing' && <Staffing {...props} />}
        {rid === 'funding' && <FundingReg {...props} />}
        {rid === 'closure' && <Closure {...props} />}
      </div>
    </>
  );
}

function ExportBtn({ name, rows, cols }) {
  return <button className="btn sm no-print" style={{ marginBottom: 10 }} onClick={() => downloadFile(`${name}_${todayISO()}.csv`, toCSV(rows, cols))}>Export CSV</button>;
}
const R = (v) => paiseToRupeeString(v);

function Statement({ s, sel, to }) {
  return sel.map((p) => {
    const f = projectFinancials(s, p.id);
    const cats = categoryBreakdown(s, p.id);
    return (
      <div key={p.id} style={{ marginBottom: 24 }}>
        <h3>{p.code} — {p.name} <span className="small muted">as of {fmtDate(to)}</span></h3>
        <ExportBtn name={`${p.code}_statement`} rows={cats} cols={[{ label: 'Category', value: 'category' }, { label: 'Planned', value: (c) => R(c.planned) }, { label: 'Actual', value: (c) => R(c.actual) }, { label: 'Committed', value: (c) => R(c.committed) }]} />
        <div className="grid g2">
          <table>
            <tbody>
              <tr><td>Original allocation</td><td className="num">{formatINR(sum(s.allocations.filter((a) => a.projectId === p.id && a.type === 'original'), (a) => a.amount))}</td></tr>
              <tr><td>Approved additions</td><td className="num">{formatINR(sum(s.allocations.filter((a) => a.projectId === p.id && a.type === 'additional'), (a) => a.amount))}</td></tr>
              <tr><td>Adjustments</td><td className="num">{formatINR(sum(s.allocations.filter((a) => a.projectId === p.id && a.type === 'adjustment'), (a) => a.amount))}</td></tr>
              <tr><td><strong>Approved budget</strong></td><td className="num"><strong>{formatINR(f.approved)}</strong></td></tr>
              <tr><td>Posted project expenses</td><td className="num">{formatINR(f.expenses, { decimals: true })}</td></tr>
              <tr><td>Posted payroll allocations</td><td className="num">{formatINR(f.payroll)}</td></tr>
              <tr><td><strong>Actual cost</strong></td><td className="num"><strong>{formatINR(f.actual, { decimals: true })}</strong></td></tr>
              <tr><td>Outstanding commitments</td><td className="num">{formatINR(f.committed)}</td></tr>
              <tr><td><strong>Remaining after actuals</strong></td><td className="num"><strong>{formatINR(f.remaining, { decimals: true })}</strong></td></tr>
              <tr><td><strong>Available uncommitted</strong></td><td className="num"><strong>{formatINR(f.available, { decimals: true })}</strong></td></tr>
              <tr><td>Forecast at completion</td><td className="num">{formatINR(f.forecast)}</td></tr>
            </tbody>
          </table>
          <HBarChart rows={cats.map((c) => ({ label: c.category, value: c.actual, value2: c.committed }))} />
        </div>
      </div>
    );
  });
}

function Utilization({ s, sel }) {
  const rows = sel.map((p) => ({ p, f: projectFinancials(s, p.id) }));
  return (
    <>
      <ExportBtn name="budget_utilization" rows={rows} cols={[{ label: 'Project', value: (r) => r.p.code }, { label: 'Approved', value: (r) => R(r.f.approved) }, { label: 'Actual', value: (r) => R(r.f.actual) }, { label: 'Committed', value: (r) => R(r.f.committed) }, { label: 'Available', value: (r) => R(r.f.available) }, { label: 'Utilization %', value: (r) => r.f.utilization }, { label: 'Progress %', value: (r) => r.f.progress }, { label: 'Forecast', value: (r) => R(r.f.forecast) }]} />
      <table>
        <thead><tr><th>Project</th><th className="num">Approved</th><th className="num">Actual</th><th className="num">Committed</th><th className="num">Available</th><th className="num">Spent %</th><th className="num">Progress %</th><th className="num">Forecast</th></tr></thead>
        <tbody>{rows.map(({ p, f }) => <tr key={p.id}><td>{p.code}</td><td className="num">{formatINR(f.approved)}</td><td className="num">{formatINR(f.actual)}</td><td className="num">{formatINR(f.committed)}</td><td className="num">{formatINR(f.available)}</td><td className="num">{f.utilization}%</td><td className="num">{f.progress}%</td><td className="num">{formatINR(f.forecast)}</td></tr>)}</tbody>
        <tfoot><tr><td>Total</td>{['approved', 'actual', 'committed', 'available'].map((k) => <td key={k} className="num">{formatINR(sum(rows, (r) => r.f[k]))}</td>)}<td className="num">{pct(sum(rows, (r) => r.f.actual), sum(rows, (r) => r.f.approved))}%</td><td></td><td className="num">{formatINR(sum(rows, (r) => r.f.forecast))}</td></tr></tfoot>
      </table>
    </>
  );
}

function Ledger({ s, sel, from, to, state }) {
  const rows = sel.flatMap((p) => projectLedger(s, p.id)).filter((r) => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const totalB = sum(rows, (r) => r.budget);
  const totalC = sum(rows, (r) => r.cost);
  return (
    <>
      <ExportBtn name="transaction_ledger" rows={rows} cols={[{ label: 'Date', value: 'date' }, { label: 'Project', value: (r) => state.projects.find((p) => p.id === r.projectId)?.code }, { label: 'Type', value: 'kind' }, { label: 'Reference', value: 'ref' }, { label: 'Description', value: 'description' }, { label: 'Budget (INR)', value: (r) => R(r.budget) }, { label: 'Cost (INR)', value: (r) => R(r.cost) }]} />
      <div className="alert info small">Reconciliation: budget events {formatINR(totalB)} · cost {formatINR(totalC, { decimals: true })} in range. Totals match the project financial statements for the same filters and as-of date.</div>
      <div className="table-wrap" style={{ maxHeight: 600 }}>
        <table>
          <thead><tr><th>Date</th><th>Project</th><th>Type</th><th>Ref</th><th>Description</th><th className="num">Budget</th><th className="num">Cost</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.kind + r.ref}><td className="nowrap">{fmtDate(r.date)}</td><td>{state.projects.find((p) => p.id === r.projectId)?.code}</td><td><Badge>{r.kind}</Badge></td><td className="mono">{r.ref}</td><td className="small">{r.description}</td><td className="num">{r.budget ? formatINR(r.budget) : ''}</td><td className="num">{r.cost ? formatINR(r.cost, { decimals: true }) : ''}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={5}>Totals</td><td className="num">{formatINR(totalB)}</td><td className="num">{formatINR(totalC, { decimals: true })}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

function Vendor({ s, sel, from, to }) {
  const ids = new Set(sel.map((p) => p.id));
  const exp = s.expenses.filter((e) => ids.has(e.projectId) && EXPENSE_ACTUAL_STATES.includes(e.state) && e.date >= from && e.date <= to);
  const by = (key) => {
    const m = {};
    exp.forEach((e) => { const k = e[key] || '(none)'; m[k] ??= { label: k, value: 0, count: 0 }; m[k].value += e.amount; m[k].count++; });
    return Object.values(m).sort((a, b) => b.value - a.value);
  };
  const vendors = by('vendor');
  const cats = by('category');
  return (
    <>
      <ExportBtn name="vendor_analysis" rows={vendors} cols={[{ label: 'Vendor', value: 'label' }, { label: 'Transactions', value: 'count' }, { label: 'Total (INR)', value: (r) => R(r.value) }]} />
      <div className="grid g2">
        <div><h3>By category</h3><HBarChart rows={cats} /></div>
        <div><h3>Top vendors</h3>
          <table><thead><tr><th>Vendor</th><th className="num">Txns</th><th className="num">Total</th><th className="num">Avg</th></tr></thead>
            <tbody>{vendors.slice(0, 20).map((v) => <tr key={v.label}><td>{v.label}</td><td className="num">{v.count}</td><td className="num">{formatINR(v.value)}</td><td className="num">{formatINR(Math.round(v.value / v.count))}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function PayrollReport({ s, state, sel, from, to }) {
  const ids = new Set(sel.map((p) => p.id));
  const rows = s.payrollEntries.filter((p) => ids.has(p.projectId) && PAYROLL_ACTUAL_STATES.includes(p.state) && p.postedOn >= from && p.postedOn <= to);
  const showNames = can(state.users.find((u) => u.id === state.currentUserId), 'salary.view');
  const grouped = {};
  rows.forEach((r) => { const k = `${r.projectId}|${r.period}`; grouped[k] ??= { projectId: r.projectId, period: r.period, total: 0, people: new Set() }; grouped[k].total += payrollCost(r); grouped[k].people.add(r.employeeId); });
  const list = Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));
  return (
    <>
      {!showNames && <div className="alert info small">Individual compensation is hidden for your role; project totals only.</div>}
      <ExportBtn name="payroll_allocation" rows={list} cols={[{ label: 'Project', value: (r) => state.projects.find((p) => p.id === r.projectId)?.code }, { label: 'Period', value: 'period' }, { label: 'Headcount', value: (r) => r.people.size }, { label: 'Total cost (INR)', value: (r) => R(r.total) }]} />
      <table>
        <thead><tr><th>Project</th><th>Period</th><th className="num">People</th><th className="num">Labour cost</th></tr></thead>
        <tbody>{list.map((r) => <tr key={r.projectId + r.period}><td>{state.projects.find((p) => p.id === r.projectId)?.code}</td><td>{r.period}</td><td className="num">{r.people.size}</td><td className="num">{formatINR(r.total)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={3}>Total</td><td className="num">{formatINR(sum(list, (r) => r.total))}</td></tr></tfoot>
      </table>
    </>
  );
}

function Progress({ state, sel, from, to, group }) {
  const ids = new Set(sel.map((p) => p.id));
  const key = (d) => {
    if (group === 'day') return d;
    if (group === 'month') return d.slice(0, 7);
    const dt = new Date(d + 'T00:00:00');
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  };
  const buckets = {};
  const b = (d) => (buckets[key(d)] ??= { period: key(d), logs: 0, tasksDone: 0, milestones: 0, headcount: 0, blockers: 0, spend: 0 });
  state.dailyLogs.filter((l) => ids.has(l.projectId) && l.date >= from && l.date <= to).forEach((l) => { const x = b(l.date); x.logs++; x.headcount += l.headcount; if (l.blockers) x.blockers++; });
  state.tasks.filter((t) => ids.has(t.projectId) && t.actualEnd && t.actualEnd >= from && t.actualEnd <= to).forEach((t) => { const x = b(t.actualEnd); x.tasksDone++; if (t.milestone) x.milestones++; });
  state.expenses.filter((e) => ids.has(e.projectId) && EXPENSE_ACTUAL_STATES.includes(e.state) && e.date >= from && e.date <= to).forEach((e) => (b(e.date).spend += e.amount));
  const rows = Object.values(buckets).sort((a, b2) => b2.period.localeCompare(a.period));
  return (
    <>
      <ExportBtn name={`progress_${group}`} rows={rows} cols={[{ label: 'Period', value: 'period' }, { label: 'Daily logs', value: 'logs' }, { label: 'Tasks done', value: 'tasksDone' }, { label: 'Milestones', value: 'milestones' }, { label: 'Blocker reports', value: 'blockers' }, { label: 'Expense spend (INR)', value: (r) => R(r.spend) }]} />
      <table>
        <thead><tr><th>{group === 'week' ? 'Week of' : 'Period'}</th><th className="num">Daily logs</th><th className="num">Avg headcount</th><th className="num">Tasks done</th><th className="num">Milestones</th><th className="num">Blocker reports</th><th className="num">Expense spend</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.period}><td>{group === 'month' ? r.period : fmtDate(r.period)}</td><td className="num">{r.logs}</td><td className="num">{r.logs ? Math.round(r.headcount / r.logs) : '—'}</td><td className="num">{r.tasksDone}</td><td className="num">{r.milestones}</td><td className="num">{r.blockers}</td><td className="num">{formatINR(r.spend)}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function Milestones({ state, sel }) {
  const ids = new Set(sel.map((p) => p.id));
  const ms = state.tasks.filter((t) => ids.has(t.projectId) && t.milestone);
  const variance = (t) => {
    const end = t.actualEnd || (t.dueDate < todayISO() ? todayISO() : null);
    if (!end) return null;
    return Math.round((new Date(end) - new Date(t.dueDate)) / 86400000);
  };
  return (
    <>
      <ExportBtn name="milestone_variance" rows={ms} cols={[{ label: 'Project', value: (t) => state.projects.find((p) => p.id === t.projectId)?.code }, { label: 'Milestone', value: 'title' }, { label: 'Due', value: 'dueDate' }, { label: 'Actual end', value: 'actualEnd' }, { label: 'Variance days', value: (t) => variance(t) ?? '' }, { label: 'Status', value: 'status' }]} />
      <table>
        <thead><tr><th>Project</th><th>Milestone</th><th>Due</th><th>Actual</th><th className="num">Variance (days)</th><th>Status</th></tr></thead>
        <tbody>{ms.map((t) => { const v = variance(t); return <tr key={t.id}><td>{state.projects.find((p) => p.id === t.projectId)?.code}</td><td>{t.title}</td><td>{fmtDate(t.dueDate)}</td><td>{fmtDate(t.actualEnd)}</td><td className="num" style={{ color: v > 0 ? 'var(--red)' : v < 0 ? 'var(--green)' : undefined }}>{v === null ? '—' : v > 0 ? `+${v}` : v}</td><td><Badge>{t.status}</Badge></td></tr>; })}</tbody>
      </table>
    </>
  );
}

function Staffing({ state, sel, from, to }) {
  const ids = new Set(sel.map((p) => p.id));
  const wd = weekdaysBetween(from, to);
  const rows = state.assignments.filter((a) => ids.has(a.projectId)).map((a) => {
    const days = wd.filter((d) => d >= a.startDate && (!a.endDate || d <= a.endDate)).length;
    const planned = Math.round((a.allocationPct / 100) * 8 * days);
    const actual = sum(state.timesheets.filter((t) => t.employeeId === a.employeeId && t.projectId === a.projectId && t.date >= from && t.date <= to), (t) => t.hours);
    return { a, name: state.employees.find((e) => e.id === a.employeeId)?.name, code: state.projects.find((p) => p.id === a.projectId)?.code, planned, actual };
  });
  return (
    <>
      <div className="alert info small">Actual hours come from timesheets (seeded for the last ~2 weeks). Use as a capacity aid, not a performance ranking.</div>
      <ExportBtn name="staffing_utilization" rows={rows} cols={[{ label: 'Person', value: 'name' }, { label: 'Project', value: 'code' }, { label: 'Allocation %', value: (r) => r.a.allocationPct }, { label: 'Planned h', value: 'planned' }, { label: 'Actual h', value: 'actual' }]} />
      <table>
        <thead><tr><th>Person</th><th>Project</th><th className="num">Allocation</th><th className="num">Planned h</th><th className="num">Actual h</th><th className="num">Actual / planned</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.a.id}><td>{r.name}</td><td>{r.code}</td><td className="num">{r.a.allocationPct}%</td><td className="num">{r.planned}</td><td className="num">{r.actual}</td><td className="num">{r.planned ? `${pct(r.actual, r.planned)}%` : '—'}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function FundingReg({ state, sel }) {
  const ids = new Set(sel.map((p) => p.id));
  const reqs = state.fundingRequests.filter((r) => ids.has(r.projectId));
  const allocs = state.allocations.filter((a) => ids.has(a.projectId)).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return (
    <>
      <ExportBtn name="allocation_history" rows={allocs} cols={[{ label: 'Date', value: 'effectiveDate' }, { label: 'Project', value: (a) => state.projects.find((p) => p.id === a.projectId)?.code }, { label: 'Type', value: 'type' }, { label: 'Amount (INR)', value: (a) => R(a.amount) }, { label: 'Approval ref', value: 'approvalRef' }, { label: 'Reason', value: 'reason' }]} />
      <h3>Funding requests</h3>
      <table>
        <thead><tr><th>Request</th><th>Project</th><th className="num">Amount</th><th>State</th><th>Decisions</th></tr></thead>
        <tbody>{reqs.map((r) => <tr key={r.id}><td><Link to={`/funding/${r.id}`}>{r.number}</Link> v{r.version}</td><td>{state.projects.find((p) => p.id === r.projectId)?.code}</td><td className="num">{formatINR(r.amount)}</td><td><Badge>{r.state}</Badge></td><td className="small">{r.decisions.map((d) => `${state.users.find((u) => u.id === d.approverId)?.name}: ${d.decision}`).join('; ') || '—'}</td></tr>)}</tbody>
      </table>
      <h3 style={{ marginTop: 16 }}>Allocation history</h3>
      <table>
        <thead><tr><th>Date</th><th>Project</th><th>Type</th><th>Ref</th><th className="num">Amount</th></tr></thead>
        <tbody>{allocs.map((a) => <tr key={a.id}><td>{fmtDate(a.effectiveDate)}</td><td>{state.projects.find((p) => p.id === a.projectId)?.code}</td><td><Badge>{a.type}</Badge></td><td className="mono">{a.approvalRef}</td><td className="num">{formatINR(a.amount)}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function Closure({ state, sel }) {
  return sel.map((p) => {
    const f = projectFinancials(state, p.id);
    const checks = [
      ['All tasks completed', state.tasks.filter((t) => t.projectId === p.id && t.status !== 'Done').length === 0],
      ['No open commitments', state.commitments.filter((c) => c.projectId === p.id && c.status === 'Open').length === 0],
      ['No unposted (submitted/approved) expenses', state.expenses.filter((e) => e.projectId === p.id && ['Submitted', 'Approved'].includes(e.state)).length === 0],
      ['No estimated (unposted) payroll', state.payrollEntries.filter((x) => x.projectId === p.id && x.state === 'Estimated').length === 0],
      ['No pending funding requests', state.fundingRequests.filter((r) => r.projectId === p.id && ['Under review', 'Draft', 'Changes requested'].includes(r.state)).length === 0],
      ['Actual cost within approved budget', f.actual <= f.approved],
      ['All daily logs reviewed & locked', state.dailyLogs.filter((l) => l.projectId === p.id && !l.locked).length === 0],
    ];
    const ready = checks.every((c) => c[1]);
    return (
      <div key={p.id} style={{ marginBottom: 20 }}>
        <h3>{p.code} — {p.name} {ready ? <Badge tone="green">Ready to close</Badge> : <Badge tone="amber">Not ready</Badge>}</h3>
        {checks.map(([l, ok]) => <div key={l} className="small">{ok ? '✅' : '⬜'} {l}</div>)}
        <div className="small muted" style={{ marginTop: 6 }}>Audit events: {state.audit.filter((a) => a.projectId === p.id).length} · Final: approved {formatINR(f.approved)}, actual {formatINR(f.actual)}, remaining {formatINR(f.remaining)}</div>
      </div>
    );
  });
}

import { useMemo, useState } from 'react';
import { useStore } from '../../store/Store.jsx';
import { can } from '../../lib/permissions.js';
import { Badge, Field, Empty, UserName } from '../../components/ui.jsx';
import { formatINR, sum, paiseToRupeeString } from '../../lib/money.js';
import { fmtDate, todayISO, addDays, toCSV, downloadFile } from '../../lib/util.js';

/** Reconstruct any date range: logs, tasks, staffing, expenses, approvals, changes (FR-034, AC-07). */
export default function TimelineTab({ p }) {
  const { state, user } = useStore();
  const [from, setFrom] = useState(addDays(todayISO(), -120));
  const [to, setTo] = useState(todayISO());
  const [kinds, setKinds] = useState({ log: true, task: true, expense: can(user, 'budget.view'), budget: can(user, 'budget.view'), funding: true, staff: true, change: false });
  const [group, setGroup] = useState('day');

  const events = useMemo(() => {
    const ev = [];
    const inRange = (d) => d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
    if (kinds.log) state.dailyLogs.filter((l) => l.projectId === p.id && inRange(l.date)).forEach((l) => ev.push({ date: l.date, kind: 'Daily log', tone: 'teal', text: `${l.summary}${l.blockers ? ` — Blocker: ${l.blockers}` : ''} (headcount ${l.headcount})`, by: l.authorId }));
    if (kinds.task) state.tasks.filter((t) => t.projectId === p.id && inRange(t.actualEnd)).forEach((t) => ev.push({ date: t.actualEnd, kind: t.milestone ? 'Milestone done' : 'Task done', tone: 'green', text: t.title }));
    if (kinds.expense) state.expenses.filter((e) => e.projectId === p.id && inRange(e.date) && !['Draft'].includes(e.state)).forEach((e) => ev.push({ date: e.date, kind: e.reversalOf ? 'Reversal' : 'Expense', tone: e.reversalOf ? 'purple' : '', text: `${formatINR(e.amount, { decimals: true })} ${e.category} — ${e.vendor || ''} [${e.state}]`, by: e.submitterId, amount: e.amount }));
    if (kinds.budget) state.allocations.filter((a) => a.projectId === p.id && inRange(a.effectiveDate)).forEach((a) => ev.push({ date: a.effectiveDate, kind: 'Budget', tone: 'blue', text: `${a.type} ${formatINR(a.amount)} — ${a.reason}`, by: a.createdBy }));
    if (kinds.funding) state.fundingRequests.filter((r) => r.projectId === p.id).forEach((r) => r.history.filter((h) => inRange(h.at)).forEach((h) => ev.push({ date: h.at.slice(0, 10), kind: 'Funding', tone: 'amber', text: `${r.number} ${formatINR(r.amount)} → ${h.state}${h.comment ? `: ${h.comment}` : ''}`, by: h.by })));
    if (kinds.staff) {
      const byDay = {};
      state.timesheets.filter((t) => t.projectId === p.id && inRange(t.date)).forEach((t) => { byDay[t.date] ??= { hours: 0, people: new Set() }; byDay[t.date].hours += t.hours; if (t.hours) byDay[t.date].people.add(t.employeeId); });
      Object.entries(byDay).forEach(([d, v]) => ev.push({ date: d, kind: 'Staffing', tone: '', text: `${v.people.size} people · ${v.hours} h logged` }));
    }
    if (kinds.change) state.audit.filter((a) => a.projectId === p.id && inRange(a.at)).forEach((a) => ev.push({ date: a.at.slice(0, 10), kind: 'Change', tone: '', text: `${a.action}${a.reason ? ` — ${a.reason}` : ''}`, by: a.actorId }));
    return ev.sort((a, b) => b.date.localeCompare(a.date));
  }, [state, p.id, from, to, kinds]);

  const keyOf = (d) => {
    if (group === 'day') return d;
    if (group === 'month') return d.slice(0, 7);
    const dt = new Date(d + 'T00:00:00');
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return `Week of ${dt.toISOString().slice(0, 10)}`;
  };
  const groups = {};
  events.forEach((e) => (groups[keyOf(e.date)] ??= []).push(e));

  const exportCSV = () => downloadFile(`${p.code}_history_${from}_${to}.csv`, toCSV(events, [
    { label: 'Date', value: 'date' }, { label: 'Type', value: 'kind' }, { label: 'Detail', value: 'text' },
    { label: 'By', value: (e) => state.users.find((u) => u.id === e.by)?.name || '' }, { label: 'Amount (INR)', value: (e) => (e.amount !== undefined ? paiseToRupeeString(e.amount) : '') },
  ]));

  return (
    <div className="card">
      <div className="card-head"><h2>Project history</h2><div className="btn-row"><button className="btn sm" onClick={exportCSV}>Export CSV</button><button className="btn sm" onClick={() => window.print()}>Print / PDF</button></div></div>
      <div className="filters">
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Group by"><select value={group} onChange={(e) => setGroup(e.target.value)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></Field>
        <div className="btn-row">
          {[['log', 'Logs'], ['task', 'Tasks'], ['expense', 'Expenses'], ['budget', 'Budget'], ['funding', 'Funding'], ['staff', 'Staffing'], ['change', 'All changes']].map(([k, l]) =>
            (k !== 'expense' && k !== 'budget') || can(user, 'budget.view') ? <label key={k} className="check"><input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} />{l}</label> : null)}
        </div>
      </div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        {[['Last 7 days', 7], ['Last month', 30], ['Last 4 months', 120], ['Last year', 365]].map(([l, n]) => <button key={n} className="btn sm" onClick={() => { setFrom(addDays(todayISO(), -n)); setTo(todayISO()); }}>{l}</button>)}
        <span className="small muted">{events.length} events</span>
      </div>
      {!events.length ? <Empty title="No activity in this range" /> : Object.entries(groups).map(([k, list]) => (
        <div className="day-group" key={k}>
          <h3>{group === 'day' ? fmtDate(k) : k}{group !== 'day' && <span className="small muted"> · {list.length} events · expenses {formatINR(sum(list.filter((e) => e.amount !== undefined), (e) => e.amount))}</span>}</h3>
          {list.slice(0, group === 'day' ? 50 : 15).map((e, i) => (
            <div key={i} className="small" style={{ marginBottom: 3 }}><Badge tone={e.tone}>{e.kind}</Badge> {e.text} {e.by && <span className="muted">— <UserName id={e.by} /></span>}</div>
          ))}
          {group !== 'day' && list.length > 15 && <div className="small muted">…and {list.length - 15} more</div>}
        </div>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { Badge, Empty, UserName } from '../components/ui.jsx';
import { formatINR } from '../lib/money.js';
import { fmtDate, fmtDateTime } from '../lib/util.js';
import { currentApprover } from '../store/actions.js';
import { DecisionPanel } from './FundingDetail.jsx';
import { ExpenseTable } from './Expenses.jsx';
import { projectFinancials } from '../lib/finance.js';

const businessHoursSince = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 3600000);

/** Approver inbox: pending decisions with financial context, history and SLA (PRD §11/§12). */
export default function Approvals() {
  const { state, user } = useStore();
  const pending = state.fundingRequests.filter((r) => currentApprover(r) === user.id);
  const ids = new Set(visibleProjects(state, user).map((p) => p.id));
  const expenses = can(user, 'expense.approve')
    ? state.expenses.filter((e) => ids.has(e.projectId) && e.state === 'Submitted' && e.submitterId !== user.id && (user.role !== 'pm' || state.projects.find((p) => p.id === e.projectId)?.managerId === user.id))
    : [];
  const toPost = can(user, 'expense.post') ? state.expenses.filter((e) => e.state === 'Approved') : [];
  const decided = state.fundingRequests.filter((r) => r.decisions.some((d) => d.approverId === user.id)).slice(-10).reverse();
  return (
    <>
      <div className="page-head"><div><h1>Approver inbox</h1><p className="muted">Decisions are recorded with your identity, time and comment. Email links never approve on their own.</p></div></div>
      {can(user, 'funding.decide') && (
        <>
          <h2>Funding requests awaiting you ({pending.length})</h2>
          {!pending.length && <div className="card"><Empty title="You're all caught up" icon="✅" /></div>}
          {pending.map((r) => {
            const p = state.projects.find((x) => x.id === r.projectId);
            const f = projectFinancials(state, r.projectId);
            const age = businessHoursSince(r.submittedAt || r.createdAt);
            return (
              <div key={r.id}>
                <div className="card">
                  <div className="card-head">
                    <h3><Link to={`/funding/${r.id}`}>{r.number}</Link> · {p.code} {p.name}</h3>
                    <div className="btn-row"><Badge tone={r.urgency === 'Critical' ? 'red' : 'amber'}>{r.urgency}</Badge><Badge tone={age > 48 ? 'red' : 'blue'}>{age > 48 ? 'SLA exceeded' : 'Within SLA'} · {age} h</Badge></div>
                  </div>
                  <div className="grid g2">
                    <div>
                      <p><strong>{formatINR(r.amount)}</strong> requested by <UserName id={r.requesterId} /> (v{r.version})</p>
                      <p className="small">{r.reason}</p>
                      {r.items.map((i, k) => <div key={k} className="small muted">• {i.category}: {i.description} — {formatINR(Math.round(i.qty * i.unitCost))}</div>)}
                    </div>
                    <dl className="kv">
                      <dt>Approved budget</dt><dd>{formatINR(f.approved)}</dd>
                      <dt>Actual / committed</dt><dd>{formatINR(f.actual)} / {formatINR(f.committed)}</dd>
                      <dt>Available</dt><dd>{formatINR(f.available)}</dd>
                      <dt>Progress</dt><dd>{f.progress}%</dd>
                      <dt>After approval</dt><dd><strong>{formatINR(f.approved + r.amount)}</strong></dd>
                    </dl>
                  </div>
                </div>
                <DecisionPanel r={r} compact />
              </div>
            );
          })}
        </>
      )}
      {can(user, 'expense.approve') && (
        <div className="card">
          <h2>Expenses awaiting approval ({expenses.length})</h2>
          <ExpenseTable expenses={expenses} showProject />
        </div>
      )}
      {toPost.length > 0 && (
        <div className="card">
          <h2>Approved expenses ready to post ({toPost.length})</h2>
          <ExpenseTable expenses={toPost} showProject />
        </div>
      )}
      {decided.length > 0 && (
        <div className="card">
          <h2>Your recent decisions</h2>
          <table><tbody>{decided.map((r) => {
            const d = r.decisions.filter((x) => x.approverId === user.id).slice(-1)[0];
            return <tr key={r.id}><td><Link to={`/funding/${r.id}`}>{r.number}</Link></td><td>{formatINR(r.amount)}</td><td><Badge>{d.decision}</Badge></td><td className="small">{d.comment}</td><td className="small muted">{fmtDateTime(d.at)}</td></tr>;
          })}</tbody></table>
        </div>
      )}
      <p className="small muted">Today: {fmtDate(new Date().toISOString().slice(0, 10))}</p>
    </>
  );
}

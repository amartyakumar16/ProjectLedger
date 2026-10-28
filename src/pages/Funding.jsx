import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { Badge, Field, Empty, UserName, Money } from '../components/ui.jsx';
import { fmtDate, toCSV, downloadFile, todayISO } from '../lib/util.js';
import { paiseToRupeeString, formatINR, sum } from '../lib/money.js';
import { currentApprover } from '../store/actions.js';

export default function Funding() {
  const { state, user } = useStore();
  const [st, setSt] = useState('');
  const ids = new Set(visibleProjects(state, user).map((p) => p.id));
  const list = state.fundingRequests.filter((r) => ids.has(r.projectId) && (!st || r.state === st)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const exportCSV = () => downloadFile(`funding_register_${todayISO()}.csv`, toCSV(list, [
    { label: 'Request', value: 'number' }, { label: 'Version', value: 'version' }, { label: 'Project', value: (r) => state.projects.find((p) => p.id === r.projectId)?.code },
    { label: 'Amount (INR)', value: (r) => paiseToRupeeString(r.amount) }, { label: 'Urgency', value: 'urgency' }, { label: 'State', value: 'state' },
    { label: 'Requester', value: (r) => state.users.find((u) => u.id === r.requesterId)?.name }, { label: 'Created', value: (r) => r.createdAt.slice(0, 10) },
    { label: 'Decided', value: (r) => r.decidedAt?.slice(0, 10) || '' }, { label: 'Allocation', value: 'allocationId' }, { label: 'Reason', value: 'reason' },
  ]));
  return (
    <>
      <div className="page-head">
        <div><h1>Funding requests</h1><p className="muted">Draft → Submitted → Under review → (Changes requested → Resubmitted) → Approved / Rejected / Withdrawn</p></div>
        <div className="btn-row">
          <button className="btn" onClick={exportCSV}>Export register</button>
          {can(user, 'funding.create') && <Link className="btn primary" to="/funding/new">+ New request</Link>}
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {['Under review', 'Changes requested', 'Approved', 'Rejected'].map((s) => {
          const l = state.fundingRequests.filter((r) => ids.has(r.projectId) && r.state === s);
          return <div key={s} className="stat"><div className="label">{s}</div><div className="value">{formatINR(sum(l, (r) => r.amount))}</div><div className="sub">{l.length} request(s)</div></div>;
        })}
      </div>
      <div className="card">
        <div className="filters">
          <Field label="State"><select value={st} onChange={(e) => setSt(e.target.value)}><option value="">All</option>{['Draft', 'Under review', 'Changes requested', 'Approved', 'Rejected', 'Withdrawn'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <FundingTable list={list} />
      </div>
    </>
  );
}

export function FundingTable({ list }) {
  const { state } = useStore();
  const navigate = useNavigate();
  if (!list.length) return <Empty title="No funding requests" icon="📄" />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Request</th><th>Project</th><th className="num">Amount</th><th>Urgency</th><th>State</th><th>Requester</th><th>Waiting on</th><th>Created</th></tr></thead>
        <tbody>
          {list.map((r) => {
            const cur = currentApprover(r);
            return (
              <tr key={r.id} className="clickable" onClick={() => navigate(`/funding/${r.id}`)}>
                <td><Link to={`/funding/${r.id}`}><strong>{r.number}</strong></Link>{r.version > 1 && <span className="small muted"> v{r.version}</span>}<div className="small muted" style={{ maxWidth: 320 }}>{r.reason.slice(0, 90)}</div></td>
                <td>{state.projects.find((p) => p.id === r.projectId)?.code}</td>
                <td className="num"><Money value={r.amount} /></td>
                <td><Badge tone={r.urgency === 'Critical' ? 'red' : r.urgency === 'High' ? 'amber' : ''}>{r.urgency}</Badge></td>
                <td><Badge>{r.state}</Badge></td>
                <td className="small"><UserName id={r.requesterId} /></td>
                <td className="small">{cur ? <UserName id={cur} /> : '—'}</td>
                <td className="small nowrap">{fmtDate(r.createdAt.slice(0, 10))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, canSeeProject } from '../lib/permissions.js';
import { Badge, Empty, UserName, Field, Modal, ReasonModal } from '../components/ui.jsx';
import { formatINR } from '../lib/money.js';
import { fmtDate, fmtDateTime } from '../lib/util.js';
import { currentApprover, buildSnapshot } from '../store/actions.js';

export default function FundingDetail() {
  const { id } = useParams();
  const { state, user, run, A } = useStore();
  const r = state.fundingRequests.find((x) => x.id === id);
  const [email, setEmail] = useState(null);
  const [withdraw, setWithdraw] = useState(false);
  if (!r) return <Empty title="Request not found" />;
  if (!canSeeProject(state, user, r.projectId)) return <Empty icon="🔒" title="Access restricted" />;
  const p = state.projects.find((x) => x.id === r.projectId);
  const cur = currentApprover(r);
  const snap = r.snapshot || buildSnapshot(state, r.projectId);
  const live = buildSnapshot(state, r.projectId);
  const mine = r.requesterId === user.id;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted"><Link to="/funding">Funding requests</Link> / {r.number}</div>
          <h1>{r.number} · {formatINR(r.amount)} for {p.code}</h1>
          <div className="btn-row"><Badge>{r.state}</Badge><Badge tone={r.urgency === 'Critical' ? 'red' : r.urgency === 'High' ? 'amber' : ''}>{r.urgency}</Badge><span className="small muted">Version {r.version} · requested by <UserName id={r.requesterId} /> · {fmtDateTime(r.createdAt)}</span></div>
        </div>
        <div className="btn-row">
          {mine && ['Draft', 'Changes requested'].includes(r.state) && <Link className="btn" to={`/funding/${r.id}/edit`}>Edit{r.state === 'Changes requested' ? ' (new version)' : ''}</Link>}
          {mine && ['Draft', 'Changes requested'].includes(r.state) && <button className="btn primary" onClick={() => run(A.submitFunding, { id: r.id }, { success: r.state === 'Draft' ? 'Submitted for approval' : 'Resubmitted' })}>{r.state === 'Draft' ? 'Submit' : 'Resubmit'}</button>}
          {mine && !['Approved', 'Rejected', 'Withdrawn'].includes(r.state) && <button className="btn danger" onClick={() => setWithdraw(true)}>Withdraw</button>}
          <button className="btn" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {cur === user.id && <DecisionPanel r={r} />}
      {cur && cur !== user.id && r.state === 'Under review' && <div className="alert info">Waiting for <UserName id={cur} /> to decide.</div>}
      {r.state === 'Approved' && <div className="alert ok">Approved — allocation <span className="mono">{r.allocationId}</span> of {formatINR(r.amount)} was added to {p.code} exactly once. The original allocation remains separately visible.</div>}

      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Justification</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.reason}</p>
            <dl className="kv">
              <dt>Proposed effective date</dt><dd>{fmtDate(r.effectiveDate)}</dd>
              <dt>Revised completion</dt><dd>{fmtDate(r.revisedCompletion)} <span className="muted small">(baseline {fmtDate(p.endDate)})</span></dd>
              <dt>Expected runway</dt><dd>{r.runwayNote || '—'}</dd>
              <dt>Consequences</dt><dd>{r.consequences || '—'}</dd>
              <dt>Supporting documents</dt><dd>{(r.attachments || []).length ? r.attachments.map((a) => <div key={a}>📎 {a}</div>) : '—'}</dd>
            </dl>
          </div>
          <div className="card">
            <h2>Itemized use of funds</h2>
            <table>
              <thead><tr><th>Category</th><th>Description</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Total</th></tr></thead>
              <tbody>{r.items.map((i, k) => <tr key={k}><td>{i.category}</td><td>{i.description}</td><td className="num">{i.qty}</td><td className="num">{formatINR(i.unitCost, { decimals: true })}</td><td className="num">{formatINR(Math.round(i.qty * i.unitCost), { decimals: true })}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={4}>Requested</td><td className="num">{formatINR(r.amount, { decimals: true })}</td></tr></tfoot>
            </table>
          </div>
          {r.versions.length > 0 && (
            <div className="card">
              <h2>Previous versions</h2>
              {r.versions.map((v) => (
                <div key={v.version} className="small" style={{ marginBottom: 8 }}>
                  <strong>v{v.version}</strong> — {formatINR(v.amount)} · saved {fmtDateTime(v.savedAt)}
                  {v.decisions?.map((d, i) => <div key={i} className="muted">↳ {d.decision} by <UserName id={d.approverId} />: “{d.comment}”</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="card">
            <h2>Financial context</h2>
            <p className="small muted">{r.snapshot ? `Snapshot at submission (${fmtDateTime(r.snapshot.takenAt)}) vs live today` : 'Live figures (snapshot is taken at submission)'}</p>
            <table>
              <thead><tr><th></th><th className="num">At submission</th><th className="num">Live</th></tr></thead>
              <tbody>
                {[['Approved budget', 'approved'], ['Actual cost', 'actual'], ['Commitments', 'committed'], ['Available uncommitted', 'available'], ['Forecast at completion', 'forecast']].map(([l, k]) => (
                  <tr key={k}><td>{l}</td><td className="num">{formatINR(snap[k])}</td><td className="num">{formatINR(live[k])}</td></tr>
                ))}
                <tr><td>Progress</td><td className="num">{snap.progress}%</td><td className="num">{live.progress}%</td></tr>
              </tbody>
            </table>
            {snap.categories && <><h3 style={{ marginTop: 12 }}>Actual by category (at submission)</h3>{snap.categories.map((c) => <div key={c.category} className="small">{c.category}: {formatINR(c.actual)}</div>)}</>}
            {snap.outstanding && <><h3 style={{ marginTop: 12 }}>Outstanding work</h3><div className="small">{snap.outstanding.join(', ') || '—'}</div></>}
            {snap.blockers?.length > 0 && <><h3 style={{ marginTop: 12 }}>Blockers</h3><div className="small">{snap.blockers.join(', ')}</div></>}
          </div>
          <div className="card">
            <h2>Approval chain</h2>
            {r.approverIds.length ? r.approverIds.map((aid, i) => {
              const d = [...r.decisions].reverse().find((x) => x.approverId === aid && x.version === r.version) || (r.version === 1 ? r.decisions.find((x) => x.approverId === aid) : null);
              return (
                <div key={aid} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <span className="badge">{i + 1}</span><UserName id={aid} />
                  {d ? <Badge>{d.decision}</Badge> : cur === aid ? <Badge tone="blue">Pending</Badge> : <Badge>Queued</Badge>}
                  {d?.comment && <span className="small muted">“{d.comment}”</span>}
                </div>
              );
            }) : <p className="small muted">Routed at submission.</p>}
          </div>
          <div className="card">
            <h2>History</h2>
            <ul className="timeline">
              {r.history.map((h, i) => <li key={i}><span className="small muted">{fmtDateTime(h.at)}</span><div><Badge>{h.state}</Badge> <UserName id={h.by} />{h.comment && <span className="small"> — {h.comment}</span>}</div></li>)}
            </ul>
          </div>
          <div className="card">
            <h2>Email delivery log</h2>
            <p className="small muted">Email delivery never approves anything; only authenticated in-app decisions update the workflow (FR-044, AC-09).</p>
            {r.emails.length ? (
              <div className="table-wrap"><table>
                <thead><tr><th>To</th><th>Subject</th><th>Status</th><th className="num">Attempts</th><th></th></tr></thead>
                <tbody>
                  {r.emails.map((e) => (
                    <tr key={e.id}>
                      <td className="small">{e.to}</td><td className="small"><button className="btn link" onClick={() => setEmail(e)}>{e.subject}</button></td>
                      <td><Badge>{e.status}</Badge>{e.error && <div className="small muted">{e.error}</div>}</td><td className="num">{e.attempts}</td>
                      <td>{e.status === 'Failed' && (mine || can(user, 'admin.manage') || can(user, 'funding.decide')) && <button className="btn sm" onClick={() => run(A.retryEmail, { requestId: r.id, emailId: e.id }, { success: 'Retry attempted' })}>Retry</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <p className="small muted">No emails sent yet.</p>}
          </div>
        </div>
      </div>
      {email && <Modal title="Email" wide onClose={() => setEmail(null)}><div className="email-preview"><strong>To:</strong> {email.to}{'\n'}<strong>Subject:</strong> {email.subject}{'\n\n'}{email.body}</div></Modal>}
      {withdraw && <ReasonModal title="Withdraw request" required={false} tone="danger" confirmLabel="Withdraw" onClose={() => setWithdraw(false)} onConfirm={(c) => run(A.withdrawFunding, { id: r.id, reason: c }, { success: 'Request withdrawn' }).ok && setWithdraw(false)} />}
    </>
  );
}

export function DecisionPanel({ r, compact }) {
  const { run, A, state } = useStore();
  const [comment, setComment] = useState('');
  const p = state.projects.find((x) => x.id === r.projectId);
  const decide = (decision) => {
    const res = run(A.decideFunding, { id: r.id, decision, comment }, { success: decision === 'Approved' ? 'Approved' : `Marked ${decision.toLowerCase()}` });
    if (res.ok) setComment('');
  };
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--teal)' }}>
      <h2>Your decision{compact ? `: ${r.number} · ${p.code} · ${formatINR(r.amount)}` : ''}</h2>
      <Field label="Comment" hint="Mandatory for Reject and Request changes"><textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="btn-row">
        <button className="btn success" onClick={() => decide('Approved')}>Approve</button>
        <button className="btn" onClick={() => decide('Changes requested')} disabled={!comment.trim()}>Request changes</button>
        <button className="btn danger" onClick={() => decide('Rejected')} disabled={!comment.trim()}>Reject</button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { Field, MoneyInput, Empty, Badge } from '../components/ui.jsx';
import { formatINR, sum } from '../lib/money.js';
import { todayISO, addDays, fmtDate } from '../lib/util.js';
import { buildSnapshot, fundingEmail, routeApprovers } from '../store/actions.js';
import { EXPENSE_CATEGORIES } from '../data/seed.js';

/** Funding request composer with auto-populated financial snapshot (FR-040, PRD §12). */
export default function FundingComposer() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, user, run, A } = useStore();
  const existing = id ? state.fundingRequests.find((r) => r.id === id) : null;
  const projects = visibleProjects(state, user).filter((p) => ['Active', 'On hold'].includes(p.status));
  const [r, setR] = useState(() => existing ? JSON.parse(JSON.stringify(existing)) : {
    projectId: params.get('project') || projects[0]?.id || '', urgency: 'Normal', reason: '', effectiveDate: todayISO(), revisedCompletion: '', runwayNote: '', consequences: '',
    items: [{ category: 'Materials', description: '', qty: 1, unitCost: 0 }], attachments: [],
  });
  if (!can(user, 'funding.create')) return <Empty icon="🔒" title="You cannot create funding requests" />;
  if (existing && existing.requesterId !== user.id) return <Empty icon="🔒" title="Only the requester can edit this request" />;
  if (!r.projectId) return <Empty title="No eligible projects" />;

  const p = state.projects.find((x) => x.id === r.projectId);
  const snap = buildSnapshot(state, r.projectId);
  const amount = sum(r.items, (i) => Math.round(Number(i.qty || 0) * (i.unitCost || 0)));
  const newRunway = snap.burnPerDay > 0 ? Math.floor((Math.max(snap.available, 0) + amount) / snap.burnPerDay) : null;
  const req = { ...r, amount, number: existing?.number || '(new)', requesterId: user.id, id: existing?.id || 'new' };
  const route = routeApprovers(state, amount, user.id);
  const preview = route[0] ? fundingEmail(state, { ...req, snapshot: snap }, route[0]) : null;
  const setItem = (i, k, v) => setR({ ...r, items: r.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });

  const smartDraft = () => {
    setR({
      ...r,
      reason: r.reason || `${p.code} has used ${snap.approved ? Math.round((snap.actual / snap.approved) * 100) : 0}% of its approved budget (${formatINR(snap.actual)} of ${formatINR(snap.approved)}) with ${snap.progress}% of work complete. Outstanding commitments are ${formatINR(snap.committed)}, leaving ${formatINR(snap.available)} uncommitted.${snap.blockers.length ? ` Current blockers: ${snap.blockers.join(', ')}.` : ''} Additional funds are needed to complete: ${snap.outstanding.slice(0, 4).join(', ')}.`,
      runwayNote: r.runwayNote || (newRunway !== null ? `≈ ${newRunway} days at current burn of ${formatINR(snap.burnPerDay)}/day` : ''),
      revisedCompletion: r.revisedCompletion || p.endDate,
      consequences: r.consequences || 'Without approval, remaining milestones will be paused once the uncommitted balance is exhausted, delaying completion.',
    });
  };

  const save = (submit) => {
    const res = run(A.saveFundingDraft, { request: { ...r, amount } }, { success: submit ? undefined : 'Draft saved' });
    if (!res.ok) return;
    if (submit) {
      const s2 = run(A.submitFunding, { id: res.id }, { success: 'Submitted and routed for approval' });
      if (!s2.ok) { navigate(`/funding/${res.id}/edit`, { replace: true }); return; }
    }
    navigate(`/funding/${res.id}`);
  };

  return (
    <>
      <div className="page-head">
        <div><div className="small muted"><Link to="/funding">Funding requests</Link> / {existing ? `${existing.number} (editing v${existing.version}${existing.state === 'Changes requested' ? ` → v${existing.version + 1}` : ''})` : 'New'}</div><h1>{existing ? 'Edit funding request' : 'Request additional funding'}</h1></div>
        <div className="btn-row">
          <button className="btn" onClick={smartDraft} title="Fills empty fields from verified project records. Review before submitting.">✨ Draft from project data</button>
          <button className="btn" onClick={() => save(false)}>Save draft</button>
          <button className="btn primary" onClick={() => save(true)}>Submit for approval</button>
        </div>
      </div>
      {existing?.state === 'Changes requested' && <div className="alert warn">Changes requested: “{existing.decisions.filter((d) => d.decision === 'Changes requested').slice(-1)[0]?.comment}”. Saving creates version {existing.version + 1} which must be re-reviewed (AC-06).</div>}
      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Request</h2>
            <div className="form-row">
              <Field label="Project *"><select value={r.projectId} onChange={(e) => setR({ ...r, projectId: e.target.value })} disabled={!!existing}>{projects.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select></Field>
              <Field label="Urgency"><select value={r.urgency} onChange={(e) => setR({ ...r, urgency: e.target.value })}>{['Low', 'Normal', 'High', 'Critical'].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Proposed effective date"><input type="date" value={r.effectiveDate} onChange={(e) => setR({ ...r, effectiveDate: e.target.value })} /></Field>
            </div>
            <Field label="Justification *"><textarea rows={5} value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} /></Field>
          </div>
          <div className="card">
            <div className="card-head"><h2>Itemized use of funds</h2><button className="btn sm" onClick={() => setR({ ...r, items: [...r.items, { category: 'Materials', description: '', qty: 1, unitCost: 0 }] })}>+ Line</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Category</th><th>Description / assumption</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Line total</th><th></th></tr></thead>
                <tbody>
                  {r.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ minWidth: 130 }}><select value={it.category} onChange={(e) => setItem(i, 'category', e.target.value)}>{[...EXPENSE_CATEGORIES, 'Labour / Payroll'].map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td style={{ minWidth: 160 }}><input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} /></td>
                      <td style={{ width: 80 }}><input type="number" min="0" step="any" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} /></td>
                      <td style={{ minWidth: 120 }}><MoneyInput value={it.unitCost} onChange={(v) => setItem(i, 'unitCost', v)} /></td>
                      <td className="num">{formatINR(Math.round(Number(it.qty || 0) * (it.unitCost || 0)), { decimals: true })}</td>
                      <td><button className="btn sm danger" aria-label="Remove line" onClick={() => setR({ ...r, items: r.items.filter((_, j) => j !== i) })}>×</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={4}>Requested amount</td><td className="num">{formatINR(amount, { decimals: true })}</td><td></td></tr></tfoot>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Forecast & consequences</h2>
            <div className="form-row">
              <Field label="Revised completion date"><input type="date" value={r.revisedCompletion} onChange={(e) => setR({ ...r, revisedCompletion: e.target.value })} /></Field>
              <Field label="Expected runway" hint={newRunway !== null ? `Calculated: ≈ ${newRunway} days with this funding` : ''}><input value={r.runwayNote} onChange={(e) => setR({ ...r, runwayNote: e.target.value })} /></Field>
            </div>
            <Field label="Consequences of approval / delay / rejection"><textarea value={r.consequences} onChange={(e) => setR({ ...r, consequences: e.target.value })} /></Field>
            <Field label="Supporting documents" hint={(r.attachments || []).join(', ') || 'Quotes, invoices, sponsor emails'}>
              <input type="file" multiple onChange={(e) => setR({ ...r, attachments: [...(r.attachments || []), ...[...e.target.files].map((f) => f.name)] })} />
            </Field>
          </div>
        </div>
        <div>
          <div className="card">
            <h2>Live financial snapshot · {p.code}</h2>
            <p className="small muted">Frozen into the request at submission (FR-040).</p>
            <dl className="kv">
              <dt>Approved budget</dt><dd>{formatINR(snap.approved)}</dd>
              <dt>Actual cost</dt><dd>{formatINR(snap.actual)}</dd>
              <dt>Outstanding commitments</dt><dd>{formatINR(snap.committed)}</dd>
              <dt>Available uncommitted</dt><dd style={{ color: snap.available < 0 ? 'var(--red)' : undefined }}>{formatINR(snap.available)}</dd>
              <dt>Progress</dt><dd>{snap.progress}%</dd>
              <dt>Burn rate (30d)</dt><dd>{formatINR(snap.burnPerDay)}/day · runway {snap.runwayDays ?? '—'} days</dd>
              <dt>Forecast at completion</dt><dd>{formatINR(snap.forecast)}</dd>
              <dt>Budget after approval</dt><dd><strong>{formatINR(snap.approved + amount)}</strong></dd>
            </dl>
            <h3 style={{ marginTop: 12 }}>Spending by category</h3>
            {snap.categories.map((c) => <div key={c.category} className="small">{c.category}: {formatINR(c.actual)}{c.committed ? ` (+${formatINR(c.committed)} committed)` : ''}</div>)}
            <h3 style={{ marginTop: 12 }}>Completed</h3><div className="small">{snap.completed.join(', ') || '—'}</div>
            <h3 style={{ marginTop: 12 }}>Outstanding</h3><div className="small">{snap.outstanding.join(', ') || '—'}</div>
            {snap.blockers.length > 0 && <><h3 style={{ marginTop: 12 }}>Blockers</h3><div className="small">{snap.blockers.map((b) => <Badge key={b} tone="red">{b}</Badge>)}</div></>}
          </div>
          <div className="card">
            <h2>Approval route</h2>
            <p className="small">{route.map((u, i) => <span key={u}>{i > 0 && ' → '}<strong>{state.users.find((x) => x.id === u)?.name}</strong></span>)}</p>
            <p className="small muted">Amounts above {formatINR(state.settings.singleApproverLimit)} need sequential approval by the owner. Requesters never approve their own requests.</p>
            {preview && amount > 0 && (
              <>
                <h3>Email preview</h3>
                <div className="email-preview"><strong>Subject:</strong> {preview.subject}{'\n\n'}{preview.body}</div>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="small muted">Revised completion currently {fmtDate(r.revisedCompletion)} · original end {fmtDate(p.endDate)} · {addDays(p.endDate, 0) < (r.revisedCompletion || '') ? 'schedule slip' : 'no slip'}</p>
    </>
  );
}

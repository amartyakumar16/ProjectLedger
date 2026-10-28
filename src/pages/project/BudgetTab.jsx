import { useState } from 'react';
import { useStore } from '../../store/Store.jsx';
import { can } from '../../lib/permissions.js';
import { categoryBreakdown, projectFinancials, projectLedger } from '../../lib/finance.js';
import { Badge, Modal, Field, MoneyInput, Money, Empty, UserName, ReasonModal } from '../../components/ui.jsx';
import { formatINR, paiseToRupeeString, sum } from '../../lib/money.js';
import { fmtDate, todayISO, toCSV, downloadFile } from '../../lib/util.js';
import { EXPENSE_CATEGORIES } from '../../data/seed.js';

export default function BudgetTab({ p }) {
  const { state, user, run, A } = useStore();
  const [allocOpen, setAllocOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [settle, setSettle] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const f = projectFinancials(state, p.id);
  const allocs = state.allocations.filter((a) => a.projectId === p.id).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const cats = categoryBreakdown(state, p.id);
  const commitments = state.commitments.filter((c) => c.projectId === p.id);
  const ledger = projectLedger(state, p.id);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Budget events (immutable)</h2>
          {can(user, 'budget.allocate') && <button className="btn primary" onClick={() => setAllocOpen(true)}>+ Record allocation / adjustment</button>}
        </div>
        <p className="small muted">Approved budget = original allocation + approved additions ± approved adjustments. Each event is kept separately; nothing is overwritten (FR-010).</p>
        {allocs.length ? (
          <table>
            <thead><tr><th>Effective</th><th>Type</th><th>Reason</th><th>Approval ref</th><th>Recorded by</th><th className="num">Amount</th><th className="num">Running total</th></tr></thead>
            <tbody>
              {allocs.map((a, i) => (
                <tr key={a.id}>
                  <td>{fmtDate(a.effectiveDate)}</td>
                  <td><Badge tone={a.type === 'original' ? 'blue' : a.type === 'additional' ? 'green' : 'amber'}>{a.type}</Badge></td>
                  <td>{a.reason}</td><td className="mono">{a.approvalRef}</td><td className="small"><UserName id={a.createdBy} /></td>
                  <td className="num"><Money value={a.amount} /></td>
                  <td className="num">{formatINR(sum(allocs.slice(0, i + 1), (x) => x.amount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={5}>Approved budget</td><td className="num">{formatINR(f.approved)}</td><td></td></tr></tfoot>
          </table>
        ) : <Empty title="No budget recorded yet">Finance records the original allocation here.</Empty>}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Planned vs actual by category</h2>
          {can(user, 'budget.allocate') && <button className="btn sm" onClick={() => setPlanOpen(true)}>Edit category plan</button>}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Committed</th><th className="num">Variance (plan − actual − committed)</th><th style={{ width: 160 }}>Use</th></tr></thead>
            <tbody>
              {cats.map((c) => {
                const v = c.planned - c.actual - c.committed;
                const use = c.planned ? Math.round(((c.actual + c.committed) / c.planned) * 100) : null;
                return (
                  <tr key={c.category}>
                    <td>{c.category}</td><td className="num">{formatINR(c.planned)}</td><td className="num">{formatINR(c.actual)}</td><td className="num">{formatINR(c.committed)}</td>
                    <td className="num" style={{ color: v < 0 ? 'var(--red)' : undefined }}>{formatINR(v)}</td>
                    <td>{use === null ? <span className="small muted">unplanned</span> : <><div className="bar"><span className={use > 100 ? 'over' : 'actual'} style={{ width: `${Math.min(use, 100)}%` }} /></div><span className="small muted">{use}%</span></>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td>Total</td><td className="num">{formatINR(sum(cats, (c) => c.planned))}</td><td className="num">{formatINR(f.actual)}</td><td className="num">{formatINR(f.committed)}</td><td className="num">{formatINR(sum(cats, (c) => c.planned) - f.actual - f.committed)}</td><td></td></tr></tfoot>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Commitments (purchase orders & planned obligations)</h2>
          {can(user, 'commitment.manage') && <button className="btn" onClick={() => setCommitOpen(true)}>+ Commitment</button>}
        </div>
        <p className="small muted">Commitments reduce available uncommitted budget but are not actual cost until settled (AC-02).</p>
        {commitments.length ? (
          <table>
            <thead><tr><th>Description</th><th>Vendor</th><th>Due</th><th className="num">Amount</th><th className="num">Settled</th><th className="num">Outstanding</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {commitments.map((c) => (
                <tr key={c.id}>
                  <td>{c.description}<div className="small muted">{c.category}</div></td><td>{c.vendor}</td><td>{fmtDate(c.dueDate)}</td>
                  <td className="num">{formatINR(c.amount)}</td><td className="num">{formatINR(c.settled)}</td>
                  <td className="num">{formatINR(c.status === 'Open' ? c.amount - c.settled : 0)}</td>
                  <td><Badge>{c.status}</Badge></td>
                  <td className="nowrap">
                    {c.status === 'Open' && can(user, 'expense.post') && <button className="btn sm" onClick={() => setSettle({ c, amount: c.amount - c.settled })}>Settle</button>}{' '}
                    {c.status === 'Open' && can(user, 'commitment.manage') && <button className="btn sm danger" onClick={() => setCancel(c)}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="No commitments" />}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Transaction ledger</h2>
          <button className="btn sm" onClick={() => downloadFile(`${p.code}_ledger.csv`, toCSV(ledger, [
            { label: 'Date', value: 'date' }, { label: 'Type', value: 'kind' }, { label: 'Reference', value: 'ref' }, { label: 'Description', value: 'description' },
            { label: 'Budget (INR)', value: (r) => paiseToRupeeString(r.budget) }, { label: 'Cost (INR)', value: (r) => paiseToRupeeString(r.cost) },
            { label: 'Running budget', value: (r) => paiseToRupeeString(r.runningBudget) }, { label: 'Running cost', value: (r) => paiseToRupeeString(r.runningCost) }, { label: 'Available after actuals', value: (r) => paiseToRupeeString(r.runningAvailable) },
          ]))}>Export CSV</button>
        </div>
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table>
            <thead><tr><th>Date</th><th>Event</th><th>Description</th><th className="num">Budget</th><th className="num">Actual cost</th><th className="num">Available after actuals</th></tr></thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.kind + r.ref}>
                  <td className="nowrap">{fmtDate(r.date)}</td><td><Badge tone={r.budget ? 'blue' : r.cost < 0 ? 'purple' : ''}>{r.kind}</Badge></td><td className="small">{r.description}</td>
                  <td className="num">{r.budget ? formatINR(r.runningBudget) : ''}</td>
                  <td className="num">{formatINR(r.runningCost, { decimals: true })}</td>
                  <td className="num" style={{ color: r.runningAvailable < 0 ? 'var(--red)' : undefined }}>{formatINR(r.runningAvailable, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {allocOpen && <AllocationModal p={p} onClose={() => setAllocOpen(false)} />}
      {commitOpen && <CommitmentModal p={p} onClose={() => setCommitOpen(false)} />}
      {planOpen && <PlanModal p={p} onClose={() => setPlanOpen(false)} />}
      {settle && (
        <Modal title="Settle commitment" onClose={() => setSettle(null)} footer={<><button className="btn" onClick={() => setSettle(null)}>Cancel</button><button className="btn primary" onClick={() => run(A.settleCommitment, { id: settle.c.id, amount: settle.amount }, { success: 'Posted as actual expense' }).ok && setSettle(null)}>Post settlement</button></>}>
          <p>{settle.c.description}</p>
          <Field label="Amount invoiced / paid" hint={`Outstanding ${formatINR(settle.c.amount - settle.c.settled)}`}><MoneyInput value={settle.amount} onChange={(v) => setSettle({ ...settle, amount: v })} /></Field>
        </Modal>
      )}
      {cancel && <ReasonModal title="Cancel commitment" tone="danger" onClose={() => setCancel(null)} onConfirm={(r) => run(A.cancelCommitment, { id: cancel.id, reason: r }, { success: 'Commitment cancelled' }).ok && setCancel(null)} />}
    </>
  );
}

function AllocationModal({ p, onClose }) {
  const { state, run, A } = useStore();
  const hasOriginal = state.allocations.some((a) => a.projectId === p.id && a.type === 'original');
  const [a, setA] = useState({ type: hasOriginal ? 'adjustment' : 'original', amount: 0, reason: '', approvalRef: '', effectiveDate: todayISO() });
  return (
    <Modal title="Record budget event" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run(A.addAllocation, { projectId: p.id, ...a }, { success: 'Budget event recorded' }).ok && onClose()}>Record</button></>}>
      <div className="form-row">
        <Field label="Type"><select value={a.type} onChange={(e) => setA({ ...a, type: e.target.value })}>{!hasOriginal && <option value="original">Original allocation</option>}<option value="adjustment">Adjustment (+/−)</option><option value="additional">Additional (approved offline)</option></select></Field>
        <Field label="Effective date"><input type="date" value={a.effectiveDate} onChange={(e) => setA({ ...a, effectiveDate: e.target.value })} /></Field>
      </div>
      <Field label="Amount *" hint={a.type === 'adjustment' ? 'Use a negative value to reduce the budget' : ''}><MoneyInput allowNegative={a.type === 'adjustment'} value={a.amount} onChange={(v) => setA({ ...a, amount: v })} /></Field>
      <Field label="Approval reference"><input value={a.approvalRef} onChange={(e) => setA({ ...a, approvalRef: e.target.value })} placeholder="Board minute, PO, email ref…" /></Field>
      <Field label="Reason *"><textarea value={a.reason} onChange={(e) => setA({ ...a, reason: e.target.value })} /></Field>
      <div className="alert info small">Additional funding normally flows through a Funding Request so the approval chain is captured automatically.</div>
    </Modal>
  );
}

function CommitmentModal({ p, onClose }) {
  const { run, A } = useStore();
  const [c, setC] = useState({ projectId: p.id, description: '', vendor: '', category: 'Materials', amount: 0, dueDate: todayISO() });
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  return (
    <Modal title="New commitment" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run(A.saveCommitment, { commitment: c }, { success: 'Commitment recorded' }).ok && onClose()}>Save</button></>}>
      <Field label="Description *"><input value={c.description} onChange={set('description')} placeholder="PO-1234: …" /></Field>
      <div className="form-row">
        <Field label="Vendor"><input value={c.vendor} onChange={set('vendor')} /></Field>
        <Field label="Category"><select value={c.category} onChange={set('category')}>{EXPENSE_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <div className="form-row">
        <Field label="Expected amount *"><MoneyInput value={c.amount} onChange={(v) => setC({ ...c, amount: v })} /></Field>
        <Field label="Due date"><input type="date" value={c.dueDate} onChange={set('dueDate')} /></Field>
      </div>
    </Modal>
  );
}

function PlanModal({ p, onClose }) {
  const { run, A } = useStore();
  const cats = [...EXPENSE_CATEGORIES, 'Labour / Payroll'];
  const [plan, setPlan] = useState({ ...p.categoryPlan });
  return (
    <Modal title="Category budget plan" onClose={onClose} footer={<><span className="muted small" style={{ marginRight: 'auto' }}>Total {formatINR(sum(Object.values(plan), (v) => v || 0))}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run(A.setCategoryPlan, { projectId: p.id, plan: Object.fromEntries(Object.entries(plan).filter(([, v]) => v)) }, { success: 'Plan saved' }).ok && onClose()}>Save</button></>}>
      <div className="form-row">
        {cats.map((c) => <Field key={c} label={c}><MoneyInput value={plan[c] || 0} onChange={(v) => setPlan({ ...plan, [c]: v })} /></Field>)}
      </div>
    </Modal>
  );
}

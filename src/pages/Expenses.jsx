import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { Badge, Modal, Field, MoneyInput, Money, Empty, UserName, ReasonModal } from '../components/ui.jsx';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../data/seed.js';
import { formatINR, paiseToRupeeString, toPaise, sum } from '../lib/money.js';
import { fmtDate, fmtDateTime, todayISO, toCSV, downloadFile, parseCSV } from '../lib/util.js';
import { findDuplicateExpense, projectFinancials } from '../lib/finance.js';

const STATES = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Posted', 'Paid', 'Reversed'];

export default function Expenses() {
  const { state, user, run, A } = useStore();
  const [params, setParams] = useSearchParams();
  const projects = visibleProjects(state, user);
  const ids = new Set(projects.map((p) => p.id));
  const [f, setF] = useState({ projectId: '', state: '', category: '', from: '', to: '', q: '', mine: user.role === 'employee' });
  const [selected, setSelected] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkCat, setBulkCat] = useState('');
  const showNew = params.get('new') === '1';

  const list = useMemo(() => state.expenses
    .filter((e) => ids.has(e.projectId))
    .filter((e) => (user.role === 'employee' || f.mine ? e.submitterId === user.id : true))
    .filter((e) => !f.projectId || e.projectId === f.projectId)
    .filter((e) => !f.state || e.state === f.state)
    .filter((e) => !f.category || e.category === f.category)
    .filter((e) => !f.from || e.date >= f.from)
    .filter((e) => !f.to || e.date <= f.to)
    .filter((e) => {
      const q = f.q.toLowerCase();
      return !q || [e.vendor, e.notes, e.category, e.id, paiseToRupeeString(e.amount)].some((x) => String(x || '').toLowerCase().includes(q));
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [state.expenses, f, user]); // eslint-disable-line

  const exportCSV = () => {
    const csv = toCSV(list, [
      { label: 'Expense ID', value: 'id' }, { label: 'Date', value: 'date' },
      { label: 'Project', value: (e) => state.projects.find((p) => p.id === e.projectId)?.code },
      { label: 'Category', value: 'category' }, { label: 'Vendor', value: 'vendor' },
      { label: 'Amount (INR)', value: (e) => paiseToRupeeString(e.amount) }, { label: 'Tax (INR)', value: (e) => paiseToRupeeString(e.tax || 0) },
      { label: 'Payment method', value: 'paymentMethod' }, { label: 'State', value: 'state' },
      { label: 'Submitter', value: (e) => state.users.find((u) => u.id === e.submitterId)?.name }, { label: 'Receipt', value: 'receipt' },
      { label: 'Reversal of', value: 'reversalOf' }, { label: 'Notes', value: 'notes' },
    ]);
    downloadFile(`expenses_${todayISO()}.csv`, csv);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Expenses</h1>
          <p className="muted">Record every cost — down to ₹0.01 — with evidence and a clear approval state.</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={exportCSV}>Export CSV</button>
          {can(user, 'expense.import') && <button className="btn" onClick={() => setImportOpen(true)}>Import CSV</button>}
          {can(user, 'expense.create') && <button className="btn primary" onClick={() => setParams({ new: '1' })}>+ New expense</button>}
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        {['Submitted', 'Approved', 'Posted', 'Paid'].map((s) => {
          const l = list.filter((e) => e.state === s);
          return <div className="stat" key={s}><div className="label">{s}</div><div className="value">{formatINR(sum(l, (e) => e.amount))}</div><div className="sub">{l.length} item(s)</div></div>;
        })}
      </div>

      <div className="card">
        <div className="filters">
          <Field label="Search"><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Vendor, notes, amount…" /></Field>
          <Field label="Project"><select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">All</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
          <Field label="State"><select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">All</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All</option>{EXPENSE_CATEGORIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="From"><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          {user.role !== 'employee' && <label className="check"><input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} /> Mine only</label>}
        </div>
        {can(user, 'expense.post') && selected.length > 0 && (
          <div className="alert info btn-row">
            {selected.length} selected · Bulk categorize (drafts/submitted only):
            <select style={{ width: 200 }} value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}><option value="">Choose category…</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            <button className="btn sm primary" disabled={!bulkCat} onClick={() => { run(A.bulkCategorize, { ids: selected, category: bulkCat }, { success: 'Categories updated' }); setSelected([]); }}>Apply</button>
          </div>
        )}
        <ExpenseTable expenses={list} showProject selectable={can(user, 'expense.post')} selected={selected} setSelected={setSelected} focusId={params.get('focus')} />
      </div>

      {showNew && <ExpenseForm onClose={() => setParams({})} defaultProjectId={f.projectId || params.get('project') || ''} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </>
  );
}

export function ExpenseTable({ expenses, showProject, selectable, selected = [], setSelected, focusId }) {
  const { state } = useStore();
  const [detail, setDetail] = useState(focusId || null);
  const [edit, setEdit] = useState(null);
  if (!expenses.length) return <Empty title="No expenses found" icon="🧾" />;
  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {selectable && <th style={{ width: 28 }}><input type="checkbox" aria-label="Select all" checked={selected.length === expenses.length} onChange={(e) => setSelected(e.target.checked ? expenses.map((x) => x.id) : [])} /></th>}
              <th>Date</th>{showProject && <th>Project</th>}<th>Category</th><th>Vendor / payee</th><th className="num">Amount</th><th>State</th><th>Submitter</th><th>Evidence</th><th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.slice(0, 300).map((e) => (
              <tr key={e.id} style={{ background: e.id === focusId ? '#fffbe6' : undefined }}>
                {selectable && <td><input type="checkbox" aria-label={`Select ${e.id}`} checked={selected.includes(e.id)} onChange={() => toggle(e.id)} /></td>}
                <td className="nowrap">{fmtDate(e.date)}</td>
                {showProject && <td>{state.projects.find((p) => p.id === e.projectId)?.code}</td>}
                <td>{e.category}{e.reversalOf && <div className="small muted">Reversal of {e.reversalOf}</div>}</td>
                <td>{e.vendor || '—'}{e.duplicateOf && <div><Badge tone="amber">Possible duplicate</Badge></div>}{e.override && <div><Badge tone="red">Budget override</Badge></div>}</td>
                <td className="num"><Money value={e.amount} decimals /></td>
                <td><Badge>{e.state}</Badge></td>
                <td className="small"><UserName id={e.submitterId} /></td>
                <td className="small">{e.receipt ? <span title={e.receipt}>📎 Receipt</span> : <span className="muted">—</span>}</td>
                <td><button className="btn sm" onClick={() => setDetail(e.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={(selectable ? 1 : 0) + (showProject ? 5 : 4)}>Total ({expenses.length} rows{expenses.length > 300 ? ', first 300 shown' : ''})</td>
              <td className="num">{formatINR(sum(expenses, (e) => e.amount), { decimals: true })}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {detail && state.expenses.find((x) => x.id === detail) && <ExpenseDetail id={detail} onClose={() => setDetail(null)} onEdit={(e) => { setDetail(null); setEdit(e); }} />}
      {edit && <ExpenseForm expense={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ExpenseDetail({ id, onClose, onEdit }) {
  const { state, user, run, A } = useStore();
  const e = state.expenses.find((x) => x.id === id);
  const p = state.projects.find((x) => x.id === e.projectId);
  const [prompt, setPrompt] = useState(null); // {kind}
  const fin = projectFinancials(state, e.projectId);
  const mine = e.submitterId === user.id;
  const canDecide = can(user, 'expense.approve') && e.state === 'Submitted' && (!mine || state.settings.allowSelfApproval) && (user.role !== 'pm' || p.managerId === user.id);

  const post = (overrideReason) => {
    const r = run(A.postExpense, { id: e.id, overrideReason }, { silent: !overrideReason, success: 'Expense posted to ledger' });
    if (!r.ok && r.error.startsWith('OVERRIDE_REQUIRED')) setPrompt({ kind: 'override', msg: r.error.replace('OVERRIDE_REQUIRED:', '') });
    else if (!r.ok && !overrideReason) run(A.postExpense, { id: e.id }); // re-run to show toast for other errors
    else setPrompt(null);
  };

  return (
    <Modal title={`Expense ${e.id}`} onClose={onClose} wide footer={
      <div className="btn-row">
        {mine && ['Draft', 'Rejected'].includes(e.state) && <button className="btn" onClick={() => onEdit(e)}>Edit</button>}
        {mine && e.state === 'Draft' && <button className="btn primary" onClick={() => run(A.submitExpense, { id: e.id }, { success: 'Submitted for approval' })}>Submit</button>}
        {mine && e.state === 'Submitted' && <button className="btn" onClick={() => run(A.withdrawExpense, { id: e.id }, { success: 'Withdrawn to draft' })}>Withdraw</button>}
        {canDecide && <button className="btn danger" onClick={() => setPrompt({ kind: 'reject' })}>Reject</button>}
        {canDecide && <button className="btn success" onClick={() => run(A.decideExpense, { id: e.id, decision: 'Approved' }, { success: 'Expense approved' })}>Approve</button>}
        {can(user, 'expense.post') && e.state === 'Approved' && <button className="btn primary" onClick={() => post()}>Post to ledger</button>}
        {can(user, 'expense.post') && e.state === 'Posted' && !e.reversalOf && <button className="btn" onClick={() => run(A.markExpensePaid, { id: e.id }, { success: 'Marked paid' })}>Mark paid / reimbursed</button>}
        {can(user, 'expense.reverse') && ['Posted', 'Paid'].includes(e.state) && !e.reversalOf && <button className="btn danger" onClick={() => setPrompt({ kind: 'reverse' })}>Reverse…</button>}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    }>
      <div className="grid g2">
        <dl className="kv">
          <dt>Project</dt><dd><Link to={`/projects/${p.id}`}>{p.code}</Link> — {p.name}</dd>
          <dt>Amount</dt><dd><Money value={e.amount} decimals /> <span className="muted small">(tax {formatINR(e.tax || 0, { decimals: true })})</span></dd>
          <dt>Category</dt><dd>{e.category}</dd>
          <dt>Date</dt><dd>{fmtDate(e.date)}</dd>
          <dt>Vendor / payee</dt><dd>{e.vendor || '—'}</dd>
          <dt>Payment method</dt><dd>{e.paymentMethod}</dd>
          <dt>State</dt><dd><Badge>{e.state}</Badge></dd>
          <dt>Receipt</dt><dd>{e.receipt ? `📎 ${e.receipt}` : <span className="muted">None</span>}</dd>
          <dt>Notes</dt><dd>{e.notes || '—'}</dd>
          {e.reversalOf && <><dt>Reversal of</dt><dd className="mono">{e.reversalOf}</dd></>}
          {e.reversedBy && <><dt>Reversed by</dt><dd className="mono">{e.reversedBy}</dd></>}
          {e.commitmentId && <><dt>From commitment</dt><dd className="mono">{e.commitmentId}</dd></>}
        </dl>
        <div>
          {can(user, 'budget.view') && (
            <div className="alert info">
              <strong>{p.code} budget context</strong><br />
              Approved {formatINR(fin.approved)} · Actual {formatINR(fin.actual)} · Committed {formatINR(fin.committed)} · Available {formatINR(fin.available)}
            </div>
          )}
          {e.duplicateOf && <div className="alert warn">Possible duplicate of <span className="mono">{e.duplicateOf}</span> (same vendor, amount and date). Review before approving.</div>}
          {e.override && <div className="alert danger">Posted with budget override by <UserName id={e.override.by} />: “{e.override.reason}” (available was {formatINR(e.override.availableAtPosting)})</div>}
          <h3>History</h3>
          <ul className="timeline">
            <li><span className="small muted">{fmtDateTime(e.createdAt)}</span><br />Created by <UserName id={e.submitterId} /></li>
            {e.history.map((h, i) => (
              <li key={i}><span className="small muted">{fmtDateTime(h.at)}</span><br /><Badge>{h.state}</Badge> by <UserName id={h.by} />{h.comment && <div className="small">“{h.comment}”</div>}</li>
            ))}
          </ul>
        </div>
      </div>
      {prompt?.kind === 'reject' && <ReasonModal title="Reject expense" label="Comment" tone="danger" confirmLabel="Reject" onClose={() => setPrompt(null)} onConfirm={(c) => { if (run(A.decideExpense, { id: e.id, decision: 'Rejected', comment: c }, { success: 'Expense rejected' }).ok) setPrompt(null); }} />}
      {prompt?.kind === 'reverse' && <ReasonModal title="Reverse posted expense" tone="danger" confirmLabel="Create reversal" onClose={() => setPrompt(null)} onConfirm={(c) => { if (run(A.reverseExpense, { id: e.id, reason: c }, { success: 'Reversal entry created' }).ok) setPrompt(null); }}>
        <div className="alert info">Posted records are never edited or deleted. A linked negative entry of {formatINR(-e.amount, { decimals: true })} will be posted (FR-016).</div>
      </ReasonModal>}
      {prompt?.kind === 'override' && <ReasonModal title="Budget override required" label="Override justification" tone="danger" confirmLabel="Post with override" onClose={() => setPrompt(null)} onConfirm={(c) => post(c)}>
        <div className="alert danger">{prompt.msg}</div>
        <p className="small muted">The project manager and owner will be notified. Consider a funding request instead.</p>
      </ReasonModal>}
    </Modal>
  );
}

export function ExpenseForm({ expense, onClose, defaultProjectId = '' }) {
  const { state, user, run, A } = useStore();
  const projects = visibleProjects(state, user).filter((p) => !['Archived', 'Completed'].includes(p.status));
  const [e, setE] = useState(() => ({ projectId: defaultProjectId || projects[0]?.id || '', category: 'Materials', amount: 0, date: todayISO(), vendor: '', paymentMethod: 'UPI', tax: 0, notes: '', receipt: null, ...expense }));
  const set = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  const dup = e.amount && e.vendor ? findDuplicateExpense(state, { ...e, id: e.id || '__new' }) : null;
  const needsReceipt = e.amount >= state.settings.receiptThreshold;
  const save = (submit) => {
    const r = run(A.saveExpense, { expense: e, submit }, { success: submit ? 'Expense submitted for approval' : 'Draft saved' });
    if (r.ok) onClose();
  };
  return (
    <Modal title={expense?.id ? `Edit expense ${expense.id}` : 'New expense'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn" onClick={() => save(false)}>Save draft</button>
      <button className="btn primary" onClick={() => save(true)}>Submit for approval</button>
    </>}>
      <div className="form-row">
        <Field label="Project *" htmlFor="ex-proj"><select id="ex-proj" value={e.projectId} onChange={set('projectId')}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></Field>
        <Field label="Date *" htmlFor="ex-date"><input id="ex-date" type="date" value={e.date} max={todayISO()} onChange={set('date')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Amount (incl. tax) *" htmlFor="ex-amt" hint="Minimum ₹0.01"><MoneyInput id="ex-amt" value={e.amount} onChange={(v) => setE({ ...e, amount: v })} /></Field>
        <Field label="Tax component" htmlFor="ex-tax"><MoneyInput id="ex-tax" value={e.tax} onChange={(v) => setE({ ...e, tax: v })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Category *" htmlFor="ex-cat"><select id="ex-cat" value={e.category} onChange={set('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Payment method" htmlFor="ex-pm"><select id="ex-pm" value={e.paymentMethod} onChange={set('paymentMethod')}>{PAYMENT_METHODS.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Vendor / payee" htmlFor="ex-v"><input id="ex-v" value={e.vendor} onChange={set('vendor')} /></Field>
      <Field label={`Receipt ${needsReceipt ? '* (required at this amount)' : '(optional)'}`} htmlFor="ex-r" hint={e.receipt ? `Attached: ${e.receipt}` : `Required for ${formatINR(state.settings.receiptThreshold)} and above. Stored in private object storage in production.`}>
        <input id="ex-r" type="file" accept="image/*,.pdf" capture="environment" onChange={(ev) => setE({ ...e, receipt: ev.target.files[0]?.name || null })} />
      </Field>
      <Field label="Notes" htmlFor="ex-n"><textarea id="ex-n" value={e.notes} onChange={set('notes')} /></Field>
      {dup && <div className="alert warn">Possible duplicate: {dup.id} on {fmtDate(dup.date)} for the same vendor and amount ({dup.state}).</div>}
    </Modal>
  );
}

function ImportModal({ onClose }) {
  const { state, run, A } = useStore();
  const [rows, setRows] = useState([]);
  const [file, setFile] = useState('');
  const [results, setResults] = useState(null);
  const sample = 'project_code,date,category,amount,vendor,payment_method,notes\nPRJ-101,2026-10-01,Materials,1250.50,Acrylic World,UPI,Boards\nPRJ-102,2026-10-02,Transport,0.75,Toll,Cash (petty),Toll charge';
  const onFile = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    setFile(f.name);
    const parsed = parseCSV(await f.text());
    setRows(parsed.map((r) => ({ projectCode: r.project_code, date: r.date, category: r.category, amount: toPaise(r.amount), vendor: r.vendor, paymentMethod: r.payment_method, notes: r.notes })));
  };
  const doImport = () => {
    const r = run(A.importExpenses, { rows, source: file });
    if (r.ok) setResults(r.results);
  };
  return (
    <Modal title="Import expenses from CSV" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Close</button>{!results && <button className="btn primary" disabled={!rows.length} onClick={doImport}>Import {rows.length} row(s) as drafts</button>}</>}>
      <p className="muted">Rows are imported as <strong>drafts</strong> with a source label, so they go through validation, duplicate review and approval (FR-017).</p>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ maxWidth: 320 }} />
        <button className="btn sm" onClick={() => downloadFile('expense_import_template.csv', sample)}>Download template</button>
      </div>
      {rows.length > 0 && !results && (
        <div className="table-wrap"><table><thead><tr><th>Project</th><th>Date</th><th>Category</th><th className="num">Amount</th><th>Vendor</th></tr></thead>
          <tbody>{rows.slice(0, 50).map((r, i) => <tr key={i}><td>{r.projectCode}</td><td>{r.date}</td><td>{r.category}</td><td className="num">{Number.isNaN(r.amount) ? <Badge tone="red">invalid</Badge> : formatINR(r.amount, { decimals: true })}</td><td>{r.vendor}</td></tr>)}</tbody></table></div>
      )}
      {results && (
        <>
          <div className="alert ok">{results.filter((r) => r.ok).length} imported · {results.filter((r) => !r.ok).length} failed</div>
          {results.filter((r) => !r.ok).map((r) => <div key={r.row} className="alert danger">Row {r.row}: {r.error}</div>)}
        </>
      )}
      <p className="small muted">Known project codes: {state.projects.map((p) => p.code).join(', ')}</p>
    </Modal>
  );
}

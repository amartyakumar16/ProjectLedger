import { useState } from 'react';
import { useStore, useToast } from '../store/Store.jsx';
import { can } from '../lib/permissions.js';
import { Badge, Empty, ReasonModal, Field } from '../components/ui.jsx';
import { formatINR, sum, paiseToRupeeString } from '../lib/money.js';
import { fmtDate, todayISO, toCSV, downloadFile } from '../lib/util.js';
import { payrollCost } from '../lib/finance.js';

/** Payroll cost allocation (FR-023..025). Not statutory payroll processing (out of scope). */
export default function Payroll() {
  const { state, user, run, A } = useStore();
  const toast = useToast();
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [projectId, setProjectId] = useState('');
  const [reverse, setReverse] = useState(null);
  const [st, setSt] = useState('');
  if (!can(user, 'payroll.manage')) return <Empty icon="🔒" title="Restricted to HR and finance" />;
  const periods = [...new Set(state.payrollEntries.map((p) => p.period))].sort().reverse();
  const list = state.payrollEntries.filter((p) => (!period || p.period === period) && (!projectId || p.projectId === projectId) && (!st || p.state === st));
  const generate = () => {
    const r = run(A.generatePayroll, { period });
    if (r.ok) toast(`Generated ${r.created} estimated entr${r.created === 1 ? 'y' : 'ies'}; ${r.skipped} skipped (already exist)`, 'success');
  };

  const exportCSV = () => downloadFile(`payroll_allocation_${period || 'all'}.csv`, toCSV(list, [
    { label: 'Period', value: 'period' }, { label: 'Employee', value: (p) => state.employees.find((e) => e.id === p.employeeId)?.name },
    { label: 'Project', value: (p) => state.projects.find((x) => x.id === p.projectId)?.code }, { label: 'Hours', value: 'hours' },
    { label: 'Gross cost (INR)', value: (p) => paiseToRupeeString(p.grossCost) }, { label: 'Employer on-cost (INR)', value: (p) => paiseToRupeeString(p.employerCost) },
    { label: 'Total (INR)', value: (p) => paiseToRupeeString(payrollCost(p)) }, { label: 'State', value: 'state' }, { label: 'Posted on', value: 'postedOn' }, { label: 'Source key', value: 'sourceKey' },
  ]));
  const byProject = {};
  list.filter((p) => p.state !== 'Estimated').forEach((p) => (byProject[p.projectId] = (byProject[p.projectId] || 0) + payrollCost(p)));
  return (
    <>
      <div className="page-head">
        <div><h1>Payroll cost allocation</h1><p className="muted">Allocates labour cost to projects from approved timesheets. Statutory payroll, payouts and tax filing are out of scope.</p></div>
        <div className="btn-row"><button className="btn" onClick={exportCSV}>Export CSV</button><button className="btn primary" onClick={generate} disabled={!period}>Generate estimates for {period || '…'}</button></div>
      </div>
      <div className="card">
        <div className="filters">
          <Field label="Pay period"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
          <Field label="Known periods"><select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">All</option>{periods.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All</option>{state.projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
          <Field label="State"><select value={st} onChange={(e) => setSt(e.target.value)}><option value="">All</option>{['Estimated', 'Posted', 'Reversed'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <div className="grid g4" style={{ marginBottom: 12 }}>
          <div className="stat"><div className="label">Estimated</div><div className="value">{formatINR(sum(list.filter((p) => p.state === 'Estimated'), payrollCost))}</div></div>
          <div className="stat"><div className="label">Posted (net)</div><div className="value">{formatINR(sum(list.filter((p) => p.state !== 'Estimated'), payrollCost))}</div></div>
          {Object.entries(byProject).slice(0, 2).map(([pid, v]) => <div key={pid} className="stat"><div className="label">{state.projects.find((p) => p.id === pid)?.code}</div><div className="value">{formatINR(v)}</div></div>)}
        </div>
        {!list.length ? <Empty title="No payroll entries for this filter">Approve timesheets, then generate estimates.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th>Employee</th><th>Project</th><th className="num">Hours</th><th className="num">Gross</th><th className="num">On-cost</th><th className="num">Total</th><th>State</th><th>Posted</th><th></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.period}</td>
                    <td>{state.employees.find((e) => e.id === p.employeeId)?.name}{p.reversalOf && <div className="small muted">Reversal of {p.reversalOf}</div>}</td>
                    <td>{state.projects.find((x) => x.id === p.projectId)?.code}</td>
                    <td className="num">{p.hours ?? '—'}</td>
                    <td className="num">{formatINR(p.grossCost)}</td><td className="num">{formatINR(p.employerCost)}</td><td className="num"><strong>{formatINR(payrollCost(p))}</strong></td>
                    <td><Badge>{p.state}</Badge></td>
                    <td className="small">{fmtDate(p.postedOn)}</td>
                    <td className="nowrap">
                      {p.state === 'Estimated' && <button className="btn sm primary" onClick={() => run(A.postPayroll, { id: p.id }, { success: 'Posted to project cost' })}>Post</button>}
                      {p.state === 'Posted' && !p.reversalOf && <button className="btn sm danger" onClick={() => setReverse(p)}>Reverse</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {reverse && <ReasonModal title="Reverse payroll allocation" tone="danger" confirmLabel="Post reversal" onClose={() => setReverse(null)} onConfirm={(r) => run(A.reversePayroll, { id: reverse.id, reason: r }, { success: 'Correction entry posted' }).ok && setReverse(null)} />}
    </>
  );
}

import { useState } from 'react';
import { useStore } from '../../store/Store.jsx';
import { can } from '../../lib/permissions.js';
import { Badge, Modal, Field, Empty } from '../../components/ui.jsx';
import { formatINR, sum } from '../../lib/money.js';
import { fmtDate, todayISO, addDays } from '../../lib/util.js';
import { payrollCost, PAYROLL_ACTUAL_STATES, weekdaysBetween } from '../../lib/finance.js';
import { rateOn } from '../../store/actions.js';

export default function PeopleTab({ p }) {
  const { state, user } = useStore();
  const [assign, setAssign] = useState(null);
  const from = addDays(todayISO(), -14);
  const workdays = weekdaysBetween(from, addDays(todayISO(), -1)).length;
  const assignments = state.assignments.filter((a) => a.projectId === p.id);
  const salaryVisible = can(user, 'salary.view');
  const costVisible = can(user, 'budget.view');
  const rows = assignments.map((a) => {
    const e = state.employees.find((x) => x.id === a.employeeId);
    const active = (!a.endDate || a.endDate >= todayISO()) && a.startDate <= todayISO();
    const planned = active ? Math.round((a.allocationPct / 100) * 8 * workdays) : 0;
    const actual = sum(state.timesheets.filter((t) => t.employeeId === a.employeeId && t.projectId === p.id && t.date >= from), (t) => t.hours);
    const cost = sum(state.payrollEntries.filter((x) => x.employeeId === a.employeeId && x.projectId === p.id && PAYROLL_ACTUAL_STATES.includes(x.state)), payrollCost);
    return { a, e, active, planned, actual, cost };
  });
  const activeCount = rows.filter((r) => r.active).length;
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="label">Active staff</div><div className="value">{activeCount}</div><div className="sub">{rows.length} assignment(s) total</div></div>
        <div className="stat"><div className="label">Planned hours (14d)</div><div className="value">{sum(rows, (r) => r.planned)}</div><div className="sub">From allocation %</div></div>
        <div className="stat"><div className="label">Actual hours (14d)</div><div className="value">{sum(rows, (r) => r.actual)}</div><div className="sub">From timesheets</div></div>
        {costVisible && <div className="stat"><div className="label">Posted labour cost</div><div className="value">{formatINR(sum(rows, (r) => r.cost))}</div><div className="sub">Project total only</div></div>}
      </div>
      <div className="card">
        <div className="card-head"><h2>Staff assignments</h2>{can(user, 'people.assign') && <button className="btn primary" onClick={() => setAssign({ projectId: p.id })}>+ Assign person</button>}</div>
        <p className="small muted">Capacity indicators are planning aids — not a sole measure of individual performance (FR-026). Individual rates are visible only to HR/finance.</p>
        {!rows.length ? <Empty title="No one assigned" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Person</th><th>Role</th><th>Period</th><th className="num">Allocation</th><th className="num">Planned h (14d)</th><th className="num">Actual h (14d)</th>{salaryVisible && <th className="num">Current rate</th>}{costVisible && <th className="num">Posted cost</th>}<th></th></tr></thead>
              <tbody>
                {rows.map(({ a, e, active, planned, actual, cost }) => (
                  <tr key={a.id}>
                    <td><strong>{e?.name}</strong><div className="small muted">{e?.type} · {e?.title}</div></td>
                    <td>{a.role}</td>
                    <td className="small nowrap">{fmtDate(a.startDate)} → {fmtDate(a.endDate)} {!active && <Badge>ended</Badge>}</td>
                    <td className="num">{a.allocationPct}%</td>
                    <td className="num">{planned}</td>
                    <td className="num" style={{ color: planned && actual < planned * 0.7 ? 'var(--amber)' : undefined }}>{actual}</td>
                    {salaryVisible && <td className="num">{formatINR(rateOn(e, todayISO()))}/h</td>}
                    {costVisible && <td className="num">{formatINR(cost)}</td>}
                    <td>{can(user, 'people.assign') && <button className="btn sm" onClick={() => setAssign(a)}>Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {assign && <AssignModal assignment={assign} onClose={() => setAssign(null)} />}
    </>
  );
}

export function AssignModal({ assignment, onClose }) {
  const { state, run, A } = useStore();
  const [a, setA] = useState({ employeeId: '', role: '', allocationPct: 50, startDate: todayISO(), endDate: '', ...assignment });
  const set = (k) => (e) => setA({ ...a, [k]: e.target.value });
  const other = state.assignments.filter((x) => x.employeeId === a.employeeId && x.id !== a.id && (!x.endDate || x.endDate >= todayISO()));
  const total = sum(other, (x) => Number(x.allocationPct)) + Number(a.allocationPct || 0);
  return (
    <Modal title={a.id ? 'Edit assignment' : 'Assign person'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run(A.saveAssignment, { assignment: a }, { success: 'Assignment saved' }).ok && onClose()}>Save</button></>}>
      <div className="form-row">
        <Field label="Person *"><select value={a.employeeId} onChange={set('employeeId')} disabled={!!a.id}><option value="">Select…</option>{state.employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}</select></Field>
        <Field label="Project *"><select value={a.projectId} onChange={set('projectId')} disabled={!!assignment.projectId}>{state.projects.filter((p) => p.status !== 'Archived').map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
      </div>
      <div className="form-row">
        <Field label="Project role"><input value={a.role} onChange={set('role')} /></Field>
        <Field label="Allocation %"><input type="number" min="1" max="100" value={a.allocationPct} onChange={set('allocationPct')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Start"><input type="date" value={a.startDate} onChange={set('startDate')} /></Field>
        <Field label="End"><input type="date" value={a.endDate} onChange={set('endDate')} /></Field>
      </div>
      {a.employeeId && <div className={`alert ${total > 100 ? 'warn' : 'info'}`}>Total active allocation for this person: {total}%{total > 100 ? ' — over-allocated' : ''}</div>}
    </Modal>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects, employeeForUser } from '../lib/permissions.js';
import { Badge, Tabs, Modal, Field, MoneyInput, Empty, UserName } from '../components/ui.jsx';
import { formatINR, sum } from '../lib/money.js';
import { fmtDate, todayISO, addDays } from '../lib/util.js';
import { rateOn } from '../store/actions.js';
import { AssignModal } from './project/PeopleTab.jsx';

export default function People() {
  const { user } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (user.role === 'employee' ? 'time' : 'directory');
  const tabs = [
    user.role !== 'employee' && { id: 'directory', label: 'Directory' },
    user.role !== 'employee' && { id: 'capacity', label: 'Assignments & capacity' },
    { id: 'time', label: 'Attendance & time' },
  ].filter(Boolean);
  return (
    <>
      <div className="page-head"><div><h1>People & time</h1><p className="muted">Employees, contractors, project assignments and timesheets.</p></div></div>
      <Tabs tabs={tabs} active={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'directory' && <Directory />}
      {tab === 'capacity' && <Capacity />}
      {tab === 'time' && <Time />}
    </>
  );
}

function Directory() {
  const { state, user, run, A } = useStore();
  const [add, setAdd] = useState(null);
  const [rate, setRate] = useState(null);
  const [q, setQ] = useState('');
  const salary = can(user, 'salary.view');
  const list = state.employees.filter((e) => !q || [e.name, e.title, e.department].some((x) => x?.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="card">
      <div className="card-head">
        <input style={{ maxWidth: 300 }} placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        {can(user, 'people.assign') && <button className="btn primary" onClick={() => setAdd({})}>+ Add person</button>}
      </div>
      {!salary && <div className="alert info small">Compensation details are restricted to HR and finance roles.</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Title</th><th>Department</th><th>Active projects</th><th className="num">Allocation</th>{salary && <><th className="num">Current rate</th><th>Rate history</th></>}<th></th></tr></thead>
          <tbody>
            {list.map((e) => {
              const asg = state.assignments.filter((a) => a.employeeId === e.id && (!a.endDate || a.endDate >= todayISO()));
              const total = sum(asg, (a) => Number(a.allocationPct));
              return (
                <tr key={e.id}>
                  <td><strong>{e.name}</strong>{e.userId && <div className="small muted">App user</div>}</td>
                  <td><Badge tone={e.type === 'Contractor' ? 'purple' : 'blue'}>{e.type}</Badge></td>
                  <td>{e.title}</td><td>{e.department}</td>
                  <td className="small">{asg.map((a) => state.projects.find((p) => p.id === a.projectId)?.code).join(', ') || '—'}</td>
                  <td className="num" style={{ color: total > 100 ? 'var(--red)' : undefined }}>{total}%</td>
                  {salary && <>
                    <td className="num">{formatINR(rateOn(e, todayISO()))}/h</td>
                    <td className="small">{e.rateHistory.map((r) => `${fmtDate(r.effectiveDate)}: ${formatINR(r.hourlyRate)}`).join(' → ')}</td>
                  </>}
                  <td className="nowrap">
                    {can(user, 'people.assign') && <button className="btn sm" onClick={() => setAdd(e)}>Edit</button>}{' '}
                    {salary && <button className="btn sm" onClick={() => setRate({ employeeId: e.id, hourlyRate: 0, effectiveDate: todayISO() })}>+ Rate</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {add && <EmployeeModal employee={add} onClose={() => setAdd(null)} />}
      {rate && (
        <Modal title="Add rate (effective-dated)" onClose={() => setRate(null)} footer={<><button className="btn" onClick={() => setRate(null)}>Cancel</button><button className="btn primary" onClick={() => run(A.addRate, rate, { success: 'Rate recorded' }).ok && setRate(null)}>Save</button></>}>
          <Field label="Hourly cost rate"><MoneyInput value={rate.hourlyRate} onChange={(v) => setRate({ ...rate, hourlyRate: v })} /></Field>
          <Field label="Effective from"><input type="date" value={rate.effectiveDate} onChange={(e) => setRate({ ...rate, effectiveDate: e.target.value })} /></Field>
          <div className="alert info small">Rate history is kept; earlier periods continue to use the rate that was effective at the time (FR-022).</div>
        </Modal>
      )}
    </div>
  );
}

function EmployeeModal({ employee, onClose }) {
  const { state, user, run, A } = useStore();
  const [e, setE] = useState({ name: '', type: 'Employee', title: '', department: '', userId: '', initialRate: 0, ...employee });
  const set = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  return (
    <Modal title={e.id ? `Edit ${e.name}` : 'Add person'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run(A.saveEmployee, { employee: { ...e, userId: e.userId || null, initialRate: e.initialRate || undefined } }, { success: 'Saved' }).ok && onClose()}>Save</button></>}>
      <div className="form-row">
        <Field label="Full name *"><input value={e.name} onChange={set('name')} /></Field>
        <Field label="Type"><select value={e.type} onChange={set('type')}><option>Employee</option><option>Contractor</option></select></Field>
      </div>
      <div className="form-row">
        <Field label="Title"><input value={e.title} onChange={set('title')} /></Field>
        <Field label="Department"><input value={e.department} onChange={set('department')} /></Field>
        <Field label="Linked app user"><select value={e.userId || ''} onChange={set('userId')}><option value="">None</option>{state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      </div>
      {!e.id && can(user, 'salary.view') && <Field label="Initial hourly cost rate"><MoneyInput value={e.initialRate} onChange={(v) => setE({ ...e, initialRate: v })} /></Field>}
    </Modal>
  );
}

function Capacity() {
  const { state, user } = useStore();
  const [edit, setEdit] = useState(null);
  const ids = new Set(visibleProjects(state, user).map((p) => p.id));
  const rows = state.assignments.filter((a) => ids.has(a.projectId)).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  return (
    <div className="card">
      <div className="card-head"><h2>Assignments</h2>{can(user, 'people.assign') && <button className="btn primary" onClick={() => setEdit({ projectId: [...ids][0] })}>+ Assignment</button>}</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Person</th><th>Project</th><th>Role</th><th>Period</th><th className="num">Allocation</th><th></th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{state.employees.find((e) => e.id === a.employeeId)?.name}</td>
                <td>{state.projects.find((p) => p.id === a.projectId)?.code}</td>
                <td>{a.role}</td>
                <td className="small">{fmtDate(a.startDate)} → {fmtDate(a.endDate)} {a.endDate && a.endDate < todayISO() && <Badge>ended</Badge>}</td>
                <td className="num">{a.allocationPct}%</td>
                <td>{can(user, 'people.assign') && <button className="btn sm" onClick={() => setEdit(a)}>Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <AssignModal assignment={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Time() {
  const { state, user, run, A } = useStore();
  const me = employeeForUser(state, user);
  const projects = visibleProjects(state, user);
  const ids = new Set(projects.map((p) => p.id));
  const employees = user.role === 'employee' ? (me ? [me] : []) : state.employees;
  const [entry, setEntry] = useState({ employeeId: me?.id || employees[0]?.id || '', projectId: projects[0]?.id || '', date: todayISO(), hours: 8, attendance: 'Present' });
  const [from, setFrom] = useState(addDays(todayISO(), -14));
  const [sel, setSel] = useState([]);
  const list = state.timesheets
    .filter((t) => ids.has(t.projectId) && t.date >= from && (user.role !== 'employee' || t.employeeId === me?.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const canApprove = can(user, 'time.approve');
  return (
    <div className="grid g2" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)' }}>
      <div className="card">
        <h2>Log attendance & hours</h2>
        {!employees.length ? <Empty title="No employee profile linked to your user" /> : <>
          <Field label="Person"><select value={entry.employeeId} onChange={(e) => setEntry({ ...entry, employeeId: e.target.value })} disabled={user.role === 'employee'}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Project"><select value={entry.projectId} onChange={(e) => setEntry({ ...entry, projectId: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
          <div className="form-row">
            <Field label="Date"><input type="date" max={todayISO()} value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></Field>
            <Field label="Attendance"><select value={entry.attendance} onChange={(e) => setEntry({ ...entry, attendance: e.target.value, hours: e.target.value === 'Leave' ? 0 : e.target.value === 'Half day' ? 4 : 8 })}><option>Present</option><option>Half day</option><option>Leave</option></select></Field>
            <Field label="Hours" hint=">8 counts as overtime"><input type="number" min="0" max="24" step="0.5" value={entry.hours} onChange={(e) => setEntry({ ...entry, hours: e.target.value })} /></Field>
          </div>
          <button className="btn primary" onClick={() => run(A.logTime, { entry }, { success: 'Time logged' })}>Save time</button>
        </>}
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Timesheets</h2>
          <div className="btn-row">
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            {canApprove && <button className="btn success" disabled={!sel.length} onClick={() => { run(A.approveTime, { ids: sel }, { success: `${sel.length} approved` }); setSel([]); }}>Approve selected ({sel.length})</button>}
          </div>
        </div>
        {!list.length ? <Empty title="No time entries" /> : (
          <div className="table-wrap" style={{ maxHeight: 520 }}>
            <table>
              <thead><tr>{canApprove && <th><input type="checkbox" aria-label="Select all submitted" onChange={(e) => setSel(e.target.checked ? list.filter((t) => t.status === 'Submitted').map((t) => t.id) : [])} /></th>}<th>Date</th><th>Person</th><th>Project</th><th>Attendance</th><th className="num">Hours</th><th className="num">OT</th><th>Status</th><th>Reviewer</th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    {canApprove && <td>{t.status === 'Submitted' && <input type="checkbox" aria-label="Select" checked={sel.includes(t.id)} onChange={() => setSel(sel.includes(t.id) ? sel.filter((x) => x !== t.id) : [...sel, t.id])} />}</td>}
                    <td className="nowrap">{fmtDate(t.date)}</td>
                    <td>{state.employees.find((e) => e.id === t.employeeId)?.name}</td>
                    <td>{state.projects.find((p) => p.id === t.projectId)?.code}</td>
                    <td><Badge>{t.attendance}</Badge></td>
                    <td className="num">{t.hours}</td>
                    <td className="num">{t.hours > 8 ? t.hours - 8 : ''}</td>
                    <td><Badge>{t.status}</Badge></td>
                    <td className="small">{t.reviewerId ? <UserName id={t.reviewerId} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={canApprove ? 5 : 4}>Total</td><td className="num">{sum(list, (t) => t.hours)}</td><td colSpan={3}></td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

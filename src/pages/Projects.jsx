import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { projectFinancials, healthOf } from '../lib/finance.js';
import { Badge, Modal, Field, ProgressBar, Empty, BudgetBar } from '../components/ui.jsx';
import { formatINRCompact } from '../lib/money.js';
import { fmtDate, todayISO, addDays } from '../lib/util.js';

export default function Projects() {
  const { state, user } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Open');
  const [dept, setDept] = useState('');
  const [editing, setEditing] = useState(null);
  const showMoney = can(user, 'budget.view');

  const all = visibleProjects(state, user);
  const depts = [...new Set(all.map((p) => p.department).filter(Boolean))];
  const list = all.filter((p) => {
    if (status === 'Open' && ['Archived', 'Completed'].includes(p.status)) return false;
    if (status !== 'Open' && status !== 'All' && p.status !== status) return false;
    if (dept && p.department !== dept) return false;
    const s = q.toLowerCase();
    return !s || [p.code, p.name, p.sponsor, p.department, p.portfolio].some((x) => x?.toLowerCase().includes(s));
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">{all.length} projects you can access</p>
        </div>
        {can(user, 'project.create') && <button className="btn primary" onClick={() => setEditing({})}>+ New project</button>}
      </div>
      <div className="card">
        <div className="filters">
          <Field label="Search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name, sponsor…" /></Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {['Open', 'All', 'Active', 'On hold', 'Completed', 'Archived'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">All</option>
              {depts.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
        </div>
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Project</th><th>Manager</th><th>Dates</th><th>Status</th><th>Progress</th>
                  {showMoney && <><th style={{ minWidth: 140 }}>Budget</th><th className="num">Available</th></>}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const f = projectFinancials(state, p.id);
                  const h = healthOf(state, p);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                      <td><Link to={`/projects/${p.id}`}><strong>{p.code}</strong></Link></td>
                      <td>{p.name}<div className="small muted">{p.department} · {p.portfolio}</div></td>
                      <td>{state.users.find((u) => u.id === p.managerId)?.name}</td>
                      <td className="nowrap small">{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</td>
                      <td><Badge>{p.status}</Badge> {p.status === 'Active' && <Badge tone={h.tone}>{h.label}</Badge>}</td>
                      <td style={{ minWidth: 100 }}><ProgressBar value={f.progress} /><span className="small muted">{f.progress}%</span></td>
                      {showMoney && <>
                        <td><BudgetBar approved={f.approved} actual={f.actual} committed={f.committed} /><span className="small muted">{formatINRCompact(f.actual)} / {formatINRCompact(f.approved)}</span></td>
                        <td className="num" style={{ color: f.available < 0 ? 'var(--red)' : undefined }}>{formatINRCompact(f.available)}</td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No projects match your filters" />}
      </div>
      {editing && <ProjectForm project={editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </>
  );
}

export function ProjectForm({ project, onClose, onSaved }) {
  const { state, user, run, A } = useStore();
  const isNew = !project.id;
  const [p, setP] = useState(() => ({
    code: `PRJ-${state.counters.project + 1}`, name: '', managerId: user.role === 'pm' ? user.id : '', sponsor: '', department: '', portfolio: '',
    startDate: todayISO(), endDate: addDays(todayISO(), 90), status: 'Active', priority: 'Medium', description: '', deliverables: '', ...project,
  }));
  const [reason, setReason] = useState('');
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const managers = state.users.filter((u) => ['pm', 'owner'].includes(u.role));
  const baselineChanged = !isNew && (project.startDate !== p.startDate || project.endDate !== p.endDate || project.deliverables !== p.deliverables);
  const save = () => {
    const r = run(A.saveProject, { project: p, reason }, { success: isNew ? 'Project created' : 'Project updated' });
    if (r.ok) onSaved();
  };
  return (
    <Modal title={isNew ? 'New project' : `Edit ${project.code}`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="form-row">
        <Field label="Project code *"><input value={p.code} onChange={set('code')} /></Field>
        <Field label="Name *"><input value={p.name} onChange={set('name')} /></Field>
        <Field label="Project manager">
          <select value={p.managerId} onChange={set('managerId')}>
            <option value="">Select…</option>
            {managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Sponsor"><input value={p.sponsor} onChange={set('sponsor')} /></Field>
        <Field label="Department"><input value={p.department} onChange={set('department')} /></Field>
        <Field label="Portfolio"><input value={p.portfolio} onChange={set('portfolio')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Start date"><input type="date" value={p.startDate} onChange={set('startDate')} /></Field>
        <Field label="End date"><input type="date" value={p.endDate} onChange={set('endDate')} /></Field>
        <Field label="Priority"><select value={p.priority} onChange={set('priority')}>{['Low', 'Medium', 'High', 'Critical'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Status"><select value={p.status} onChange={set('status')}>{['Active', 'On hold', 'Completed'].map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <Field label="Description / baseline scope"><textarea value={p.description} onChange={set('description')} /></Field>
      <Field label="Planned deliverables" hint="Separate with semicolons"><textarea value={p.deliverables} onChange={set('deliverables')} /></Field>
      {baselineChanged && (
        <Field label="Reason for baseline revision *" hint="Schedule/scope revisions are retained with reasons (FR-004)"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      )}
      {isNew && <div className="alert info">After creating the project, finance records the original budget allocation from the project's Budget tab.</div>}
    </Modal>
  );
}

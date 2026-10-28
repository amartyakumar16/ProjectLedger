import { useState } from 'react';
import { useStore } from '../../store/Store.jsx';
import { can } from '../../lib/permissions.js';
import { Badge, Modal, Field, Empty, ReasonModal } from '../../components/ui.jsx';
import { fmtDate, todayISO, addDays } from '../../lib/util.js';
import { projectProgress } from '../../lib/finance.js';

const STATUSES = ['To do', 'In progress', 'Blocked', 'Done'];

export default function TasksTab({ p }) {
  const { state, user, run, A } = useStore();
  const [edit, setEdit] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [filter, setFilter] = useState('');
  const tasks = state.tasks.filter((t) => t.projectId === p.id && (!filter || t.status === filter)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const emp = (id) => state.employees.find((e) => e.id === id)?.name || '—';
  const prog = projectProgress(state, p.id);
  const changeStatus = (t, status) => {
    if (status === 'Done' && t.milestone && !t.evidence) setEvidence(t);
    else run(A.setTaskStatus, { id: t.id, status }, { success: `Marked ${status}` });
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Tasks & milestones</h2>
        <div className="btn-row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 150 }}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          {can(user, 'task.manage') && <button className="btn primary" onClick={() => setEdit({ projectId: p.id })}>+ Task</button>}
        </div>
      </div>
      <p className="small muted">Progress method: {prog.method} → {prog.value}%. Milestones carry weights and require completion evidence.</p>
      {!tasks.length ? <Empty title="No tasks" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Task</th><th>Assignee</th><th>Planned</th><th>Due</th><th className="num">Est. h</th><th className="num">Weight</th><th>Depends on</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tasks.map((t) => {
                const overdue = t.status !== 'Done' && t.dueDate < todayISO();
                return (
                  <tr key={t.id}>
                    <td>{t.milestone && <Badge tone="purple">Milestone</Badge>} {t.title}{t.evidence && <div className="small muted">Evidence: {t.evidence}</div>}</td>
                    <td className="small">{emp(t.assigneeId)}</td>
                    <td className="small nowrap">{fmtDate(t.plannedStart)}</td>
                    <td className="small nowrap" style={{ color: overdue ? 'var(--red)' : undefined }}>{fmtDate(t.dueDate)}{overdue && ' ⚠'}{t.actualEnd && <div className="muted">done {fmtDate(t.actualEnd)}</div>}</td>
                    <td className="num">{t.estimateHours}</td>
                    <td className="num">{t.milestone ? t.weight : '—'}</td>
                    <td className="small">{(t.dependsOn || []).map((d) => state.tasks.find((x) => x.id === d)?.title).filter(Boolean).join(', ') || '—'}</td>
                    <td>
                      {can(user, 'task.update') ? (
                        <select value={t.status} onChange={(e) => changeStatus(t, e.target.value)} style={{ width: 120 }} aria-label={`Status of ${t.title}`}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : <Badge>{t.status}</Badge>}
                    </td>
                    <td>{can(user, 'task.manage') && <button className="btn sm" onClick={() => setEdit(t)}>Edit</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <TaskModal task={edit} onClose={() => setEdit(null)} />}
      {evidence && <ReasonModal title={`Complete milestone: ${evidence.title}`} label="Completion evidence (document, sign-off, photo reference)" confirmLabel="Mark done" onClose={() => setEvidence(null)} onConfirm={(ev) => run(A.setTaskStatus, { id: evidence.id, status: 'Done', evidence: ev }, { success: 'Milestone completed' }).ok && setEvidence(null)} />}
    </div>
  );
}

function TaskModal({ task, onClose }) {
  const { state, run, A } = useStore();
  const [t, setT] = useState({ title: '', assigneeId: '', plannedStart: todayISO(), dueDate: addDays(todayISO(), 14), estimateHours: 8, milestone: false, weight: 1, dependsOn: [], ...task });
  const set = (k) => (e) => setT({ ...t, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const assignees = state.employees.filter((e) => state.assignments.some((a) => a.employeeId === e.id && a.projectId === t.projectId));
  const others = state.tasks.filter((x) => x.projectId === t.projectId && x.id !== t.id);
  return (
    <Modal title={t.id ? 'Edit task' : 'New task'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run(A.saveTask, { task: { ...t, estimateHours: Number(t.estimateHours), weight: Number(t.weight) } }, { success: 'Task saved' }).ok && onClose()}>Save</button></>}>
      <Field label="Title *"><input value={t.title} onChange={set('title')} /></Field>
      <div className="form-row">
        <Field label="Assignee"><select value={t.assigneeId} onChange={set('assigneeId')}><option value="">Unassigned</option>{assignees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="Planned start"><input type="date" value={t.plannedStart} onChange={set('plannedStart')} /></Field>
        <Field label="Due date"><input type="date" value={t.dueDate} onChange={set('dueDate')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Estimate (hours)"><input type="number" min="0" value={t.estimateHours} onChange={set('estimateHours')} /></Field>
        <Field label="Milestone weight"><input type="number" min="1" value={t.weight} onChange={set('weight')} disabled={!t.milestone} /></Field>
        <Field label=" "><label className="check"><input type="checkbox" checked={t.milestone} onChange={set('milestone')} /> This is a milestone</label></Field>
      </div>
      <Field label="Depends on" hint="Ctrl/Cmd-click to select multiple">
        <select multiple value={t.dependsOn} onChange={(e) => setT({ ...t, dependsOn: [...e.target.selectedOptions].map((o) => o.value) })} style={{ minHeight: 90 }}>
          {others.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
      </Field>
      <Field label="Acceptance criteria / notes"><textarea value={t.acceptance || ''} onChange={set('acceptance')} /></Field>
    </Modal>
  );
}

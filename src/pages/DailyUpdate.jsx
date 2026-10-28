import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { can, visibleProjects } from '../lib/permissions.js';
import { Field, Badge, Modal, UserName, Empty } from '../components/ui.jsx';
import { todayISO, fmtDate, fmtDateTime, addDays } from '../lib/util.js';
import { formatINR, sum } from '../lib/money.js';
import { EXPENSE_ACTUAL_STATES } from '../lib/finance.js';

/** Daily update wizard (PRD §12): reuse previous-day tasks, work summary, headcount and next steps. */
export default function DailyUpdate() {
  const { state, user } = useStore();
  const navigate = useNavigate();
  const projects = visibleProjects(state, user).filter((p) => p.status === 'Active');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  if (!projects.length) return <Empty title="No active projects assigned to you" />;
  return (
    <>
      <div className="page-head">
        <div><h1>Daily update</h1><p className="muted">A two-minute log that builds a reviewable project history.</p></div>
        <button className="btn" onClick={() => navigate('/worker-progress')}>Worker quantity sheet</button>
      </div>
      <div className="card" style={{ maxWidth: 900 }}>
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </Field>
        <DailyLogForm key={projectId} projectId={projectId} onSaved={() => navigate(`/projects/${projectId}?tab=logs`)} />
      </div>
    </>
  );
}

export function DailyLogForm({ projectId, log, onSaved, onCancel }) {
  const { state, run, A } = useStore();
  const prev = state.dailyLogs.filter((l) => l.projectId === projectId).sort((a, b) => b.date.localeCompare(a.date))[0];
  const openTasks = state.tasks.filter((t) => t.projectId === projectId && t.status !== 'Done');
  const [l, setL] = useState(() => log || { projectId, date: todayISO(), location: prev?.location || '', shift: 'Day', summary: '', completed: '', pending: prev?.nextSteps || '', blockers: '', headcount: prev?.headcount || 0, hours: prev?.hours || 0, nextSteps: '' });
  const [reason, setReason] = useState('');
  const set = (k) => (e) => setL({ ...l, [k]: e.target.value });
  const existing = !log && state.dailyLogs.find((x) => x.projectId === projectId && x.date === l.date);
  const dayExpenses = state.expenses.filter((e) => e.projectId === projectId && e.date === l.date && EXPENSE_ACTUAL_STATES.concat(['Submitted', 'Approved']).includes(e.state));
  const dayTime = state.timesheets.filter((t) => t.projectId === projectId && t.date === l.date);
  const save = () => {
    const r = run(A.saveDailyLog, { log: { ...l, headcount: Number(l.headcount), hours: Number(l.hours) }, reason }, { success: log ? 'Log revised (previous version kept in history)' : 'Daily log submitted' });
    if (r.ok) onSaved?.();
  };
  return (
    <div>
      <div className="form-row">
        <Field label="Date *"><input type="date" value={l.date} max={todayISO()} onChange={set('date')} disabled={!!log} /></Field>
        <Field label="Location / site"><input value={l.location} onChange={set('location')} /></Field>
        <Field label="Shift"><select value={l.shift} onChange={set('shift')}>{['Day', 'Night', 'General'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Headcount on site"><input type="number" min="0" value={l.headcount} onChange={set('headcount')} /></Field>
        <Field label="Total person-hours"><input type="number" min="0" value={l.hours} onChange={set('hours')} /></Field>
      </div>
      {existing && <div className="alert info">A log already exists for {fmtDate(l.date)} by <UserName id={existing.authorId} />. You can add another (e.g. for a different shift/location).</div>}
      <Field label="Work summary *"><textarea value={l.summary} onChange={set('summary')} placeholder="What happened today in one or two sentences" /></Field>
      <div className="grid g2">
        <Field label="Work completed"><textarea value={l.completed} onChange={set('completed')} /></Field>
        <Field label="Pending work" hint={prev ? `Pre-filled from previous day's next steps (${fmtDate(prev.date)})` : ''}><textarea value={l.pending} onChange={set('pending')} /></Field>
      </div>
      {openTasks.length > 0 && (
        <div className="field">
          <label>Reuse open tasks</label>
          <div className="chips">
            {openTasks.slice(0, 10).map((t) => (
              <button type="button" key={t.id} className="btn sm" onClick={() => setL({ ...l, completed: (l.completed ? l.completed + '; ' : '') + t.title })}>+ {t.title}</button>
            ))}
          </div>
        </div>
      )}
      <div className="grid g2">
        <Field label="Blockers / risks" hint="Blockers notify the project manager"><textarea value={l.blockers} onChange={set('blockers')} /></Field>
        <Field label="Next steps"><textarea value={l.nextSteps} onChange={set('nextSteps')} /></Field>
      </div>
      <div className="alert info small">
        Linked to this day automatically: {dayTime.length} timesheet entr{dayTime.length === 1 ? 'y' : 'ies'} ({sum(dayTime, (t) => t.hours)} h) · {dayExpenses.length} expense(s) ({formatINR(sum(dayExpenses, (e) => e.amount))})
      </div>
      {log && <Field label="Revision reason *"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      <div className="btn-row">
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" onClick={save}>{log ? 'Save revision' : 'Submit daily log'}</button>
      </div>
    </div>
  );
}

export function DailyLogList({ projectId }) {
  const { state, user, run, A } = useStore();
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(null);
  const logs = state.dailyLogs.filter((l) => l.projectId === projectId && l.date >= from && l.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="card">
      <div className="card-head">
        <h2>Daily logs</h2>
        <div className="filters" style={{ margin: 0 }}>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {can(user, 'log.create') && <button className="btn primary" onClick={() => setAdding(true)}>+ Daily log</button>}
        </div>
      </div>
      {!logs.length ? <Empty title="No logs in this range" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Author</th><th>Summary</th><th>Blockers</th><th className="num">Headcount</th><th></th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{fmtDate(l.date)}<div className="small muted">{l.shift} · {l.location}</div></td>
                  <td className="small"><UserName id={l.authorId} /></td>
                  <td>{l.summary}{l.completed && <div className="small muted">Done: {l.completed}</div>}{l.nextSteps && <div className="small muted">Next: {l.nextSteps}</div>}</td>
                  <td className="small">{l.blockers ? <Badge tone="red">{l.blockers}</Badge> : '—'}</td>
                  <td className="num">{l.headcount}</td>
                  <td className="nowrap">
                    {l.locked ? <Badge tone="purple">🔒 Locked</Badge> : can(user, 'log.create') && <button className="btn sm" onClick={() => setEditing(l)}>Revise</button>}{' '}
                    {can(user, 'log.lock') && <button className="btn sm" onClick={() => run(A.lockDailyLog, { id: l.id, locked: !l.locked }, { success: l.locked ? 'Unlocked' : 'Locked after review' })}>{l.locked ? 'Unlock' : 'Review & lock'}</button>}{' '}
                    {l.revisions?.length > 0 && <button className="btn sm link" onClick={() => setHistory(l)}>{l.revisions.length} revision(s)</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(adding || editing) && (
        <Modal title={editing ? `Revise log ${fmtDate(editing.date)}` : 'New daily log'} wide onClose={() => { setAdding(false); setEditing(null); }}>
          <DailyLogForm projectId={projectId} log={editing} onSaved={() => { setAdding(false); setEditing(null); }} onCancel={() => { setAdding(false); setEditing(null); }} />
        </Modal>
      )}
      {history && (
        <Modal title="Revision history" onClose={() => setHistory(null)}>
          <ul className="timeline">
            {history.revisions.map((r, i) => (
              <li key={i}><span className="small muted">{fmtDateTime(r.at)}</span> — <UserName id={r.by} />: “{r.reason}”<div className="small">Previous summary: {r.before.summary}</div></li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

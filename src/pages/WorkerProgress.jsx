import { useState } from 'react';
import { useStore, useToast } from '../store/Store.jsx';
import { can, visibleProjects, employeeForUser } from '../lib/permissions.js';
import { Field, Empty, Modal, Stat } from '../components/ui.jsx';
import { todayISO, fmtDate, downloadFile } from '../lib/util.js';
import { progressRows, roundQuantity } from '../lib/workerProgress.js';

export default function WorkerProgress() {
  const { state, user, run, A } = useStore();
  const toast = useToast();
  const projects = visibleProjects(state, user);
  const [projectId, setProjectId] = useState(projects.find((p) => p.status === 'Active')?.id || projects[0]?.id || '');
  const [taskId, setTaskId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [exporting, setExporting] = useState(false);
  if (!can(user, 'log.create')) return <Empty title="Worker progress is available to workers and project managers" />;
  if (!projects.length) return <Empty title="No projects assigned to you" />;
  const ownEmployee = employeeForUser(state, user);
  const workers = state.employees.filter((e) => state.assignments.some((a) => a.projectId === projectId && a.employeeId === e.id) && (user.role !== 'employee' || e.id === ownEmployee?.id));
  const tasks = (state.workerTasks || []).filter((t) => t.projectId === projectId && (user.role !== 'employee' || t.employeeId === ownEmployee?.id));
  const task = tasks.find((t) => t.id === taskId) || tasks.at(-1);
  const rows = task ? progressRows(task) : [];
  const completed = rows.at(-1)?.completed || 0;
  const workerName = (id) => state.employees.find((e) => e.id === id)?.name || '';
  const project = projects.find((p) => p.id === projectId);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Daily worker progress');
      sheet.addRow(['Project', project.name]);
      sheet.addRow(['Worker', workerName(task.employeeId)]);
      sheet.addRow(['Task', task.title]);
      sheet.addRow(['Unit', task.unit]);
      sheet.addRow(['Target quantity', task.target]);
      sheet.addRow([]);
      sheet.addRow(['Day', 'Date', 'Daily quantity', 'Total target', 'Completed to date', 'Remaining', 'Notes']);
      rows.forEach((row, i) => {
        const n = i + 8;
        sheet.addRow([row.day, row.date, row.quantity, { formula: '$B$5', result: task.target }, { formula: `SUM(C$8:C${n})`, result: row.completed }, { formula: `D${n}-E${n}`, result: row.remaining }, row.notes]);
      });
      sheet.getRow(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F8A83' } };
      sheet.columns.forEach((col, i) => { col.width = [10, 24, 22, 22, 24, 22, 48][i]; });
      [3, 4, 5, 6].forEach((i) => { sheet.getColumn(i).numFmt = '0.###'; });
      sheet.autoFilter = { from: 'A7', to: `G${Math.max(7, rows.length + 7)}` };
      sheet.views = [{ state: 'frozen', ySplit: 7 }];
      downloadFile(`worker-progress-${task.id}.xlsx`, await book.xlsx.writeBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch { toast('Excel download failed. Please try again.', 'error'); }
    finally { setExporting(false); }
  };

  return <>
    <div className="page-head">
      <div><h1>Worker daily progress</h1><p className="muted">Record daily work quantities and track what is left to finish.</p></div>
      <div className="btn-row">
        <button className="btn" disabled={!task || !rows.length || exporting} onClick={exportExcel}>{exporting ? 'Preparing Excel…' : 'Download Excel (.xlsx)'}</button>
        <button className="btn primary" disabled={!workers.length || project?.status !== 'Active'} onClick={() => setCreating(true)}>+ Work task</button>
      </div>
    </div>
    <div className="card filters">
      <Field label="Project"><select value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(''); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></Field>
      <Field label="Worker / task"><select value={task?.id || ''} onChange={(e) => setTaskId(e.target.value)} disabled={!tasks.length}>{!tasks.length && <option value="">Create your first work task</option>}{tasks.map((t) => <option key={t.id} value={t.id}>{workerName(t.employeeId)} — {t.title}</option>)}</select></Field>
    </div>
    {!task ? <div className="card"><Empty title="Start a worker’s daily work sheet">Create a task, choose its unit (m, m², pieces, etc.) and enter the total target. Then add each day’s completed quantity.</Empty><p className="small muted">Example: 500 m target − 100 m on day 1 − 92 m on day 2 = 308 m remaining.</p></div> : <>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat label="Total target" value={`${task.target} ${task.unit}`} money={false} />
        <Stat label="Completed so far" value={`${completed} ${task.unit}`} money={false} kind="actual" />
        <Stat label="Remaining work" value={`${roundQuantity(task.target - completed)} ${task.unit}`} money={false} kind="available" />
      </div>
      <div className="card">
        <div className="card-head"><div><h2>{task.title}</h2><p className="small muted">{workerName(task.employeeId)} · {Math.round(completed / task.target * 100)}% complete</p></div><button className="btn primary" onClick={() => setEditing({ date: todayISO(), quantity: '', notes: '' })}>+ Daily quantity</button></div>
        <div className="table-wrap"><table className="worker-sheet">
          <thead><tr><th>Day</th><th>Date</th><th className="num">Daily ({task.unit})</th><th className="num">Total target</th><th className="num">Completed to date</th><th className="num">Remaining</th><th>Notes</th><th></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.date}><td>Day {r.day}</td><td className="nowrap">{fmtDate(r.date)}</td><td className="num">{r.quantity}</td><td className="num">{task.target}</td><td className="num calculated">{r.completed}</td><td className="num calculated">{r.remaining}</td><td>{r.notes || '—'}</td><td><button className="btn sm" onClick={() => setEditing(r)}>Correct</button></td></tr>)}</tbody>
        </table></div>
        {!rows.length && <Empty title="No daily quantities yet">Add the first day’s work to start tracking progress.</Empty>}
        <p className="small muted" style={{ marginTop: 12 }}>Quantities use {task.unit}. One entry per date; corrections replace that day’s quantity and recalculate all balances.</p>
      </div>
    </>}
    {creating && <Modal title="Create a worker work task" onClose={() => setCreating(false)}><NewTask workers={workers} projectId={projectId} onSave={(draft) => { const r = run(A.createWorkerTask, draft, { success: 'Work task created' }); if (r.ok) { setTaskId(''); setCreating(false); } }} /></Modal>}
    {editing && task && <Modal title={`Daily quantity — ${task.title}`} onClose={() => setEditing(null)}><DailyEntry key={task.id + editing.date} task={task} entry={editing} onSave={(entry) => { const r = run(A.saveWorkerProgress, { taskId: task.id, ...entry }, { success: 'Daily quantity saved' }); if (r.ok) setEditing(null); }} /></Modal>}
  </>;
}

function NewTask({ workers, projectId, onSave }) {
  const [draft, setDraft] = useState({ projectId, employeeId: workers[0]?.id || '', title: '', unit: 'm', target: '' });
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  return <form onSubmit={(e) => { e.preventDefault(); onSave({ ...draft, target: Number(draft.target) }); }}>
    <Field label="Worker"><select value={draft.employeeId} onChange={set('employeeId')} required>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
    <Field label="Task name"><input required value={draft.title} onChange={set('title')} placeholder="e.g. Install cable along platform" /></Field>
    <div className="form-row"><Field label="Total target"><input type="number" required min="0.001" step="0.001" value={draft.target} onChange={set('target')} placeholder="500" /></Field><Field label="Unit"><input required value={draft.unit} onChange={set('unit')} placeholder="m, m², pieces" maxLength={20} /></Field></div>
    <button className="btn primary" type="submit">Create work sheet</button>
  </form>;
}

function DailyEntry({ task, entry, onSave }) {
  const [draft, setDraft] = useState({ ...entry, reason: '' });
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const existing = task.entries.find((e) => e.date === draft.date);
  const previous = task.entries.filter((e) => e.date !== draft.date).reduce((sum, e) => sum + e.quantity, 0);
  const remaining = roundQuantity(task.target - previous - Number(draft.quantity));
  return <form onSubmit={(e) => { e.preventDefault(); onSave({ ...draft, quantity: Number(draft.quantity) }); }}>
    <div className="form-row"><Field label="Date"><input required type="date" max={todayISO()} value={draft.date} onChange={set('date')} /></Field><Field label={`Completed this day (${task.unit})`}><input autoFocus required type="number" min="0" step="0.001" value={draft.quantity} onChange={set('quantity')} /></Field></div>
    <Field label="Notes"><textarea value={draft.notes} onChange={set('notes')} placeholder="Work location, details or blockers" /></Field>
    {existing && <><div className="alert info">An entry exists for this date ({existing.quantity} {task.unit}). Saving replaces that day’s quantity.</div><Field label="Correction reason"><input required value={draft.reason} onChange={set('reason')} /></Field></>}
    <p className="muted">Remaining after saving: <strong>{Number.isFinite(remaining) ? remaining : '—'} {task.unit}</strong></p>
    <button type="submit" className="btn primary">Save daily quantity</button>
  </form>;
}

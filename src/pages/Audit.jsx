import { useState } from 'react';
import { useStore } from '../store/Store.jsx';
import { can } from '../lib/permissions.js';
import { Field, Empty, UserName, Modal } from '../components/ui.jsx';
import { fmtDateTime, toCSV, downloadFile, todayISO, addDays } from '../lib/util.js';

/** Append-only audit trail explorer (PRD §14 Audit). */
export default function Audit() {
  const { state, user } = useStore();
  const [f, setF] = useState({ q: '', actor: '', projectId: '', entity: '', from: addDays(todayISO(), -365), to: todayISO() });
  const [detail, setDetail] = useState(null);
  if (!can(user, 'audit.view')) return <Empty icon="🔒" title="Restricted" />;
  const entities = [...new Set(state.audit.map((a) => a.entity))].sort();
  const list = state.audit
    .filter((a) => (!f.actor || a.actorId === f.actor) && (!f.projectId || a.projectId === f.projectId) && (!f.entity || a.entity === f.entity))
    .filter((a) => a.at.slice(0, 10) >= f.from && a.at.slice(0, 10) <= f.to)
    .filter((a) => !f.q || JSON.stringify(a).toLowerCase().includes(f.q.toLowerCase()))
    .slice()
    .reverse();
  const exportCSV = () => downloadFile(`audit_${todayISO()}.csv`, toCSV(list, [
    { label: 'Timestamp', value: 'at' }, { label: 'Actor', value: (a) => state.users.find((u) => u.id === a.actorId)?.name || a.actorId },
    { label: 'Action', value: 'action' }, { label: 'Entity', value: 'entity' }, { label: 'Entity ID', value: 'entityId' },
    { label: 'Project', value: (a) => state.projects.find((p) => p.id === a.projectId)?.code || '' }, { label: 'Reason', value: 'reason' },
    { label: 'Before', value: (a) => JSON.stringify(a.before) }, { label: 'After', value: (a) => JSON.stringify(a.after) }, { label: 'Correlation ID', value: 'correlationId' },
  ]));
  return (
    <>
      <div className="page-head">
        <div><h1>Audit explorer</h1><p className="muted">{state.audit.length} immutable events. Every financial mutation and approval is attributable to an actor and timestamp.</p></div>
        <button className="btn" onClick={exportCSV}>Export CSV</button>
      </div>
      <div className="card">
        <div className="filters">
          <Field label="Search"><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Any text, ID…" /></Field>
          <Field label="Actor"><select value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })}><option value="">All</option>{state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Project"><select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">All</option>{state.projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
          <Field label="Entity"><select value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="">All</option>{entities.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="From"><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        </div>
        {!list.length ? <Empty title="No events" /> : (
          <div className="table-wrap" style={{ maxHeight: 640 }}>
            <table>
              <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Project</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                {list.slice(0, 500).map((a) => (
                  <tr key={a.id}>
                    <td className="small nowrap">{fmtDateTime(a.at)}</td>
                    <td className="small"><UserName id={a.actorId} /></td>
                    <td className="mono">{a.action}</td>
                    <td className="small">{a.entity} <span className="mono muted">{a.entityId}</span></td>
                    <td className="small">{state.projects.find((p) => p.id === a.projectId)?.code || '—'}</td>
                    <td className="small">{a.reason || '—'}</td>
                    <td><button className="btn sm" onClick={() => setDetail(a)}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {detail && (
        <Modal title={`Audit event ${detail.id}`} wide onClose={() => setDetail(null)}>
          <div className="grid g2">
            <div><h3>Before</h3><pre className="email-preview mono">{JSON.stringify(detail.before, null, 2)}</pre></div>
            <div><h3>After</h3><pre className="email-preview mono">{JSON.stringify(detail.after, null, 2)}</pre></div>
          </div>
          <p className="small muted">Correlation ID: {detail.correlationId || '—'}</p>
        </Modal>
      )}
    </>
  );
}

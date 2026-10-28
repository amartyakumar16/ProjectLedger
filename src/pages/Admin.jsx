import { useState } from 'react';
import { useStore } from '../store/Store.jsx';
import { can, ROLES } from '../lib/permissions.js';
import { Field, MoneyInput, Empty, Badge, Modal, Tabs } from '../components/ui.jsx';

const MATRIX = [
  ['View all projects', ['owner', 'finance', 'approver', 'hr', 'auditor']],
  ['Create / edit projects', ['owner', 'pm']],
  ['Record budget allocations', ['owner', 'finance']],
  ['Submit expenses', ['owner', 'finance', 'pm', 'employee']],
  ['Approve expenses', ['owner', 'finance', 'pm*']],
  ['Post / reverse to ledger', ['owner', 'finance']],
  ['View salaries & rates', ['owner', 'finance', 'hr']],
  ['Post payroll cost', ['owner', 'finance', 'hr']],
  ['Create funding requests', ['owner', 'pm', 'finance']],
  ['Decide funding requests', ['owner', 'approver', 'finance']],
  ['Audit explorer', ['owner', 'finance', 'auditor']],
  ['Administration', ['owner']],
];

export default function Admin() {
  const { state, user, run, A, clearAllRecords, downloadRecoveryCopy } = useStore();
  const [tab, setTab] = useState('settings');
  const [s, setS] = useState(state.settings);
  const [edit, setEdit] = useState(null);
  if (!can(user, 'admin.manage')) return <Empty icon="🔒" title="Administrators only" />;
  return (
    <>
      <div className="page-head"><div><h1>Administration</h1><p className="muted">Organization settings, users, roles and policy configuration.</p></div></div>
      <Tabs tabs={[{ id: 'settings', label: 'Policies' }, { id: 'users', label: 'Users & roles' }, { id: 'matrix', label: 'Permission matrix' }, { id: 'data', label: 'App data' }]} active={tab} onChange={setTab} />
      {tab === 'settings' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <h2>Financial controls</h2>
          <Field label="Over-budget policy (FR-015)">
            <select value={s.budgetPolicy} onChange={(e) => setS({ ...s, budgetPolicy: e.target.value })}>
              <option value="override">Escalate — allow finance override with mandatory reason</option>
              <option value="hardstop">Hard stop — block posting above available budget</option>
            </select>
          </Field>
          <div className="form-row">
            <Field label="Receipt required at or above"><MoneyInput value={s.receiptThreshold} onChange={(v) => setS({ ...s, receiptThreshold: v })} /></Field>
            <Field label="PM expense approval limit"><MoneyInput value={s.pmApprovalLimit} onChange={(v) => setS({ ...s, pmApprovalLimit: v })} /></Field>
            <Field label="Single-approver funding limit" hint="Above this, owner approval is added sequentially"><MoneyInput value={s.singleApproverLimit} onChange={(v) => setS({ ...s, singleApproverLimit: v })} /></Field>
          </div>
          <Field label="Budget alert thresholds (%)" hint="Comma-separated"><input value={s.budgetAlertThresholds.join(', ')} onChange={(e) => setS({ ...s, budgetAlertThresholds: e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => x > 0) })} /></Field>
          <label className="check"><input type="checkbox" checked={s.allowSelfApproval} onChange={(e) => setS({ ...s, allowSelfApproval: e.target.checked })} /> Allow self-approval (not recommended; breaks segregation of duties)</label>
          <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={s.simulateEmailFailures} onChange={(e) => setS({ ...s, simulateEmailFailures: e.target.checked })} /> Simulate email delivery failures (for testing retries, AC-09)</label>
          <div className="btn-row" style={{ marginTop: 16 }}><button className="btn primary" onClick={() => run(A.updateSettings, { settings: s }, { success: 'Settings saved' })}>Save policies</button></div>
        </div>
      )}
      {tab === 'users' && (
        <div className="card">
          <div className="card-head"><h2>Users</h2><button className="btn primary" onClick={() => setEdit({ role: 'employee' })}>+ Invite user</button></div>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>{state.users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{ROLES[u.role].label}</td><td><Badge tone={u.active ? 'green' : ''}>{u.active ? 'Active' : 'Disabled'}</Badge></td><td><button className="btn sm" onClick={() => setEdit(u)}>Edit</button></td></tr>)}</tbody>
          </table>
        </div>
      )}
      {tab === 'matrix' && (
        <div className="card">
          <h2>Role permission matrix</h2>
          <p className="small muted">Access = role permission + project membership. Project managers, employees see only projects they manage or are assigned to. *PM approval limited to own projects and the PM approval limit.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Capability</th>{Object.values(ROLES).map((r) => <th key={r.short} style={{ textAlign: 'center' }}>{r.short}</th>)}</tr></thead>
              <tbody>{MATRIX.map(([cap, roles]) => <tr key={cap}><td>{cap}</td>{Object.keys(ROLES).map((r) => <td key={r} style={{ textAlign: 'center' }}>{roles.includes(r) ? '✅' : roles.includes(r + '*') ? '✅*' : '—'}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'data' && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2>App data</h2>
          <p>Records are stored in this browser. Clear projects, expenses, workers, daily logs, active and closed requests, notifications and history. Login accounts and organization settings are retained. Sample records are not generated automatically.</p>
          <button className="btn danger" onClick={() => window.confirm('Clear all saved app records? A recovery copy will be saved in this browser. Login accounts and settings will be kept.') && clearAllRecords()}>Clear all records</button>
          <button className="btn" style={{ marginLeft: 8 }} onClick={downloadRecoveryCopy}>Download recovery copy</button>
          <button className="btn" style={{ marginLeft: 8 }} onClick={() => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'projectledger_backup.json';
            a.click();
          }}>Download JSON backup</button>
        </div>
      )}
      {edit && <UserModal u={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function UserModal({ u, onClose }) {
  const { run, A } = useStore();
  const [x, setX] = useState({ name: '', email: '', active: true, ...u });
  return (
    <Modal title={x.id ? 'Edit user' : 'Invite user'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => run(A.saveUser, { user: x }, { success: 'User saved' }).ok && onClose()}>Save</button></>}>
      <Field label="Name *"><input value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} /></Field>
      <Field label="Email *"><input type="email" value={x.email} onChange={(e) => setX({ ...x, email: e.target.value })} /></Field>
      <Field label="Role"><select value={x.role} onChange={(e) => setX({ ...x, role: e.target.value })}>{Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
      <label className="check"><input type="checkbox" checked={x.active} onChange={(e) => setX({ ...x, active: e.target.checked })} /> Active</label>
    </Modal>
  );
}

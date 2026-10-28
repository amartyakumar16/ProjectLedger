import { useEffect, useState } from 'react';
import { formatINR, toPaise, paiseToRupeeString } from '../lib/money.js';
import { useStore } from '../store/Store.jsx';

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const TONES = {
  Draft: '', Submitted: 'blue', Approved: 'teal', Rejected: 'red', Posted: 'green', Paid: 'green', Reversed: 'purple',
  'Under review': 'blue', 'Changes requested': 'amber', Resubmitted: 'blue', Withdrawn: '',
  Active: 'green', 'On hold': 'amber', Completed: 'blue', Archived: '',
  'To do': '', 'In progress': 'blue', Blocked: 'red', Done: 'green',
  Open: 'amber', Closed: 'green', Cancelled: '', Estimated: 'amber',
  Delivered: 'green', Failed: 'red',
  'On track': 'green', 'At risk': 'amber', Critical: 'red', High: 'amber', Medium: 'blue', Low: '',
  Present: 'green', Leave: 'amber', 'Half day': 'blue',
};

export function Badge({ children, tone }) {
  return <span className={`badge ${tone ?? TONES[children] ?? ''}`}>{children}</span>;
}

export function Money({ value, decimals, className = '' }) {
  return <span className={`num ${value < 0 ? 'neg' : ''} ${className}`}>{formatINR(value, { decimals })}</span>;
}

export function Stat({ label, value, sub, kind = '', money = true }) {
  return (
    <div className={`stat ${kind} ${money && value < 0 ? 'negative' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{money ? formatINR(value) : value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Empty({ icon = '📭', title, children }) {
  return (
    <div className="empty">
      <div className="big" aria-hidden>{icon}</div>
      <strong>{title}</strong>
      {children && <div className="small" style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

/** Money input: user types rupees; value/onChange are integer paise. */
export function MoneyInput({ value, onChange, id, allowNegative = false, ...rest }) {
  const [text, setText] = useState(value ? paiseToRupeeString(value) : '');
  useEffect(() => {
    const cur = toPaise(text);
    if (value !== cur && !(Number.isNaN(cur) && !value)) setText(value || value === 0 ? paiseToRupeeString(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: 8, color: '#667085' }}>₹</span>
      <input
        id={id}
        inputMode="decimal"
        style={{ paddingLeft: 24 }}
        value={text}
        placeholder="0.00"
        onChange={(e) => {
          const t = e.target.value;
          if (!/^-?[\d,]*\.?\d{0,2}$/.test(t)) return;
          if (!allowNegative && t.startsWith('-')) return;
          setText(t);
          const p = toPaise(t);
          onChange(Number.isNaN(p) ? 0 : p);
        }}
        {...rest}
      />
    </div>
  );
}

export function BudgetBar({ approved, actual, committed }) {
  const total = Math.max(approved, actual + committed, 1);
  const a = Math.min(actual, approved);
  const over = Math.max(actual - approved, 0);
  return (
    <div>
      <div className="bar" title={`Actual ${formatINR(actual)} · Committed ${formatINR(committed)} · Approved ${formatINR(approved)}`}>
        <span className="actual" style={{ width: `${(a / total) * 100}%` }} />
        <span className="over" style={{ width: `${(over / total) * 100}%` }} />
        <span className="committed" style={{ width: `${(committed / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'prog' }) {
  return (
    <div className="bar" aria-label={`${value}%`}>
      <span className={tone} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

export function HBarChart({ rows, max }) {
  const m = max || Math.max(...rows.map((r) => r.value + (r.value2 || 0)), 1);
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar-row" key={r.label}>
          <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</div>
          <div className="bar" style={{ height: 12 }}>
            <span className="actual" style={{ width: `${(Math.max(r.value, 0) / m) * 100}%` }} />
            {r.value2 ? <span className="committed" style={{ width: `${(r.value2 / m) * 100}%` }} /> : null}
          </div>
          <div className="num small">{formatINR(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

/** Simple SVG line/area chart for cumulative series. series: [{label, color, points:[{x: label, y}]}] */
export function LineChart({ series, height = 200, format = formatINR }) {
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  const maxY = Math.max(...all, 1);
  const n = Math.max(...series.map((s) => s.points.length), 2);
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const x = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const labels = series[0]?.points || [];
  const step = Math.ceil(labels.length / 6);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Chart">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={y(maxY * g)} y2={y(maxY * g)} stroke="#e8ecf2" />
        ))}
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '6 4' : ''} points={s.points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ')} />
          </g>
        ))}
        {labels.map((p, i) => (i % step === 0 || i === labels.length - 1) && (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="#667085" textAnchor="middle">{p.x}</text>
        ))}
        <text x={W - pad.r} y={pad.t + 10} fontSize="10" fill="#667085" textAnchor="end">max {format(maxY)}</text>
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
    </div>
  );
}

export function UserName({ id }) {
  const { state } = useStore();
  if (id === 'system') return <span className="muted">System</span>;
  const u = state.users.find((x) => x.id === id);
  return <span>{u ? u.name : '—'}</span>;
}

export function Avatar({ name }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <span className="avatar" aria-hidden>{initials}</span>;
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count ? <span className="badge" style={{ marginLeft: 6 }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Prompt for a reason/comment then call onConfirm(text). */
export function ReasonModal({ title, label = 'Reason', required = true, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onClose, children }) {
  const [text, setText] = useState('');
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={`btn ${tone}`} disabled={required && !text.trim()} onClick={() => onConfirm(text)}>{confirmLabel}</button>
        </>
      }
    >
      {children}
      <Field label={label + (required ? ' *' : '')}>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </Modal>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { ROLES } from '../lib/permissions.js';
import { Avatar } from '../components/ui.jsx';
import BrandMark from '../components/BrandMark.jsx';
import './Login.css';

export default function Login() {
  const { state, run, A } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [showAccounts, setShowAccounts] = useState(false);
  const users = state.users.filter((u) => u.active);
  const selected = users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
  const signIn = (event) => {
    event.preventDefault();
    if (!selected) { setError('Choose an available demo account below or enter its email address.'); setShowAccounts(true); return; }
    const result = run(A.login, { userId: selected.id });
    if (result.ok) navigate('/'); else setError(result.error);
  };
  return <main className="signin-page">
    <section className="signin-story" aria-label="About ProjectLedger">
      <div className="signin-story-content">
        <a className="signin-brand" href="/login" aria-label="ProjectLedger home"><span className="signin-logo"><BrandMark /></span><h1>ProjectLedger</h1></a>
      </div>
    </section>
    <section className="signin-panel" aria-labelledby="signin-title">
      <div className="signin-panel-top"><span className="signin-demo-badge">● &nbsp; Demo workspace</span></div>
      <div className="signin-form-wrap">
        <h2 id="signin-title">Welcome back.</h2>
        <p className="signin-subtitle">Your next great project starts here.<br />Sign in to your workspace to continue.</p>
        <div className="signin-organization"><span className="signin-org-icon">{state.org.name.slice(0, 1)}</span><div><small>YOUR WORKSPACE</small><strong>{state.org.name}</strong></div><span className="signin-org-status">●</span></div>
        <form onSubmit={signIn}>
          <label htmlFor="signin-email">Work email</label>
          <input id="signin-email" type="email" name="email" autoComplete="username" placeholder="you@company.com" required value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? 'signin-error' : 'signin-email-help'} />
          <p id="signin-email-help" className="signin-field-help">Use a demo account’s email, or choose an account below.</p>
          {error && <p id="signin-error" className="signin-error" role="alert">{error}</p>}
          {selected && <div className="signin-selected"><Avatar name={selected.name} /><span><strong>{selected.name}</strong><small>{ROLES[selected.role].short}</small></span><span className="signin-selected-check">✓</span></div>}
          <button type="submit" className="signin-submit">Sign in to workspace <span aria-hidden="true">→</span></button>
        </form>
        <div className="signin-divider"><span />or explore the application<span /></div>
        <button type="button" className="signin-account-toggle" aria-expanded={showAccounts} aria-controls="signin-accounts" onClick={() => setShowAccounts(!showAccounts)}>Choose a demo account <span aria-hidden="true">{showAccounts ? '−' : '+'}</span></button>
        {showAccounts && <div id="signin-accounts" className="signin-accounts">{users.map((u) => <button type="button" key={u.id} className={`signin-account ${selected?.id === u.id ? 'selected' : ''}`} aria-pressed={selected?.id === u.id} onClick={() => { setEmail(u.email); setError(''); }}><Avatar name={u.name} /><span><strong>{u.name}</strong><small>{ROLES[u.role].short}</small></span><span aria-hidden="true">{selected?.id === u.id ? '✓' : '→'}</span></button>)}</div>}
        <p className="signin-demo-note">ⓘ &nbsp; You’re using the demo. No password is needed.<br />Your workspace data stays in this browser.</p>
      </div>
      <footer className="signin-panel-footer"><span>Projects in motion. Everything in view.</span><span>ProjectLedger v1.0</span></footer>
    </section>
  </main>;
}

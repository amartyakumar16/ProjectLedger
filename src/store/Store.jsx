// @refresh reset
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearSavedRecords, loadSavedState, RECOVERY_KEY, STORAGE_KEY } from './persistence.js';
import { downloadFile } from '../lib/util.js';
import * as A from './actions.js';

// Front-end persistence layer. In production this is replaced by REST API calls to the backend
// (NestJS/Django + PostgreSQL) — every action below maps 1:1 to an API endpoint.
function load() {
  try {
    return { state: loadSavedState(localStorage), error: null };
  } catch (err) {
    return { state: null, error: 'The records could not be cleared and saved safely. Existing records have been kept. Free some browser storage, allow site storage, then reload to try again.' };
  }
}

const StoreCtx = createContext(null);
const ToastCtx = createContext(null);

export function StoreProvider({ children }) {
  const [startup] = useState(load);
  const [state, setState] = useState(startup.state);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state]);

  const toast = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const currentUser = state?.users.find((u) => u.id === state.currentUserId) || null;

  /**
   * Run a domain action. Returns { ok, error, ...extra }. Errors are toasted unless `silent`.
   * Actions may return a plain state or an object { state, ...extra }.
   */
  const run = useCallback(
    (fn, payload = {}, { success, silent } = {}) => {
      const cur = stateRef.current;
      const actor = cur.users.find((u) => u.id === cur.currentUserId) || null;
      try {
        const res = fn(cur, actor, payload);
        const next = res && res.users ? res : res.state;
        const extra = res && res.users ? {} : { ...res, state: undefined };
        stateRef.current = next;
        setState(next);
        if (success) toast(success, 'success');
        return { ok: true, ...extra };
      } catch (err) {
        if (!silent) toast(err.message.replace(/^OVERRIDE_REQUIRED:/, ''), 'error');
        return { ok: false, error: err.message };
      }
    },
    [toast],
  );

  const clearAllRecords = useCallback(() => {
    const cur = stateRef.current;
    if (cur.users.find((u) => u.id === cur.currentUserId)?.role !== 'owner') return toast('Only the owner can clear all records.', 'error');
    try {
      const fresh = clearSavedRecords(localStorage, cur, `${RECOVERY_KEY}.${Date.now()}`);
      stateRef.current = fresh;
      setState(fresh);
      toast('All records have been cleared. Login accounts and settings are retained.', 'success');
    } catch {
      toast('Records were not cleared because the recovery copy or cleared data could not be saved.', 'error');
    }
  }, [toast]);

  const downloadRecoveryCopy = useCallback(() => {
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return toast('No recovery copy is stored in this browser.', 'info');
      downloadFile('projectledger-before-clear-2026-10-27.json', raw, 'application/json');
    } catch { toast('The recovery copy could not be downloaded.', 'error'); }
  }, [toast]);

  const value = useMemo(() => ({ state, user: currentUser, run, A, clearAllRecords, downloadRecoveryCopy }), [state, currentUser, run, clearAllRecords, downloadRecoveryCopy]);

  if (startup.error) return <div className="login-wrap"><div className="login-card"><h1>Records have not been cleared</h1><p role="alert">{startup.error}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button></div></div>;

  return (
    <StoreCtx.Provider value={value}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.tone}`}>
              {t.message}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </StoreCtx.Provider>
  );
}

export const useStore = () => useContext(StoreCtx);
export const useToast = () => useContext(ToastCtx);

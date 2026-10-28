import { buildSeed } from '../data/seed.js';

export const STORAGE_KEY = 'projectledger.v1';
export const DATA_CLEAR_VERSION = 'clear-records-2026-10-27';
export const RECOVERY_KEY = 'projectledger.backup.before-clear-2026-10-27';

// Accounts and organization policies stay available; every record collection is emptied.
export function emptyRecords(state) {
  const empty = structuredClone(state);
  for (const [key, value] of Object.entries(empty)) {
    if (Array.isArray(value) && key !== 'users') empty[key] = [];
  }
  empty.workerTasks = [];
  empty.pdfDataChecks = [];
  empty.counters = Object.fromEntries(Object.keys(empty.counters || {}).map((key) => [key, 0]));
  empty.dataClearVersion = DATA_CLEAR_VERSION;
  return empty;
}

export function buildEmptyState() {
  return emptyRecords(buildSeed());
}

export function clearSavedRecords(storage, state, backupKey = RECOVERY_KEY, originalRaw = null) {
  const next = emptyRecords(state);
  // If the recovery copy or the new state cannot be saved, leave existing records intact.
  if (!storage.getItem(backupKey)) storage.setItem(backupKey, originalRaw ?? JSON.stringify(state));
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadSavedState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return buildEmptyState();
  let parsed;
  try {
    parsed = JSON.parse(raw, (_key, value) => typeof value === 'string'
      ? value.replace(/@silverspace\.example/gi, '@phoenixengineers.example').replace(/silverspace/gi, 'Phoenix Engineers')
      : value);
  } catch {
    return clearSavedRecords(storage, buildEmptyState(), RECOVERY_KEY, raw);
  }
  if (parsed?.schemaVersion !== 1) return clearSavedRecords(storage, buildEmptyState(), RECOVERY_KEY, raw);
  if (parsed.dataClearVersion === DATA_CLEAR_VERSION) return parsed;
  // Apply the requested cleanup once. New records created afterwards survive reloads.
  return clearSavedRecords(storage, parsed, RECOVERY_KEY, raw);
}

import { describe, expect, it } from 'vitest';
import { buildSeed } from '../data/seed.js';
import { saveProject } from './actions.js';
import { buildEmptyState, clearSavedRecords, DATA_CLEAR_VERSION, emptyRecords, loadSavedState, RECOVERY_KEY, STORAGE_KEY } from './persistence.js';

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

function expectEmptyRecords(state) {
  for (const [key, value] of Object.entries(state)) {
    if (Array.isArray(value) && key !== 'users') expect(value, key).toHaveLength(0);
  }
}

describe('Clearing saved app records', () => {
  it('clears every record collection, including requests and worker sheets, while retaining accounts and settings', () => {
    const before = buildSeed();
    before.currentUserId = 'u1';
    before.workerTasks = [{ id: 'work1', entries: [{ quantity: 100 }] }];
    before.pdfDataChecks = [{ id: 'check1', status: 'Checked' }];
    before.futureRecords = [{ id: 'another-record' }];
    const cleared = emptyRecords(before);
    expectEmptyRecords(cleared);
    expect(cleared.users).toEqual(before.users);
    expect(cleared.org).toEqual(before.org);
    expect(cleared.settings).toEqual(before.settings);
    expect(cleared.currentUserId).toBe('u1');
    expect(cleared.counters).toEqual({ funding: 0, project: 0 });
    expect(cleared.dataClearVersion).toBe(DATA_CLEAR_VERSION);
    expect(before.projects.length).toBeGreaterThan(0);
  });

  it('backs up original records before applying the cleanup, without changing unrelated browser storage', () => {
    const raw = JSON.stringify(buildSeed());
    const storage = memoryStorage({ [STORAGE_KEY]: raw, 'other-app': 'keep me' });
    const cleared = loadSavedState(storage);
    expectEmptyRecords(cleared);
    expect(storage.getItem(RECOVERY_KEY)).toBe(raw);
    expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual(cleared);
    expect(storage.getItem('other-app')).toBe('keep me');
  });

  it('runs once and preserves newly created records and the original recovery copy on later reloads', () => {
    const raw = JSON.stringify(buildSeed());
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    const cleared = loadSavedState(storage);
    const withProject = saveProject(cleared, cleared.users[0], { project: { code: 'NEW-1', name: 'New real work', managerId: 'u3' } });
    storage.setItem(STORAGE_KEY, JSON.stringify(withProject));
    const reloaded = loadSavedState(storage);
    expect(reloaded.projects).toHaveLength(1);
    expect(reloaded.projects[0].name).toBe('New real work');
    expect(storage.getItem(RECOVERY_KEY)).toBe(raw);
  });

  it('starts fresh browsers with empty records rather than sample projects', () => {
    const state = loadSavedState(memoryStorage());
    expectEmptyRecords(state);
    expect(state.users.some((u) => u.active && u.role === 'owner')).toBe(true);
    expect(state).toEqual(buildEmptyState());
  });

  it('does not erase existing data when either saving a backup or saving the cleared state fails', () => {
    for (const failingKey of [RECOVERY_KEY, STORAGE_KEY]) {
      const raw = JSON.stringify(buildSeed());
      const storage = memoryStorage({ [STORAGE_KEY]: raw });
      const write = storage.setItem;
      storage.setItem = (key, value) => { if (key === failingKey) throw new Error('Storage full'); write(key, value); };
      expect(() => loadSavedState(storage)).toThrow('Storage full');
      expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    }
  });

  it('supports another explicit clear without overwriting the first recovery copy', () => {
    const storage = memoryStorage({ [RECOVERY_KEY]: 'first backup' });
    const state = buildSeed();
    const cleared = clearSavedRecords(storage, state, `${RECOVERY_KEY}.later`);
    expectEmptyRecords(cleared);
    expect(storage.getItem(RECOVERY_KEY)).toBe('first backup');
    expect(JSON.parse(storage.getItem(`${RECOVERY_KEY}.later`))).toEqual(state);
  });
});

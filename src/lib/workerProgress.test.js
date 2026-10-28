import { describe, expect, it } from 'vitest';
import { buildSeed } from '../data/seed.js';
import { createWorkerTask, saveWorkerProgress } from '../store/actions.js';
import { progressRows } from './workerProgress.js';
import { addDays, todayISO } from './util.js';

function setup(target = 500) {
  const seed = buildSeed();
  const worker = seed.users.find((u) => u.id === 'u5');
  const state = createWorkerTask(seed, worker, { projectId: 'p1', employeeId: 'e3', title: 'Cable installation', unit: 'm', target });
  return { state, worker, taskId: state.workerTasks[0].id };
}

describe('Worker daily quantities', () => {
  it('loads old saved data without a workerTasks collection and calculates 308 m remaining', () => {
    let { state, worker, taskId } = setup();
    state = saveWorkerProgress(state, worker, { taskId, date: todayISO(), quantity: 92 });
    state = saveWorkerProgress(state, worker, { taskId, date: addDays(todayISO(), -1), quantity: 100 });
    expect(progressRows(state.workerTasks[0]).map((r) => [r.day, r.completed, r.remaining])).toEqual([[1, 100, 400], [2, 192, 308]]);
  });

  it('replaces a corrected day, recalculates later days and audits the reason', () => {
    let { state, worker, taskId } = setup();
    state = saveWorkerProgress(state, worker, { taskId, date: addDays(todayISO(), -1), quantity: 100 });
    state = saveWorkerProgress(state, worker, { taskId, date: todayISO(), quantity: 92 });
    expect(() => saveWorkerProgress(state, worker, { taskId, date: addDays(todayISO(), -1), quantity: 110 })).toThrow(/reason/);
    state = saveWorkerProgress(state, worker, { taskId, date: addDays(todayISO(), -1), quantity: 110, reason: 'Measured again' });
    expect(state.workerTasks[0].entries).toHaveLength(2);
    expect(progressRows(state.workerTasks[0])[1].remaining).toBe(298);
    expect(state.audit.at(-1).reason).toBe('Measured again');
    expect(state.audit.at(-1).before.quantity).toBe(100);
  });

  it('handles decimal quantities without floating point balances', () => {
    let { state, worker, taskId } = setup(0.3);
    state = saveWorkerProgress(state, worker, { taskId, date: addDays(todayISO(), -1), quantity: 0.1 });
    state = saveWorkerProgress(state, worker, { taskId, date: todayISO(), quantity: 0.2 });
    expect(progressRows(state.workerTasks[0])[1].remaining).toBe(0);
  });

  it('rejects invalid dates, negative, non-finite and excess quantities', () => {
    const { state, worker, taskId } = setup();
    for (const quantity of [-1, NaN, Infinity, 501, 0.0001]) {
      expect(() => saveWorkerProgress(state, worker, { taskId, date: todayISO(), quantity })).toThrow();
    }
    for (const date of ['2026-02-30', 'bad-date', addDays(todayISO(), 1)]) {
      expect(() => saveWorkerProgress(state, worker, { taskId, date, quantity: 1 })).toThrow(/date/);
    }
  });

  it('restricts worker identity and project access while allowing manager review', () => {
    let { state, worker } = setup();
    expect(() => createWorkerTask(state, worker, { projectId: 'p1', employeeId: 'e5', title: 'Other worker', unit: 'm', target: 500 })).toThrow(/own/);
    expect(() => createWorkerTask(state, worker, { projectId: 'p2', employeeId: 'e3', title: 'Other project', unit: 'm', target: 500 })).toThrow(/member/);
    const manager = state.users.find((u) => u.id === 'u3');
    state = createWorkerTask(state, manager, { projectId: 'p1', employeeId: 'e5', title: 'Other worker', unit: 'm', target: 500 });
    const taskId = state.workerTasks.at(-1).id;
    expect(() => saveWorkerProgress(state, worker, { taskId, date: todayISO(), quantity: 100 })).toThrow(/own/);
    state = saveWorkerProgress(state, manager, { taskId, date: todayISO(), quantity: 100 });
    expect(state.workerTasks.at(-1).entries[0].quantity).toBe(100);
  });
});

// Canonical financial definitions (PRD §7):
//   Approved budget        = original allocation + approved additions +/- approved adjustments
//   Actual cost            = posted project expenses + posted payroll allocations (no double counting)
//   Available uncommitted  = approved budget - actual cost - outstanding commitments
//   Remaining after actuals= approved budget - actual cost
// All values are integer paise.
import { sum, pct } from './money.js';
import { addDays, daysBetween, todayISO } from './util.js';

// Expense states that count toward actual cost. A reversed original keeps counting and is
// offset by its negative reversal entry (ledger-style, never destructive — FR-016).
export const EXPENSE_ACTUAL_STATES = ['Posted', 'Paid', 'Reversed'];
// Approved-but-not-yet-posted expenses are obligations: they reduce available, not actual (AC-02).
export const EXPENSE_COMMITTED_STATES = ['Approved'];
export const PAYROLL_ACTUAL_STATES = ['Posted', 'Reversed'];

export const payrollCost = (e) => e.grossCost + e.employerCost;

export function approvedBudget(state, projectId) {
  return sum(state.allocations.filter((a) => a.projectId === projectId), (a) => a.amount);
}

export function expenseActual(state, projectId) {
  return sum(
    state.expenses.filter((e) => e.projectId === projectId && EXPENSE_ACTUAL_STATES.includes(e.state)),
    (e) => e.amount,
  );
}

export function payrollActual(state, projectId) {
  return sum(
    state.payrollEntries.filter((p) => p.projectId === projectId && PAYROLL_ACTUAL_STATES.includes(p.state)),
    payrollCost,
  );
}

export function actualCost(state, projectId) {
  return expenseActual(state, projectId) + payrollActual(state, projectId);
}

export function outstandingCommitments(state, projectId) {
  const open = sum(
    state.commitments.filter((c) => c.projectId === projectId && c.status === 'Open'),
    (c) => c.amount - c.settled,
  );
  const approvedExp = sum(
    state.expenses.filter((e) => e.projectId === projectId && EXPENSE_COMMITTED_STATES.includes(e.state)),
    (e) => e.amount,
  );
  return open + approvedExp;
}

export function projectFinancials(state, projectId) {
  const approved = approvedBudget(state, projectId);
  const actual = actualCost(state, projectId);
  const committed = outstandingCommitments(state, projectId);
  const payroll = payrollActual(state, projectId);
  const progress = projectProgress(state, projectId);
  const burn = burnRate(state, projectId);
  const remaining = approved - actual;
  const available = approved - actual - committed;
  const runwayDays = burn > 0 ? Math.floor(Math.max(available, 0) / burn) : null;
  // Forecast at completion (earned-value style): EAC = actual + (budget − earned value),
  // where earned value = progress% × approved budget. Never below actual + committed.
  const earnedValue = Math.round((approved * progress.value) / 100);
  const forecast = Math.max(actual + (approved - earnedValue), actual + committed);
  return {
    approved,
    actual,
    committed,
    payroll,
    expenses: actual - payroll,
    remaining,
    available,
    utilization: pct(actual, approved),
    utilizationWithCommitted: pct(actual + committed, approved),
    progress: progress.value,
    progressMethod: progress.method,
    burnPerDay: burn,
    runwayDays,
    forecast,
    forecastVariance: approved - forecast,
  };
}

/** Category-level planned vs actual (FR-014). */
export function categoryBreakdown(state, projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  const planned = project?.categoryPlan || {};
  const map = {};
  const ensure = (c) => (map[c] ??= { category: c, planned: planned[c] || 0, actual: 0, committed: 0 });
  Object.keys(planned).forEach(ensure);
  state.expenses
    .filter((e) => e.projectId === projectId)
    .forEach((e) => {
      if (EXPENSE_ACTUAL_STATES.includes(e.state)) ensure(e.category).actual += e.amount;
      if (EXPENSE_COMMITTED_STATES.includes(e.state)) ensure(e.category).committed += e.amount;
    });
  const pay = payrollActual(state, projectId);
  if (pay || planned['Labour / Payroll']) ensure('Labour / Payroll').actual += pay;
  state.commitments
    .filter((c) => c.projectId === projectId && c.status === 'Open')
    .forEach((c) => (ensure(c.category || 'Other').committed += c.amount - c.settled));
  return Object.values(map).sort((a, b) => b.actual - a.actual);
}

/** Progress (FR-032): manual override with reason, else milestone-weighted, else task-based. */
export function projectProgress(state, projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (project?.progressOverride) return { value: project.progressOverride.value, method: 'Manual override' };
  const tasks = state.tasks.filter((t) => t.projectId === projectId);
  if (!tasks.length) return { value: 0, method: 'No tasks' };
  const milestones = tasks.filter((t) => t.milestone);
  const set = milestones.length ? milestones : tasks;
  const total = sum(set, (t) => t.weight || 1);
  const done = sum(set.filter((t) => t.status === 'Done'), (t) => t.weight || 1);
  return { value: pct(done, total), method: milestones.length ? 'Milestone-weighted' : 'Task-based' };
}

/** Average daily burn over the last 30 days (paise/day). */
export function burnRate(state, projectId, asOf = todayISO(), days = 30) {
  const from = addDays(asOf, -days);
  const exp = sum(
    state.expenses.filter(
      (e) => e.projectId === projectId && EXPENSE_ACTUAL_STATES.includes(e.state) && e.date > from && e.date <= asOf,
    ),
    (e) => e.amount,
  );
  const pay = sum(
    state.payrollEntries.filter(
      (p) => p.projectId === projectId && PAYROLL_ACTUAL_STATES.includes(p.state) && (p.postedOn || '') > from && (p.postedOn || '') <= asOf,
    ),
    payrollCost,
  );
  return Math.round((exp + pay) / days);
}

export function healthOf(state, project) {
  const f = projectFinancials(state, project.id);
  const overdue = overdueTasks(state, project.id).length;
  if (f.approved > 0 && (f.available < 0 || f.utilization >= 100)) return { label: 'Critical', tone: 'red' };
  if (f.utilizationWithCommitted >= 90 || overdue > 2 || f.forecastVariance < 0) return { label: 'At risk', tone: 'amber' };
  return { label: 'On track', tone: 'green' };
}

export function overdueTasks(state, projectId, asOf = todayISO()) {
  return state.tasks.filter((t) => (!projectId || t.projectId === projectId) && t.status !== 'Done' && t.dueDate && t.dueDate < asOf);
}

/** Duplicate detection (FR-013): same project, vendor, amount and date. */
export function findDuplicateExpense(state, exp) {
  return state.expenses.find(
    (e) =>
      e.id !== exp.id &&
      e.projectId === exp.projectId &&
      e.amount === exp.amount &&
      e.date === exp.date &&
      (e.vendor || '').trim().toLowerCase() === (exp.vendor || '').trim().toLowerCase() &&
      !['Rejected', 'Draft'].includes(e.state) &&
      !e.reversalOf,
  );
}

/** Ledger: every financial event for a project in chronological order (transaction ledger report). */
export function projectLedger(state, projectId) {
  const rows = [];
  state.allocations
    .filter((a) => !projectId || a.projectId === projectId)
    .forEach((a) => rows.push({ date: a.effectiveDate, projectId: a.projectId, kind: 'Budget allocation', ref: a.id, description: `${a.type} — ${a.reason}`, budget: a.amount, cost: 0 }));
  state.expenses
    .filter((e) => (!projectId || e.projectId === projectId) && EXPENSE_ACTUAL_STATES.includes(e.state))
    .forEach((e) => rows.push({ date: e.date, projectId: e.projectId, kind: e.reversalOf ? 'Expense reversal' : 'Expense', ref: e.id, description: `${e.category} — ${e.vendor || ''}`, budget: 0, cost: e.amount }));
  state.payrollEntries
    .filter((p) => (!projectId || p.projectId === projectId) && PAYROLL_ACTUAL_STATES.includes(p.state))
    .forEach((p) => {
      const emp = state.employees.find((x) => x.id === p.employeeId);
      rows.push({ date: p.postedOn, projectId: p.projectId, kind: p.reversalOf ? 'Payroll reversal' : 'Payroll cost', ref: p.id, description: `${p.period} — ${emp?.name || ''}`, budget: 0, cost: payrollCost(p) });
    });
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (b.budget - a.budget));
  let budget = 0;
  let cost = 0;
  return rows.map((r) => {
    budget += r.budget;
    cost += r.cost;
    return { ...r, runningBudget: budget, runningCost: cost, runningAvailable: budget - cost };
  });
}

export function portfolioTotals(state, projects) {
  const list = projects.map((p) => projectFinancials(state, p.id));
  return {
    approved: sum(list, (f) => f.approved),
    actual: sum(list, (f) => f.actual),
    committed: sum(list, (f) => f.committed),
    available: sum(list, (f) => f.available),
    forecast: sum(list, (f) => f.forecast),
  };
}

export function weekdaysBetween(fromIso, toIso) {
  const n = daysBetween(fromIso, toIso);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const d = addDays(fromIso, i);
    const wd = new Date(d + 'T00:00:00').getDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

/** Daily update adoption (success metric): % of active-project workdays with a log, last N workdays. */
export function dailyLogAdoption(state, projectId, asOf = todayISO(), days = 30) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return 0;
  const from = project.startDate > addDays(asOf, -days) ? project.startDate : addDays(asOf, -days);
  const workdays = weekdaysBetween(from, asOf);
  if (!workdays.length) return 0;
  const logged = new Set(state.dailyLogs.filter((l) => l.projectId === projectId).map((l) => l.date));
  return pct(workdays.filter((d) => logged.has(d)).length, workdays.length);
}

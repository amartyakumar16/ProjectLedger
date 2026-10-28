// Domain actions. Each action is a pure function: (state, actor, payload) => newState.
// Actions validate business rules and throw Error(message) on violations.
// Every mutation appends an immutable audit event (PRD §14 Audit).
import { clone, uid, nowISO, todayISO } from '../lib/util.js';
import { can, canSeeProject } from '../lib/permissions.js';
import { formatINR } from '../lib/money.js';
import { projectFinancials, findDuplicateExpense, payrollCost, categoryBreakdown } from '../lib/finance.js';
import { roundQuantity } from '../lib/workerProgress.js';

function fail(msg) {
  throw new Error(msg);
}

function need(actor, perm, msg) {
  if (!can(actor, perm)) fail(msg || 'You do not have permission to perform this action.');
}

function requireProject(s, actor, projectId) {
  if (!canSeeProject(s, actor, projectId)) fail('You are not a member of this project.');
}

export function audit(s, actor, action, entity, entityId, projectId, before, after, reason = '') {
  s.audit.push({ id: uid('au'), at: nowISO(), actorId: actor?.id || 'system', action, entity, entityId, projectId: projectId || null, before: before ?? null, after: after ?? null, reason, correlationId: uid('corr') });
}

export function notify(s, userIds, title, body, link) {
  [...new Set(userIds.filter(Boolean))].forEach((userId) =>
    s.notifications.push({ id: uid('n'), userId, title, body, link, read: false, at: nowISO() }),
  );
}

const usersByRole = (s, ...roles) => s.users.filter((u) => u.active && roles.includes(u.role)).map((u) => u.id);
const projectOf = (s, id) => s.projects.find((p) => p.id === id) || fail('Project not found.');

function checkBudgetThresholds(s, projectId, beforeUtil) {
  const f = projectFinancials(s, projectId);
  const p = projectOf(s, projectId);
  const crossed = s.settings.budgetAlertThresholds.filter((t) => beforeUtil < t && f.utilization >= t);
  if (crossed.length) {
    const t = Math.max(...crossed);
    notify(s, [p.managerId, ...usersByRole(s, 'finance')], `Budget threshold crossed: ${p.code} at ${t}%`, `Actual cost ${formatINR(f.actual)} of approved ${formatINR(f.approved)} (${f.utilization}%).`, `/projects/${projectId}`);
  }
}

// ---------------------------------------------------------------- session
export function login(state, _actor, { userId }) {
  const s = clone(state);
  const u = s.users.find((x) => x.id === userId && x.active) || fail('User not found or inactive.');
  s.currentUserId = u.id;
  audit(s, u, 'session.login', 'User', u.id, null, null, null);
  return s;
}

export function logout(state, actor) {
  const s = clone(state);
  audit(s, actor, 'session.logout', 'User', actor?.id, null, null, null);
  s.currentUserId = null;
  return s;
}

// ---------------------------------------------------------------- projects (FR-001..006)
export function saveProject(state, actor, { project, reason }) {
  const s = clone(state);
  if (!project.code?.trim() || !project.name?.trim()) fail('Project code and name are required.');
  if (project.endDate && project.startDate && project.endDate < project.startDate) fail('End date must be after start date.');
  const dupCode = s.projects.find((p) => p.code.toLowerCase() === project.code.trim().toLowerCase() && p.id !== project.id);
  if (dupCode) fail(`Project code ${project.code} already exists.`);
  if (project.id) {
    need(actor, 'project.edit');
    const p = projectOf(s, project.id);
    if (actor.role === 'pm' && p.managerId !== actor.id) fail('Only the project manager can edit this project.');
    const before = clone(p);
    const changedBaseline = before.startDate !== project.startDate || before.endDate !== project.endDate || before.deliverables !== project.deliverables;
    if (changedBaseline && !reason?.trim()) fail('A reason is required when changing dates or deliverables (baseline revision).');
    Object.assign(p, project, { updatedAt: nowISO() });
    if (changedBaseline) p.revisions.push({ at: nowISO(), by: actor.id, reason, before: { startDate: before.startDate, endDate: before.endDate, deliverables: before.deliverables } });
    audit(s, actor, 'project.update', 'Project', p.id, p.id, before, project, reason);
  } else {
    need(actor, 'project.create');
    s.counters.project += 1;
    const p = { categoryPlan: {}, progressOverride: null, revisions: [], status: 'Active', priority: 'Medium', ...project, id: uid('p'), code: project.code.trim(), createdAt: nowISO(), updatedAt: nowISO() };
    s.projects.push(p);
    audit(s, actor, 'project.create', 'Project', p.id, p.id, null, { code: p.code, name: p.name }, '');
  }
  return s;
}

export function setProjectStatus(state, actor, { projectId, status, reason }) {
  const s = clone(state);
  need(actor, status === 'Archived' ? 'project.archive' : 'project.edit');
  const p = projectOf(s, projectId);
  const before = p.status;
  p.status = status;
  p.updatedAt = nowISO();
  audit(s, actor, 'project.status', 'Project', p.id, p.id, { status: before }, { status }, reason);
  return s;
}

export function setProgressOverride(state, actor, { projectId, value, reason }) {
  const s = clone(state);
  need(actor, 'project.edit');
  const p = projectOf(s, projectId);
  if (value === null) {
    audit(s, actor, 'progress.override_cleared', 'Project', p.id, p.id, p.progressOverride, null, reason || '');
    p.progressOverride = null;
  } else {
    if (!(value >= 0 && value <= 100)) fail('Progress must be between 0 and 100.');
    if (!reason?.trim()) fail('A manual progress override requires a reason (FR-032).');
    const before = p.progressOverride;
    p.progressOverride = { value: Number(value), reason, by: actor.id, at: nowISO() };
    audit(s, actor, 'progress.override', 'Project', p.id, p.id, before, p.progressOverride, reason);
  }
  return s;
}

export function setCategoryPlan(state, actor, { projectId, plan }) {
  const s = clone(state);
  need(actor, 'budget.allocate');
  const p = projectOf(s, projectId);
  const before = p.categoryPlan;
  p.categoryPlan = plan;
  audit(s, actor, 'budget.category_plan', 'Project', p.id, p.id, before, plan, 'Category plan updated');
  return s;
}

// ---------------------------------------------------------------- budget (FR-010)
export function addAllocation(state, actor, { projectId, type, amount, reason, approvalRef, effectiveDate }) {
  const s = clone(state);
  need(actor, 'budget.allocate', 'Only finance or the owner can record budget allocations.');
  projectOf(s, projectId);
  if (!Number.isInteger(amount) || amount === 0) fail('Enter a non-zero amount.');
  if (type !== 'adjustment' && amount < 0) fail('Only adjustments may be negative.');
  if (!reason?.trim()) fail('A reason is required for every budget event.');
  if (type === 'original' && s.allocations.some((a) => a.projectId === projectId && a.type === 'original')) fail('This project already has an original allocation. Use an adjustment or a funding request.');
  const a = { id: uid('al'), projectId, type, amount, reason, approvalRef: approvalRef || '', effectiveDate: effectiveDate || todayISO(), createdBy: actor.id, createdAt: nowISO() };
  s.allocations.push(a);
  audit(s, actor, 'budget.allocate', 'Allocation', a.id, projectId, null, { type, amount }, reason);
  return s;
}

// ---------------------------------------------------------------- expenses (FR-011..017)
export function saveExpense(state, actor, { expense, submit = false }) {
  let s = clone(state);
  need(actor, 'expense.create');
  requireProject(s, actor, expense.projectId);
  if (!Number.isInteger(expense.amount) || expense.amount < 1) fail('Amount must be at least ₹0.01.');
  if (!expense.category) fail('Category is required.');
  if (!expense.date) fail('Date is required.');
  const p = projectOf(s, expense.projectId);
  if (['Archived', 'Completed'].includes(p.status)) fail(`Cannot add expenses to a ${p.status.toLowerCase()} project.`);
  let e;
  if (expense.id) {
    e = s.expenses.find((x) => x.id === expense.id) || fail('Expense not found.');
    if (!['Draft', 'Rejected'].includes(e.state)) fail('Only draft or rejected expenses can be edited. Use a reversal for posted records.');
    if (e.submitterId !== actor.id && !can(actor, 'expense.post')) fail('You can only edit your own expenses.');
    const before = clone(e);
    ['projectId', 'category', 'amount', 'date', 'vendor', 'paymentMethod', 'tax', 'notes', 'receipt'].forEach((k) => {
      if (k in expense) e[k] = expense[k];
    });
    e.state = 'Draft';
    audit(s, actor, 'expense.update', 'Expense', e.id, e.projectId, before, expense);
  } else {
    e = { tax: 0, notes: '', receipt: null, paymentMethod: 'UPI', vendor: '', ...expense, id: uid('ex'), submitterId: actor.id, state: 'Draft', reversalOf: null, reversedBy: null, override: null, history: [], createdAt: nowISO() };
    s.expenses.push(e);
    audit(s, actor, 'expense.create', 'Expense', e.id, e.projectId, null, { amount: e.amount, category: e.category });
  }
  if (submit) s = submitExpense(s, actor, { id: e.id });
  return s;
}

export function submitExpense(state, actor, { id }) {
  const s = clone(state);
  const e = s.expenses.find((x) => x.id === id) || fail('Expense not found.');
  if (!['Draft', 'Rejected'].includes(e.state)) fail('Only drafts can be submitted.');
  if (e.amount >= s.settings.receiptThreshold && !e.receipt) fail(`A receipt is required for expenses of ${formatINR(s.settings.receiptThreshold)} or more (FR-013).`);
  const dup = findDuplicateExpense(s, e);
  e.duplicateOf = dup ? dup.id : null;
  e.state = 'Submitted';
  e.history.push({ state: 'Submitted', by: actor.id, at: nowISO(), comment: dup ? `Possible duplicate of ${dup.id}` : '' });
  const p = projectOf(s, e.projectId);
  notify(s, [p.managerId !== actor.id ? p.managerId : null, ...usersByRole(s, 'finance')], `Expense approval pending: ${p.code}`, `${formatINR(e.amount)} ${e.category} — ${e.vendor || 'no vendor'}${dup ? ' (possible duplicate)' : ''}`, `/expenses?focus=${e.id}`);
  audit(s, actor, 'expense.submit', 'Expense', e.id, e.projectId, { state: 'Draft' }, { state: 'Submitted' });
  return s;
}

export function decideExpense(state, actor, { id, decision, comment }) {
  const s = clone(state);
  need(actor, 'expense.approve');
  const e = s.expenses.find((x) => x.id === id) || fail('Expense not found.');
  if (e.state !== 'Submitted') fail('Only submitted expenses can be approved or rejected.');
  if (e.submitterId === actor.id && !s.settings.allowSelfApproval) fail('Segregation of duties: you cannot approve your own expense.');
  const p = projectOf(s, e.projectId);
  if (actor.role === 'pm') {
    if (p.managerId !== actor.id) fail('Project managers can only approve expenses on their own projects.');
    if (decision === 'Approved' && e.amount > s.settings.pmApprovalLimit) fail(`Amount exceeds the project manager approval limit of ${formatINR(s.settings.pmApprovalLimit)}; finance must approve.`);
  }
  if (decision === 'Rejected' && !comment?.trim()) fail('A comment is required when rejecting.');
  e.state = decision;
  e.history.push({ state: decision, by: actor.id, at: nowISO(), comment: comment || '' });
  notify(s, [e.submitterId], `Expense ${decision.toLowerCase()}: ${formatINR(e.amount)}`, `${p.code} — ${e.category}${comment ? `: ${comment}` : ''}`, `/expenses?focus=${e.id}`);
  audit(s, actor, `expense.${decision.toLowerCase()}`, 'Expense', e.id, e.projectId, { state: 'Submitted' }, { state: decision }, comment);
  return s;
}

/** Posting checks the budget (FR-015): hard stop or explicit override with reason. */
export function postExpense(state, actor, { id, overrideReason }) {
  const s = clone(state);
  need(actor, 'expense.post', 'Only finance can post expenses to the ledger.');
  const e = s.expenses.find((x) => x.id === id) || fail('Expense not found.');
  if (e.state !== 'Approved') fail('Only approved expenses can be posted.');
  const f = projectFinancials(s, e.projectId);
  const availableForThis = f.available + e.amount; // this expense is currently counted in committed
  const beforeUtil = f.utilization;
  if (e.amount > availableForThis) {
    if (s.settings.budgetPolicy === 'hardstop') fail(`Budget hard stop: this expense exceeds the available budget of ${formatINR(availableForThis)}. Request additional funding first.`);
    if (!overrideReason?.trim()) fail(`OVERRIDE_REQUIRED:This expense exceeds available budget (${formatINR(availableForThis)}). An override reason is required.`);
    need(actor, 'budget.override');
    e.override = { by: actor.id, at: nowISO(), reason: overrideReason, availableAtPosting: availableForThis };
    const p = projectOf(s, e.projectId);
    notify(s, [p.managerId, ...usersByRole(s, 'owner')], `Budget override on ${p.code}`, `${formatINR(e.amount)} posted above available budget. Reason: ${overrideReason}`, `/projects/${p.id}`);
  }
  e.state = 'Posted';
  e.postedAt = nowISO();
  e.history.push({ state: 'Posted', by: actor.id, at: nowISO(), comment: overrideReason ? `Override: ${overrideReason}` : '' });
  audit(s, actor, 'expense.post', 'Expense', e.id, e.projectId, { state: 'Approved' }, { state: 'Posted', amount: e.amount }, overrideReason || '');
  checkBudgetThresholds(s, e.projectId, beforeUtil);
  return s;
}

export function markExpensePaid(state, actor, { id }) {
  const s = clone(state);
  need(actor, 'expense.post');
  const e = s.expenses.find((x) => x.id === id) || fail('Expense not found.');
  if (e.state !== 'Posted') fail('Only posted expenses can be marked paid/reimbursed.');
  e.state = 'Paid';
  e.history.push({ state: 'Paid', by: actor.id, at: nowISO(), comment: '' });
  audit(s, actor, 'expense.paid', 'Expense', e.id, e.projectId, { state: 'Posted' }, { state: 'Paid' });
  return s;
}

/** Corrections only via linked reversal entries — never destructive edits (FR-016). */
export function reverseExpense(state, actor, { id, reason }) {
  const s = clone(state);
  need(actor, 'expense.reverse');
  const e = s.expenses.find((x) => x.id === id) || fail('Expense not found.');
  if (!['Posted', 'Paid'].includes(e.state)) fail('Only posted or paid expenses can be reversed.');
  if (e.reversalOf) fail('A reversal entry cannot itself be reversed.');
  if (!reason?.trim()) fail('A reason is required for a reversal.');
  const rev = { ...clone(e), id: uid('ex'), amount: -e.amount, tax: -(e.tax || 0), state: 'Posted', reversalOf: e.id, reversedBy: null, receipt: null, date: todayISO(), notes: `Reversal of ${e.id}: ${reason}`, override: null, duplicateOf: null, history: [{ state: 'Posted', by: actor.id, at: nowISO(), comment: reason }], createdAt: nowISO(), submitterId: actor.id };
  s.expenses.push(rev);
  const beforeState = e.state;
  e.state = 'Reversed';
  e.reversedBy = rev.id;
  e.history.push({ state: 'Reversed', by: actor.id, at: nowISO(), comment: reason });
  audit(s, actor, 'expense.reverse', 'Expense', e.id, e.projectId, { state: beforeState }, { state: 'Reversed', reversalId: rev.id, amount: rev.amount }, reason);
  return s;
}

export function withdrawExpense(state, actor, { id }) {
  const s = clone(state);
  const e = s.expenses.find((x) => x.id === id) || fail('Expense not found.');
  if (e.submitterId !== actor.id) fail('Only the submitter can withdraw.');
  if (e.state !== 'Submitted') fail('Only submitted expenses can be withdrawn.');
  e.state = 'Draft';
  e.history.push({ state: 'Withdrawn', by: actor.id, at: nowISO(), comment: '' });
  audit(s, actor, 'expense.withdraw', 'Expense', e.id, e.projectId, { state: 'Submitted' }, { state: 'Draft' });
  return s;
}

/** CSV import as drafts (FR-017). rows: [{project_code, date, category, amount(paise), vendor, payment_method, notes}] */
export function importExpenses(state, actor, { rows, source }) {
  let s = clone(state);
  need(actor, 'expense.import');
  const results = [];
  rows.forEach((r, i) => {
    try {
      const p = s.projects.find((x) => x.code.toLowerCase() === String(r.projectCode).toLowerCase());
      if (!p) throw new Error(`Unknown project code "${r.projectCode}"`);
      s = saveExpense(s, actor, { expense: { projectId: p.id, date: r.date, category: r.category, amount: r.amount, vendor: r.vendor, paymentMethod: r.paymentMethod || 'Bank transfer', notes: `${r.notes || ''} [import: ${source}]`.trim(), receipt: r.receipt || null } });
      results.push({ row: i + 2, ok: true });
    } catch (err) {
      results.push({ row: i + 2, ok: false, error: err.message });
    }
  });
  audit(s, actor, 'expense.import', 'Import', source, null, null, { rows: rows.length, ok: results.filter((r) => r.ok).length }, '');
  return { state: s, results };
}

export function bulkCategorize(state, actor, { ids, category }) {
  const s = clone(state);
  need(actor, 'expense.post');
  ids.forEach((id) => {
    const e = s.expenses.find((x) => x.id === id);
    if (e && ['Draft', 'Submitted'].includes(e.state)) {
      const before = e.category;
      e.category = category;
      audit(s, actor, 'expense.categorize', 'Expense', e.id, e.projectId, { category: before }, { category });
    }
  });
  return s;
}

// ---------------------------------------------------------------- commitments
export function saveCommitment(state, actor, { commitment }) {
  const s = clone(state);
  need(actor, 'commitment.manage');
  requireProject(s, actor, commitment.projectId);
  if (!commitment.description?.trim()) fail('Description is required.');
  if (!Number.isInteger(commitment.amount) || commitment.amount <= 0) fail('Enter a positive amount.');
  const c = { ...commitment, id: uid('c'), settled: 0, status: 'Open', createdBy: actor.id, createdAt: nowISO() };
  s.commitments.push(c);
  audit(s, actor, 'commitment.create', 'Commitment', c.id, c.projectId, null, { amount: c.amount, description: c.description });
  return s;
}

/** Settling converts part of a commitment into a posted actual expense. */
export function settleCommitment(state, actor, { id, amount }) {
  const s = clone(state);
  need(actor, 'expense.post', 'Only finance can settle commitments.');
  const c = s.commitments.find((x) => x.id === id) || fail('Commitment not found.');
  if (c.status !== 'Open') fail('Commitment is not open.');
  const remaining = c.amount - c.settled;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) fail(`Amount must be between ₹0.01 and ${formatINR(remaining)}.`);
  const beforeUtil = projectFinancials(s, c.projectId).utilization;
  c.settled += amount;
  if (c.settled === c.amount) c.status = 'Closed';
  const e = { id: uid('ex'), projectId: c.projectId, category: c.category || 'Other', amount, date: todayISO(), vendor: c.vendor, paymentMethod: 'Bank transfer', tax: 0, notes: `Settlement of commitment: ${c.description}`, receipt: `invoice_${c.id}.pdf`, submitterId: actor.id, state: 'Posted', reversalOf: null, reversedBy: null, override: null, commitmentId: c.id, history: [{ state: 'Posted', by: actor.id, at: nowISO(), comment: 'From commitment' }], createdAt: nowISO() };
  s.expenses.push(e);
  audit(s, actor, 'commitment.settle', 'Commitment', c.id, c.projectId, { settled: c.settled - amount }, { settled: c.settled, expenseId: e.id });
  checkBudgetThresholds(s, c.projectId, beforeUtil);
  return s;
}

export function cancelCommitment(state, actor, { id, reason }) {
  const s = clone(state);
  need(actor, 'commitment.manage');
  const c = s.commitments.find((x) => x.id === id) || fail('Commitment not found.');
  if (!reason?.trim()) fail('Reason required.');
  c.status = 'Cancelled';
  audit(s, actor, 'commitment.cancel', 'Commitment', c.id, c.projectId, { status: 'Open' }, { status: 'Cancelled' }, reason);
  return s;
}

// ---------------------------------------------------------------- tasks (FR-003)
export function saveTask(state, actor, { task }) {
  const s = clone(state);
  need(actor, 'task.manage');
  requireProject(s, actor, task.projectId);
  if (!task.title?.trim()) fail('Task title is required.');
  if (task.id) {
    const t = s.tasks.find((x) => x.id === task.id) || fail('Task not found.');
    const before = clone(t);
    Object.assign(t, task);
    audit(s, actor, 'task.update', 'Task', t.id, t.projectId, before, task);
  } else {
    const t = { status: 'To do', milestone: false, weight: 1, estimateHours: 0, dependsOn: [], evidence: '', actualEnd: null, ...task, id: uid('t'), createdAt: nowISO() };
    s.tasks.push(t);
    audit(s, actor, 'task.create', 'Task', t.id, t.projectId, null, { title: t.title });
  }
  return s;
}

export function setTaskStatus(state, actor, { id, status, evidence }) {
  const s = clone(state);
  need(actor, 'task.update');
  const t = s.tasks.find((x) => x.id === id) || fail('Task not found.');
  requireProject(s, actor, t.projectId);
  if (status === 'Done') {
    const blocking = (t.dependsOn || []).map((d) => s.tasks.find((x) => x.id === d)).filter((d) => d && d.status !== 'Done');
    if (blocking.length) fail(`Cannot complete: depends on "${blocking[0].title}" which is not done.`);
    if (t.milestone && !evidence?.trim() && !t.evidence) fail('Milestones require completion evidence.');
  }
  const before = t.status;
  t.status = status;
  if (evidence) t.evidence = evidence;
  t.actualEnd = status === 'Done' ? todayISO() : null;
  audit(s, actor, 'task.status', 'Task', t.id, t.projectId, { status: before }, { status }, evidence || '');
  return s;
}

// ---------------------------------------------------------------- worker quantity sheets
function requireWorkerTask(state, actor, task) {
  need(actor, 'log.create');
  requireProject(state, actor, task.projectId);
  const employee = state.employees.find((e) => e.id === task.employeeId);
  if (actor.role === 'employee' && employee?.userId !== actor.id) fail('You can only update your own work sheet.');
}

export function createWorkerTask(state, actor, { projectId, employeeId, title, unit, target }) {
  requireWorkerTask(state, actor, { projectId, employeeId });
  if (!state.employees.some((e) => e.id === employeeId) || !state.assignments.some((a) => a.projectId === projectId && a.employeeId === employeeId)) fail('Choose a worker assigned to this project.');
  if (state.projects.find((p) => p.id === projectId)?.status !== 'Active') fail('Choose an active project.');
  if (!title?.trim() || !unit?.trim()) fail('Task name and unit are required.');
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || roundQuantity(target) !== target) fail('Enter a positive target with up to 3 decimal places.');
  const s = clone(state);
  const task = { id: uid('wt'), projectId, employeeId, title: title.trim(), unit: unit.trim(), target, entries: [], createdBy: actor.id, createdAt: nowISO() };
  s.workerTasks = [...(s.workerTasks || []), task];
  audit(s, actor, 'workerTask.create', 'WorkerTask', task.id, projectId, null, task);
  return s;
}

export function saveWorkerProgress(state, actor, { taskId, date, quantity, notes = '', reason = '' }) {
  const original = (state.workerTasks || []).find((t) => t.id === taskId) || fail('Work task not found.');
  requireWorkerTask(state, actor, original);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date || date > todayISO()) fail('Choose a valid date that is not in the future.');
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || roundQuantity(quantity) !== quantity) fail('Enter a non-negative quantity with up to 3 decimal places.');
  const existing = original.entries.find((e) => e.date === date);
  if (existing && !reason.trim()) fail('A reason is required to correct a saved day.');
  const total = roundQuantity(original.entries.filter((e) => e.date !== date).reduce((sum, e) => sum + e.quantity, 0) + quantity);
  if (total > original.target) fail('Completed quantity cannot exceed the task target.');
  const s = clone(state);
  const task = s.workerTasks.find((t) => t.id === taskId);
  const entry = { date, quantity, notes: notes.trim(), updatedBy: actor.id, updatedAt: nowISO() };
  task.entries = [...task.entries.filter((e) => e.date !== date), entry];
  audit(s, actor, existing ? 'workerProgress.correct' : 'workerProgress.create', 'WorkerTask', task.id, task.projectId, existing, entry, reason.trim());
  return s;
}

// ---------------------------------------------------------------- daily logs (FR-030..036)
export function saveDailyLog(state, actor, { log, reason }) {
  const s = clone(state);
  need(actor, 'log.create');
  requireProject(s, actor, log.projectId);
  if (!log.date) fail('Date is required.');
  if (log.date > todayISO()) fail('Daily logs cannot be future-dated.');
  if (!log.summary?.trim()) fail('Work summary is required.');
  if (log.id) {
    const l = s.dailyLogs.find((x) => x.id === log.id) || fail('Log not found.');
    if (l.locked) fail('This log is locked by the manager. Ask them to unlock it.');
    if (!reason?.trim()) fail('Editing a submitted log requires a revision reason.');
    const before = clone(l);
    delete before.revisions;
    l.revisions.push({ at: nowISO(), by: actor.id, reason, before });
    Object.assign(l, log);
    audit(s, actor, 'dailylog.revise', 'DailyLog', l.id, l.projectId, before, log, reason);
  } else {
    const l = { headcount: 0, hours: 0, blockers: '', pending: '', completed: '', nextSteps: '', location: '', shift: 'Day', ...log, id: uid('dl'), authorId: actor.id, locked: false, revisions: [], createdAt: nowISO() };
    s.dailyLogs.push(l);
    if (l.blockers?.trim()) {
      const p = projectOf(s, l.projectId);
      notify(s, [p.managerId !== actor.id ? p.managerId : null], `Blocker reported on ${p.code}`, l.blockers, `/projects/${p.id}?tab=logs`);
    }
    audit(s, actor, 'dailylog.create', 'DailyLog', l.id, l.projectId, null, { date: l.date, summary: l.summary });
  }
  return s;
}

export function lockDailyLog(state, actor, { id, locked }) {
  const s = clone(state);
  need(actor, 'log.lock');
  const l = s.dailyLogs.find((x) => x.id === id) || fail('Log not found.');
  l.locked = locked;
  audit(s, actor, locked ? 'dailylog.lock' : 'dailylog.unlock', 'DailyLog', l.id, l.projectId, { locked: !locked }, { locked });
  return s;
}

// ---------------------------------------------------------------- workforce (FR-020..026)
export function saveEmployee(state, actor, { employee }) {
  const s = clone(state);
  need(actor, 'people.assign');
  if (!employee.name?.trim()) fail('Name is required.');
  if (employee.id) {
    const e = s.employees.find((x) => x.id === employee.id) || fail('Not found');
    const before = { ...e, rateHistory: undefined };
    Object.assign(e, { ...employee, rateHistory: e.rateHistory });
    audit(s, actor, 'employee.update', 'Employee', e.id, null, before, { name: e.name, title: e.title });
  } else {
    const e = { type: 'Employee', title: '', department: '', userId: null, ...employee, id: uid('e'), rateHistory: [] };
    if (employee.initialRate) {
      need(actor, 'salary.view', 'Only HR/finance can record rates.');
      e.rateHistory.push({ effectiveDate: todayISO(), hourlyRate: employee.initialRate });
    }
    delete e.initialRate;
    s.employees.push(e);
    audit(s, actor, 'employee.create', 'Employee', e.id, null, null, { name: e.name });
  }
  return s;
}

export function addRate(state, actor, { employeeId, hourlyRate, effectiveDate }) {
  const s = clone(state);
  need(actor, 'salary.view', 'Only HR or finance can change compensation.');
  const e = s.employees.find((x) => x.id === employeeId) || fail('Employee not found.');
  if (!Number.isInteger(hourlyRate) || hourlyRate <= 0) fail('Enter a valid rate.');
  e.rateHistory.push({ effectiveDate, hourlyRate });
  e.rateHistory.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  audit(s, actor, 'employee.rate', 'Employee', e.id, null, null, { effectiveDate, hourlyRate: '[restricted]' }, 'Rate history entry added');
  return s;
}

export function rateOn(employee, date) {
  const r = [...(employee?.rateHistory || [])].filter((x) => x.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  return r ? r.hourlyRate : 0;
}

export function saveAssignment(state, actor, { assignment }) {
  const s = clone(state);
  need(actor, 'people.assign');
  if (!assignment.employeeId || !assignment.projectId) fail('Employee and project are required.');
  const pctv = Number(assignment.allocationPct);
  if (!(pctv > 0 && pctv <= 100)) fail('Allocation must be between 1 and 100%.');
  const others = s.assignments.filter((a) => a.employeeId === assignment.employeeId && a.id !== assignment.id && (!a.endDate || a.endDate >= todayISO()));
  const total = others.reduce((t, a) => t + Number(a.allocationPct), 0) + pctv;
  const a = { ...assignment, allocationPct: pctv, id: assignment.id || uid('as') };
  if (assignment.id) Object.assign(s.assignments.find((x) => x.id === a.id), a);
  else s.assignments.push(a);
  audit(s, actor, assignment.id ? 'assignment.update' : 'assignment.create', 'Assignment', a.id, a.projectId, null, { employeeId: a.employeeId, allocationPct: pctv }, total > 100 ? `Over-allocated: ${total}%` : '');
  return s;
}

export function logTime(state, actor, { entry }) {
  const s = clone(state);
  need(actor, 'time.log');
  if (!entry.employeeId || !entry.projectId || !entry.date) fail('Employee, project and date are required.');
  const hours = Number(entry.hours);
  if (!(hours >= 0 && hours <= 24)) fail('Hours must be between 0 and 24.');
  if (actor.role === 'employee') {
    const me = s.employees.find((e) => e.userId === actor.id);
    if (!me || me.id !== entry.employeeId) fail('You can only log your own time.');
  }
  const exists = s.timesheets.find((t) => t.employeeId === entry.employeeId && t.projectId === entry.projectId && t.date === entry.date);
  if (exists) {
    if (exists.status === 'Approved') fail('An approved timesheet already exists for this day and project.');
    Object.assign(exists, { hours, attendance: entry.attendance });
    audit(s, actor, 'time.update', 'Timesheet', exists.id, exists.projectId, null, { hours });
  } else {
    const t = { id: uid('ts'), ...entry, hours, status: 'Submitted', reviewerId: null };
    s.timesheets.push(t);
    audit(s, actor, 'time.log', 'Timesheet', t.id, t.projectId, null, { hours, date: t.date });
  }
  return s;
}

export function approveTime(state, actor, { ids }) {
  const s = clone(state);
  need(actor, 'time.approve');
  ids.forEach((id) => {
    const t = s.timesheets.find((x) => x.id === id);
    if (t && t.status === 'Submitted') {
      t.status = 'Approved';
      t.reviewerId = actor.id;
      audit(s, actor, 'time.approve', 'Timesheet', t.id, t.projectId, { status: 'Submitted' }, { status: 'Approved' });
    }
  });
  return s;
}

/** Generate estimated labour cost from approved timesheets for a pay period (FR-023/024). */
export function generatePayroll(state, actor, { period, onCostPct = 12 }) {
  const s = clone(state);
  need(actor, 'payroll.manage');
  const groups = {};
  s.timesheets
    .filter((t) => t.status === 'Approved' && t.date.startsWith(period))
    .forEach((t) => {
      const k = `${t.employeeId}|${t.projectId}|${period}`;
      const emp = s.employees.find((e) => e.id === t.employeeId);
      groups[k] ??= { employeeId: t.employeeId, projectId: t.projectId, hours: 0, gross: 0 };
      groups[k].hours += t.hours;
      groups[k].gross += Math.round(t.hours * rateOn(emp, t.date));
    });
  let created = 0;
  let skipped = 0;
  Object.entries(groups).forEach(([k, g]) => {
    if (s.payrollEntries.some((p) => p.sourceKey === k && p.state !== 'Reversed' && !p.reversalOf)) {
      skipped++;
      return;
    }
    s.payrollEntries.push({ id: uid('pr'), period, employeeId: g.employeeId, projectId: g.projectId, grossCost: g.gross, employerCost: Math.round((g.gross * onCostPct) / 100), hours: g.hours, state: 'Estimated', sourceKey: k, postedOn: null, postedBy: null, reversalOf: null, createdAt: nowISO() });
    created++;
  });
  audit(s, actor, 'payroll.generate', 'PayrollRun', period, null, null, { created, skipped }, '');
  return { state: s, created, skipped };
}

/** Post payroll cost. Posting the same allocation twice is blocked (AC-03 / FR-025). */
export function postPayroll(state, actor, { id }) {
  const s = clone(state);
  need(actor, 'payroll.manage');
  const p = s.payrollEntries.find((x) => x.id === id) || fail('Payroll entry not found.');
  if (p.state === 'Posted') fail('This payroll allocation is already posted (duplicate posting blocked).');
  if (p.state !== 'Estimated') fail('Only estimated entries can be posted.');
  const dup = s.payrollEntries.find((x) => x.id !== p.id && x.sourceKey === p.sourceKey && x.state === 'Posted' && !x.reversalOf);
  if (dup) fail(`Duplicate labour cost: ${p.sourceKey} is already posted as ${dup.id}.`);
  const beforeUtil = projectFinancials(s, p.projectId).utilization;
  p.state = 'Posted';
  p.postedOn = todayISO();
  p.postedBy = actor.id;
  audit(s, actor, 'payroll.post', 'PayrollEntry', p.id, p.projectId, { state: 'Estimated' }, { state: 'Posted' });
  checkBudgetThresholds(s, p.projectId, beforeUtil);
  return s;
}

export function reversePayroll(state, actor, { id, reason }) {
  const s = clone(state);
  need(actor, 'payroll.manage');
  const p = s.payrollEntries.find((x) => x.id === id) || fail('Payroll entry not found.');
  if (p.state !== 'Posted' || p.reversalOf) fail('Only posted entries can be reversed.');
  if (!reason?.trim()) fail('Reason required.');
  const r = { ...clone(p), id: uid('pr'), grossCost: -p.grossCost, employerCost: -p.employerCost, state: 'Posted', reversalOf: p.id, postedOn: todayISO(), postedBy: actor.id, createdAt: nowISO() };
  s.payrollEntries.push(r);
  p.state = 'Reversed';
  audit(s, actor, 'payroll.reverse', 'PayrollEntry', p.id, p.projectId, { state: 'Posted' }, { state: 'Reversed', reversalId: r.id }, reason);
  return s;
}

// ---------------------------------------------------------------- funding (§10, FR-040..046)
function nextFundingNumber(s) {
  s.counters.funding += 1;
  return `FR-${String(s.counters.funding).padStart(4, '0')}`;
}

export function routeApprovers(s, amount, requesterId) {
  const exclude = (ids) => ids.filter((id) => s.settings.allowSelfApproval || id !== requesterId);
  const approvers = exclude(usersByRole(s, 'approver'));
  const owners = exclude(usersByRole(s, 'owner'));
  const finance = exclude(usersByRole(s, 'finance'));
  const route = [approvers[0] || finance[0] || owners[0]];
  if (amount > s.settings.singleApproverLimit) route.push(owners[0] || finance[0]);
  return [...new Set(route.filter(Boolean))];
}

export function buildSnapshot(s, projectId) {
  const f = projectFinancials(s, projectId);
  const tasks = s.tasks.filter((t) => t.projectId === projectId);
  return {
    approved: f.approved, actual: f.actual, committed: f.committed, available: f.available, progress: f.progress,
    burnPerDay: f.burnPerDay, runwayDays: f.runwayDays, forecast: f.forecast,
    categories: categoryBreakdown(s, projectId).map((c) => ({ category: c.category, actual: c.actual, committed: c.committed })),
    completed: tasks.filter((t) => t.status === 'Done').map((t) => t.title),
    outstanding: tasks.filter((t) => t.status !== 'Done').map((t) => `${t.title} (${t.status})`),
    blockers: tasks.filter((t) => t.status === 'Blocked').map((t) => t.title),
    takenAt: nowISO(),
  };
}

export function fundingEmail(s, req, approverId) {
  const p = s.projects.find((x) => x.id === req.projectId);
  const approver = s.users.find((u) => u.id === approverId);
  const requester = s.users.find((u) => u.id === req.requesterId);
  const snap = req.snapshot || buildSnapshot(s, req.projectId);
  const itemized = req.items.map((i) => `${i.category}: ${i.description} (${i.qty} × ${formatINR(i.unitCost)} = ${formatINR(Math.round(i.qty * i.unitCost))})`).join('; ');
  const subject = `Funding Approval Required | ${p.code} | Additional INR ${formatINR(req.amount).replace('₹', '')} | ${req.number}`;
  const body = `Dear ${approver?.name || 'Approver'},

Additional funding of INR ${formatINR(req.amount).replace('₹', '')} is requested for ${p.code} – ${p.name}.

Approved budget: ${formatINR(snap.approved)}
Actual cost: ${formatINR(snap.actual)}
Outstanding commitments: ${formatINR(snap.committed)}
Available uncommitted balance: ${formatINR(snap.available)}

Work completed: ${snap.completed.join(', ') || '—'}
Work remaining: ${snap.outstanding.join(', ') || '—'}
Reason: ${req.reason}
Proposed spending: ${itemized || '—'}
Expected runway: ${req.runwayNote || '—'}
Revised completion: ${req.revisedCompletion || '—'}

Please review the supporting documents and choose Approve, Request Changes or Reject using the secure request link:
${typeof window !== 'undefined' ? window.location.origin : ''}/funding/${req.id}

Note: replying to this email does not approve the request. Only an authenticated decision in ProjectLedger updates the workflow.

Regards,
${requester?.name || ''}`;
  return { subject, body };
}

function queueEmail(s, req, toUserId, kind) {
  const u = s.users.find((x) => x.id === toUserId);
  const { subject, body } = kind === 'approval' ? fundingEmail(s, req, toUserId) : { subject: `Funding ${req.state}: ${req.number}`, body: `Your request ${req.number} is now "${req.state}".` };
  const failed = s.settings.simulateEmailFailures || !u?.email;
  req.emails.push({ id: uid('em'), to: u?.email || '(missing address)', toUserId, subject, body, kind, status: failed ? 'Failed' : 'Delivered', attempts: 1, lastAttemptAt: nowISO(), error: failed ? 'SMTP 451: temporary failure (simulated)' : null });
}

export function saveFundingDraft(state, actor, { request }) {
  const s = clone(state);
  need(actor, 'funding.create');
  requireProject(s, actor, request.projectId);
  if (!Number.isInteger(request.amount) || request.amount <= 0) fail('Requested amount must be positive.');
  let r;
  if (request.id) {
    r = s.fundingRequests.find((x) => x.id === request.id) || fail('Request not found.');
    if (!['Draft', 'Changes requested'].includes(r.state)) fail('Only drafts or requests with changes requested can be edited.');
    if (r.requesterId !== actor.id) fail('Only the requester can edit this request.');
    if (r.state === 'Changes requested' && !r.revising) {
      // AC-06: changing a submitted request creates a new version
      r.versions.push({ version: r.version, amount: r.amount, reason: r.reason, items: r.items, snapshot: r.snapshot, decisions: r.decisions, savedAt: nowISO() });
      r.version += 1;
      r.decisions = [];
      r.revising = true;
    }
    const EDITABLE = ['amount', 'urgency', 'reason', 'effectiveDate', 'items', 'revisedCompletion', 'runwayNote', 'consequences', 'attachments'];
    EDITABLE.forEach((k) => {
      if (k in request) r[k] = request[k];
    });
    audit(s, actor, 'funding.update', 'FundingRequest', r.id, r.projectId, null, { amount: r.amount, version: r.version });
  } else {
    r = { currency: 'INR', urgency: 'Normal', items: [], ...request, id: uid('fr'), number: nextFundingNumber(s), version: 1, versions: [], state: 'Draft', requesterId: actor.id, approverIds: [], decisions: [], snapshot: null, emails: [], allocationId: null, history: [], createdAt: nowISO() };
    s.fundingRequests.push(r);
    audit(s, actor, 'funding.create', 'FundingRequest', r.id, r.projectId, null, { amount: r.amount, number: r.number });
  }
  return { state: s, id: r.id };
}

export function submitFunding(state, actor, { id }) {
  const s = clone(state);
  const r = s.fundingRequests.find((x) => x.id === id) || fail('Request not found.');
  if (r.requesterId !== actor.id) fail('Only the requester can submit.');
  if (!['Draft', 'Changes requested'].includes(r.state)) fail('Request is not in an editable state.');
  if (!r.reason?.trim()) fail('A justification is required.');
  if (!r.items?.length) fail('Add at least one itemized line for the proposed use of funds.');
  const itemTotal = r.items.reduce((t, i) => t + Math.round(i.qty * i.unitCost), 0);
  if (Math.abs(itemTotal - r.amount) > 100) fail(`Itemized total (${formatINR(itemTotal)}) must match the requested amount (${formatINR(r.amount)}).`);
  // FR-046: duplicate submission guard
  const dup = s.fundingRequests.find((x) => x.id !== r.id && x.projectId === r.projectId && x.amount === r.amount && ['Submitted', 'Under review', 'Resubmitted'].includes(x.state));
  if (dup) fail(`A pending request ${dup.number} for the same amount already exists on this project.`);
  const wasResubmission = r.state === 'Changes requested';
  r.snapshot = buildSnapshot(s, r.projectId); // FR-040 snapshot at submission
  r.approverIds = routeApprovers(s, r.amount, r.requesterId);
  if (!r.approverIds.length) fail('No eligible approver is configured (segregation of duties).');
  const st = wasResubmission ? 'Resubmitted' : 'Submitted';
  r.revising = false;
  r.state = 'Under review';
  r.submittedAt = nowISO();
  r.history.push({ state: st, by: actor.id, at: nowISO(), comment: wasResubmission ? `Version ${r.version}` : '' });
  r.history.push({ state: 'Under review', by: 'system', at: nowISO(), comment: `Routed to ${r.approverIds.map((u) => s.users.find((x) => x.id === u)?.name).join(' → ')}` });
  const first = r.approverIds[0];
  queueEmail(s, r, first, 'approval');
  const p = projectOf(s, r.projectId);
  notify(s, [first], `Funding approval required: ${p.code}`, `${actor.name} requested ${formatINR(r.amount)} (${r.number}).`, `/funding/${r.id}`);
  audit(s, actor, `funding.${st.toLowerCase()}`, 'FundingRequest', r.id, r.projectId, null, { state: 'Under review', amount: r.amount, version: r.version, approvers: r.approverIds });
  return s;
}

export function currentApprover(req) {
  if (req.state !== 'Under review') return null;
  return req.approverIds.find((id) => !req.decisions.some((d) => d.approverId === id && d.decision === 'Approved' && d.version === req.version)) || null;
}

/** Decision by an authenticated approver (FR-042/044/045, AC-04/05). */
export function decideFunding(state, actor, { id, decision, comment }) {
  const s = clone(state);
  need(actor, 'funding.decide', 'You are not an authorized funding approver.');
  const r = s.fundingRequests.find((x) => x.id === id) || fail('Request not found.');
  if (r.state !== 'Under review') fail(`Request is "${r.state}" and cannot be decided.`);
  if (r.requesterId === actor.id && !s.settings.allowSelfApproval) fail('Segregation of duties: you cannot decide on your own funding request.');
  const cur = currentApprover(r);
  if (cur !== actor.id) fail(`Waiting for ${s.users.find((u) => u.id === cur)?.name || 'another approver'} to decide.`);
  if (['Rejected', 'Changes requested'].includes(decision) && !comment?.trim()) fail('A comment is mandatory when rejecting or requesting changes.');
  r.decisions.push({ approverId: actor.id, decision, comment: comment || '', at: nowISO(), version: r.version });
  const p = projectOf(s, r.projectId);
  if (decision === 'Approved') {
    const next = currentApprover(r);
    if (next) {
      r.history.push({ state: 'Under review', by: actor.id, at: nowISO(), comment: `Approved by ${actor.name}; routed to next approver` });
      queueEmail(s, r, next, 'approval');
      notify(s, [next], `Funding approval required: ${p.code}`, `${r.number} for ${formatINR(r.amount)} awaits your sequential approval.`, `/funding/${r.id}`);
    } else {
      if (r.allocationId) fail('Allocation already created for this request.'); // exactly-once
      const a = { id: uid('al'), projectId: r.projectId, type: 'additional', amount: r.amount, reason: `Funding request ${r.number} approved: ${r.reason.slice(0, 80)}`, approvalRef: r.number, effectiveDate: r.effectiveDate && r.effectiveDate > todayISO() ? r.effectiveDate : todayISO(), createdBy: actor.id, createdAt: nowISO() };
      s.allocations.push(a);
      r.allocationId = a.id;
      r.state = 'Approved';
      r.decidedAt = nowISO();
      r.history.push({ state: 'Approved', by: actor.id, at: nowISO(), comment });
      audit(s, actor, 'budget.allocate', 'Allocation', a.id, r.projectId, null, { type: 'additional', amount: a.amount }, `From ${r.number}`);
      const f = projectFinancials(s, r.projectId);
      notify(s, [r.requesterId, p.managerId, ...usersByRole(s, 'finance')], `Funding approved: ${r.number}`, `${formatINR(r.amount)} added to ${p.code}. New approved budget ${formatINR(f.approved)}.`, `/funding/${r.id}`);
      queueEmail(s, r, r.requesterId, 'decision');
    }
  } else {
    r.state = decision; // 'Rejected' | 'Changes requested'
    r.decidedAt = nowISO();
    r.history.push({ state: decision, by: actor.id, at: nowISO(), comment });
    notify(s, [r.requesterId], `Funding ${decision.toLowerCase()}: ${r.number}`, comment, `/funding/${r.id}`);
    queueEmail(s, r, r.requesterId, 'decision');
  }
  audit(s, actor, `funding.decision.${decision.toLowerCase().replace(/\s/g, '_')}`, 'FundingRequest', r.id, r.projectId, null, { decision, version: r.version }, comment);
  return s;
}

export function withdrawFunding(state, actor, { id, reason }) {
  const s = clone(state);
  const r = s.fundingRequests.find((x) => x.id === id) || fail('Request not found.');
  if (r.requesterId !== actor.id) fail('Only the requester can withdraw.');
  if (['Approved', 'Rejected', 'Withdrawn'].includes(r.state)) fail('Request is already closed.');
  const before = r.state;
  r.state = 'Withdrawn';
  r.history.push({ state: 'Withdrawn', by: actor.id, at: nowISO(), comment: reason || '' });
  audit(s, actor, 'funding.withdrawn', 'FundingRequest', r.id, r.projectId, { state: before }, { state: 'Withdrawn' }, reason);
  return s;
}

export function retryEmail(state, actor, { requestId, emailId }) {
  const s = clone(state);
  const r = s.fundingRequests.find((x) => x.id === requestId) || fail('Request not found.');
  const e = r.emails.find((x) => x.id === emailId) || fail('Email not found.');
  if (e.status !== 'Failed') fail('Only failed emails can be retried.');
  e.attempts += 1;
  e.lastAttemptAt = nowISO();
  const u = s.users.find((x) => x.id === e.toUserId);
  if (!s.settings.simulateEmailFailures && u?.email) {
    e.status = 'Delivered';
    e.error = null;
  }
  audit(s, actor, 'email.retry', 'Email', e.id, r.projectId, null, { status: e.status, attempts: e.attempts });
  return s;
}

// ---------------------------------------------------------------- PDF data checks
export function requestPdfDataCheck(state, actor, { reviewerId, filename, tableName, columns, rows, note = '' }) {
  const s = clone(state);
  if (!actor || !s.users.some((u) => u.id === actor.id && u.active)) fail('Sign in to request a data check.');
  const reviewer = s.users.find((u) => u.id === reviewerId && u.active);
  if (!reviewer || reviewer.role !== 'pm' || reviewer.id === actor.id) fail('Choose another active project manager to check the data.');
  if (!filename?.trim() || !tableName?.trim() || !columns?.length || !rows?.length) fail('Select at least one row to check.');
  if (rows.some((row) => !Number.isInteger(row.rowNumber) || row.rowNumber < 1 || row.values?.length !== columns.length)) fail('The selected rows are invalid.');
  const request = {
    id: uid('check'), requesterId: actor.id, reviewerId, filename, tableName,
    columns: columns.map(String), rows: rows.map((row) => ({ rowNumber: row.rowNumber, values: row.values.map((v) => String(v ?? '')) })),
    note: note.trim(), status: 'Pending', requestedAt: nowISO(), reviewedAt: null, reviewNote: '',
  };
  s.pdfDataChecks = [...(s.pdfDataChecks || []), request];
  notify(s, [reviewerId], 'Data check requested', `${actor.name} asked you to check ${rows.length} row(s) in ${filename} (${tableName}).${request.note ? ` ${request.note}` : ''}`, `/pdf-to-excel?check=${request.id}`);
  audit(s, actor, 'pdfCheck.request', 'PdfDataCheck', request.id, null, null, request);
  return { state: s, id: request.id };
}

export function completePdfDataCheck(state, actor, { id, decision, note = '' }) {
  const s = clone(state);
  const request = (s.pdfDataChecks || []).find((r) => r.id === id);
  if (!request || ![request.reviewerId, request.requesterId].includes(actor?.id) || !s.users.some((u) => u.id === actor.id && u.active)) fail('Only the requester or assigned reviewer can complete this check.');
  if (request.status !== 'Pending' && !(request.status === 'Needs correction' && decision === 'Checked')) fail('This data check has already been completed.');
  if (!['Checked', 'Needs correction'].includes(decision)) fail('Choose a valid check result.');
  if (decision === 'Needs correction' && request.reviewerId !== actor.id) fail('Only the assigned reviewer can request corrections.');
  if (decision === 'Needs correction' && !note.trim()) fail('Explain which numbers or cells need correction.');
  const before = clone(request);
  Object.assign(request, { status: decision, reviewedAt: nowISO(), reviewedById: actor.id, reviewNote: note.trim() });
  const recipientId = actor.id === request.requesterId ? request.reviewerId : request.requesterId;
  notify(s, [recipientId], `Data check: ${decision}`, `${actor.name} marked ${request.filename} as ${decision.toLowerCase()}.${request.reviewNote ? ` ${request.reviewNote}` : ''}`, `/pdf-to-excel?check=${request.id}`);
  audit(s, actor, 'pdfCheck.complete', 'PdfDataCheck', request.id, null, before, request);
  return s;
}

// ---------------------------------------------------------------- notifications & admin
export function markNotifications(state, actor, { ids, read = true }) {
  const s = clone(state);
  s.notifications.forEach((n) => {
    if (n.userId === actor.id && (!ids || ids.includes(n.id))) n.read = read;
  });
  return s;
}

export function updateSettings(state, actor, { settings }) {
  const s = clone(state);
  need(actor, 'admin.manage');
  const before = clone(s.settings);
  s.settings = { ...s.settings, ...settings };
  audit(s, actor, 'settings.update', 'Settings', 'org', null, before, s.settings);
  return s;
}

export function saveUser(state, actor, { user }) {
  const s = clone(state);
  need(actor, 'admin.manage');
  if (!user.name?.trim() || !user.email?.trim()) fail('Name and email are required.');
  if (s.users.some((u) => u.email.toLowerCase() === user.email.toLowerCase() && u.id !== user.id)) fail('Email already in use.');
  if (user.id) {
    const u = s.users.find((x) => x.id === user.id);
    if (u.id === actor.id && user.role !== 'owner') fail('You cannot remove your own owner role.');
    const before = clone(u);
    Object.assign(u, user);
    audit(s, actor, 'user.update', 'User', u.id, null, before, user);
  } else {
    const u = { active: true, ...user, id: uid('u') };
    s.users.push(u);
    audit(s, actor, 'user.create', 'User', u.id, null, null, { name: u.name, role: u.role });
  }
  return s;
}

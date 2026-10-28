// Automated tests for PRD §13 acceptance criteria and money handling.
import { describe, it, expect } from 'vitest';
import { buildSeed } from '../data/seed.js';
import * as A from '../store/actions.js';
import { projectFinancials, projectLedger } from './finance.js';
import { toPaise, formatINR } from './money.js';
import { visibleProjects, can } from './permissions.js';

const user = (s, id) => s.users.find((u) => u.id === id);
const R = (r) => Math.round(r * 100);

function freshProject(s0, budgetRupees = 1000) {
  const owner = user(s0, 'u1');
  let s = A.saveProject(s0, owner, { project: { code: 'TST-1', name: 'Test', managerId: 'u3', startDate: '2026-01-01', endDate: '2026-12-31' } });
  const p = s.projects.find((x) => x.code === 'TST-1');
  s = A.addAllocation(s, user(s, 'u2'), { projectId: p.id, type: 'original', amount: R(budgetRupees), reason: 'Baseline' });
  return { s, p };
}

function postExpense(s, projectId, rupees, extra = {}) {
  const pm = user(s, 'u3');
  s = A.saveExpense(s, pm, { expense: { projectId, category: 'Materials', amount: R(rupees), date: '2026-03-01', vendor: 'V' + Math.random(), receipt: 'r.pdf', ...extra }, submit: true });
  const e = s.expenses[s.expenses.length - 1];
  s = A.decideExpense(s, user(s, 'u2'), { id: e.id, decision: 'Approved' });
  s = A.postExpense(s, user(s, 'u2'), { id: e.id });
  return { s, e };
}

describe('Money', () => {
  it('parses and formats exact paise', () => {
    expect(toPaise('0.01')).toBe(1);
    expect(toPaise('1,234.5')).toBe(123450);
    expect(Number.isNaN(toPaise('1.234'))).toBe(true);
    expect(formatINR(1234567890)).toBe('₹1,23,45,678.90');
    expect(toPaise('0.1') + toPaise('0.2')).toBe(toPaise('0.3'));
  });
});

describe('Acceptance criteria', () => {
  it('AC-01: ₹1,000 approved and ₹10 posted expense → ₹990 remaining, searchable & audited', () => {
    const { s: s0, p } = freshProject(buildSeed());
    const { s, e } = postExpense(s0, p.id, 10);
    expect(projectFinancials(s, p.id).remaining).toBe(R(990));
    expect(s.audit.some((a) => a.entityId === e.id && a.action === 'expense.post')).toBe(true);
    expect(projectLedger(s, p.id).some((r) => r.ref === e.id)).toBe(true);
  });

  it('AC-02: draft/rejected expenses do not affect actual; commitments reduce available only', () => {
    let { s, p } = freshProject(buildSeed());
    const pm = user(s, 'u3');
    s = A.saveExpense(s, pm, { expense: { projectId: p.id, category: 'Materials', amount: R(100), date: '2026-03-01', vendor: 'X' } });
    s = A.saveExpense(s, pm, { expense: { projectId: p.id, category: 'Materials', amount: R(50), date: '2026-03-02', vendor: 'Y' }, submit: true });
    const e2 = s.expenses[s.expenses.length - 1];
    s = A.decideExpense(s, user(s, 'u2'), { id: e2.id, decision: 'Rejected', comment: 'no' });
    s = A.saveCommitment(s, pm, { commitment: { projectId: p.id, description: 'PO', amount: R(300), category: 'Materials' } });
    const f = projectFinancials(s, p.id);
    expect(f.actual).toBe(0);
    expect(f.committed).toBe(R(300));
    expect(f.available).toBe(R(700));
    expect(f.remaining).toBe(R(1000));
  });

  it('AC-03: posting the same payroll allocation twice is blocked', () => {
    const s0 = buildSeed();
    const est = s0.payrollEntries.find((x) => x.state === 'Estimated');
    const s1 = A.postPayroll(s0, user(s0, 'u7'), { id: est.id });
    expect(() => A.postPayroll(s1, user(s1, 'u7'), { id: est.id })).toThrow(/already posted/);
    // A second estimated entry with the same source key is also blocked
    const s2 = JSON.parse(JSON.stringify(s1));
    s2.payrollEntries.push({ ...est, id: 'dupe', state: 'Estimated' });
    expect(() => A.postPayroll(s2, user(s2, 'u7'), { id: 'dupe' })).toThrow(/Duplicate/);
  });

  it('AC-04: funding approval of ₹600 creates one allocation; original ₹1,000 stays separate; total ₹1,600', () => {
    let { s, p } = freshProject(buildSeed());
    const pm = user(s, 'u3');
    const res = A.saveFundingDraft(s, pm, { request: { projectId: p.id, amount: R(600), reason: 'More shelves', items: [{ category: 'Materials', description: 'Shelves', qty: 1, unitCost: R(600) }] } });
    s = A.submitFunding(res.state, pm, { id: res.id });
    s = A.decideFunding(s, user(s, 'u6'), { id: res.id, decision: 'Approved', comment: '' });
    const allocs = s.allocations.filter((a) => a.projectId === p.id);
    expect(allocs.map((a) => a.amount).sort((a, b) => a - b)).toEqual([R(600), R(1000)]);
    expect(projectFinancials(s, p.id).approved).toBe(R(1600));
    expect(() => A.decideFunding(s, user(s, 'u6'), { id: res.id, decision: 'Approved' })).toThrow();
    expect(s.allocations.filter((a) => a.projectId === p.id).length).toBe(2);
  });

  it('AC-05: requester cannot approve their own funding request', () => {
    let { s, p } = freshProject(buildSeed());
    const owner = user(s, 'u1');
    const res = A.saveFundingDraft(s, owner, { request: { projectId: p.id, amount: R(100), reason: 'x', items: [{ category: 'Other', description: 'x', qty: 1, unitCost: R(100) }] } });
    s = A.submitFunding(res.state, owner, { id: res.id });
    const req = s.fundingRequests.find((r) => r.id === res.id);
    expect(req.approverIds).not.toContain('u1');
    // even if forced into the route, SoD blocks it
    req.approverIds = ['u1'];
    expect(() => A.decideFunding(s, owner, { id: res.id, decision: 'Approved' })).toThrow(/Segregation/);
  });

  it('AC-06: changing a request after "changes requested" creates a new version needing re-review', () => {
    let { s, p } = freshProject(buildSeed());
    const pm = user(s, 'u3');
    const res = A.saveFundingDraft(s, pm, { request: { projectId: p.id, amount: R(200), reason: 'x', items: [{ category: 'Other', description: 'x', qty: 1, unitCost: R(200) }] } });
    s = A.submitFunding(res.state, pm, { id: res.id });
    s = A.decideFunding(s, user(s, 'u6'), { id: res.id, decision: 'Changes requested', comment: 'Add quotes' });
    const r = s.fundingRequests.find((x) => x.id === res.id);
    s = A.saveFundingDraft(s, pm, { request: { ...r, amount: R(250), items: [{ category: 'Other', description: 'x', qty: 1, unitCost: R(250) }] } }).state;
    const r2 = s.fundingRequests.find((x) => x.id === res.id);
    expect(r2.version).toBe(2);
    expect(r2.versions.length).toBe(1);
    expect(r2.decisions.length).toBe(0);
    s = A.submitFunding(s, pm, { id: res.id });
    expect(s.fundingRequests.find((x) => x.id === res.id).state).toBe('Under review');
  });

  it('AC-08: an employee cannot see other projects or salary data', () => {
    const s = buildSeed();
    const emp = user(s, 'u5');
    const codes = visibleProjects(s, emp).map((p) => p.code).sort();
    expect(codes).toEqual(['PRJ-101', 'PRJ-103']);
    expect(can(emp, 'salary.view')).toBe(false);
    expect(can(user(s, 'u3'), 'salary.view')).toBe(false);
    expect(can(user(s, 'u7'), 'salary.view')).toBe(true);
  });

  it('AC-09: email failure never increases budget; retries are logged', () => {
    let { s, p } = freshProject(buildSeed());
    s = A.updateSettings(s, user(s, 'u1'), { settings: { simulateEmailFailures: true } });
    const pm = user(s, 'u3');
    const res = A.saveFundingDraft(s, pm, { request: { projectId: p.id, amount: R(500), reason: 'x', items: [{ category: 'Other', description: 'x', qty: 1, unitCost: R(500) }] } });
    s = A.submitFunding(res.state, pm, { id: res.id });
    const r = s.fundingRequests.find((x) => x.id === res.id);
    expect(r.emails[0].status).toBe('Failed');
    expect(projectFinancials(s, p.id).approved).toBe(R(1000));
    s = A.updateSettings(s, user(s, 'u1'), { settings: { simulateEmailFailures: false } });
    s = A.retryEmail(s, pm, { requestId: r.id, emailId: r.emails[0].id });
    const e = s.fundingRequests.find((x) => x.id === res.id).emails[0];
    expect(e.status).toBe('Delivered');
    expect(e.attempts).toBe(2);
  });

  it('AC-10: ledger totals reconcile to financial summary', () => {
    const s = buildSeed();
    s.projects.forEach((p) => {
      const ledger = projectLedger(s, p.id);
      const f = projectFinancials(s, p.id);
      const last = ledger[ledger.length - 1];
      expect(last.runningBudget).toBe(f.approved);
      expect(last.runningCost).toBe(f.actual);
    });
  });

  it('PRD illustrative example: PRJ-103 ₹1,000 + ₹600 → ₹1,600 budget, ₹1,000 actual, ₹600 available', () => {
    const s = buildSeed();
    const f = projectFinancials(s, 'p3');
    expect(f.approved).toBe(R(1600));
    expect(f.actual).toBe(R(1000));
    expect(f.remaining).toBe(R(600));
  });

  it('FR-015/016: hard-stop budget policy and reversal entries', () => {
    let { s, p } = freshProject(buildSeed(), 100);
    s = A.updateSettings(s, user(s, 'u1'), { settings: { budgetPolicy: 'hardstop' } });
    expect(() => postExpense(s, p.id, 150)).toThrow(/hard stop/);
    const r = postExpense(s, p.id, 60);
    s = A.reverseExpense(r.s, user(s, 'u2'), { id: r.e.id, reason: 'Wrong project' });
    expect(projectFinancials(s, p.id).actual).toBe(0);
    expect(s.expenses.filter((e) => e.projectId === p.id).length).toBe(2);
  });

  it('Segregation of duties for expenses: submitter cannot approve own expense', () => {
    let { s, p } = freshProject(buildSeed());
    const fin = user(s, 'u2');
    s = A.saveExpense(s, fin, { expense: { projectId: p.id, category: 'Other', amount: R(5), date: '2026-03-01' }, submit: true });
    const e = s.expenses[s.expenses.length - 1];
    expect(() => A.decideExpense(s, fin, { id: e.id, decision: 'Approved' })).toThrow(/Segregation/);
  });
});

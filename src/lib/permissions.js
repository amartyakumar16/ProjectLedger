// Role-based access control (PRD §4). Access = role permission + project membership scope.

export const ROLES = {
  owner: { label: 'Organization owner / super admin', short: 'Owner' },
  finance: { label: 'Finance admin / accountant', short: 'Finance' },
  pm: { label: 'Project manager', short: 'Project manager' },
  employee: { label: 'Employee / contractor', short: 'Employee' },
  approver: { label: 'Funding approver', short: 'Approver' },
  hr: { label: 'HR / payroll manager', short: 'HR' },
  auditor: { label: 'Auditor / executive viewer', short: 'Auditor' },
};

const PERMS = {
  'project.create': ['owner', 'pm'],
  'project.edit': ['owner', 'pm'],
  'project.archive': ['owner'],
  'budget.allocate': ['owner', 'finance'],
  'budget.view': ['owner', 'finance', 'pm', 'approver', 'auditor', 'hr'],
  'expense.create': ['owner', 'finance', 'pm', 'employee'],
  'expense.approve': ['owner', 'finance', 'pm'],
  'expense.post': ['owner', 'finance'],
  'expense.reverse': ['owner', 'finance'],
  'expense.import': ['owner', 'finance'],
  'budget.override': ['owner', 'finance'],
  'commitment.manage': ['owner', 'finance', 'pm'],
  'task.manage': ['owner', 'pm'],
  'task.update': ['owner', 'pm', 'employee'],
  'log.create': ['owner', 'pm', 'employee'],
  'log.lock': ['owner', 'pm'],
  'people.assign': ['owner', 'pm', 'hr'],
  'time.log': ['owner', 'pm', 'employee', 'hr'],
  'time.approve': ['owner', 'pm', 'hr'],
  'salary.view': ['owner', 'finance', 'hr'],
  'payroll.manage': ['owner', 'finance', 'hr'],
  'funding.create': ['owner', 'pm', 'finance'],
  'funding.decide': ['owner', 'approver', 'finance'],
  'reports.view': ['owner', 'finance', 'pm', 'approver', 'auditor', 'hr'],
  'audit.view': ['owner', 'finance', 'auditor'],
  'admin.manage': ['owner'],
};

export function can(user, perm) {
  if (!user) return false;
  return (PERMS[perm] || []).includes(user.role);
}

const ALL_PROJECT_ROLES = ['owner', 'finance', 'approver', 'auditor', 'hr'];

/** Object-level authorization: which projects can this user see? (AC-08) */
export function visibleProjects(state, user) {
  if (!user) return [];
  if (ALL_PROJECT_ROLES.includes(user.role)) return state.projects;
  const emp = state.employees.find((e) => e.userId === user.id);
  const assigned = new Set(state.assignments.filter((a) => emp && a.employeeId === emp.id).map((a) => a.projectId));
  return state.projects.filter((p) => p.managerId === user.id || assigned.has(p.id));
}

export function canSeeProject(state, user, projectId) {
  return visibleProjects(state, user).some((p) => p.id === projectId);
}

export function employeeForUser(state, user) {
  return state.employees.find((e) => e.userId === user?.id);
}

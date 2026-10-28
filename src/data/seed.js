// Demo data generator. Dates are relative to "today" so the demo always looks current.
// Includes the PRD's illustrative ₹1,000 → ₹1,600 budget example (project PRJ-103).
import { addDays, todayISO, isWeekday } from '../lib/util.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const EXPENSE_CATEGORIES = [
  'Materials',
  'Equipment rental',
  'Transport',
  'Subcontractor',
  'Travel & lodging',
  'Food & site welfare',
  'Software & licences',
  'Permits & fees',
  'Utilities',
  'Other',
];

export const PAYMENT_METHODS = ['UPI', 'Bank transfer', 'Company card', 'Cash (petty)', 'Cheque', 'Employee paid (reimburse)'];

const R = (rupees) => Math.round(rupees * 100); // rupees → paise

export function buildSeed() {
  const today = todayISO();
  const rand = rng(20261022);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const at = (offset, hour = 10) => `${addDays(today, offset)}T${String(hour).padStart(2, '0')}:15:00.000Z`;

  const users = [
    { id: 'u1', name: 'Aakash Kumar', email: 'aakash@phoenixengineers.example', role: 'owner', active: true },
    { id: 'u2', name: 'Priya Sharma', email: 'priya@phoenixengineers.example', role: 'finance', active: true },
    { id: 'u3', name: 'Rohan Mehta', email: 'rohan@phoenixengineers.example', role: 'pm', active: true },
    { id: 'u4', name: 'Neha Gupta', email: 'neha@phoenixengineers.example', role: 'pm', active: true },
    { id: 'u5', name: 'Vikram Singh', email: 'vikram@phoenixengineers.example', role: 'employee', active: true },
    { id: 'u6', name: 'Anita Desai', email: 'anita@phoenixengineers.example', role: 'approver', active: true },
    { id: 'u7', name: 'Sanjay Rao', email: 'sanjay@phoenixengineers.example', role: 'hr', active: true },
    { id: 'u8', name: 'Kavita Iyer', email: 'kavita@phoenixengineers.example', role: 'auditor', active: true },
  ];

  const projects = [
    {
      id: 'p1', code: 'PRJ-101', name: 'Metro Line Signage Upgrade', managerId: 'u3', sponsor: 'City Transit Authority',
      department: 'Infrastructure', portfolio: 'Public sector', startDate: addDays(today, -125), endDate: addDays(today, 70),
      status: 'Active', priority: 'High', description: 'Replace and digitise wayfinding signage across 14 stations.',
      deliverables: 'Signage design pack; 14 station installations; digital display integration; handover manual',
      categoryPlan: { Materials: R(1200000), 'Equipment rental': R(300000), Transport: R(150000), Subcontractor: R(600000), 'Labour / Payroll': R(650000), Other: R(100000) },
      progressOverride: null, revisions: [], createdAt: at(-126), updatedAt: at(-2),
    },
    {
      id: 'p2', code: 'PRJ-102', name: 'Warehouse Rooftop Solar Installation', managerId: 'u4', sponsor: 'Logistics Division',
      department: 'Energy', portfolio: 'Internal capex', startDate: addDays(today, -95), endDate: addDays(today, 40),
      status: 'Active', priority: 'Critical', description: '420 kWp rooftop solar plant with net metering on Warehouse B.',
      deliverables: 'Structural audit; mounting structure; 760 panels; inverter yard; DISCOM net-metering approval',
      categoryPlan: { Materials: R(2400000), 'Equipment rental': R(400000), Subcontractor: R(700000), 'Permits & fees': R(100000), 'Labour / Payroll': R(400000) },
      progressOverride: null, revisions: [], createdAt: at(-96), updatedAt: at(-1),
    },
    {
      id: 'p3', code: 'PRJ-103', name: 'Community Library Fit-out (PRD budget example)', managerId: 'u3', sponsor: 'CSR Committee',
      department: 'CSR', portfolio: 'CSR', startDate: addDays(today, -30), endDate: addDays(today, 30),
      status: 'Active', priority: 'Medium', description: 'Small CSR project demonstrating the PRD ₹1,000 → ₹1,600 budget example.',
      deliverables: 'Shelving; reading corner; donation drive',
      categoryPlan: { Materials: R(400), Transport: R(250), 'Labour / Payroll': R(350) },
      progressOverride: null, revisions: [], createdAt: at(-31), updatedAt: at(-3),
    },
    {
      id: 'p4', code: 'PRJ-104', name: 'HR Portal Migration', managerId: 'u4', sponsor: 'People Operations',
      department: 'IT', portfolio: 'Internal capex', startDate: addDays(today, -60), endDate: addDays(today, 100),
      status: 'On hold', priority: 'Low', description: 'Migrate legacy HR portal to cloud HRMS.',
      deliverables: 'Data migration; SSO; employee self-service',
      categoryPlan: { 'Software & licences': R(500000), Subcontractor: R(250000), 'Labour / Payroll': R(50000) },
      progressOverride: null, revisions: [], createdAt: at(-61), updatedAt: at(-20),
    },
  ];

  const allocations = [
    { id: 'al1', projectId: 'p1', type: 'original', amount: R(2500000), reason: 'Board-approved baseline budget', approvalRef: 'BRD-2026-014', effectiveDate: addDays(today, -125), createdBy: 'u2', createdAt: at(-125) },
    { id: 'al2', projectId: 'p2', type: 'original', amount: R(4000000), reason: 'Capex committee approval', approvalRef: 'CAPEX-2026-07', effectiveDate: addDays(today, -95), createdBy: 'u2', createdAt: at(-95) },
    { id: 'al3', projectId: 'p3', type: 'original', amount: R(1000), reason: 'CSR micro-grant', approvalRef: 'CSR-26-003', effectiveDate: addDays(today, -30), createdBy: 'u2', createdAt: at(-30) },
    { id: 'al4', projectId: 'p4', type: 'original', amount: R(800000), reason: 'IT budget FY26-27', approvalRef: 'IT-26-002', effectiveDate: addDays(today, -60), createdBy: 'u2', createdAt: at(-60) },
    { id: 'al5', projectId: 'p1', type: 'additional', amount: R(500000), reason: 'Funding request FR-0001 approved: 3 additional stations', approvalRef: 'FR-0001', effectiveDate: addDays(today, -40), createdBy: 'u6', createdAt: at(-40) },
    { id: 'al6', projectId: 'p3', type: 'additional', amount: R(600), reason: 'Funding request FR-0002 approved: extra shelving', approvalRef: 'FR-0002', effectiveDate: addDays(today, -5), createdBy: 'u6', createdAt: at(-5) },
  ];

  const employees = [
    { id: 'e1', name: 'Rohan Mehta', userId: 'u3', type: 'Employee', title: 'Project Manager', department: 'Infrastructure', rateHistory: [{ effectiveDate: addDays(today, -400), hourlyRate: R(1100) }, { effectiveDate: addDays(today, -150), hourlyRate: R(1200) }] },
    { id: 'e2', name: 'Neha Gupta', userId: 'u4', type: 'Employee', title: 'Project Manager', department: 'Energy', rateHistory: [{ effectiveDate: addDays(today, -300), hourlyRate: R(1250) }] },
    { id: 'e3', name: 'Vikram Singh', userId: 'u5', type: 'Employee', title: 'Site Engineer', department: 'Infrastructure', rateHistory: [{ effectiveDate: addDays(today, -500), hourlyRate: R(650) }] },
    { id: 'e4', name: 'Meera Nair', userId: null, type: 'Contractor', title: 'Electrician', department: 'Energy', rateHistory: [{ effectiveDate: addDays(today, -200), hourlyRate: R(500) }] },
    { id: 'e5', name: 'Arjun Patel', userId: null, type: 'Employee', title: 'Technician', department: 'Infrastructure', rateHistory: [{ effectiveDate: addDays(today, -365), hourlyRate: R(450) }] },
    { id: 'e6', name: 'Farah Khan', userId: null, type: 'Contractor', title: 'Signage Designer', department: 'Design', rateHistory: [{ effectiveDate: addDays(today, -180), hourlyRate: R(800) }] },
  ];

  const assignments = [
    { id: 'as1', employeeId: 'e1', projectId: 'p1', role: 'Project manager', allocationPct: 60, startDate: addDays(today, -125), endDate: addDays(today, 70) },
    { id: 'as2', employeeId: 'e1', projectId: 'p3', role: 'Project manager', allocationPct: 10, startDate: addDays(today, -30), endDate: addDays(today, 30) },
    { id: 'as3', employeeId: 'e2', projectId: 'p2', role: 'Project manager', allocationPct: 70, startDate: addDays(today, -95), endDate: addDays(today, 40) },
    { id: 'as4', employeeId: 'e3', projectId: 'p1', role: 'Site engineer', allocationPct: 80, startDate: addDays(today, -120), endDate: addDays(today, 70) },
    { id: 'as5', employeeId: 'e4', projectId: 'p2', role: 'Electrician', allocationPct: 100, startDate: addDays(today, -80), endDate: addDays(today, 40) },
    { id: 'as6', employeeId: 'e5', projectId: 'p1', role: 'Technician', allocationPct: 50, startDate: addDays(today, -100), endDate: addDays(today, 70) },
    { id: 'as7', employeeId: 'e5', projectId: 'p2', role: 'Technician', allocationPct: 50, startDate: addDays(today, -80), endDate: addDays(today, 40) },
    { id: 'as8', employeeId: 'e6', projectId: 'p1', role: 'Designer', allocationPct: 40, startDate: addDays(today, -125), endDate: addDays(today, -20) },
    { id: 'as9', employeeId: 'e3', projectId: 'p3', role: 'Volunteer coordinator', allocationPct: 10, startDate: addDays(today, -30), endDate: addDays(today, 30) },
  ];

  // Expenses -----------------------------------------------------------
  const expenses = [];
  let expN = 1;
  const addExp = (projectId, offset, category, rupees, vendor, state, submitterId, extra = {}) => {
    const id = `ex${expN++}`;
    const date = addDays(today, offset);
    const history = [{ state: 'Submitted', by: submitterId, at: at(offset, 11), comment: '' }];
    if (['Approved', 'Posted', 'Paid', 'Rejected'].includes(state)) history.push({ state: state === 'Rejected' ? 'Rejected' : 'Approved', by: 'u3', at: at(offset + 1, 12), comment: state === 'Rejected' ? 'Not a project cost' : '' });
    if (['Posted', 'Paid'].includes(state)) history.push({ state: 'Posted', by: 'u2', at: at(offset + 1, 15), comment: '' });
    if (state === 'Paid') history.push({ state: 'Paid', by: 'u2', at: at(offset + 2, 15), comment: '' });
    expenses.push({
      id, projectId, category, amount: R(rupees), date, vendor, paymentMethod: pick(PAYMENT_METHODS), tax: Math.round(R(rupees) * 0.18 / 1.18),
      notes: '', receipt: rupees >= 2000 ? `receipt_${id}.pdf` : null, submitterId, state, reversalOf: null, reversedBy: null,
      override: null, history: state === 'Draft' ? [] : history, createdAt: at(offset, 11), ...extra,
    });
  };

  const p1Vendors = { Materials: ['Asian Signs Pvt Ltd', 'Acrylic World', 'Bharat Steel Fabricators'], 'Equipment rental': ['Skyline Scaffolding', 'LiftPro Rentals'], Transport: ['Ola Corporate', 'Shree Ganesh Logistics'], Subcontractor: ['BrightLED Systems'], 'Food & site welfare': ['Annapurna Caterers'], Other: ['Stationery Mart'] };
  for (let i = -120; i <= -1; i += 3) {
    const cat = pick(Object.keys(p1Vendors));
    const base = { Materials: 42000, 'Equipment rental': 18000, Transport: 3500, Subcontractor: 65000, 'Food & site welfare': 1800, Other: 450 }[cat];
    const amt = Math.round(base * (0.6 + rand() * 0.8) * 100) / 100;
    addExp('p1', i, cat, amt, pick(p1Vendors[cat]), i < -6 ? (rand() < 0.5 ? 'Paid' : 'Posted') : pick(['Submitted', 'Approved', 'Posted']), pick(['u3', 'u5']));
  }
  addExp('p1', -2, 'Food & site welfare', 86.5, 'Chai Point', 'Submitted', 'u5', { notes: 'Tea for night-shift crew' });
  addExp('p1', -1, 'Transport', 0.5, 'Parking - Andheri station', 'Draft', 'u5', { notes: 'Smallest-expense demo (₹0.50)' });
  addExp('p1', -15, 'Other', 2400, 'Unknown vendor', 'Rejected', 'u5');

  const p2Vendors = { Materials: ['Waaree Energies', 'Polycab Wires', 'Tata Power Solar'], 'Equipment rental': ['Hydra Crane Services'], Subcontractor: ['SunMount Structures'], 'Permits & fees': ['MSEDCL'], Transport: ['VRL Logistics'] };
  for (let i = -92; i <= -1; i += 2) {
    const cat = pick(Object.keys(p2Vendors));
    const base = { Materials: 120000, 'Equipment rental': 22000, Subcontractor: 75000, 'Permits & fees': 15000, Transport: 9000 }[cat];
    const amt = Math.round(base * (0.6 + rand() * 0.7) * 100) / 100;
    addExp('p2', i, cat, amt, pick(p2Vendors[cat]), i < -5 ? 'Posted' : pick(['Submitted', 'Approved']), pick(['u4']));
  }

  // PRD illustrative example (₹1,000 budget): materials ₹350, transport ₹250 (+ payroll ₹400 below)
  addExp('p3', -25, 'Materials', 350, 'Local Timber Depot', 'Paid', 'u3');
  addExp('p3', -12, 'Transport', 250, 'Tempo hire', 'Posted', 'u5');

  addExp('p4', -55, 'Software & licences', 180000, 'Zoho HRMS', 'Paid', 'u4');
  addExp('p4', -40, 'Subcontractor', 95000, 'CloudMigrate LLP', 'Posted', 'u4');

  // One reversal example (FR-016): a posted duplicate reversed with a linked negative entry
  const dup = expenses.find((e) => e.projectId === 'p1' && e.state === 'Posted');
  if (dup) {
    const revId = `ex${expN++}`;
    expenses.push({ ...dup, id: revId, amount: -dup.amount, tax: -dup.tax, state: 'Posted', reversalOf: dup.id, notes: 'Reversal: duplicate invoice', history: [{ state: 'Posted', by: 'u2', at: at(-3), comment: 'Duplicate invoice reversed' }], createdAt: at(-3), date: addDays(today, -3), receipt: null });
    dup.state = 'Reversed';
    dup.reversedBy = revId;
    dup.history.push({ state: 'Reversed', by: 'u2', at: at(-3), comment: 'Duplicate invoice reversed' });
  }

  // Commitments ------------------------------------------------------------
  const commitments = [
    { id: 'c1', projectId: 'p1', description: 'PO-5512: LED display panels (8 nos)', vendor: 'BrightLED Systems', category: 'Subcontractor', amount: R(320000), settled: R(120000), dueDate: addDays(today, 20), status: 'Open', createdBy: 'u3', createdAt: at(-30) },
    { id: 'c2', projectId: 'p2', description: 'PO-7781: String inverters 4 x 100 kW', vendor: 'Tata Power Solar', category: 'Materials', amount: R(680000), settled: R(0), dueDate: addDays(today, 12), status: 'Open', createdBy: 'u4', createdAt: at(-18) },
    { id: 'c3', projectId: 'p2', description: 'Crane booking for panel lift', vendor: 'Hydra Crane Services', category: 'Equipment rental', amount: R(45000), settled: R(45000), dueDate: addDays(today, -10), status: 'Closed', createdBy: 'u4', createdAt: at(-30) },
  ];

  // Payroll ----------------------------------------------------------------
  const payrollEntries = [];
  let prN = 1;
  const month = (offsetMonths) => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(1);
    d.setMonth(d.getMonth() + offsetMonths);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const addPay = (period, employeeId, projectId, gross, postedOffset, state = 'Posted') => {
    payrollEntries.push({ id: `pr${prN++}`, period, employeeId, projectId, grossCost: R(gross), employerCost: Math.round(R(gross) * 0.12), hours: null, state, sourceKey: `${employeeId}|${projectId}|${period}`, postedOn: addDays(today, postedOffset), postedBy: 'u7', reversalOf: null, createdAt: at(postedOffset) });
  };
  [-3, -2, -1].forEach((m, i) => {
    addPay(month(m), 'e1', 'p1', 115000, -95 + i * 30);
    addPay(month(m), 'e3', 'p1', 98000, -95 + i * 30);
    addPay(month(m), 'e5', 'p1', 36000, -95 + i * 30);
    if (i < 2) addPay(month(m), 'e6', 'p1', 54000, -95 + i * 30);
    addPay(month(m), 'e2', 'p2', 140000, -95 + i * 30);
    addPay(month(m), 'e4', 'p2', 80000, -95 + i * 30);
    addPay(month(m), 'e5', 'p2', 36000, -95 + i * 30);
  });
  // PRD example: employee project cost ₹400 total (gross 357.14 + 12% ≈ 400) → use exact 400 with zero on-cost
  payrollEntries.push({ id: `pr${prN++}`, period: month(-1), employeeId: 'e3', projectId: 'p3', grossCost: R(400), employerCost: 0, hours: 0.6, state: 'Posted', sourceKey: `e3|p3|${month(-1)}`, postedOn: addDays(today, -15), postedBy: 'u7', reversalOf: null, createdAt: at(-15) });
  addPay(month(0), 'e3', 'p1', 98000, 0, 'Estimated');

  // Timesheets (last 15 days) ---------------------------------------------
  const timesheets = [];
  let tsN = 1;
  for (let i = -15; i <= -1; i++) {
    const d = addDays(today, i);
    if (!isWeekday(d)) continue;
    [['e3', 'p1'], ['e4', 'p2'], ['e5', i % 2 ? 'p1' : 'p2']].forEach(([employeeId, projectId]) => {
      const leave = rand() < 0.06;
      timesheets.push({ id: `ts${tsN++}`, employeeId, projectId, date: d, hours: leave ? 0 : 8 + (rand() < 0.2 ? 2 : 0), attendance: leave ? 'Leave' : 'Present', status: i < -3 ? 'Approved' : 'Submitted', reviewerId: i < -3 ? 'u3' : null });
    });
  }

  // Tasks ---------------------------------------------------------------
  const tasks = [];
  let tN = 1;
  const addTask = (projectId, title, assigneeId, startOff, dueOff, status, milestone = false, weight = 1, est = 40, dependsOn = []) => {
    const id = `t${tN++}`;
    tasks.push({ id, projectId, title, assigneeId, plannedStart: addDays(today, startOff), dueDate: addDays(today, dueOff), actualEnd: status === 'Done' ? addDays(today, dueOff - 1) : null, estimateHours: est, status, milestone, weight, dependsOn, evidence: status === 'Done' ? 'Signed completion note' : '', createdAt: at(startOff) });
    return id;
  };
  const a1 = addTask('p1', 'Station survey & measurements', 'e3', -120, -100, 'Done', true, 10, 120);
  const a2 = addTask('p1', 'Signage design pack approval', 'e6', -100, -70, 'Done', true, 15, 200, [a1]);
  const a3 = addTask('p1', 'Fabrication – batch 1 (7 stations)', 'e5', -70, -35, 'Done', true, 20, 300, [a2]);
  addTask('p1', 'Installation – stations 1-7', 'e3', -35, -5, 'Done', true, 20, 260, [a3]);
  addTask('p1', 'Fabrication – batch 2 (7 stations)', 'e5', -30, 5, 'In progress', true, 15, 300, [a2]);
  addTask('p1', 'Digital display integration', 'e3', -10, 25, 'In progress', true, 15, 180);
  addTask('p1', 'Fire safety sign-off at Andheri', 'e1', -20, -3, 'Blocked', false, 1, 16);
  addTask('p1', 'Handover manual & training', 'e1', 40, 68, 'To do', true, 5, 60);
  const b1 = addTask('p2', 'Structural audit of roof', 'e2', -92, -80, 'Done', true, 10, 60);
  addTask('p2', 'Mounting structure erection', 'e5', -80, -40, 'Done', true, 20, 400, [b1]);
  addTask('p2', 'Panel installation (760)', 'e4', -40, 5, 'In progress', true, 30, 600);
  addTask('p2', 'Inverter yard & cabling', 'e4', -15, 15, 'In progress', true, 20, 300);
  addTask('p2', 'DISCOM net-metering application', 'e2', -30, -8, 'Blocked', true, 10, 20);
  addTask('p2', 'Commissioning & performance test', 'e2', 20, 38, 'To do', true, 10, 80);
  addTask('p3', 'Purchase shelving timber', 'e3', -28, -20, 'Done', true, 30, 6);
  addTask('p3', 'Assemble reading corner', 'e3', -15, 10, 'In progress', true, 40, 12);
  addTask('p3', 'Book donation drive', 'e1', -5, 20, 'To do', true, 30, 8);
  addTask('p4', 'Data mapping workshop', 'e2', -55, -45, 'Done', true, 30, 24);
  addTask('p4', 'Vendor SSO configuration', 'e2', -40, -10, 'Blocked', true, 30, 40);

  // Daily logs ----------------------------------------------------------
  const dailyLogs = [];
  let lN = 1;
  const workP1 = ['Installed wayfinding panels on platform level', 'Completed concourse signage alignment', 'Fabricated 12 acrylic direction boards', 'Electrical first-fix for display units', 'Snag walk with station manager', 'Painted mounting brackets and anchors'];
  const workP2 = ['Lifted 64 panels to roof with crane', 'Mounted 48 panels on row C', 'DC cabling for strings 5-8', 'Earthing pits completed', 'Inverter plinth casting', 'Safety toolbox talk and harness inspection'];
  const blockers = ['', '', '', 'Night block permit delayed by 2 hours', 'Rain stopped roof work after 2 pm', 'Awaiting DISCOM inspection slot', ''];
  [['p1', -120, workP1, 'u3'], ['p2', -92, workP2, 'u4']].forEach(([projectId, start, work, author]) => {
    for (let i = start; i <= -1; i++) {
      const d = addDays(today, i);
      if (!isWeekday(d) || rand() < 0.07) continue;
      dailyLogs.push({
        id: `dl${lN++}`, projectId, date: d, authorId: rand() < 0.7 ? author : 'u5', location: projectId === 'p1' ? pick(['Andheri', 'Ghatkopar', 'Versova', 'Workshop']) : 'Warehouse B roof',
        shift: pick(['Day', 'Day', 'Night']), summary: pick(work), completed: pick(work), pending: pick(work), blockers: pick(blockers),
        headcount: 4 + Math.floor(rand() * 9), hours: 8 * (4 + Math.floor(rand() * 9)), nextSteps: pick(work), locked: i < -7, revisions: [], createdAt: at(i, 18),
      });
    }
  });
  dailyLogs.push({ id: `dl${lN++}`, projectId: 'p3', date: addDays(today, -12), authorId: 'u3', location: 'Library hall', shift: 'Day', summary: 'Timber delivered; shelving cut to size', completed: 'Timber delivery', pending: 'Assembly', blockers: '', headcount: 3, hours: 12, nextSteps: 'Assemble reading corner', locked: true, revisions: [], createdAt: at(-12, 18) });

  // Funding requests -----------------------------------------------------
  const fr = (o) => ({ version: 1, versions: [], emails: [], history: [], decisions: [], allocationId: null, items: [], ...o });
  const fundingRequests = [
    fr({
      id: 'fr1', number: 'FR-0001', projectId: 'p1', amount: R(500000), currency: 'INR', urgency: 'High', reason: 'Scope addition: 3 extra stations requested by sponsor.', effectiveDate: addDays(today, -40),
      items: [{ category: 'Materials', description: 'Signage for 3 stations', qty: 3, unitCost: R(110000) }, { category: 'Subcontractor', description: 'Installation crew', qty: 3, unitCost: R(56666.67) }],
      revisedCompletion: addDays(today, 70), runwayNote: '6 weeks', consequences: 'Without approval the 3 stations remain out of scope.', state: 'Approved', requesterId: 'u3', approverIds: ['u6'],
      decisions: [{ approverId: 'u6', decision: 'Approved', comment: 'Sponsor confirmed in writing.', at: at(-40) }], allocationId: 'al5',
      snapshot: { approved: R(2500000), actual: R(1400000), committed: R(200000), available: R(900000), progress: 45 },
      history: [{ state: 'Submitted', by: 'u3', at: at(-43), comment: '' }, { state: 'Under review', by: 'system', at: at(-43), comment: 'Routed to Anita Desai' }, { state: 'Approved', by: 'u6', at: at(-40), comment: 'Sponsor confirmed in writing.' }],
      createdAt: at(-44),
    }),
    fr({
      id: 'fr2', number: 'FR-0002', projectId: 'p3', amount: R(600), currency: 'INR', urgency: 'Normal', reason: 'Budget exhausted (₹1,000 fully spent). Extra shelving and fasteners needed.', effectiveDate: addDays(today, -5),
      items: [{ category: 'Materials', description: 'Additional shelving boards', qty: 4, unitCost: R(120) }, { category: 'Transport', description: 'Delivery', qty: 1, unitCost: R(120) }],
      revisedCompletion: addDays(today, 30), runwayNote: '3 weeks', consequences: 'Reading corner cannot be completed.', state: 'Approved', requesterId: 'u3', approverIds: ['u6'],
      decisions: [{ approverId: 'u6', decision: 'Approved', comment: 'OK.', at: at(-5) }], allocationId: 'al6',
      snapshot: { approved: R(1000), actual: R(1000), committed: 0, available: 0, progress: 30 },
      history: [{ state: 'Submitted', by: 'u3', at: at(-7), comment: '' }, { state: 'Approved', by: 'u6', at: at(-5), comment: 'OK.' }], createdAt: at(-7),
    }),
    fr({
      id: 'fr3', number: 'FR-0003', projectId: 'p2', amount: R(600000), currency: 'INR', urgency: 'Critical', reason: 'Panel prices rose 9% and the DISCOM requires an additional protection relay panel.', effectiveDate: addDays(today, 3),
      items: [{ category: 'Materials', description: 'Panel price escalation (760 panels)', qty: 760, unitCost: R(450) }, { category: 'Materials', description: 'Protection relay panel', qty: 1, unitCost: R(180000) }, { category: 'Subcontractor', description: 'Relay installation & testing', qty: 1, unitCost: R(78000) }],
      revisedCompletion: addDays(today, 45), runwayNote: '≈ 2 weeks at current burn', consequences: 'Without approval, commissioning slips by 6+ weeks and net-metering approval lapses.', state: 'Under review', requesterId: 'u4', approverIds: ['u6', 'u1'],
      snapshot: null, history: [{ state: 'Submitted', by: 'u4', at: at(-1), comment: '' }, { state: 'Under review', by: 'system', at: at(-1), comment: 'Routed to Anita Desai → Aakash Kumar (amount > ₹5,00,000)' }], createdAt: at(-2),
    }),
  ];

  const notifications = [
    { id: 'n1', userId: 'u6', title: 'Funding approval required: PRJ-102', body: 'Neha Gupta requested ₹6,00,000 for Warehouse Rooftop Solar Installation.', link: '/funding/fr3', read: false, at: at(-1) },
    { id: 'n2', userId: 'u4', title: 'Budget threshold crossed: PRJ-102 at 75%', body: 'Actual cost has crossed 75% of approved budget.', link: '/projects/p2', read: false, at: at(-6) },
    { id: 'n3', userId: 'u2', title: 'Budget threshold crossed: PRJ-102 at 75%', body: 'Actual cost has crossed 75% of approved budget.', link: '/projects/p2', read: false, at: at(-6) },
    { id: 'n4', userId: 'u3', title: 'Funding approved: FR-0002', body: '₹600 added to PRJ-103. New approved budget ₹1,600.', link: '/funding/fr2', read: true, at: at(-5) },
    { id: 'n5', userId: 'u1', title: 'Task blocked: Fire safety sign-off', body: 'PRJ-101 has a blocked task past its due date.', link: '/projects/p1', read: false, at: at(-3) },
  ];

  const audit = [];
  let auN = 1;
  allocations.forEach((a) => audit.push({ id: `au${auN++}`, at: a.createdAt, actorId: a.createdBy, action: 'budget.allocate', entity: 'Allocation', entityId: a.id, projectId: a.projectId, before: null, after: { type: a.type, amount: a.amount }, reason: a.reason }));
  projects.forEach((p) => audit.push({ id: `au${auN++}`, at: p.createdAt, actorId: p.managerId, action: 'project.create', entity: 'Project', entityId: p.id, projectId: p.id, before: null, after: { code: p.code, name: p.name }, reason: '' }));
  fundingRequests.forEach((f) => f.history.forEach((h) => audit.push({ id: `au${auN++}`, at: h.at, actorId: h.by, action: `funding.${h.state.toLowerCase().replace(/\s/g, '_')}`, entity: 'FundingRequest', entityId: f.id, projectId: f.projectId, before: null, after: { state: h.state }, reason: h.comment })));
  audit.sort((a, b) => a.at.localeCompare(b.at));

  return {
    schemaVersion: 1,
    org: { name: 'Phoenix Engineers', currency: 'INR' },
    settings: {
      budgetPolicy: 'override', // 'hardstop' | 'override'
      receiptThreshold: R(2000),
      pmApprovalLimit: R(100000),
      singleApproverLimit: R(500000),
      allowSelfApproval: false,
      budgetAlertThresholds: [50, 75, 90, 100],
      simulateEmailFailures: false,
    },
    counters: { funding: 3, project: 104 },
    currentUserId: null,
    users, projects, allocations, expenses, commitments, employees, assignments, timesheets, payrollEntries,
    tasks, dailyLogs, fundingRequests, notifications, audit, pdfDataChecks: [],
  };
}

import { describe, expect, it } from 'vitest';
import { buildSeed } from '../data/seed.js';
import { completePdfDataCheck, requestPdfDataCheck } from '../store/actions.js';

const payload = () => ({
  reviewerId: 'u3', filename: 'order.pdf', tableName: 'Purchase order items',
  columns: ['Item no.', 'Quantity', 'Gross price'],
  rows: [{ rowNumber: 4, values: ['00040', '35.000', '2840.000'] }],
  note: 'Check quantity and price against the order.',
});
const person = (s, id) => s.users.find((u) => u.id === id);

describe('PDF data check requests', () => {
  it('saves a dated snapshot and notifies only the chosen project manager', () => {
    const initial = buildSeed();
    // Existing browser data may predate this feature.
    delete initial.pdfDataChecks;
    const data = payload();
    const { state, id } = requestPdfDataCheck(initial, person(initial, 'u1'), data);
    data.rows[0].values[1] = '999';
    data.columns[1] = 'Changed';
    const saved = JSON.parse(JSON.stringify(state)).pdfDataChecks[0];
    expect(saved).toMatchObject({ id, status: 'Pending', requesterId: 'u1', reviewerId: 'u3', columns: ['Item no.', 'Quantity', 'Gross price'], rows: [{ rowNumber: 4, values: ['00040', '35.000', '2840.000'] }] });
    expect(Number.isNaN(Date.parse(saved.requestedAt))).toBe(false);
    expect(state.notifications.slice(initial.notifications.length)).toMatchObject([{ userId: 'u3', read: false, link: `/pdf-to-excel?check=${id}` }]);
    expect(state.audit.at(-1)).toMatchObject({ action: 'pdfCheck.request', entityId: id });
    expect(initial.pdfDataChecks).toBeUndefined();
  });

  it('rejects empty selections, inactive reviewers, self review and non-manager routing', () => {
    const s = buildSeed();
    const actor = person(s, 'u1');
    expect(() => requestPdfDataCheck(s, actor, { ...payload(), rows: [] })).toThrow('Select at least one row');
    expect(() => requestPdfDataCheck(s, actor, { ...payload(), reviewerId: 'u2' })).toThrow('project manager');
    expect(() => requestPdfDataCheck(s, person(s, 'u3'), payload())).toThrow('project manager');
    person(s, 'u3').active = false;
    expect(() => requestPdfDataCheck(s, actor, payload())).toThrow('project manager');
  });

  it('rejects unrelated users and sends the reviewer result back once', () => {
    const s = buildSeed();
    const { state, id } = requestPdfDataCheck(s, person(s, 'u1'), payload());
    expect(() => completePdfDataCheck(state, person(state, 'u4'), { id, decision: 'Checked' })).toThrow('assigned reviewer');
    const done = completePdfDataCheck(state, person(state, 'u3'), { id, decision: 'Checked', note: 'Numbers match.' });
    expect(done.pdfDataChecks[0]).toMatchObject({ status: 'Checked', reviewNote: 'Numbers match.' });
    expect(done.pdfDataChecks[0].reviewedAt).toBeTruthy();
    expect(done.notifications.at(-1)).toMatchObject({ userId: 'u1', title: 'Data check: Checked', link: `/pdf-to-excel?check=${id}` });
    expect(() => completePdfDataCheck(done, person(done, 'u3'), { id, decision: 'Checked' })).toThrow('already been completed');
    expect(state.pdfDataChecks[0].status).toBe('Pending');
  });

  it('lets the requester mark a request as checked and notifies the manager with the actual completion author', () => {
    const s = buildSeed();
    const { state, id } = requestPdfDataCheck(s, person(s, 'u1'), payload());
    expect(() => completePdfDataCheck(state, person(state, 'u1'), { id, decision: 'Needs correction', note: 'Change it.' })).toThrow('assigned reviewer');
    const done = completePdfDataCheck(state, person(state, 'u1'), { id, decision: 'Checked' });
    expect(done.pdfDataChecks[0]).toMatchObject({ status: 'Checked', reviewedById: 'u1' });
    expect(done.notifications.at(-1)).toMatchObject({ userId: 'u3', title: 'Data check: Checked' });
    expect(done.notifications.at(-1).body).toContain('Aakash Kumar marked');
    expect(done.audit.at(-1)).toMatchObject({ actorId: 'u1', action: 'pdfCheck.complete' });
    expect(() => completePdfDataCheck(done, person(done, 'u1'), { id, decision: 'Checked' })).toThrow('already been completed');
  });

  it('requires specific correction notes and preserves the originally requested values', () => {
    const s = buildSeed();
    const { state, id } = requestPdfDataCheck(s, person(s, 'u1'), payload());
    const actor = person(state, 'u3');
    expect(() => completePdfDataCheck(state, actor, { id, decision: 'Needs correction' })).toThrow('Explain which numbers');
    const done = completePdfDataCheck(state, actor, { id, decision: 'Needs correction', note: 'Row 4, Quantity should be 36.' });
    expect(done.pdfDataChecks[0]).toMatchObject({ status: 'Needs correction', reviewNote: 'Row 4, Quantity should be 36.' });
    expect(done.pdfDataChecks[0].rows[0].values[1]).toBe('35.000');
    expect(done.notifications.at(-1).body).toContain('Row 4, Quantity should be 36.');
    const checked = completePdfDataCheck(done, person(done, 'u1'), { id, decision: 'Checked' });
    expect(checked.pdfDataChecks[0]).toMatchObject({ status: 'Checked', reviewedById: 'u1' });
  });
});

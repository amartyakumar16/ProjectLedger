import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { buildSeed } from '../data/seed.js';
import { completePdfDataCheck, requestPdfDataCheck } from '../store/actions.js';
import PdfDataChecks from './PdfDataChecks.jsx';

vi.mock('react-router-dom', () => ({ useSearchParams: vi.fn(), Link: ({ to, children, ...props }) => createElement('a', { ...props, href: to }, children) }));
vi.mock('../store/Store.jsx', () => ({ useStore: vi.fn() }));

const request = (status, extra = {}) => ({
  id: status, requesterId: 'u1', reviewerId: 'u3', filename: `${status}.pdf`,
  tableName: 'Purchase order items', columns: ['Quantity'], rows: [{ rowNumber: 1, values: ['40'] }],
  requestedAt: '2026-10-27T10:00:00Z', status, ...extra,
});

function render(state, selectedId = '', { view = 'all', search = '' } = {}) {
  useStore.mockReturnValue({ state, user: state.users[0], run: vi.fn(), A: {} });
  const params = new URLSearchParams();
  if (selectedId) params.set('check', selectedId);
  if (search) params.set('closedSearch', search);
  useSearchParams.mockReturnValue([params, vi.fn()]);
  const html = renderToStaticMarkup(createElement(PdfDataChecks, { view }));
  const sections = html.split('<section');
  return { active: sections[1] || '', closed: sections[2] || '', html };
}

beforeEach(() => vi.clearAllMocks());

describe('PDF request lists', () => {
  it('keeps the archive separate and links completed selections to their saved details', () => {
    const state = buildSeed();
    state.pdfDataChecks = [request('Pending'), request('Checked')];
    const active = render(state, 'Checked', { view: 'active' }).html;
    expect(active).toContain('Pending.pdf');
    expect(active).not.toContain('Checked.pdf');
    expect(active).toContain('/closed-requests?check=Checked');
    const closed = render(state, 'Checked', { view: 'closed' }).html;
    expect(closed).not.toContain('Active Requests');
    expect(closed).not.toContain('Pending.pdf');
    expect(closed).toContain('Checked.pdf');
    expect(closed).toContain('pdf-check-details');
    expect(closed).toContain('Search closed requests');
  });

  it('searches saved closed requests without exposing other users or active requests', () => {
    const state = buildSeed();
    state.pdfDataChecks = [request('Checked', { filename: 'order-123.pdf', reviewNote: 'Verified steel totals' }),
      request('Checked', { id: 'other', filename: 'different.pdf', rows: [{ rowNumber: 2, values: ['9876'] }] }),
      request('Pending', { filename: 'steel-active.pdf' }),
      request('Checked', { id: 'private', requesterId: 'u4', reviewerId: 'u3', filename: 'steel-private.pdf' })];
    for (const search of [' ORDER-123 ', 'STEEL', 'Aakash Kumar', '40']) {
      const { html } = render(state, '', { view: 'closed', search });
      expect(html).toContain('order-123.pdf');
      expect(html).not.toContain('steel-active.pdf');
      expect(html).not.toContain('steel-private.pdf');
    }
    const filtered = render(state, '', { view: 'closed', search: 'steel' }).html;
    expect(filtered).not.toContain('different.pdf');
    expect(filtered).toContain('1 of 2 closed requests');
    expect(render(state, '', { view: 'closed', search: 'no-match' }).html).toContain('No matching closed requests');
    expect(render(state, '', { view: 'closed' }).html).toContain('different.pdf');
  });

  it('separates saved completed statuses from requests that still need work', () => {
    const state = buildSeed();
    state.pdfDataChecks = ['Pending', 'Needs correction', 'Checked', 'Done', 'Closed', 'Completed'].map((status) => request(status));
    state.pdfDataChecks.push(request('Pending', { id: 'private', requesterId: 'u4', reviewerId: 'u3', filename: 'private.pdf' }));
    const { active, closed } = render(state);
    expect(active).toContain('Active Requests');
    expect(closed).toContain('Closed Requests');
    for (const status of ['Pending', 'Needs correction']) {
      expect(active).toContain(`${status}.pdf`);
      expect(closed).not.toContain(`${status}.pdf`);
    }
    for (const status of ['Checked', 'Done', 'Closed', 'Completed']) {
      expect(closed).toContain(`${status}.pdf`);
      expect(active).not.toContain(`${status}.pdf`);
    }
    expect(active + closed).not.toContain('private.pdf');
    expect(closed).not.toContain('Mark as checked');
  });

  it('moves the row and open details to Closed Requests immediately after completion and after reload', () => {
    const initial = buildSeed();
    const { state, id } = requestPdfDataCheck(initial, initial.users[0], {
      reviewerId: 'u3', filename: 'selected-order.pdf', tableName: 'Items',
      columns: ['Quantity'], rows: [{ rowNumber: 1, values: ['40'] }],
    });
    const before = render(state, id);
    expect(before.active).toContain('selected-order.pdf');
    expect(before.closed).not.toContain('selected-order.pdf');
    const done = completePdfDataCheck(state, state.users[0], { id, decision: 'Checked' });
    const after = render(done, id);
    expect(after.active).not.toContain('selected-order.pdf');
    expect(after.active).toContain('No active requests');
    expect(after.closed).toContain('selected-order.pdf');
    expect(after.closed).toContain('pdf-check-details');
    expect(after.closed).toContain('Completed date');
    expect(after.closed).not.toContain('Mark as checked');
    expect(render(JSON.parse(JSON.stringify(done)), id)).toEqual(after);
  });

  it('orders closed requests by completion date and preserves their review details', () => {
    const state = buildSeed();
    state.pdfDataChecks = [
      request('Checked', { id: 'older', filename: 'older.pdf', reviewedAt: '2026-10-27T11:00:00Z' }),
      request('Checked', { id: 'newer', filename: 'newer.pdf', reviewedAt: '2026-10-27T12:00:00Z', reviewedById: 'u1', reviewNote: 'Numbers verified.' }),
    ];
    const { active, closed } = render(state, 'newer');
    expect(active).not.toContain('Numbers verified.');
    expect(closed).toContain('Numbers verified.');
    expect(closed).toContain('Aakash Kumar');
    // The table lists the most recently completed request first.
    const table = closed.slice(closed.indexOf('<th>Document / table</th>'));
    expect(table.indexOf('newer.pdf')).toBeLessThan(table.indexOf('older.pdf'));
  });
});

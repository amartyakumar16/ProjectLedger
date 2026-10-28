import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/Store.jsx';
import { Badge, Empty, Field } from './ui.jsx';
import { fmtDateTime } from '../lib/util.js';

export default function PdfDataChecks({ view = 'all' }) {
  const { state, user, run, A } = useStore();
  const [params, setParams] = useSearchParams();
  const [note, setNote] = useState('');
  const [search, setSearch] = useState(params.get('closedSearch') || '');
  const query = (params.get('closedSearch') || '').trim().toLocaleLowerCase();
  const savedSearch = params.get('closedSearch') || '';
  useEffect(() => { setSearch(savedSearch); }, [savedSearch]);
  const requests = (state.pdfDataChecks || []).filter((r) => r.requesterId === user.id || r.reviewerId === user.id)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const isClosed = (request) => ['Checked', 'Done', 'Closed', 'Completed'].includes(request.status);
  const activeRequests = requests.filter((r) => !isClosed(r));
  const closedRequests = requests.filter(isClosed).sort((a, b) =>
    (b.closedAt || b.reviewedAt || b.requestedAt).localeCompare(a.closedAt || a.reviewedAt || a.requestedAt));
  const selectedId = params.get('check');
  const selected = requests.find((r) => r.id === selectedId);
  const name = (id) => state.users.find((u) => u.id === id)?.name || 'Unknown user';
  const matches = closedRequests.filter((r) => [r.filename, r.tableName, name(r.requesterId), name(r.reviewerId),
    r.status, r.note, r.reviewNote, fmtDateTime(r.requestedAt), fmtDateTime(r.closedAt || r.reviewedAt),
    ...r.rows.flatMap((row) => row.values)].join(' ').toLocaleLowerCase().includes(query));
  const open = (id) => { setNote(''); setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id) next.set('check', id); else next.delete('check');
    return next;
  }); };
  const applySearch = (value) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value.trim()) next.set('closedSearch', value.trim()); else next.delete('closedSearch');
    next.delete('check');
    return next;
  });
  const complete = (decision, id = selected.id) => {
    const res = run(A.completePdfDataCheck, { id, decision, note: selected?.id === id ? note : '' }, { success: 'Request updated and notification sent.' });
    if (res.ok) setNote('');
  };

  const renderSection = (title, list, closed) => {
    const details = selected && isClosed(selected) === closed ? selected : null;
    return <section className="card" aria-label={title} key={title}>
    <div className="card-head"><h2>{title} <span className="badge">{list.length}</span></h2><div className="btn-row">
      {!closed && view === 'active' && <Link className="btn sm" to={`/closed-requests${selected && isClosed(selected) ? `?check=${encodeURIComponent(selected.id)}` : ''}`}>View closed requests ({closedRequests.length})</Link>}
      {details && !closed && <button className="btn primary" onClick={() => complete('Checked')}>Mark as checked</button>}
      {(details || (!closed && selectedId && !selected)) && <button className="btn sm" onClick={() => open(null)}>Close details</button>}
    </div></div>
    {closed && <form className="filters" role="search" aria-label="Search closed requests" onSubmit={(e) => { e.preventDefault(); applySearch(search); }}>
      <Field label="Search closed requests" htmlFor="closed-request-search"><input id="closed-request-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Document, person, date or saved values" /></Field>
      <button className="btn primary" type="submit">Search</button>
      {(search || query) && <button className="btn" type="button" onClick={() => { setSearch(''); applySearch(''); }}>Clear search</button>}
      <p className="small muted" role="status">{list.length} of {closedRequests.length} closed requests</p>
    </form>}
    {!closed && view === 'active' && selected && isClosed(selected) && <p className="alert">This request is complete and saved in Closed Requests. Use “View closed requests” to see its details.</p>}
    {selectedId && !selected && (view !== 'all' || !closed) && <div className="alert warn">This request is unavailable or is assigned to another person.</div>}
    {details && <div className="pdf-check-details" key={selected.id}>
      <h3>{selected.filename} · {selected.tableName}</h3>
      <p><Badge tone={closed ? 'green' : selected.status === 'Pending' ? 'amber' : 'red'}>{selected.status}</Badge></p>
      <p className="small">Requested by {name(selected.requesterId)} · Project manager: {name(selected.reviewerId)} · Requested {fmtDateTime(selected.requestedAt)}</p>
      {selected.note && <p><strong>What to check:</strong> {selected.note}</p>}
      <p className="small muted">Values saved when the request was sent. Row numbers refer to the original extracted table.</p>
      <div className="table-wrap"><table><thead><tr><th>Row</th>{selected.columns.map((col, i) => <th key={i}>{col}</th>)}</tr></thead>
        <tbody>{selected.rows.map((row, i) => <tr key={i}><td>{row.rowNumber}</td>{row.values.map((value, c) => <td key={c}>{value}</td>)}</tr>)}</tbody>
      </table></div>
      {selected.status === 'Pending' && selected.reviewerId === user.id && <div style={{ marginTop: 16 }}>
        <Field label="Check result / corrections" htmlFor="pdf-review-note"><textarea id="pdf-review-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Identify the row, column and correct value if anything needs fixing." /></Field>
        <div className="btn-row"><button className="btn primary" onClick={() => complete('Checked')}>Mark as checked</button><button className="btn" onClick={() => complete('Needs correction')}>Needs correction</button></div>
      </div>}
      {(selected.closedAt || selected.reviewedAt) && <p><strong>{selected.status}</strong> · By {name(selected.reviewedById || selected.reviewerId)} · {fmtDateTime(selected.closedAt || selected.reviewedAt)}{selected.reviewNote && <> · {selected.reviewNote}</>}</p>}
    </div>}
    {!list.length ? <Empty title={closed ? query ? 'No matching closed requests' : 'No closed requests' : 'No active requests'}>{closed ? query ? 'Try a different search or clear the search to see all closed requests.' : 'Completed requests will appear here automatically.' : 'All requests have been completed. New requests will appear here.'}</Empty> : <div className="table-wrap"><table><thead><tr><th>Document / table</th><th>Rows</th><th>Requested by</th><th>Project manager</th><th>Request date</th>{closed && <th>Completed date</th>}<th>Status</th><th>Action</th></tr></thead>
      <tbody>{list.map((r) => <tr key={r.id}><td>{r.filename}<div className="small muted">{r.tableName}</div></td><td>{r.rows.length}</td><td>{name(r.requesterId)}</td><td>{name(r.reviewerId)}</td><td>{fmtDateTime(r.requestedAt)}</td>{closed && <td>{fmtDateTime(r.closedAt || r.reviewedAt)}</td>}<td>{r.status}</td><td><div className="btn-row"><button className="btn sm" onClick={() => open(r.id)}>View request</button>{!closed && <button className="btn primary sm" onClick={() => complete('Checked', r.id)}>Mark as checked</button>}</div></td></tr>)}</tbody>
    </table></div>
    }
  </section>;
  };

  return <>{view !== 'closed' && renderSection('Active Requests', activeRequests, false)}{view !== 'active' && renderSection('Closed Requests', matches, true)}</>;
}

import { useEffect, useRef, useState } from 'react';
import { Field, Empty, Modal } from '../components/ui.jsx';
import PdfDataChecks from '../components/PdfDataChecks.jsx';
import { useStore } from '../store/Store.jsx';
import { useSearchParams } from 'react-router-dom';
import { downloadFile } from '../lib/util.js';
import { createTablesWorkbook, parseDocumentTables } from '../lib/pdfTables.js';

export default function PdfToExcel() {
  const { state, user, run, A } = useStore();
  const [, setParams] = useSearchParams();
  const [selectedRows, setSelectedRows] = useState([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [checkNote, setCheckNote] = useState('');
  const managers = state.users.filter((u) => u.active && u.role === 'pm' && u.id !== user.id);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [ocrMode, setOcrMode] = useState('auto');
  const [mode, setMode] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [tables, setTables] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [section, setSection] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const controller = useRef(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = (selected) => {
    if (!selected) return;
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(selected.name)) { setError('Choose a PDF, PNG, JPG or WebP file.'); return; }
    if (selected.size > 100 * 1024 * 1024) { setError('Choose a file under 100 MB.'); return; }
    setFile(selected); setError(''); setResult(null); setTables([]); setSection(''); setPageIndex(0); setProgress(null); setSelectedRows([]); setRequestOpen(false);
  };
  const extract = async () => {
    if (!file || busy) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setResult(null); setTables([]); setSection(''); setPageIndex(0); setSelectedRows([]); setRequestOpen(false);
    setProgress({ page: 0, total: 0, message: 'Opening document…' });
    try {
      const { readPdfFile } = await import('../lib/readPdf.js');
      const output = await readPdfFile(file, { ocrMode, signal: abort.signal, onProgress: (p) => { if (mounted.current && !abort.signal.aborted) setProgress(p); } });
      if (!mounted.current || abort.signal.aborted) return;
      if (!output.lines.length) throw new Error('No readable text found. Try “OCR every page” or upload a clearer document.');
      const parsed = parseDocumentTables(output.lines, mode);
      setResult(output); setTables(parsed); setActiveId(parsed[0].id);
    } catch (err) {
      if (mounted.current) setError(abort.signal.aborted ? 'Reading cancelled. You can start again.' : err.name === 'PasswordException' ? 'This PDF is password protected. Upload an unlocked copy.' : `Could not read document: ${err.message}. If OCR files could not load, check your internet connection.`);
    } finally {
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  };
  const active = tables.find((t) => t.id === activeId);
  const sectionColumn = active && ['fields', 'source'].includes(active.id) ? 1 : -1;
  const sections = sectionColumn >= 0 ? [...new Set(active.rows.map((r) => r[sectionColumn]))] : [];
  const filtered = active?.rows.map((row, index) => ({ row, index })).filter(({ row }) => !section || sectionColumn < 0 || row[sectionColumn] === section) || [];
  const pageRows = filtered.slice(pageIndex * 50, (pageIndex + 1) * 50);
  const changeTable = (fn) => setTables((prev) => prev.map((t) => t.id === activeId ? fn(t) : t));
  const deleteRow = (index) => {
    changeTable((t) => ({ ...t, rows: t.rows.filter((_, i) => i !== index) }));
    setSelectedRows((rows) => rows.filter((i) => i !== index).map((i) => i > index ? i - 1 : i));
    setPageIndex((p) => Math.min(p, Math.max(0, Math.ceil((filtered.length - 1) / 50) - 1)));
  };
  const requestCheck = () => {
    const res = run(A.requestPdfDataCheck, {
      reviewerId, filename: file.name, tableName: active.name, columns: active.columns,
      rows: [...selectedRows].sort((a, b) => a - b).map((index) => ({ rowNumber: index + 1, values: active.rows[index] })), note: checkNote,
    }, { success: 'Data check requested. The project manager has been notified.' });
    if (res.ok) { setRequestOpen(false); setSelectedRows([]); setCheckNote(''); setParams({ check: res.id }); }
  };
  const moveBetweenCells = (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return;
    const input = event.target;
    if (!input.matches('td input, td button')) return;
    event.preventDefault();
    const cells = [...input.closest('tr').querySelectorAll('td input, td button:not(:disabled)')];
    const next = cells[cells.indexOf(input) + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) {
      next.focus({ preventScroll: true });
      if (next.matches('input:not([type="checkbox"])')) next.select();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };
  const exportExcel = async () => {
    setExporting(true); setError('');
    try {
      const buffer = await createTablesWorkbook(tables, file.name);
      if (mounted.current) downloadFile(file.name.replace(/\.[^.]+$/, '') + '-tables.xlsx', buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch { if (mounted.current) setError('Excel export failed. Please try again.'); }
    finally { if (mounted.current) setExporting(false); }
  };

  return <>
    <div className="page-head"><div><h1>PDF to Excel</h1><p className="muted">Turn purchase orders, scanned pages and document sections into editable tables.</p></div>
      <button className="btn primary" disabled={!tables.length || busy || exporting} onClick={exportExcel}>{exporting ? 'Preparing Excel…' : 'Download Excel (.xlsx)'}</button>
    </div>
    <PdfDataChecks view="active" />
    <div className="card">
      <div className="pdf-upload"><div><h2>1. Upload a document</h2><p className="muted small">PDF or image · Up to 100 MB · Files are processed in your browser.</p></div><input aria-label="Upload PDF or image" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={busy || exporting} onChange={(e) => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} /></div>
      {file && <p className="small"><strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(2)} MB <button className="btn sm" onClick={() => setShowPreview((v) => !v)}>{showPreview ? 'Hide source' : 'View source'}</button></p>}
      <div className="filters" style={{ marginTop: 16 }}>
        <Field label="Table format"><select aria-label="Table format" value={mode} disabled={busy} onChange={(e) => setMode(e.target.value)}><option value="auto">Auto: purchase order items + sections</option><option value="layout">Document rows and sections</option></select></Field>
        <Field label="Text recognition"><select aria-label="Text recognition" value={ocrMode} disabled={busy} onChange={(e) => setOcrMode(e.target.value)}><option value="auto">Automatic OCR for scanned pages</option><option value="always">OCR every page (mixed or scanned PDFs)</option><option value="never">PDF text only (fastest)</option></select></Field>
        <button className="btn primary" disabled={!file || busy || exporting} onClick={extract}>{tables.length ? 'Read document again' : 'Read document & create tables'}</button>
        {busy && <button className="btn" onClick={() => controller.current?.abort()}>Cancel</button>}
      </div>
      <p className="small muted">OCR reads English text and numbers. First use downloads recognition files and needs internet. Large scanned PDFs can take several minutes. Table edits stay here until you leave this section or read another document; download Excel to keep them.</p>
      {progress && <div className="alert info" role="status"><strong>{progress.total ? `Page ${progress.page} of ${progress.total}: ` : ''}</strong>{progress.message}<progress className="pdf-progress" max={Math.max(1, progress.total)} value={Math.max(0, progress.page - 1)} /></div>}
      {error && <div className="alert danger" role="alert">{error}</div>}
    </div>
    {showPreview && preview && <div className="card"><h2>Source document</h2>{file.type.startsWith('image/') ? <img src={preview} alt="Uploaded source document" className="pdf-source-image" /> : <object data={preview} type="application/pdf" className="pdf-preview"><a href={preview} target="_blank" rel="noreferrer">Open source PDF</a></object>}</div>}
    {result && active ? <div className="card">
      <div className="card-head"><div><h2>2. Review and edit tables</h2><p className="muted small">{result.pageInfo.length} page(s) read · {result.pageInfo.filter((p) => p.method === 'OCR').length} using OCR · {tables.reduce((n, t) => n + t.rows.length, 0)} extracted rows across {tables.length} sheets</p></div></div>
      <div className="alert warn">Check quantities, prices and descriptions against the source before using them. Missing values stay blank. OCR and unusual layouts may need corrections.</div>
      {result.pageInfo.some((p) => p.empty) && <div className="alert warn">No text found on page(s): {result.pageInfo.filter((p) => p.empty).map((p) => p.page).join(', ')}. Check those pages in the source document.</div>}
      {mode === 'auto' && !tables.some((t) => t.id === 'items') && <p className="small muted">No purchase order item markers were detected. Review the document rows and section fields below.</p>}
      <div className="btn-row" role="tablist" aria-label="Extracted tables">{tables.map((t) => <button key={t.id} role="tab" aria-selected={activeId === t.id} className={`btn ${activeId === t.id ? 'primary' : ''}`} onClick={() => { setActiveId(t.id); setSection(''); setPageIndex(0); if (activeId !== t.id) setSelectedRows([]); }}>{t.name} ({t.rows.length})</button>)}</div>
      <div className="filters" style={{ marginTop: 16 }}>
        {!!sections.length && <Field label="Section"><select aria-label="Filter section" value={section} onChange={(e) => { setSection(e.target.value); setPageIndex(0); }}><option value="">All sections</option>{sections.map((s) => <option key={s}>{s}</option>)}</select></Field>}
        <button className="btn sm" onClick={() => { changeTable((t) => ({ ...t, rows: [...t.rows, t.columns.map((_, i) => i === sectionColumn ? section : '')] })); setPageIndex(Math.floor(filtered.length / 50)); }}>+ Row</button>
        <button className="btn sm" onClick={() => changeTable((t) => ({ ...t, columns: [...t.columns, `New column ${t.columns.length + 1}`], rows: t.rows.map((r) => [...r, '']) }))}>+ Column</button>
        {!!selectedRows.length && <><span className="small">{selectedRows.length} row(s) selected</span><button className="btn primary" onClick={() => { setReviewerId(managers[0]?.id || ''); setCheckNote(''); setRequestOpen(true); }}>Request data check</button><button className="btn sm" onClick={() => setSelectedRows([])}>Clear selection</button></>}
      </div>
      <div className="table-wrap"><table className="pdf-table" onKeyDown={moveBetweenCells}><thead><tr><th>#</th>{active.columns.map((col, i) => <th key={i}><input aria-label={`Column ${i + 1} heading`} value={col} onChange={(e) => { const value = e.target.value; changeTable((t) => ({ ...t, columns: t.columns.map((v, c) => c === i ? value : v) })); }} /></th>)}<th>Action</th><th>Select for check</th></tr></thead>
        <tbody>{pageRows.map(({ row, index }) => <tr key={index}><td>{index + 1}</td>{active.columns.map((_, c) => <td key={c}><input aria-label={`Row ${index + 1}, ${active.columns[c]}`} value={row[c] ?? ''} onChange={(e) => { const value = e.target.value; changeTable((t) => ({ ...t, rows: t.rows.map((r, ri) => ri === index ? r.map((v, ci) => ci === c ? value : v) : r) })); }} /></td>)}<td><button className="btn sm" aria-label={`Delete row ${index + 1}`} onClick={() => deleteRow(index)}>Delete</button></td><td><input type="checkbox" aria-label={`Select row ${index + 1} for data check`} checked={selectedRows.includes(index)} onChange={(e) => setSelectedRows((rows) => e.target.checked ? [...rows, index] : rows.filter((i) => i !== index))} /></td></tr>)}</tbody></table></div>
      {!filtered.length && <Empty title="No rows in this section" />}
      <div className="pdf-pagination"><span className="small muted">{filtered.length ? `${pageIndex * 50 + 1}–${Math.min((pageIndex + 1) * 50, filtered.length)} of ${filtered.length} rows` : '0 rows'} · Excel includes all tables and rows, with your edits.</span><div className="btn-row"><button className="btn sm" disabled={pageIndex === 0} onClick={() => setPageIndex((p) => p - 1)}>Previous</button><button className="btn sm" disabled={(pageIndex + 1) * 50 >= filtered.length} onClick={() => setPageIndex((p) => p + 1)}>Next</button></div></div>
    </div> : !busy && <div className="card"><Empty title="Your document tables will appear here">Upload a PDF and select “Read document & create tables”. Purchase orders are grouped into item rows; source sections remain available in separate sheets.</Empty></div>}
    {requestOpen && <Modal title="Request data check" onClose={() => setRequestOpen(false)} footer={<><button className="btn" onClick={() => setRequestOpen(false)}>Cancel</button><button className="btn primary" disabled={!reviewerId || !selectedRows.length} onClick={requestCheck}>Send request</button></>}>
      <p>{selectedRows.length} selected row(s) from <strong>{file.name}</strong> · {active.name}</p>
      <p className="small">Rows: {[...selectedRows].sort((a, b) => a - b).map((i) => i + 1).join(', ')}</p>
      <Field label="Project manager" htmlFor="pdf-check-manager"><select id="pdf-check-manager" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}><option value="">Choose project manager</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></Field>
      {!managers.length && <p role="alert">No other active project manager is available. Add one in Administration to send a request.</p>}
      <Field label="What should they check?" htmlFor="pdf-check-note"><textarea id="pdf-check-note" value={checkNote} onChange={(e) => setCheckNote(e.target.value)} placeholder="For example: Check Quantity in row 3 and Gross price in row 5 against the purchase order." /></Field>
      <p className="small muted">The selected rows and their current values will be saved with the request date. The project manager will receive an in-app notification.</p>
    </Modal>}
  </>;
}

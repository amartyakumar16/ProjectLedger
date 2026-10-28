// Preserve page references and original lines so extracted values can be checked.
export function textItemsToLines(items, page) {
  const lines = [];
  for (const item of items.filter((i) => i.str?.trim())) {
    const x = item.transform[4];
    const y = item.transform[5];
    let line = lines.find((l) => Math.abs(l.y - y) < 3);
    if (!line) { line = { y, spans: [] }; lines.push(line); }
    line.spans.push({ text: item.str, x, width: item.width || 0 });
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => {
    const spans = line.spans.sort((a, b) => a.x - b.x);
    const cells = [];
    let end = -Infinity;
    for (const span of spans) {
      if (!cells.length || span.x - end > 14) cells.push(span.text);
      else cells[cells.length - 1] += ' ' + span.text;
      end = span.x + span.width;
    }
    return { page, cells, text: cells.join('  ') };
  });
}

export function ocrTextToLines(text, page) {
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => ({ page, text: line.trim(), cells: line.trim().split(/\t+| {2,}/) }));
}

const number = '([\\d,]+(?:\\.\\d+)?)';
const clean = (text) => text.replace(/^[\s:=>–—-]+/, '').trim();
const valueAfter = (text, label) => clean(text.replace(new RegExp('^.*?' + label + '\\s*', 'i'), ''));
const numeric = (text) => text === undefined ? '' : text.replace(/,/g, '');

export const ITEM_COLUMNS = ['Item no.', 'Material no.', 'Description', 'Quantity', 'Unit', 'Gross price', 'Amount', 'CGST %', 'CGST amount', 'SGST %', 'SGST amount', 'Item total', 'Delivery date', 'Unloading point'];
const NUMERIC_HEADERS = new Set(['Quantity', 'Gross price', 'Amount', 'CGST %', 'CGST amount', 'SGST %', 'SGST amount', 'Item total']);

function itemNumber(text) {
  const marker = text.match(/Item\s*(?:No\.?|Number)\s*[:=–—-]*\s*(.*)/i);
  if (!marker) return null;
  const token = marker[1].match(/^(\S+)/)?.[1] || '';
  return /^Total$/i.test(token) ? '' : token;
}

export function parseDocumentTables(lines, mode = 'auto') {
  const items = [];
  let item = null;
  let descriptionNext = false;
  let deliveryNext = false;
  for (const line of lines) {
    const text = line.text;
    const start = itemNumber(text);
    if (start !== null) {
      item = Object.fromEntries(ITEM_COLUMNS.map((key) => [key, '']));
      item['Item no.'] = start;
      items.push(item);
      descriptionNext = false;
      deliveryNext = false;
    }
    if (!item) continue;
    const qty = text.match(new RegExp('Total\\s*(?:Qty\\.?|Quantity)\\s*[:=–—-]*\\s*' + number + '\\s*([a-zA-Z²³]+)?', 'i'));
    if (qty) { item.Quantity = numeric(qty[1]); item.Unit = qty[2] || ''; }
    if (/Material\s*(?:No\.?|Number)\s*[:=–—-]/i.test(text)) item['Material no.'] = valueAfter(text, 'Material\\s*(?:No\\.?|Number)').split(/\s{2,}/)[0];
    if (/Material\s*Desc(?:ription)?\s*[:=–—-]/i.test(text)) item.Description = valueAfter(text, 'Material\\s*Desc(?:ription)?');
    else if (/PROJECT\s+MATERIAL\s+DESCRIPTION\s*:/i.test(text) && !item.Description) item.Description = valueAfter(text, 'PROJECT\\s+MATERIAL\\s+DESCRIPTION');
    else if (descriptionNext && !item.Description && !/^(?:Long Text|PROJECT|Additional|Item|Short text)/i.test(text)) { item.Description = text; descriptionNext = false; }
    if (/^Short\s*text\s*:?\s*$/i.test(text)) descriptionNext = true;
    if (/Gross\s+Price/i.test(text)) {
      const prices = [...text.matchAll(new RegExp(number + '\\s*(?:INR|INR\\b|Rs\\.?)', 'gi'))].map((m) => numeric(m[1]));
      if (prices.length) item['Gross price'] = prices[0];
      if (prices.length > 1) item.Amount = prices.at(-1);
    }
    for (const [pattern, rate, amount] of [[/(?:Central\s+GST|CGST)/i, 'CGST %', 'CGST amount'], [/(?:State\s+GST|SGST)/i, 'SGST %', 'SGST amount']]) {
      if (pattern.test(text)) {
        const percent = text.match(new RegExp(number + '\\s*%'));
        const money = text.match(new RegExp(number + '\\s*INR', 'i'));
        if (percent) item[rate] = numeric(percent[1]);
        if (money) item[amount] = numeric(money[1]);
      }
    }
    if (new RegExp('^\\s*' + number + '\\s*INR\\s*$', 'i').test(text)) item['Item total'] = numeric(text.match(new RegExp(number))[1]);
    if (/Delivery\s*date/i.test(text)) deliveryNext = true;
    else if (deliveryNext) {
      const date = text.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/);
      if (date) { item['Delivery date'] = date[0]; deliveryNext = false; }
    }
    if (/Unloading\s*Point\s*[:=–—-]/i.test(text)) item['Unloading point'] = valueAfter(text, 'Unloading\\s*Point');
  }

  const fields = [];
  let section = 'Document details';
  const source = [];
  for (const line of lines) {
    const text = line.text;
    if (/^(?:purchase order|order continuation sheet|detail description|long text|additional .*text|item charges|terms(?: and conditions)?|payment terms|delivery schedule)\s*:?$/i.test(text)) section = text.replace(/:$/, '');
    const start = itemNumber(text);
    if (start !== null) section = `Item ${start || '(unreadable number)'}`;
    source.push({ ...line, section });
    const parts = text.match(/^(.{2,65}?)\s*[:=]\s*(.+)$/);
    if (parts) fields.push([String(line.page), section, parts[1].trim(), clean(parts[2])]);
  }
  const maxCells = source.reduce((max, line) => Math.max(max, line.cells.length), 1);
  const tables = [];
  if (mode !== 'layout' && items.length) tables.push({ id: 'items', name: 'Purchase order items', columns: ITEM_COLUMNS, rows: items.map((i) => ITEM_COLUMNS.map((key) => i[key])) });
  if (fields.length) tables.push({ id: 'fields', name: 'Sections and fields', columns: ['Page', 'Section', 'Field', 'Value'], rows: fields });
  tables.push({ id: 'source', name: 'Document rows', columns: ['Page', 'Section', ...Array.from({ length: maxCells }, (_, i) => `Column ${i + 1}`)], rows: source.map((l) => [String(l.page), l.section, ...Array.from({ length: maxCells }, (_, i) => l.cells[i] || '')]) });
  return tables;
}

export async function createTablesWorkbook(tables, filename) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = 'ProjectLedger';
  const info = book.addWorksheet('Read me');
  info.addRow(['Source file', filename]);
  info.addRow(['Review', 'Automatically extracted data. Check source pages, especially OCR quantities and prices.']);
  info.columns = [{ width: 20 }, { width: 100 }];
  tables.forEach((table) => {
    const sheet = book.addWorksheet(table.name.slice(0, 31));
    sheet.addRow(table.columns);
    table.rows.forEach((row) => sheet.addRow(row.map((value, i) => {
      const str = String(value ?? '');
      return table.id === 'items' && NUMERIC_HEADERS.has(table.columns[i]) && /^\d+(?:\.\d+)?$/.test(str) && Number.isFinite(Number(str)) ? Number(str) : str;
    })));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F8A83' } };
    sheet.columns.forEach((col, i) => { col.width = /Description|Value|Column|Notes/.test(table.columns[i]) ? 50 : 22; col.alignment = { vertical: 'top', wrapText: true }; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (table.rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: table.rows.length + 1, column: table.columns.length } };
  });
  return book.xlsx.writeBuffer();
}

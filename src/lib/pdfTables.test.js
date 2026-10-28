import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createTablesWorkbook, ocrTextToLines, parseDocumentTables, textItemsToLines } from './pdfTables.js';

const fixture = [
  ...ocrTextToLines(`PURCHASE ORDER
Order No.: 2300081102/109
Item No. :- 00010 Total Qty :- 40.000Meter
Material No :- 587V00318
Material Desc :- Pipe 25, ERW to IS:1239 (Part-1), TSL
Delivery date     Delivery Quantity
12.11.2026     40.000 Meter
Unloading Point : TSG Eng & Proj
Gross Price     255.000 INR     10,200.000 INR
IN: Central GST     9.000 %     918.000 INR`, 1),
  ...ocrTextToLines(`Order Continuation Sheet
IN: State GST     9.000 %     918.000 INR
12,036.000 INR
Item No. :- 00020 Total Qty :- 60.000Meter
Material Desc :- Pipe 80
Gross Price     965.000 INR     57,900.000 INR`, 2),
];

describe('PDF table extraction', () => {
  it('groups text by page coordinates and preserves column gaps', () => {
    const span = (str, x, y, width) => ({ str, transform: [1, 0, 0, 1, x, y], width });
    expect(textItemsToLines([span('40', 200, 100, 12), span('Pipe', 10, 101, 20), span('25', 34, 100, 12), span('Next', 10, 80, 20)], 3)).toEqual([
      { page: 3, cells: ['Pipe 25', '40'], text: 'Pipe 25  40' },
      { page: 3, cells: ['Next'], text: 'Next' },
    ]);
  });

  it('extracts purchase order items spanning pages, prices, taxes and delivery', () => {
    const table = parseDocumentTables(fixture)[0];
    const items = table.rows.map((row) => Object.fromEntries(table.columns.map((col, i) => [col, row[i]])));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ 'Item no.': '00010', Quantity: '40.000', Unit: 'Meter', 'Material no.': '587V00318', 'Gross price': '255.000', Amount: '10200.000', 'CGST %': '9.000', 'SGST amount': '918.000', 'Item total': '12036.000', 'Delivery date': '12.11.2026' });
    expect(items[1]).toMatchObject({ 'Item no.': '00020', Quantity: '60.000', Description: 'Pipe 80', 'Item total': '' });
  });

  it('keeps unknown layouts and original section rows without inventing values', () => {
    const tables = parseDocumentTables(ocrTextToLines('PROJECT SUMMARY\nProject: Warehouse\nTerms and conditions\nPayment: 30 days\nUnrecognised text', 1));
    expect(tables.map((t) => t.id)).toEqual(['fields', 'source']);
    expect(tables[0].rows[1]).toEqual(['1', 'Terms and conditions', 'Payment', '30 days']);
    expect(tables[1].rows.at(-1)).toContain('Unrecognised text');
    expect(parseDocumentTables(fixture, 'layout').some((t) => t.id === 'items')).toBe(false);
  });

  it('keeps an item with an OCR-damaged number separate from the previous item', () => {
    const lines = ocrTextToLines('Item No. :- 00010 Total Qty :- 40.000 Meter\nItem No. :- @@@20 Total Qty :- 60.000 Meter', 1);
    const table = parseDocumentTables(lines)[0];
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][3]).toBe('40.000');
    expect(table.rows[1][0]).toBe('@@@20');
    expect(table.rows[1][3]).toBe('60.000');
  });

  it('exports a real XLSX with numeric quantities, preserved identifiers and edited values', async () => {
    const tables = parseDocumentTables(fixture);
    tables[0].rows[0][2] = 'Corrected description';
    const buffer = await createTablesWorkbook(tables, 'purchase-order.pdf');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    expect(book.worksheets).toHaveLength(tables.length + 1);
    const items = book.getWorksheet('Purchase order items');
    expect(items.columnCount).toBe(14);
    expect(items.getCell('A2').value).toBe('00010');
    expect(items.getCell('C2').value).toBe('Corrected description');
    expect(items.getCell('D2').value).toBe(40);
    expect(items.getCell('L2').value).toBe(12036);
    expect(book.getWorksheet('Document rows').rowCount).toBe(fixture.length + 1);
  });
});

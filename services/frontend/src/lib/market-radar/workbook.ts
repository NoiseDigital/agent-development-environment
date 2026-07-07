// Dependency-free multi-sheet Excel export via SpreadsheetML 2003 (.xls) — a
// single XML file Excel/Sheets open as a real multi-tab workbook, no bundler
// deps or zip step. Used for Market Radar's "full workbook" client deliverable.

export interface Sheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

const xmlEsc = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Excel worksheet names: ≤ 31 chars, and none of : \ / ? * [ ].
const safeSheetName = (name: string, i: number): string => {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${i + 1}`;
};

function cell(v: string | number): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEsc(String(v))}</Data></Cell>`;
}

function worksheet(sheet: Sheet, i: number): string {
  const header =
    '<Row>' +
    sheet.columns
      .map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xmlEsc(c)}</Data></Cell>`)
      .join('') +
    '</Row>';
  const body = sheet.rows.map((r) => '<Row>' + r.map(cell).join('') + '</Row>').join('');
  return (
    `<Worksheet ss:Name="${xmlEsc(safeSheetName(sheet.name, i))}">` +
    `<Table>${header}${body}</Table></Worksheet>`
  );
}

/** Build the SpreadsheetML document text for a set of sheets. */
export function buildWorkbookXml(sheets: Sheet[]): string {
  return (
    '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/>' +
    '<Interior ss:Color="#EEEEEE" ss:Pattern="Solid"/></Style></Styles>' +
    sheets.map(worksheet).join('') +
    '</Workbook>'
  );
}

/** Trigger a browser download of the workbook as an .xls file. */
export function downloadWorkbook(filename: string, sheets: Sheet[]): void {
  const blob = new Blob([buildWorkbookXml(sheets)], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

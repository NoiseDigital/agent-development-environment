// Client-side download helpers for the Analyze page — the correlation result is
// already in the browser, so exports are pure (no extra round-trip).

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv<T extends object>(rows: readonly T[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0] as Record<string, unknown>);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.join(','),
    ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(',')),
  ].join('\n');
}

export function downloadCsv<T extends object>(filename: string, rows: readonly T[]): void {
  download(filename, toCsv(rows), 'text/csv;charset=utf-8');
}

export function downloadJson(filename: string, obj: unknown): void {
  download(filename, JSON.stringify(obj, null, 2), 'application/json');
}

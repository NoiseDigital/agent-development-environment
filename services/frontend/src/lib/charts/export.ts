// Pure helpers used by the chart kebab (ChartActions) to derive export
// filenames + CSV bodies from a Vega-Lite spec. Pulled out of the
// component so the format/escaping rules are unit-testable — silent
// regressions in CSV escaping are easy to miss in a visual review.

import type { VegaSpec } from '../../types/genui';

/** A Vega-Lite spec's title may be a bare string OR a `{ text }` object. */
export function specTitle(spec: VegaSpec): string {
  const t = spec.title;
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object' && typeof (t as { text?: unknown }).text === 'string') {
    return (t as { text: string }).text;
  }
  return 'chart';
}

/** Slugify a chart title for use as a download filename. Falls back to
 *  "chart" when the input strips to empty (all-punctuation, all-unicode-
 *  dashes, etc.) — without the second guard, downloads ended up named
 *  just `.png` / `.csv`. */
export function slug(s: string): string {
  const out = (s || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return out || 'chart';
}

/** Flatten a Vega-Lite spec's inline `data.values` to a CSV string.
 *  Returns '' for specs without inline data (URL-loaded specs, layered
 *  specs whose data lives on inner layers, etc.) — caller handles UX. */
export function chartToCsv(spec: VegaSpec): string {
  const values = (spec.data as { values?: unknown[] } | undefined)?.values;
  if (!Array.isArray(values) || values.length === 0) return '';
  const rows = values as Record<string, unknown>[];
  const keys = Object.keys(rows[0]);
  // RFC-4180-ish escaping: wrap in quotes if the value contains a comma,
  // quote, or newline; double up any interior quotes.
  const cell = (v: unknown) =>
    typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '';
  return [
    keys.join(','),
    ...rows.map((row) => keys.map((k) => cell(row[k])).join(',')),
  ].join('\n');
}

// The control surface for agent-generated charts. A Vega-Lite spec is an open
// grammar — but the agent's vocabulary is exactly what this allowlist says it
// is, no more. This is the analogue of the fixed ChartType union, except it's
// data you widen or narrow without touching a renderer. Every spec passes
// through checkVegaSpec before it reaches the screen (see VegaChart).

import type { VegaSpec } from '../types/genui';

/** Mark types the agent is permitted to use. Narrow this to lock things down
 *  (e.g. just bar/line/area to mirror today's charts); widen it to open up. */
const ALLOWED_MARKS = new Set([
  'bar', 'line', 'area', 'point', 'circle', 'square', 'rule', 'tick', 'text', 'arc',
]);

/** Inline data is capped — an agent can't drop a 100k-row payload into the UI. */
const MAX_DATA_ROWS = 5000;

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Collect every mark used anywhere in the spec — layers, facets, concats. */
function collectMarks(node: unknown, out: Set<string>): void {
  const o = asObject(node);
  if (!o) return;
  if (o.mark !== undefined) {
    const mark = typeof o.mark === 'string' ? o.mark : asObject(o.mark)?.type;
    if (typeof mark === 'string') out.add(mark);
  }
  for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) {
    const arr = o[key];
    if (Array.isArray(arr)) arr.forEach((child) => collectMarks(child, out));
  }
  if (o.spec) collectMarks(o.spec, out); // facet / repeat inner view
}

/** Sum the rows of every inline dataset in the spec. */
function countInlineRows(node: unknown): number {
  const o = asObject(node);
  if (!o) return 0;
  let total = 0;
  const data = asObject(o.data);
  if (data && Array.isArray(data.values)) total += data.values.length;
  for (const value of Object.values(o)) {
    if (Array.isArray(value)) value.forEach((v) => (total += countInlineRows(v)));
    else if (asObject(value)) total += countInlineRows(value);
  }
  return total;
}

/** Validate a Vega-Lite spec against the platform's allowlist. A chart only
 *  renders if this passes — the agent cannot draw outside these lines. */
export function checkVegaSpec(spec: VegaSpec): GuardResult {
  const marks = new Set<string>();
  collectMarks(spec, marks);
  if (marks.size === 0) return { ok: false, reason: 'no chart mark found' };
  for (const mark of marks) {
    if (!ALLOWED_MARKS.has(mark)) return { ok: false, reason: `mark "${mark}" is not on the allowlist` };
  }
  if (countInlineRows(spec) > MAX_DATA_ROWS) {
    return { ok: false, reason: `inline data exceeds ${MAX_DATA_ROWS} rows` };
  }
  return { ok: true };
}

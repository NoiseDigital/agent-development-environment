// Vega templates — deterministic spec builders the analyst agent can target
// instead of routing through VegaChartsAgent. For the 80% of chart turns
// that fit one of these shapes, the root agent emits a
// `{component: "templated_chart", props: {shape, rows, title, …}}` envelope
// and the frontend resolves it into a real `chart` block at render time.
//
// Why this exists:
//   The old path was: root LLM → BQ tool → root LLM resumes → VegaChartsAgent
//   (a SECOND LLM call) → root returns verbatim. The second LLM call costs
//   ~1.5-2s per chart turn and produces specs that — for common shapes —
//   look identical to what a deterministic template would. Templates skip
//   that second LLM call entirely. Novel / custom-encoding shapes still
//   route through VegaChartsAgent.
//
// Shape vocabulary (kept narrow on purpose — adding a shape means committing
// to its template's stylistic choices):
//   - weekly_trend : single metric over time (date-ish x, numeric y).
//   - bar_by_dim   : single metric across categories (sorted, hover highlight).
//   - pareto       : 80/20 bars + cumulative-share line (auto-sorts + computes
//                    `share` and `cum` from `{name, value}` rows).
//
// Rows are ALWAYS `{name, value}` so the agent doesn't have to learn a
// per-shape schema. valueFormat is a `$` / `%` / '' hint that propagates
// to axis + tooltip formatting via the existing compactNum formatter.

import {
  barSpec,
  paretoSpec,
  singleMetricLineSpec,
} from './vega-specs';
import type { VegaSpec } from '../types/genui';

export type TemplatedShape = 'weekly_trend' | 'bar_by_dim' | 'pareto';

export interface TemplatedChartProps {
  /** Which template to apply. Unknown shapes throw — kept narrow on purpose. */
  shape: TemplatedShape;
  /** Title shown above the chart. */
  title?: string;
  /** Data rows. All templates accept `{name, value}` so the agent doesn't
   *  have to learn a per-shape schema. */
  rows: { name: string; value: number }[];
  /** Format hint: `$` for currency, `%` for percent, `''` for plain compact. */
  valueFormat?: string;
}

/** Apply a template to the props and return a Vega-Lite spec. Pure — same
 *  input always produces the same spec, so re-rendering is cheap and the
 *  result is stable for the dashboard's `enrichAgentSpec` post-processing. */
export function applyTemplate(props: TemplatedChartProps): VegaSpec {
  const { shape, title, rows, valueFormat } = props;
  switch (shape) {
    case 'weekly_trend':
      return singleMetricLineSpec({
        title,
        data: rows,
        valueFormat,
        xType: 'temporal',
      });

    case 'bar_by_dim':
      return barSpec({
        title,
        data: rows,
        valueFormat,
      });

    case 'pareto': {
      // Pareto needs sorted rows + per-row `share` and `cum`. Compute them
      // here so the agent only has to emit `{name, value}` rows — same
      // shape as every other template.
      const total = rows.reduce((s, r) => s + r.value, 0) || 1;
      const sorted = [...rows].sort((a, b) => b.value - a.value);
      let runningShare = 0;
      const enriched = sorted.map((r) => {
        const share = r.value / total;
        runningShare += share;
        return { ...r, share, cum: runningShare };
      });
      return paretoSpec({ title, data: enriched, valueFormat });
    }

    default: {
      // Exhaustive — TypeScript yells if a new shape is added without a case.
      const _exhaustive: never = shape;
      throw new Error(`Unknown templated chart shape: ${String(_exhaustive)}`);
    }
  }
}

/** Tolerant prop coercion — the agent emits JSON so we get plain objects.
 *  This narrows the unknown payload to a `TemplatedChartProps` (or null if
 *  the payload is malformed). Defensive: a bad payload renders nothing
 *  rather than crashing the bubble. */
export function coerceTemplatedChartProps(input: unknown): TemplatedChartProps | null {
  if (!input || typeof input !== 'object') return null;
  const p = input as Partial<TemplatedChartProps>;
  if (p.shape !== 'weekly_trend' && p.shape !== 'bar_by_dim' && p.shape !== 'pareto') {
    return null;
  }
  if (!Array.isArray(p.rows)) return null;
  const cleanRows = p.rows
    .filter(
      (r): r is { name: string; value: number } =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as { name?: unknown }).name === 'string' &&
        typeof (r as { value?: unknown }).value === 'number',
    );
  if (cleanRows.length === 0) return null;
  return {
    shape: p.shape,
    rows: cleanRows,
    title: typeof p.title === 'string' ? p.title : undefined,
    valueFormat: typeof p.valueFormat === 'string' ? p.valueFormat : undefined,
  };
}

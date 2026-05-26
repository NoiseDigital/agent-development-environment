// Post-process Vega-Lite specs the agent emits so they match dashboard
// quality — without making the agent prompt longer + brittle.
//
// Agent-emitted specs tend to be minimal: a mark + an encoding + a flat
// tooltip list. We enrich them at render time with:
//
//   - `formatType: 'compactNum'` on every quantitative axis + tooltip that
//     doesn't already specify one (K/M/B + $ / % rules — same as dashboards).
//   - A `$` format hint for fields whose name suggests currency (spend, cost,
//     budget, cpc/cpm/cpa).
//   - A crosshair rule + hover param overlay on line charts that don't
//     already have one — same crosshair the dashboard trend tile uses.

import type { VegaSpec } from '../types/genui';

const CURRENCY_FIELDS = /^(total_)?(spend|cost|budget|cpa|cpc|cpm)$/i;
const PERCENT_FIELDS = /^(ctr|cvr|vcr|rate|share|engagement)$/i;

function inferFormat(field: string | undefined, existing?: string): string {
  if (existing) return existing;
  if (!field) return '';
  if (CURRENCY_FIELDS.test(field)) return '$';
  if (PERCENT_FIELDS.test(field)) return '%';
  return '';
}

interface Channel {
  type?: string;
  field?: string;
  axis?: { format?: string; formatType?: string } & Record<string, unknown>;
  format?: string;
  formatType?: string;
  [k: string]: unknown;
}

function enrichChannel(ch: unknown): Channel | undefined {
  if (!ch || typeof ch !== 'object') return ch as undefined;
  const c = ch as Channel;
  if (c.type !== 'quantitative') return c;
  const field = c.field;
  const next: Channel = { ...c };
  const axis = (c.axis ?? {}) as { format?: string; formatType?: string };
  next.axis = {
    ...axis,
    format: inferFormat(field, axis.format),
    formatType: axis.formatType ?? 'compactNum',
  };
  return next;
}

function enrichTooltips(tooltip: unknown): unknown {
  if (!Array.isArray(tooltip)) return tooltip;
  return tooltip.map((t) => {
    if (!t || typeof t !== 'object') return t;
    const tt = t as Channel;
    if (tt.type !== 'quantitative') return tt;
    return {
      ...tt,
      format: inferFormat(tt.field, tt.format),
      formatType: tt.formatType ?? 'compactNum',
    };
  });
}

function enrichEncoding(encoding: unknown): Record<string, unknown> | undefined {
  if (!encoding || typeof encoding !== 'object') return encoding as undefined;
  const enc = encoding as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(enc)) {
    if (key === 'tooltip') {
      out[key] = enrichTooltips(value);
    } else {
      out[key] = enrichChannel(value);
    }
  }
  return out;
}

/** Returns true when the spec is a temporal-x line chart that doesn't
 *  already have a `hover` param — i.e. a candidate for crosshair injection.
 *  Returns false for already-layered specs (we've already wrapped them). */
function isLineChartWithoutHover(spec: Record<string, unknown>): boolean {
  if (Array.isArray(spec.layer)) return false; // already a layered spec
  const mark = spec.mark as { type?: string } | string | undefined;
  const markType = typeof mark === 'string' ? mark : mark?.type;
  if (markType !== 'line') return false;
  const encoding = spec.encoding as Record<string, unknown> | undefined;
  const x = encoding?.x as { type?: string } | undefined;
  if (x?.type !== 'temporal') return false;
  const params = spec.params as Array<{ name?: string }> | undefined;
  return !params?.some((p) => p.name === 'hover');
}

/** Wrap a flat line spec into a layered spec with a crosshair rule overlay.
 *  Same shape as `singleMetricLineSpec` in lib/vega-specs.ts. */
function withCrosshair(spec: Record<string, unknown>): Record<string, unknown> {
  const encoding = spec.encoding as Record<string, unknown>;
  const xField = (encoding?.x as { field?: string })?.field ?? 'name';
  const tooltip = encoding?.tooltip;
  // The line layer keeps the original encoding minus tooltip (which moves
  // onto the crosshair rule so the hover lands at the nearest point).
  const { tooltip: _omit, ...lineEncoding } = encoding ?? {};
  void _omit;
  // Strip the top-level mark + encoding — a layered Vega-Lite spec carries
  // them inside its layers, not on the outer object. Leaving them there
  // would also re-trigger this wrapper on a second enrich pass.
  const { mark: _m, encoding: _e, ...rest } = spec;
  void _m;
  void _e;
  return {
    ...rest,
    layer: [
      {
        mark: { type: 'line', point: true },
        encoding: lineEncoding,
      },
      {
        mark: { type: 'rule', color: '#a1a1aa', strokeWidth: 1 },
        encoding: {
          opacity: {
            condition: { param: 'hover', empty: false, value: 0.6 },
            value: 0,
          },
          ...(tooltip ? { tooltip } : {}),
        },
        params: [
          {
            name: 'hover',
            select: {
              type: 'point',
              fields: [xField],
              nearest: true,
              on: 'mouseover',
              clear: 'mouseout',
            },
          },
        ],
      },
    ],
  };
}

/** The public entry point. Idempotent — re-running it on an already-enriched
 *  spec is a no-op. Defensive against weird shapes; on any error returns
 *  the input unchanged so a malformed spec falls back to plain rendering. */
export function enrichAgentSpec(spec: VegaSpec): VegaSpec {
  return enrich(spec, /* nested */ false);
}

function enrich(spec: VegaSpec, nested: boolean): VegaSpec {
  try {
    const s = spec as Record<string, unknown>;
    let out: Record<string, unknown> = { ...s };
    if (s.encoding) out.encoding = enrichEncoding(s.encoding);
    // Recurse into layered specs — but flag the recursion so we don't
    // re-wrap an inner line layer with another crosshair.
    if (Array.isArray(s.layer)) {
      out.layer = s.layer.map((layer) => enrich(layer as VegaSpec, true));
    }
    if (!nested && isLineChartWithoutHover(out)) {
      out = withCrosshair(out);
    }
    return out as VegaSpec;
  } catch {
    return spec;
  }
}

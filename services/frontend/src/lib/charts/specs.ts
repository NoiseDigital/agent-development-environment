// Vega-Lite spec builders — the deterministic charts the dashboards and the
// Analyze page generate from the media model. The agent emits its own Vega-Lite
// specs directly; these builders keep the code-defined charts terse and
// consistent. Theming (colors, axes, fonts) comes from vega-theme via VegaChart;
// these builders only describe data + marks + encoding.

import type { VegaSpec } from '../../types/genui';

type Row = Record<string, string | number>;

/** A two-metric line chart on independent left/right Y axes — for pairing
 *  series of different scales (e.g. spend vs. impressions).
 *
 *  Hover behavior: a vertical rule snaps to the nearest x-value and the
 *  tooltip shows BOTH metrics for that date — the typical "crosshair" pattern
 *  Vega-Lite supports natively via a `point` selection with `nearest: true`. */
export function dualAxisLineSpec(opts: {
  title: string;
  data: Row[];
  left: string;
  right: string;
}): VegaSpec {
  const LEFT_COLOR = '#10b981';
  const RIGHT_COLOR = '#3b82f6';
  // One mark per metric. The point shares the line color so the legend dot
  // and the hovered marker read as the same series at a glance.
  const line = (field: string, color: string) => ({
    mark: {
      type: 'line',
      color,
      strokeWidth: 2.5,
      interpolate: 'monotone',
      // `point: true` would inherit the line color, but stating it explicitly
      // documents the contract and lets us size the marker independently.
      point: { color, filled: true, size: 45 },
    },
    encoding: {
      y: {
        field,
        type: 'quantitative',
        title: field,
        axis: { format: ',.2s', titleColor: color },
      },
    },
  });
  return {
    ...(opts.title ? { title: opts.title } : {}),
    data: { values: opts.data },
    encoding: {
      x: { field: 'name', type: 'nominal', title: null, axis: { labelAngle: 0, labelOverlap: true } },
    },
    layer: [
      line(opts.left, LEFT_COLOR),
      line(opts.right, RIGHT_COLOR),
      // Crosshair overlay — a transparent rule that snaps to the nearest x
      // and a tooltip that lists both metrics for that x value. The rule
      // shows on hover only (opacity goes from 0 → 1 inside the selection).
      {
        mark: { type: 'rule', color: '#a1a1aa', strokeWidth: 1 },
        encoding: {
          opacity: {
            condition: { param: 'hover', empty: false, value: 0.6 },
            value: 0,
          },
          tooltip: [
            { field: 'name', title: 'Week' },
            { field: opts.left, type: 'quantitative', format: ',.0f' },
            { field: opts.right, type: 'quantitative', format: ',.0f' },
          ],
        },
        params: [
          {
            name: 'hover',
            select: { type: 'point', fields: ['name'], nearest: true, on: 'mouseover', clear: 'mouseout' },
          },
        ],
      },
    ],
    resolve: { scale: { y: 'independent' } },
  };
}

/** A single-metric trend line. Renders the line + points styled by the
 *  Vega theme, plus a crosshair overlay: on hover, a faint vertical rule
 *  snaps to the nearest x value and a dark tooltip shows the date + value.
 *
 *  Format note: every quantitative axis / tooltip sets
 *  `formatType: 'compactNum'` explicitly — Vega-Lite's `customFormatTypes`
 *  config only takes effect when the channel asks for it by name. Without
 *  this, axis labels degrade to d3's lowercase-k SI format instead of the
 *  platform's K/M/B + $ / % rules. */
export function singleMetricLineSpec(opts: {
  title?: string;
  // `name` + `value` are the only fields the spec reads; extra columns on a
  // row are ignored. Loose readonly shape so the BQ tools' typed `NamedValue`
  // / `SeriesPoint` arrays can be passed without copying.
  data: readonly { name: string; value: number }[];
  /** Format hint passed to compactNum: `$` prefixes currency, `%` renders
   *  as percent, anything else is plain compact. Defaults to plain. */
  valueFormat?: string;
  /** Temporal for date-shaped names; nominal for already-bucketed labels. */
  xType?: 'temporal' | 'nominal';
  /** Tooltip label for the x field — "Week", "Day", "Date". */
  xTitle?: string;
  /** Optional flight bands rendered behind the line. */
  windows?: readonly { name: string; start_date: string; end_date: string }[];
}): VegaSpec {
  const xType = opts.xType ?? 'temporal';
  const xTitle = opts.xTitle ?? 'Date';
  const fmt = opts.valueFormat ?? '';
  return {
    ...(opts.title ? { title: opts.title } : {}),
    data: { values: opts.data },
    encoding: {
      x: { field: 'name', type: xType, title: null, axis: { labelOverlap: true } },
    },
    layer: [
      ...flightBandLayers(opts.windows ?? []),
      {
        mark: { type: 'line', point: true },
        encoding: {
          y: {
            field: 'value',
            type: 'quantitative',
            title: null,
            axis: { format: fmt, formatType: 'compactNum' },
          },
        },
      },
      {
        mark: { type: 'rule', color: '#a1a1aa', strokeWidth: 1 },
        encoding: {
          opacity: {
            condition: { param: 'hover', empty: false, value: 0.6 },
            value: 0,
          },
          tooltip: [
            { field: 'name', type: xType, title: xTitle },
            { field: 'value', type: 'quantitative', format: fmt, formatType: 'compactNum', title: 'Value' },
          ],
        },
        params: [
          {
            name: 'hover',
            select: { type: 'point', fields: ['name'], nearest: true, on: 'mouseover', clear: 'mouseout' },
          },
        ],
      },
    ],
  };
}

/** Flight-band overlay — faint rect per campaign window. Labels are NOT
 *  drawn inside the chart (they overlap when campaigns share a window);
 *  the caller renders a separate legend strip beneath the chart instead. */
function flightBandLayers(
  windows: readonly { name: string; start_date: string; end_date: string }[],
): Record<string, unknown>[] {
  if (!windows || windows.length === 0) return [];
  return [
    {
      data: { values: windows },
      mark: { type: 'rect', opacity: 0.08, color: '#10b981', tooltip: true },
      encoding: {
        x: { field: 'start_date', type: 'temporal' },
        x2: { field: 'end_date', type: 'temporal' },
        tooltip: [
          { field: 'name', title: 'Campaign' },
          { field: 'start_date', type: 'temporal', title: 'Start' },
          { field: 'end_date', type: 'temporal', title: 'End' },
        ],
      },
    },
  ];
}

/** Two-metric line chart on independent left/right Y axes. Both axes use
 *  `compactNum` formatting. The crosshair tooltip shows BOTH metrics for
 *  the hovered x. Optional `windows` array overlays a faint shaded band per
 *  campaign so spikes/dips are interpretable against the flight schedule. */
export function dualMetricLineSpec(opts: {
  title?: string;
  data: readonly Record<string, string | number>[];
  /** Field name for the primary metric (left axis). */
  primary: { field: string; label: string; format?: string; color?: string };
  /** Field name for the secondary metric (right axis). */
  secondary: { field: string; label: string; format?: string; color?: string };
  xType?: 'temporal' | 'nominal';
  xTitle?: string;
  /** Optional flight bands rendered behind the lines. */
  windows?: readonly { name: string; start_date: string; end_date: string }[];
}): VegaSpec {
  const xType = opts.xType ?? 'temporal';
  const xTitle = opts.xTitle ?? 'Date';
  const PRIMARY_COLOR = opts.primary.color ?? '#10b981';
  const SECONDARY_COLOR = opts.secondary.color ?? '#3b82f6';
  const line = (
    field: string,
    color: string,
    label: string,
    format: string | undefined,
  ) => ({
    mark: {
      type: 'line',
      color,
      strokeWidth: 2.5,
      interpolate: 'monotone',
      point: { color, filled: true, size: 45 },
    },
    encoding: {
      y: {
        field,
        type: 'quantitative',
        title: label,
        axis: {
          format: format ?? '',
          formatType: 'compactNum',
          titleColor: color,
        },
      },
    },
  });
  return {
    ...(opts.title ? { title: opts.title } : {}),
    data: { values: opts.data },
    encoding: {
      x: { field: 'name', type: xType, title: null, axis: { labelOverlap: true } },
    },
    layer: [
      // Flight bands go in FIRST so the lines render on top — the band is a
      // background hint, not a visual focus.
      ...flightBandLayers(opts.windows ?? []),
      line(opts.primary.field, PRIMARY_COLOR, opts.primary.label, opts.primary.format),
      line(opts.secondary.field, SECONDARY_COLOR, opts.secondary.label, opts.secondary.format),
      {
        mark: { type: 'rule', color: '#a1a1aa', strokeWidth: 1 },
        encoding: {
          opacity: {
            condition: { param: 'hover', empty: false, value: 0.6 },
            value: 0,
          },
          tooltip: [
            { field: 'name', type: xType, title: xTitle },
            {
              field: opts.primary.field,
              type: 'quantitative',
              format: opts.primary.format ?? '',
              formatType: 'compactNum',
              title: opts.primary.label,
            },
            {
              field: opts.secondary.field,
              type: 'quantitative',
              format: opts.secondary.format ?? '',
              formatType: 'compactNum',
              title: opts.secondary.label,
            },
          ],
        },
        params: [
          {
            name: 'hover',
            select: { type: 'point', fields: ['name'], nearest: true, on: 'mouseover', clear: 'mouseout' },
          },
        ],
      },
    ],
    resolve: { scale: { y: 'independent' } },
  };
}

/** A single-metric comparison bar chart, sorted by value descending. Hovered
 *  bars stay vivid; the rest dim, drawing the eye to the focused category.
 *  Axis + tooltip use `compactNum` (explicit formatType) for K/M/B + $. */
export function barSpec(opts: {
  title?: string;
  data: { name: string; value: number }[];
  /** Format hint for compactNum: '$' for currency, '%' for percent. */
  valueFormat?: string;
}): VegaSpec {
  const fmt = opts.valueFormat ?? '$';
  return {
    ...(opts.title ? { title: opts.title } : {}),
    data: { values: opts.data },
    mark: { type: 'bar', cursor: 'pointer' },
    encoding: {
      x: { field: 'name', type: 'nominal', sort: '-y', title: null, axis: { labelAngle: 0, labelOverlap: true } },
      y: {
        field: 'value',
        type: 'quantitative',
        title: null,
        axis: { format: fmt, formatType: 'compactNum' },
      },
      opacity: {
        condition: { param: 'highlight', empty: true, value: 1 },
        value: 0.45,
      },
      tooltip: [
        { field: 'name', title: 'Name' },
        {
          field: 'value',
          type: 'quantitative',
          format: fmt,
          formatType: 'compactNum',
          title: 'Value',
        },
      ],
    },
    params: [
      {
        name: 'highlight',
        select: { type: 'point', on: 'mouseover', clear: 'mouseout' },
      },
    ],
  };
}

/** A stacked bar — share-of-voice by brand within each market (normalized to
 *  100%), or support-band counts per market. `category` is the x-axis group,
 *  `series` is the stack color. Set `normalize` for share (% axis). */
export function stackedBarSpec(opts: {
  title?: string;
  subtitle?: string;
  data: { category: string; series: string; value: number }[];
  categoryLabel?: string;
  seriesLabel?: string;
  /** compactNum format for the raw value (counts/spend); ignored when normalized. */
  valueFormat?: string;
  normalize?: boolean;
}): VegaSpec {
  const fmt = opts.valueFormat;
  return {
    ...(opts.title
      ? { title: opts.subtitle ? { text: opts.title, subtitle: opts.subtitle } : opts.title }
      : {}),
    data: { values: opts.data },
    mark: { type: 'bar', cursor: 'pointer' },
    encoding: {
      x: {
        field: 'category',
        type: 'nominal',
        title: opts.categoryLabel ?? null,
        axis: { labelAngle: 0, labelOverlap: true },
      },
      y: {
        field: 'value',
        type: 'quantitative',
        stack: opts.normalize ? 'normalize' : 'zero',
        title: null,
        axis: opts.normalize
          ? { format: '.0%' }
          : { ...(fmt ? { format: fmt } : {}), formatType: 'compactNum' },
      },
      color: { field: 'series', type: 'nominal', title: opts.seriesLabel ?? null },
      order: { field: 'value', type: 'quantitative', sort: 'descending' },
      tooltip: [
        { field: 'category', title: opts.categoryLabel ?? 'Group' },
        { field: 'series', title: opts.seriesLabel ?? 'Series' },
        {
          field: 'value',
          type: 'quantitative',
          ...(opts.normalize
            ? { format: '.1%' }
            : { ...(fmt ? { format: fmt } : {}), formatType: 'compactNum' }),
          title: 'Value',
        },
      ],
    },
  };
}

/** A low–high estimate range per category with a base-estimate tick. Horizontal
 *  so long brand/market names fit. Communicates that the spend estimate is a
 *  directional band, not a point. */
export function rangeBarSpec(opts: {
  title?: string;
  subtitle?: string;
  data: { name: string; low: number; base: number; high: number }[];
  valueFormat?: string;
}): VegaSpec {
  const fmt = opts.valueFormat ?? '$';
  return {
    ...(opts.title
      ? { title: opts.subtitle ? { text: opts.title, subtitle: opts.subtitle } : opts.title }
      : {}),
    data: { values: opts.data },
    encoding: { y: { field: 'name', type: 'nominal', sort: '-x', title: null } },
    layer: [
      {
        mark: { type: 'bar', opacity: 0.3, cornerRadius: 3 },
        encoding: {
          x: {
            field: 'low',
            type: 'quantitative',
            title: null,
            axis: { format: fmt, formatType: 'compactNum' },
          },
          x2: { field: 'high' },
          tooltip: [
            { field: 'name', title: 'Name' },
            { field: 'low', type: 'quantitative', format: fmt, formatType: 'compactNum', title: 'Low' },
            { field: 'base', type: 'quantitative', format: fmt, formatType: 'compactNum', title: 'Base' },
            { field: 'high', type: 'quantitative', format: fmt, formatType: 'compactNum', title: 'High' },
          ],
        },
      },
      {
        mark: { type: 'tick', thickness: 2.5, size: 18, color: '#a1a1aa' },
        encoding: { x: { field: 'base', type: 'quantitative' } },
      },
    ],
  };
}

/** A forecast fan chart — a modeled history line, a dashed central projection,
 *  and nested 80/90/95% prediction-interval bands. Communicates that the
 *  forecast is a widening cone of uncertainty, not a single line. */
export function forecastFanSpec(opts: {
  title?: string;
  subtitle?: string;
  history: { month: string; value: number }[];
  forecast: {
    month: string;
    central: number;
    lo80: number; hi80: number;
    lo90: number; hi90: number;
    lo95: number; hi95: number;
  }[];
  valueFormat?: string;
}): VegaSpec {
  const fmt = opts.valueFormat ?? '$';
  const yAxis = fmt === '%' ? { format: '.0%' } : { format: fmt, formatType: 'compactNum' };
  const valTip =
    fmt === '%' ? { format: '.1%' } : { format: fmt, formatType: 'compactNum' };
  const band = (lo: string, hi: string, opacity: number) => ({
    data: { values: opts.forecast },
    mark: { type: 'area', opacity, color: '#9ca3af' },
    encoding: {
      x: { field: 'month', type: 'temporal', title: null },
      y: { field: lo, type: 'quantitative' },
      y2: { field: hi },
    },
  });
  return {
    ...(opts.title
      ? { title: opts.subtitle ? { text: opts.title, subtitle: opts.subtitle } : opts.title }
      : {}),
    layer: [
      band('lo95', 'hi95', 0.12),
      band('lo90', 'hi90', 0.16),
      band('lo80', 'hi80', 0.22),
      {
        data: { values: opts.history },
        mark: { type: 'line', point: { filled: true, size: 30 } },
        encoding: {
          x: { field: 'month', type: 'temporal', title: null },
          y: { field: 'value', type: 'quantitative', title: null, axis: yAxis },
          tooltip: [
            { field: 'month', type: 'temporal', title: 'Month' },
            { field: 'value', type: 'quantitative', ...valTip, title: 'Modeled' },
          ],
        },
      },
      {
        data: { values: opts.forecast },
        mark: { type: 'line', strokeDash: [4, 3], color: '#a1a1aa' },
        encoding: {
          x: { field: 'month', type: 'temporal' },
          y: { field: 'central', type: 'quantitative' },
          tooltip: [
            { field: 'month', type: 'temporal', title: 'Month' },
            { field: 'central', type: 'quantitative', ...valTip, title: 'Forecast' },
            { field: 'lo90', type: 'quantitative', ...valTip, title: '90% low' },
            { field: 'hi90', type: 'quantitative', ...valTip, title: '90% high' },
          ],
        },
      },
    ],
  };
}

/** A multi-series temporal line — one line per series (brand), optional dashed
 *  segments via a `phase` field (history vs forecast). */
export function multiLineSpec(opts: {
  title?: string;
  subtitle?: string;
  data: { month: string; value: number; series: string; phase?: string }[];
  valueFormat?: string;
}): VegaSpec {
  const fmt = opts.valueFormat ?? '$';
  const yAxis = fmt === '%' ? { format: '.0%' } : { format: fmt, formatType: 'compactNum' };
  const valTip =
    fmt === '%' ? { format: '.1%' } : { format: fmt, formatType: 'compactNum' };
  return {
    ...(opts.title
      ? { title: opts.subtitle ? { text: opts.title, subtitle: opts.subtitle } : opts.title }
      : {}),
    data: { values: opts.data },
    mark: { type: 'line', point: false },
    encoding: {
      x: { field: 'month', type: 'temporal', title: null },
      y: { field: 'value', type: 'quantitative', title: null, axis: yAxis },
      color: { field: 'series', type: 'nominal', title: null },
      strokeDash: { field: 'phase', type: 'nominal', legend: null },
      tooltip: [
        { field: 'series', title: 'Brand' },
        { field: 'month', type: 'temporal', title: 'Month' },
        { field: 'value', type: 'quantitative', ...valTip, title: 'Value' },
      ],
    },
  };
}

/** Actual-vs-predicted scatter for a regression fit. The dashed y=x reference
 *  line is the perfect-fit diagonal: points hugging it are well-predicted, points
 *  far from it are residuals worth inspecting. */
export function fitScatterSpec(opts: {
  title?: string;
  subtitle?: string;
  data: readonly { actual: number; predicted: number }[];
}): VegaSpec {
  const vals = opts.data.flatMap((d) => [d.actual, d.predicted]);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  return {
    ...(opts.title
      ? { title: opts.subtitle ? { text: opts.title, subtitle: opts.subtitle } : opts.title }
      : {}),
    layer: [
      {
        data: { values: [{ v: lo }, { v: hi }] },
        mark: { type: 'line', color: '#52525b', strokeDash: [4, 4], strokeWidth: 1 },
        encoding: {
          x: { field: 'v', type: 'quantitative' },
          y: { field: 'v', type: 'quantitative' },
        },
      },
      {
        data: { values: opts.data },
        mark: { type: 'point', filled: true, opacity: 0.6 },
        encoding: {
          x: { field: 'actual', type: 'quantitative', title: 'Actual', scale: { domain: [lo, hi] }, axis: { formatType: 'compactNum' } },
          y: { field: 'predicted', type: 'quantitative', title: 'Predicted', scale: { domain: [lo, hi] }, axis: { formatType: 'compactNum' } },
          tooltip: [
            { field: 'actual', type: 'quantitative', formatType: 'compactNum', title: 'Actual' },
            { field: 'predicted', type: 'quantitative', formatType: 'compactNum', title: 'Predicted' },
          ],
        },
      },
    ],
  };
}

/** A pairwise scatter with an OLS trendline — the Analyze "scatter explorer".
 *  Reveals whether a correlation is a clean linear relationship or outlier-driven
 *  / non-linear. */
export function scatterSpec(opts: {
  title?: string;
  subtitle?: string;
  data: readonly { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
}): VegaSpec {
  return {
    ...(opts.title
      ? { title: opts.subtitle ? { text: opts.title, subtitle: opts.subtitle } : opts.title }
      : {}),
    data: { values: opts.data },
    layer: [
      {
        mark: { type: 'point', filled: true, opacity: 0.5 },
        encoding: {
          x: { field: 'x', type: 'quantitative', title: opts.xLabel, axis: { formatType: 'compactNum' } },
          y: { field: 'y', type: 'quantitative', title: opts.yLabel, axis: { formatType: 'compactNum' } },
          tooltip: [
            { field: 'x', type: 'quantitative', formatType: 'compactNum', title: opts.xLabel },
            { field: 'y', type: 'quantitative', formatType: 'compactNum', title: opts.yLabel },
          ],
        },
      },
      {
        transform: [{ regression: 'y', on: 'x' }],
        mark: { type: 'line', color: '#a1a1aa', strokeWidth: 2 },
        encoding: {
          x: { field: 'x', type: 'quantitative' },
          y: { field: 'y', type: 'quantitative' },
        },
      },
    ],
  };
}

/** A 2-D quadrant scatter — efficiency-vs-engagement style. Each point is one
 *  category (publisher / format / market / …); x and y are two derived rates
 *  (e.g. CPC, CTR); the point size encodes a third measure (spend). The
 *  median of each axis is drawn as a dashed reference line so the four
 *  quadrants are read at a glance (Star = high-y low-x, Workhorse =
 *  high-y high-x, etc.).
 *
 *  Inverting `xBetterLower` flips the axis interpretation in the tooltip
 *  only — the visual still places higher-x to the right. */
export function quadrantScatterSpec(opts: {
  title?: string;
  data: readonly { name: string; x: number; y: number; size: number }[];
  xLabel: string;
  yLabel: string;
  sizeLabel: string;
  xFormat?: string;
  yFormat?: string;
  sizeFormat?: string;
  xMedian: number;
  yMedian: number;
}): VegaSpec {
  return {
    ...(opts.title ? { title: opts.title } : {}),
    data: { values: opts.data },
    layer: [
      // Median rule (vertical) — separates "expensive" from "cheap".
      {
        data: { values: [{ v: opts.xMedian }] },
        mark: { type: 'rule', color: '#52525b', strokeDash: [3, 3], strokeWidth: 1 },
        encoding: { x: { field: 'v', type: 'quantitative' } },
      },
      // Median rule (horizontal) — separates "engaged" from "flat".
      {
        data: { values: [{ v: opts.yMedian }] },
        mark: { type: 'rule', color: '#52525b', strokeDash: [3, 3], strokeWidth: 1 },
        encoding: { y: { field: 'v', type: 'quantitative' } },
      },
      {
        mark: { type: 'circle', opacity: 0.85, cursor: 'pointer' },
        encoding: {
          x: {
            field: 'x',
            type: 'quantitative',
            title: opts.xLabel,
            axis: { format: opts.xFormat ?? '', formatType: 'compactNum' },
          },
          y: {
            field: 'y',
            type: 'quantitative',
            title: opts.yLabel,
            axis: { format: opts.yFormat ?? '', formatType: 'compactNum' },
          },
          size: {
            field: 'size',
            type: 'quantitative',
            scale: { range: [60, 900] },
            legend: null,
          },
          color: {
            // Color the quadrants so the visual immediately separates winners
            // from losers — green (low-cost + high-engagement) at top-left,
            // red (high-cost + low-engagement) at bottom-right.
            condition: [
              { test: `datum.x <= ${opts.xMedian} && datum.y >= ${opts.yMedian}`, value: '#10b981' },
              { test: `datum.x >  ${opts.xMedian} && datum.y >= ${opts.yMedian}`, value: '#3b82f6' },
              { test: `datum.x <= ${opts.xMedian} && datum.y <  ${opts.yMedian}`, value: '#f59e0b' },
            ],
            value: '#ef4444',
          },
          tooltip: [
            { field: 'name', title: 'Category' },
            { field: 'x', type: 'quantitative', title: opts.xLabel, format: opts.xFormat ?? '', formatType: 'compactNum' },
            { field: 'y', type: 'quantitative', title: opts.yLabel, format: opts.yFormat ?? '', formatType: 'compactNum' },
            { field: 'size', type: 'quantitative', title: opts.sizeLabel, format: opts.sizeFormat ?? '', formatType: 'compactNum' },
          ],
        },
      },
      {
        mark: { type: 'text', align: 'left', baseline: 'middle', dx: 8, fontSize: 10, color: '#e4e4e7' },
        encoding: {
          x: { field: 'x', type: 'quantitative' },
          y: { field: 'y', type: 'quantitative' },
          text: { field: 'name' },
        },
      },
    ],
  };
}

/** A Pareto / 80-20 chart — sorted bars of share-of-total + an overlaid
 *  cumulative-share line. Useful for "what fraction of spend goes to the top
 *  N publishers?" Bars use the platform emerald; the cumulative line is
 *  drawn in white so it reads as a separate series. The 80% threshold is
 *  marked with a dashed reference rule. */
export function paretoSpec(opts: {
  title?: string;
  /** Pre-sorted, pre-computed share rows: `share` and `cum` are 0..1. */
  data: readonly { name: string; value: number; share: number; cum: number }[];
  valueFormat?: string;
}): VegaSpec {
  const fmt = opts.valueFormat ?? '$';
  return {
    ...(opts.title ? { title: opts.title } : {}),
    data: { values: opts.data },
    encoding: {
      x: {
        field: 'name',
        type: 'nominal',
        // Keep the input order — the caller has already sorted descending.
        sort: null,
        title: null,
        axis: { labelAngle: -30, labelOverlap: true },
      },
    },
    layer: [
      {
        mark: { type: 'bar', cursor: 'pointer' },
        encoding: {
          y: {
            field: 'value',
            type: 'quantitative',
            title: null,
            axis: { format: fmt, formatType: 'compactNum' },
          },
          tooltip: [
            { field: 'name', title: 'Name' },
            { field: 'value', type: 'quantitative', title: 'Value', format: fmt, formatType: 'compactNum' },
            { field: 'share', type: 'quantitative', title: 'Share', format: '.1%' },
            { field: 'cum', type: 'quantitative', title: 'Cumulative', format: '.1%' },
          ],
        },
      },
      // The 80% guide-line — a dashed horizontal on the right axis.
      {
        data: { values: [{ v: 0.8 }] },
        mark: { type: 'rule', color: '#52525b', strokeDash: [3, 3] },
        encoding: { y: { field: 'v', type: 'quantitative' } },
      },
      {
        mark: { type: 'line', color: '#f4f4f5', strokeWidth: 2, point: { color: '#f4f4f5', filled: true, size: 35 } },
        encoding: {
          y: {
            field: 'cum',
            type: 'quantitative',
            title: 'Cumulative %',
            axis: { format: '.0%', orient: 'right' },
            scale: { domain: [0, 1] },
          },
        },
      },
    ],
    resolve: { scale: { y: 'independent' } },
  };
}

/** A correlation matrix as a rect heatmap — diverging blue (negative) → red
 *  (positive), with the coefficient printed in each cell. */
export function heatmapSpec(opts: {
  title?: string;
  subtitle?: string;
  rows: string[];
  cols: string[];
  matrix: (number | null)[][];
  significant?: boolean[][];
}): VegaSpec {
  const values: Row[] = [];
  opts.rows.forEach((row, i) => {
    opts.cols.forEach((col, j) => {
      const r = opts.matrix[i]?.[j];
      values.push({
        row,
        col,
        r: r ?? Number.NaN,
        sig: opts.significant?.[i]?.[j] ? 'yes' : 'no',
      });
    });
  });
  // Only annotate cells with the numeric r when the grid is small enough to read
  // (≤ 15×15); past that the labels overlap into noise (matches the notebook).
  const annotate = opts.rows.length * opts.cols.length <= 225;
  const layers: VegaSpec[] = [
    {
      mark: { type: 'rect', strokeWidth: 1.5 },
      encoding: {
        color: {
          field: 'r',
          type: 'quantitative',
          title: 'r',
          scale: { domain: [-1, 0, 1], range: ['#60a5fa', '#18181b', '#ef4444'] },
          legend: { format: '.1f' },
        },
        // Statistically significant cells get a light border.
        stroke: {
          condition: { test: "datum.sig === 'yes'", value: '#fafafa' },
          value: 'transparent',
        },
        tooltip: [
          { field: 'row' },
          { field: 'col' },
          { field: 'r', type: 'quantitative', format: '.3f' },
          { field: 'sig', title: 'significant' },
        ],
      },
    },
  ];
  if (annotate) {
    layers.push({
      mark: { type: 'text', fontSize: 9 },
      encoding: { text: { field: 'r', type: 'quantitative', format: '.2f' }, color: { value: '#e4e4e7' } },
    });
  }
  return {
    ...(opts.title
      ? { title: opts.subtitle ? { text: opts.title, subtitle: opts.subtitle } : opts.title }
      : {}),
    data: { values },
    encoding: {
      x: { field: 'col', type: 'nominal', title: null, axis: { labelAngle: -45 } },
      y: { field: 'row', type: 'nominal', title: null },
    },
    layer: layers,
  };
}

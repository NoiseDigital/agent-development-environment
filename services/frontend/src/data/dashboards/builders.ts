// Per-block tile builders — the LEGO bricks each client dashboard composes
// from. Every builder owns the layout for ONE recognisable block of the
// page (a KPI strip, the hero trend + narrative pair, a publisher
// breakdown, a publisher × phase pivot, etc.) and accepts a `baseY` so a
// client can stack blocks in any order it wants.
//
// A custom client dashboard is a few lines: pick the blocks you want, pass
// their vertical positions, return the flat tile list. Tabs are then just
// `{ id, label, tiles }` objects pointing at those tile lists.

import type {
  BreakdownTileSpec,
  DashboardTile,
  HeatmapTileSpec,
  NarrativeTileSpec,
  PacingTileSpec,
  ParetoTileSpec,
  PivotTileSpec,
  QuadrantTileSpec,
  TabKind,
  TrendTileSpec,
} from './types';
import {
  KPI_SETS,
  PIVOT_COLUMNS,
  TREND_PAIRS,
  type KpiConfig,
} from './primitives';

/** Six KPI cards laid out across one row. Heights are fixed — KPI strips
 *  exist so the eye can scan them quickly, not so they can resize. */
export function kpiStrip(
  prefix: string,
  kpis: KpiConfig[],
  opts: { baseY?: number } = {},
): DashboardTile[] {
  const baseY = opts.baseY ?? 0;
  return kpis.map<DashboardTile>((k, i) => ({
    id: `${prefix}-kpi-${i}`,
    type: 'kpi',
    label: k.label,
    metric: k.metric,
    format: k.format,
    betterLower: k.betterLower,
    layout: { x: (i % 6) * 2, y: baseY, w: 2, h: 2, minW: 2, minH: 2 },
  }));
}

/** The hero row beneath a KPI strip — a wide dual-axis trend chart and a
 *  Noise Analyst narrative card sitting next to it. Returned as a pair so
 *  a client that wants only one half can pick. */
export function trendHero(
  prefix: string,
  kind: TabKind,
  opts: { baseY?: number; narrativeTitle?: string } = {},
): { trend: TrendTileSpec; narrative: NarrativeTileSpec } {
  const baseY = opts.baseY ?? 2;
  const pair = TREND_PAIRS[kind];
  const trend: TrendTileSpec = {
    id: `${prefix}-trend`,
    type: 'trend',
    title: pair.label,
    metric: pair.primary,
    secondaryMetric: pair.secondary,
    layout: { x: 0, y: baseY, w: 8, h: 8, minW: 4, minH: 5 },
  };
  const narrative: NarrativeTileSpec = {
    id: `${prefix}-narrative`,
    type: 'narrative',
    title: opts.narrativeTitle ?? 'Noise Analyst',
    layout: { x: 8, y: baseY, w: 4, h: 8, minW: 3, minH: 4 },
  };
  return { trend, narrative };
}

/** Budget-pacing block — single "where are we vs. plan?" card. */
export function pacingBlock(
  prefix: string,
  opts: { baseY?: number; title?: string } = {},
): PacingTileSpec {
  return {
    id: `${prefix}-pacing`,
    type: 'pacing',
    title: opts.title ?? 'Budget Pacing',
    layout: { x: 0, y: opts.baseY ?? 10, w: 4, h: 5, minW: 3, minH: 4 },
  };
}

/** Single-dim bar chart breakdown — e.g. spend by publisher. */
export function dimensionBreakdown(
  prefix: string,
  spec: {
    title: string;
    source: BreakdownTileSpec['source'];
    metric?: BreakdownTileSpec['metric'];
    baseY?: number;
  },
): BreakdownTileSpec {
  return {
    id: `${prefix}-breakdown-${spec.source}`,
    type: 'breakdown',
    title: spec.title,
    source: spec.source,
    metric: spec.metric,
    layout: { x: 4, y: spec.baseY ?? 10, w: 8, h: 5, minW: 4, minH: 4 },
  };
}

/** Two-level pivot — publisher × phase by default, but any (outer, inner)
 *  pair is supported. Uses the canonical PIVOT_COLUMNS unless overridden. */
export function nestedPivot(
  prefix: string,
  spec: {
    title: string;
    outerDim: PivotTileSpec['outerDim'];
    innerDim?: PivotTileSpec['innerDim'];
    rowHeader: string;
    columns?: PivotTileSpec['columns'];
    baseY?: number;
  },
): PivotTileSpec {
  return {
    id: `${prefix}-pivot`,
    type: 'pivot',
    title: spec.title,
    outerDim: spec.outerDim,
    innerDim: spec.innerDim,
    rowHeader: spec.rowHeader,
    columns: spec.columns ?? PIVOT_COLUMNS,
    layout: { x: 0, y: spec.baseY ?? 15, w: 12, h: 8, minW: 4, minH: 5 },
  };
}

/** Efficiency-vs-engagement scatter — one point per value of `dim`. */
export function efficiencyQuadrant(
  prefix: string,
  spec: {
    title: string;
    dim: QuadrantTileSpec['dim'];
    xMetric?: QuadrantTileSpec['xMetric'];
    yMetric?: QuadrantTileSpec['yMetric'];
    sizeMetric?: QuadrantTileSpec['sizeMetric'];
    layout?: { x: number; y: number; w: number; h: number };
  },
): QuadrantTileSpec {
  return {
    id: `${prefix}-quadrant-${spec.dim}`,
    type: 'quadrant',
    title: spec.title,
    dim: spec.dim,
    xMetric: spec.xMetric ?? 'cpc',
    yMetric: spec.yMetric ?? 'ctr',
    sizeMetric: spec.sizeMetric ?? 'total_spend',
    layout: spec.layout
      ? { ...spec.layout, minW: 4, minH: 5 }
      : { x: 0, y: 2, w: 6, h: 9, minW: 4, minH: 5 },
  };
}

/** Pareto / 80-20 sorted bars + cumulative line for one dimension. */
export function paretoBlock(
  prefix: string,
  spec: {
    title: string;
    source: ParetoTileSpec['source'];
    layout?: { x: number; y: number; w: number; h: number };
    topN?: number;
  },
): ParetoTileSpec {
  return {
    id: `${prefix}-pareto-${spec.source}`,
    type: 'pareto',
    title: spec.title,
    source: spec.source,
    topN: spec.topN,
    layout: spec.layout
      ? { ...spec.layout, minW: 4, minH: 5 }
      : { x: 0, y: 20, w: 6, h: 8, minW: 4, minH: 5 },
  };
}

/** Metric × metric correlation heatmap. One per dashboard typically. */
export function correlationHeatmap(
  prefix: string,
  opts: { baseY?: number; title?: string } = {},
): HeatmapTileSpec {
  return {
    id: `${prefix}-heatmap`,
    type: 'heatmap',
    title: opts.title ?? 'Metric correlations',
    layout: { x: 0, y: opts.baseY ?? 28, w: 12, h: 8, minW: 5, minH: 6 },
  };
}

/** Look up the canonical KPI set for a goal tab — most clients just pass
 *  this straight through to `kpiStrip`. Exposed so a bespoke client can
 *  drop or add a KPI before composing the strip. */
export function kpisFor(kind: TabKind): KpiConfig[] {
  return KPI_SETS[kind];
}

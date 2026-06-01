// Tile + dashboard model — the shapes every layer of the DAaC stack
// (primitives, builders, client compositions, frontend renderers, agent
// context manifest) operates on.
//
// Two distinct concerns live here:
//   1. Per-tile specs — one type per `TileType`, distinguished by `type`.
//   2. The dashboard model — Dashboard + DashboardTab.
//
// Nothing in this file knows about composition or any specific client —
// it's pure structure. Adding a new tile shape means adding a new TileType
// literal, a new <…>TileSpec, a member to the DashboardTile union, and an
// entry to the manifest formatter (see lib/dashboards/context.ts) +
// the tile renderer switch in components/dashboards/DashboardCanvas.tsx.

import type { VegaSpec } from '../../types/genui';

export type TileType =
  | 'chart'        // user-pinned Vega spec (from chat / agent)
  | 'text'         // text widget (dashboard edit mode)
  | 'kpi'          // live KPI card from `metric_totals`
  | 'trend'        // live time series from `metric_series` / `performance_trend`
  | 'pivot'        // live pivot from `breakdown_nested_totals`
  | 'breakdown'    // live bar from a per-dim breakdown tool
  | 'quadrant'     // live efficiency-vs-engagement scatter (CPC × CTR × Spend)
  | 'pareto'       // live Pareto / 80-20 bars + cumulative line
  | 'pacing'       // live budget pacing — spent vs. planned
  | 'heatmap'      // live metric × dimension correlation heatmap
  | 'narrative';   // live insight panel derived from `metric_totals`

export interface GridPos {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface BaseTile {
  id: string;
  layout: GridPos;
}

// ── Per-tile specs ───────────────────────────────────────────────────────────

export interface ChartTile extends BaseTile {
  type: 'chart';
  /** Vega-Lite spec rendered by VegaChart — used for charts the user pinned
   *  from chat. */
  chart: VegaSpec;
}

export interface TextTile extends BaseTile {
  type: 'text';
  text: string;
}

/** Live time-series. Renders ONE primary metric, optionally with a SECONDARY
 *  layered on a right axis (e.g. spend + impressions). Data comes from the
 *  TotalsProvider's `series` so no extra fetch is needed. */
export interface TrendTileSpec extends BaseTile {
  type: 'trend';
  title: string;
  metric:
    | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
    | 'engaged_visits' | 'completed_views';
  /** Optional right-axis metric for a dual-axis chart. */
  secondaryMetric?:
    | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
    | 'engaged_visits' | 'completed_views';
}

/** Live KPI card. The dashboard's TotalsProvider fetches current + prior +
 *  weekly series ONCE; every KPI tile reads from that single source. */
export interface KpiTileSpec extends BaseTile {
  type: 'kpi';
  label: string;
  metric:
    | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
    | 'engaged_visits' | 'completed_views' | 'budget'
    | 'ctr' | 'cvr' | 'cpm' | 'cpc' | 'cpa' | 'vcr';
  format?: 'usd' | 'usd2' | 'usdCompact' | 'compact' | 'num' | 'pct';
  /** True for metrics where a rising number is BAD (CPC / CPM / CPA). */
  betterLower?: boolean;
}

/** Live pivot table — one BQ call returns every metric column grouped by
 *  (outer, inner). Pivot row totals read from the same TotalsProvider as
 *  the KPI strip, so the bottom row matches the strip across the page. */
export interface PivotTileSpec extends BaseTile {
  type: 'pivot';
  title: string;
  outerDim:
    | 'publisher' | 'platform' | 'campaign_phase' | 'campaign' | 'market_group'
    | 'creative_format' | 'kpi_goal';
  /** Omit for a single-level grouping. */
  innerDim?:
    | 'publisher' | 'platform' | 'campaign_phase' | 'campaign' | 'market_group'
    | 'creative_format' | 'kpi_goal';
  rowHeader: string;
  columns: Array<{
    key:
      | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
      | 'engaged_visits' | 'completed_views'
      | 'ctr' | 'cvr' | 'cpm' | 'cpc' | 'cpa' | 'vcr';
    label: string;
    format: 'usd' | 'usd2' | 'usdCompact' | 'compact' | 'num' | 'pct';
  }>;
}

/** Live categorical breakdown — one BQ call per dim → a bar chart. */
export interface BreakdownTileSpec extends BaseTile {
  type: 'breakdown';
  title: string;
  source:
    | 'publisher' | 'campaign_phase' | 'platform_ctr' | 'market_group'
    | 'creative_format' | 'kpi_goal';
  metric?:
    | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
    | 'engaged_visits' | 'completed_views';
  valueFormat?: string;
}

/** Live quadrant scatter — efficiency vs. engagement at a glance. Each
 *  point is one value of `dim` (publisher / format / market / …). Same
 *  `breakdown_nested_totals` call the pivot uses; no inner_dim. */
export interface QuadrantTileSpec extends BaseTile {
  type: 'quadrant';
  title: string;
  dim:
    | 'publisher' | 'platform' | 'campaign_phase' | 'campaign' | 'market_group'
    | 'creative_format' | 'kpi_goal';
  xMetric: 'ctr' | 'cvr' | 'cpm' | 'cpc' | 'cpa' | 'vcr';
  yMetric: 'ctr' | 'cvr' | 'cpm' | 'cpc' | 'cpa' | 'vcr';
  sizeMetric?: 'total_spend' | 'impressions' | 'clicks' | 'engaged_visits';
}

/** Live Pareto / 80-20 chart — sorted bars + cumulative-share line. */
export interface ParetoTileSpec extends BaseTile {
  type: 'pareto';
  title: string;
  source:
    | 'publisher' | 'campaign_phase' | 'platform_ctr' | 'market_group'
    | 'creative_format' | 'kpi_goal';
  metric?:
    | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
    | 'engaged_visits' | 'completed_views';
  valueFormat?: string;
  topN?: number;
}

/** Live budget pacing — spent vs. planned, with optional time-elapsed
 *  target for "pacing hot / cold" reads. */
export interface PacingTileSpec extends BaseTile {
  type: 'pacing';
  title: string;
  /** 0..1 — share of the window that has elapsed. When omitted the tile
   *  shows raw %-of-budget with no judgement. */
  expectedShare?: number;
}

/** Live correlation heatmap — a square of |metric × metric| correlations
 *  derived from a per-bucket series. Lives in the Insights tab. */
export interface HeatmapTileSpec extends BaseTile {
  type: 'heatmap';
  title: string;
}

/** Live insight panel — derived from the dashboard's totals, no extra
 *  fetches unless asked (publisher breakdown for the top-publisher line). */
export interface NarrativeTileSpec extends BaseTile {
  type: 'narrative';
  title: string;
}

/** A change indicator on a KPI card — `good` drives the colour, independent
 *  of sign (a falling CPC is good). Used by tile components, exported for
 *  agent-generated tiles to reuse the same shape. */
export interface KpiDelta {
  value: string;
  good: boolean;
}

export type DashboardTile =
  | ChartTile
  | TextTile
  | TrendTileSpec
  | KpiTileSpec
  | PivotTileSpec
  | BreakdownTileSpec
  | QuadrantTileSpec
  | ParetoTileSpec
  | PacingTileSpec
  | HeatmapTileSpec
  | NarrativeTileSpec;

// ── Dashboard model ──────────────────────────────────────────────────────────

export type DashboardOwnership = 'owned' | 'shared' | 'client';

export interface DashboardTab {
  id: string;
  label: string;
  tiles: DashboardTile[];
}

export interface Dashboard {
  id: string;
  name: string;
  client: string;
  clientInitials: string;
  /** Public path to the client's brand mark. Header and cards render this when
   *  present and fall back to the initials badge when absent. Same source as
   *  the `/dashboards` listing page — one logo per client across the app. */
  clientLogoPath?: string;
  owner: string;
  ownership: DashboardOwnership;
  lastUpdated: string;
  description: string;
  accentColor: string;
  filters: string[];
  /** Optional — historic seed field, no longer used by tiles. Kept on the
   *  interface so the existing seeds still type-check until a future cleanup. */
  campaignId: string;
  tabs: DashboardTab[];
}

/** Goal-tab kinds — the four canonical tab archetypes a client report covers
 *  end-to-end. The `primitives` palette is keyed on these. */
export type TabKind = 'overall' | 'awareness' | 'engagement' | 'conversion';

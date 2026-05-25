// Dashboard tile model + the canonical client dashboard seeds.
//
// This file used to mix two roles: the mock data pipeline (in-memory tables
// + sync builders) and the actual dashboard registry. The data pipeline is
// gone — every tile is now live BigQuery — so the file is just the tile
// type definitions, the tab/dashboard composition, and the SEED list.
//
// Naming: tile discriminators are clean ('kpi', 'trend', 'pivot',
// 'breakdown', 'narrative') because there is no mock counterpart any more.
// `chart` and `text` remain for user-pinned arbitrary Vega specs and the
// text-widget feature in dashboard edit mode.

import type { VegaSpec } from '../types/genui';
import { clients } from './media-model';
import type { UserDashboardSpec } from '../lib/user-dashboards';

// ── Tile model ────────────────────────────────────────────────────────────────

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

// ── Tile shapes ───────────────────────────────────────────────────────────────

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

// ── Dashboard model ───────────────────────────────────────────────────────────

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

// ── Tab composition ───────────────────────────────────────────────────────────

export type TabKind = 'overall' | 'awareness' | 'engagement' | 'conversion';

/** Every KPI in every tab is a live BigQuery column. No fallback — adding a
 *  new KPI to a tab means adding both an entry here AND a column in BQ. If
 *  the column is missing, the tile renders "No data" instead of pretending. */
const KPI_SETS: Record<
  TabKind,
  Array<{ label: string; metric: KpiTileSpec['metric']; format: KpiTileSpec['format']; betterLower?: boolean }>
> = {
  overall: [
    { label: 'Spend',         metric: 'total_spend',     format: 'usdCompact' },
    { label: 'Impressions',   metric: 'impressions',     format: 'compact' },
    { label: 'Clicks',        metric: 'clicks',          format: 'compact' },
    { label: 'CTR',           metric: 'ctr',             format: 'pct' },
    { label: 'Avg. CPC',      metric: 'cpc',             format: 'usd2', betterLower: true },
    { label: 'Engaged Visits', metric: 'engaged_visits', format: 'compact' },
  ],
  awareness: [
    { label: 'Spend',          metric: 'total_spend',       format: 'usdCompact' },
    { label: 'Impressions',    metric: 'impressions',       format: 'compact' },
    { label: 'Completed Views', metric: 'completed_views',  format: 'compact' },
    { label: 'VCR',            metric: 'vcr',               format: 'pct' },
    { label: 'CPM',            metric: 'cpm',               format: 'usd2', betterLower: true },
    { label: 'Avg. CPC',       metric: 'cpc',               format: 'usd2', betterLower: true },
  ],
  engagement: [
    { label: 'Spend',          metric: 'total_spend', format: 'usdCompact' },
    { label: 'Clicks',         metric: 'clicks',      format: 'compact' },
    { label: 'CTR',            metric: 'ctr',         format: 'pct' },
    { label: 'LP Views',       metric: 'landing_page_views', format: 'compact' },
    { label: 'Avg. CPC',       metric: 'cpc',         format: 'usd2', betterLower: true },
    { label: 'Impressions',    metric: 'impressions', format: 'compact' },
  ],
  conversion: [
    { label: 'Spend',           metric: 'total_spend',    format: 'usdCompact' },
    { label: 'Engaged Visits',  metric: 'engaged_visits', format: 'compact' },
    { label: 'CVR',             metric: 'cvr',            format: 'pct' },
    { label: 'CPA',             metric: 'cpa',            format: 'usd2', betterLower: true },
    { label: 'Clicks',          metric: 'clicks',         format: 'compact' },
    { label: 'CTR',             metric: 'ctr',            format: 'pct' },
  ],
};

/** Each tab leads with a primary trend + a paired secondary metric on a
 *  right axis. The user wanted dual-axis spend visibility everywhere; this
 *  is how it's expressed. */
const TREND_PAIRS: Record<TabKind, { primary: TrendTileSpec['metric']; secondary: TrendTileSpec['metric']; label: string }> = {
  overall:    { primary: 'total_spend',     secondary: 'impressions',     label: 'Spend × Impressions' },
  awareness:  { primary: 'impressions',     secondary: 'total_spend',     label: 'Impressions × Spend' },
  engagement: { primary: 'clicks',          secondary: 'total_spend',     label: 'Clicks × Spend' },
  conversion: { primary: 'engaged_visits',  secondary: 'total_spend',     label: 'Engaged Visits × Spend' },
};

/** Pivot column set used on every tab. */
const PIVOT_COLUMNS: PivotTileSpec['columns'] = [
  { key: 'total_spend', label: 'Spend',       format: 'usdCompact' },
  { key: 'impressions', label: 'Impressions', format: 'compact' },
  { key: 'clicks',      label: 'Clicks',      format: 'compact' },
  { key: 'ctr',         label: 'CTR',         format: 'pct' },
  { key: 'cpc',         label: 'Avg. CPC',    format: 'usd2' },
];

/** Compose one tab — KPI strip, hero dual-axis trend + narrative, pacing,
 *  publisher breakdown, publisher×phase pivot. Pure tile composition; the
 *  data layer is handled by each tile via the TotalsProvider + cache. */
export function buildTab(prefix: string, _campaignId: string, kind: TabKind): DashboardTile[] {
  const kpis = KPI_SETS[kind].map<DashboardTile>((k, i) => ({
    id: `${prefix}-kpi-${i}`,
    type: 'kpi',
    label: k.label,
    metric: k.metric,
    format: k.format,
    betterLower: k.betterLower,
    layout: { x: (i % 6) * 2, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
  }));

  const pair = TREND_PAIRS[kind];
  const trend: TrendTileSpec = {
    id: `${prefix}-chart-0`,
    type: 'trend',
    title: pair.label,
    metric: pair.primary,
    secondaryMetric: pair.secondary,
    layout: { x: 0, y: 2, w: 8, h: 8, minW: 4, minH: 5 },
  };

  const narrative: NarrativeTileSpec = {
    id: `${prefix}-narrative`,
    type: 'narrative',
    title: 'Noise Analyst',
    layout: { x: 8, y: 2, w: 4, h: 8, minW: 3, minH: 4 },
  };

  // Pacing sits between the hero row and the breakdown — it's a single
  // "where are we vs. plan?" read that belongs above the detail blocks.
  const pacing: PacingTileSpec = {
    id: `${prefix}-pacing`,
    type: 'pacing',
    title: 'Budget Pacing',
    layout: { x: 0, y: 10, w: 4, h: 5, minW: 3, minH: 4 },
  };

  const publisherBreakdown: BreakdownTileSpec = {
    id: `${prefix}-chart-1`,
    type: 'breakdown',
    title: 'Spend by Publisher',
    source: 'publisher',
    layout: { x: 4, y: 10, w: 8, h: 5, minW: 4, minH: 4 },
  };

  const pivot: PivotTileSpec = {
    id: `${prefix}-pivot`,
    type: 'pivot',
    title: 'Performance by Publisher',
    outerDim: 'publisher',
    innerDim: 'campaign_phase',
    rowHeader: 'Publisher / Phase',
    columns: PIVOT_COLUMNS,
    layout: { x: 0, y: 15, w: 12, h: 8, minW: 4, minH: 5 },
  };

  return [...kpis, trend, narrative, pacing, publisherBreakdown, pivot];
}

const GOAL_TABS: { id: string; label: string; kind: TabKind }[] = [
  { id: 'overall', label: 'Overall', kind: 'overall' },
  { id: 'awareness', label: 'Awareness', kind: 'awareness' },
  { id: 'engagement', label: 'Engagement', kind: 'engagement' },
  { id: 'conversion', label: 'Conversion', kind: 'conversion' },
];

/** Insights tab — analytical visuals that surface "where to lean in / where
 *  to pivot" rather than the bread-and-butter spend/impression slices on the
 *  goal tabs. Same KPI strip as Overall so the reader doesn't lose context. */
function buildInsightsTab(prefix: string): DashboardTile[] {
  const kpis = KPI_SETS.overall.map<DashboardTile>((k, i) => ({
    id: `${prefix}-kpi-${i}`,
    type: 'kpi',
    label: k.label,
    metric: k.metric,
    format: k.format,
    betterLower: k.betterLower,
    layout: { x: (i % 6) * 2, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
  }));

  const quadrantPub: QuadrantTileSpec = {
    id: `${prefix}-quadrant-pub`,
    type: 'quadrant',
    title: 'Publisher efficiency — CPC × CTR (sized by spend)',
    dim: 'publisher',
    xMetric: 'cpc',
    yMetric: 'ctr',
    sizeMetric: 'total_spend',
    layout: { x: 0, y: 2, w: 6, h: 9, minW: 4, minH: 5 },
  };

  const quadrantFmt: QuadrantTileSpec = {
    id: `${prefix}-quadrant-fmt`,
    type: 'quadrant',
    title: 'Creative format efficiency — CPC × CTR',
    dim: 'creative_format',
    xMetric: 'cpc',
    yMetric: 'ctr',
    sizeMetric: 'total_spend',
    layout: { x: 6, y: 2, w: 6, h: 9, minW: 4, minH: 5 },
  };

  // Per-campaign performance matrix — same primitive as the publisher
  // quadrant but at the campaign level, which is the unit a planner can
  // actually act on (pause / scale / re-flight). Sized by spend so small
  // experiments don't drown out flagship campaigns.
  const quadrantCampaign: QuadrantTileSpec = {
    id: `${prefix}-quadrant-campaign`,
    type: 'quadrant',
    title: 'Campaign performance matrix — CPC × CTR',
    dim: 'campaign',
    xMetric: 'cpc',
    yMetric: 'ctr',
    sizeMetric: 'total_spend',
    layout: { x: 0, y: 11, w: 12, h: 9, minW: 6, minH: 5 },
  };

  const paretoPub: ParetoTileSpec = {
    id: `${prefix}-pareto-pub`,
    type: 'pareto',
    title: 'Spend concentration — top publishers',
    source: 'publisher',
    layout: { x: 0, y: 20, w: 6, h: 8, minW: 4, minH: 5 },
  };

  const paretoMkt: ParetoTileSpec = {
    id: `${prefix}-pareto-mkt`,
    type: 'pareto',
    title: 'Spend concentration — markets',
    source: 'market_group',
    layout: { x: 6, y: 20, w: 6, h: 8, minW: 4, minH: 5 },
  };

  const heatmap: HeatmapTileSpec = {
    id: `${prefix}-heatmap`,
    type: 'heatmap',
    title: 'Metric correlations',
    layout: { x: 0, y: 28, w: 12, h: 8, minW: 5, minH: 6 },
  };

  return [...kpis, quadrantPub, quadrantFmt, quadrantCampaign, paretoPub, paretoMkt, heatmap];
}

function buildTabs(prefix: string, campaignId: string): DashboardTab[] {
  return [
    ...GOAL_TABS.map((t) => ({
      id: t.id,
      label: t.label,
      tiles: buildTab(`${prefix}-${t.id}`, campaignId, t.kind),
    })),
    {
      id: 'insights',
      label: 'Insights',
      tiles: buildInsightsTab(`${prefix}-insights`),
    },
  ];
}

// ── Dashboard registry ────────────────────────────────────────────────────────

const clientById = (id: string) => clients.find((c) => c.id === id) ?? clients[0];

interface DashboardSeed {
  id: string;
  campaignId: string;
  clientId: string;
  owner: string;
  ownership: DashboardOwnership;
  name: string;
  lastUpdated: string;
  description: string;
  filters: string[];
}

// Code-defined ("DaaC") client dashboards. A canonical client dashboard's
// `id` IS the client code (see `data/client-codes.ts`) — the URL reads
// `/dashboards/NOI` and the route handle stays human-meaningful. User
// dashboards still get UUIDs; their ids don't collide because client codes
// are short uppercase strings.
const SEEDS: DashboardSeed[] = [
  {
    id: 'NOI',
    campaignId: 'noi-all',
    clientId: 'noi',
    owner: 'Marcus T.',
    ownership: 'client',
    name: 'Noise Performance — Client Report',
    lastUpdated: '2025-05-12',
    description: 'Client-facing performance report on the NOI media dataset.',
    filters: ['Campaign', 'Market', 'Publisher', 'Format'],
  },
];

export const mockDashboards: Dashboard[] = SEEDS.map((s) => {
  const client = clientById(s.clientId);
  return {
    id: s.id,
    name: s.name,
    client: client.name,
    clientInitials: client.initials,
    clientLogoPath: client.logoPath,
    owner: s.owner,
    ownership: s.ownership,
    lastUpdated: s.lastUpdated,
    description: s.description,
    accentColor: client.accentColor,
    filters: s.filters,
    campaignId: s.campaignId,
    tabs: buildTabs(s.id, s.campaignId),
  };
});

/** Hydrate a user-created dashboard spec into a full Dashboard. */
export function dashboardFromSpec(spec: UserDashboardSpec): Dashboard {
  const client = clientById('noi'); // single client today
  let tabs = buildTabs(spec.id, spec.campaignId);
  if (spec.defaultTabId) {
    const i = tabs.findIndex((t) => t.id === spec.defaultTabId);
    if (i > 0) tabs = [tabs[i], ...tabs.filter((_, idx) => idx !== i)];
  }
  return {
    id: spec.id,
    name: spec.name,
    client: client.name,
    clientInitials: client.initials,
    clientLogoPath: client.logoPath,
    owner: 'You',
    ownership: 'owned',
    lastUpdated: spec.createdAt.slice(0, 10),
    description: 'Editable internal dashboard.',
    accentColor: client.accentColor,
    filters: ['Campaign', 'Market', 'Format'],
    campaignId: spec.campaignId,
    tabs,
  };
}

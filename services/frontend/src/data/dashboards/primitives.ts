// The palette every client dashboard composes from.
//
// Nothing here is client-specific — these are the shared building blocks
// (KPI sets per tab kind, dual-axis trend pairings, the pivot column set,
// the goal-tab list) used by `builders.ts` to assemble tiles. A new client
// dashboard reuses these directly, picks a subset, or overrides at the
// builder layer if it needs a bespoke set.
//
// CHANGING A SET HERE AFFECTS EVERY DASHBOARD that consumes it — by
// design. The point of this file is that adding a CTR KPI to the Overall
// tab on every client is a one-line change.

import type {
  KpiTileSpec,
  PivotTileSpec,
  TabKind,
  TrendTileSpec,
} from './types';

/** Every KPI in every tab is a live BigQuery column. No fallback — adding a
 *  new KPI to a tab means adding both an entry here AND a column in BQ. If
 *  the column is missing, the tile renders "No data" instead of pretending. */
export interface KpiConfig {
  label: string;
  metric: KpiTileSpec['metric'];
  format: KpiTileSpec['format'];
  betterLower?: boolean;
}

export const KPI_SETS: Record<TabKind, KpiConfig[]> = {
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

/** Each goal tab leads with a primary trend + a paired secondary metric on
 *  a right axis. Dual-axis spend visibility everywhere is the agreed default. */
export interface TrendPair {
  primary: TrendTileSpec['metric'];
  secondary: TrendTileSpec['metric'];
  label: string;
}

export const TREND_PAIRS: Record<TabKind, TrendPair> = {
  overall:    { primary: 'total_spend',     secondary: 'impressions',     label: 'Spend × Impressions' },
  awareness:  { primary: 'impressions',     secondary: 'total_spend',     label: 'Impressions × Spend' },
  engagement: { primary: 'clicks',          secondary: 'total_spend',     label: 'Clicks × Spend' },
  conversion: { primary: 'engaged_visits',  secondary: 'total_spend',     label: 'Engaged Visits × Spend' },
};

/** Pivot column set used on every goal tab. */
export const PIVOT_COLUMNS: PivotTileSpec['columns'] = [
  { key: 'total_spend', label: 'Spend',       format: 'usdCompact' },
  { key: 'impressions', label: 'Impressions', format: 'compact' },
  { key: 'clicks',      label: 'Clicks',      format: 'compact' },
  { key: 'ctr',         label: 'CTR',         format: 'pct' },
  { key: 'cpc',         label: 'Avg. CPC',    format: 'usd2' },
];

/** The four canonical goal tabs and their labels — every client dashboard
 *  ships with these in order unless it opts out. */
export const GOAL_TABS: { id: string; label: string; kind: TabKind }[] = [
  { id: 'overall', label: 'Overall', kind: 'overall' },
  { id: 'awareness', label: 'Awareness', kind: 'awareness' },
  { id: 'engagement', label: 'Engagement', kind: 'engagement' },
  { id: 'conversion', label: 'Conversion', kind: 'conversion' },
];

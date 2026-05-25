// Data-source contract. Methods mirror the BigQuery toolbox tools 1:1 so
// the BQ implementation is a thin pass-through.

/** The metrics every data source supports. Aligned with the BigQuery columns
 *  on `media_campaign_performance_NOI`. */
export type MetricKey =
  | 'total_spend'
  | 'impressions'
  | 'clicks'
  | 'landing_page_views'
  | 'engaged_visits'
  | 'completed_views';

/** Filter applied at the BQ level. Optional fields are passed through as the
 *  tool's default (the toolbox can't accept null for an optional param).
 *
 *  Categorical filters use substring matching (case-insensitive) at the
 *  toolbox layer, so partial inputs like "video" match "Video", "Pre-roll
 *  video" etc. Empty / undefined values are skipped — they don't constrain
 *  the WHERE clause at all. */
export interface MetricFilter {
  metric?: MetricKey;
  date_from?: string;
  date_to?: string;
  campaign_phase_filter?: string;
  publisher_filter?: string;
  market_group_filter?: string;
  creative_format_filter?: string;
  kpi_goal_filter?: string;
}

/** One row from a chart-ready breakdown — `name` is the category label,
 *  `value` is the metric total for that category. */
export interface NamedValue {
  name: string;
  value: number;
}

/** One time-series point — `name` is the bucket's start date (`YYYY-MM-DD`),
 *  `value` is the metric total for that bucket. */
export type SeriesPoint = NamedValue;

/** One row in a period-over-period comparison. Carries both raw `value` (for
 *  the "Prior" / "Current" bar) and the pre-computed deltas a narrative can
 *  read off directly. */
export interface PopRow {
  name: 'Prior' | 'Current';
  value: number;
  prior: number;
  current: number;
  delta: number;
  pct_change: number;
}

export interface PopWindows {
  metric?: MetricKey;
  current_from: string;
  current_to: string;
  prior_from: string;
  prior_to: string;
}

export interface DateRange {
  earliest_date: string;
  latest_date: string;
  distinct_days: number;
}

/** One row from the `campaign_windows` tool — used to overlay flight bands
 *  behind a trend chart. */
export interface CampaignWindow {
  name: string;
  start_date: string;
  end_date: string;
  total_spend: number;
}

export interface CampaignWindowsFilter {
  date_from?: string;
  date_to?: string;
  campaign_phase_filter?: string;
}

/** One row of every aggregate the KPI strip cares about, plus the derived
 *  rates. Mirrors the `metric_totals` toolbox tool's columns. */
export interface MetricTotalsRow {
  total_spend: number;
  impressions: number;
  clicks: number;
  landing_page_views: number;
  engaged_visits: number;
  completed_views: number;
  budget: number;
  ctr: number;
  cvr: number;
  cpm: number;
  cpc: number;
  cpa: number;
  vcr: number;
}

/** One weekly bucket from the `metric_series` tool. Same columns as
 *  `MetricTotalsRow` plus a `name` (the bucket's start date). Each row is
 *  a sparkline point; pick the metric column to plot. */
export interface MetricSeriesRow extends MetricTotalsRow {
  name: string;
}

/** The dimensions both `outer_dim` and `inner_dim` accept on the
 *  `breakdown_nested` tool. */
export type NestedDim =
  | 'publisher'
  | 'platform'
  | 'campaign_phase'
  | 'campaign'
  | 'market_group'
  | 'creative_format'
  | 'kpi_goal';

/** Columns the `dimension_values` tool accepts. Wider than NestedDim — it
 *  includes the single-axis filters the dashboard's filter bar uses (campaign,
 *  objective, marketing_objective). */
export type FilterDim =
  | 'publisher'
  | 'platform'
  | 'campaign_phase'
  | 'campaign'
  | 'market_group'
  | 'creative_format'
  | 'kpi_goal'
  | 'objective'
  | 'marketing_objective';

/** One row from a two-level breakdown — `outer_name` and `inner_name` are
 *  the dimension values; `value` is the aggregated metric. */
export interface NestedRow {
  outer_name: string;
  inner_name: string;
  value: number;
}

export interface NestedFilter extends MetricFilter {
  outer_dim: NestedDim;
  inner_dim: NestedDim;
}

/** One row from a multi-metric nested breakdown — every aggregate + derived
 *  rate that `metric_totals` returns, but grouped by (outer, inner). */
export interface NestedTotalsRow extends MetricTotalsRow {
  outer_name: string;
  inner_name: string;
}

export interface NestedTotalsFilter {
  outer_dim: NestedDim;
  /** Empty / undefined for a single-level grouping by outer_dim only. */
  inner_dim?: NestedDim;
  date_from?: string;
  date_to?: string;
  /** Same categorical filters as `MetricFilter`. */
  campaign_phase_filter?: string;
  publisher_filter?: string;
  market_group_filter?: string;
  creative_format_filter?: string;
  kpi_goal_filter?: string;
}

/** A data source for dashboard tiles. Methods are async even when the mock
 *  implementation is synchronous so callers can swap to BQ with no rewrite. */
export interface DashboardDataSource {
  trend(filter: MetricFilter): Promise<SeriesPoint[]>;
  publisherBreakdown(filter: MetricFilter): Promise<NamedValue[]>;
  campaignBreakdown(filter: MetricFilter): Promise<NamedValue[]>;
  platformBreakdown(filter: MetricFilter): Promise<NamedValue[]>;
  marketGroupBreakdown(filter: MetricFilter): Promise<NamedValue[]>;
  creativeFormatBreakdown(filter: MetricFilter): Promise<NamedValue[]>;
  kpiGoalBreakdown(filter: MetricFilter): Promise<NamedValue[]>;
  funnel(filter: MetricFilter): Promise<NamedValue[]>;
  pacing(filter: MetricFilter): Promise<NamedValue[]>;
  periodOverPeriod(windows: PopWindows): Promise<PopRow[]>;
  /** One row of all aggregates + derived rates for the window. */
  totals(filter: MetricFilter): Promise<MetricTotalsRow | null>;
  /** Weekly time-series of every metric — drives KPI sparklines. */
  series(filter: MetricFilter): Promise<MetricSeriesRow[]>;
  /** Two-level grouping for pivot tables. */
  breakdownNested(filter: NestedFilter): Promise<NestedRow[]>;
  /** Multi-metric two-level breakdown — every aggregate + rate per cell, in
   *  one BQ call. Drives the pivot table. */
  breakdownNestedTotals(filter: NestedTotalsFilter): Promise<NestedTotalsRow[]>;
  /** Distinct values for one categorical column, ranked by impressions. */
  dimensionValues(dim: FilterDim, limit?: number): Promise<NamedValue[]>;
  dateRange(): Promise<DateRange>;
  /** Per-campaign flight windows for overlay on a time series. */
  campaignWindows(filter: CampaignWindowsFilter): Promise<CampaignWindow[]>;
}

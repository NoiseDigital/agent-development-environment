// BigQuery-backed dashboard data source. Hits the gateway's /api/v1/dashboards/query
// which runs the same toolbox tools the agent uses — one SQL surface.

import { apiRequest } from '../api/http';
import { cached } from './cache';
import type {
  DashboardDataSource,
  MetricFilter,
  NamedValue,
  PopRow,
  SeriesPoint,
  DateRange,
  MetricTotalsRow,
  MetricSeriesRow,
  NestedRow,
  NestedTotalsFilter,
  NestedTotalsRow,
  FilterDim,
  CampaignWindow,
  CampaignWindowsFilter,
} from './data-source';
import { gatewayBase } from '@/lib/api/gateway';

const BASE_URL = gatewayBase();

interface ToolResponse<T> {
  rows: T[];
}

/** POST /api/v1/dashboards/query. Promise-cached so tab-switches paint from
 *  cache; the Refresh button calls `invalidateAll()` (see cache.ts). */
async function query<T>(tool: string, params: Record<string, unknown>): Promise<T[]> {
  return cached(tool, params, async () => {
    const data = await apiRequest<ToolResponse<T>>(
      `${BASE_URL}/api/v1/dashboards/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, params }),
      },
    );
    return data.rows ?? [];
  });
}

/** Allowlist of params passed to the toolbox — defence in depth. */
function metricParams(f: MetricFilter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.metric) out.metric = f.metric;
  if (f.date_from) out.date_from = f.date_from;
  if (f.date_to) out.date_to = f.date_to;
  if (f.campaign_phase_filter) out.campaign_phase_filter = f.campaign_phase_filter;
  if (f.publisher_filter) out.publisher_filter = f.publisher_filter;
  if (f.market_group_filter) out.market_group_filter = f.market_group_filter;
  if (f.creative_format_filter) out.creative_format_filter = f.creative_format_filter;
  if (f.kpi_goal_filter) out.kpi_goal_filter = f.kpi_goal_filter;
  return out;
}

export const bqDashboardDataSource: DashboardDataSource = {
  trend: (f) => query<SeriesPoint>('performance_trend', metricParams(f)),
  publisherBreakdown: (f) => query<NamedValue>('publisher_spend_breakdown', metricParams(f)),
  campaignBreakdown: (f) => query<NamedValue>('campaign_performance_comparison', metricParams(f)),
  platformBreakdown: (f) => query<NamedValue>('platform_engagement_metrics', metricParams(f)),
  marketGroupBreakdown: (f) => query<NamedValue>('market_group_breakdown', metricParams(f)),
  creativeFormatBreakdown: (f) => query<NamedValue>('creative_format_breakdown', metricParams(f)),
  kpiGoalBreakdown: (f) => query<NamedValue>('kpi_goal_breakdown', metricParams(f)),
  funnel: (f) => query<NamedValue>('conversion_funnel_data', metricParams(f)),
  pacing: (f) => query<NamedValue>('budget_pacing', metricParams(f)),
  periodOverPeriod: (w) =>
    query<PopRow>('period_over_period', {
      ...(w.metric ? { metric: w.metric } : {}),
      current_from: w.current_from,
      current_to: w.current_to,
      prior_from: w.prior_from,
      prior_to: w.prior_to,
    }),
  totals: async (f) => {
    const rows = await query<MetricTotalsRow>('metric_totals', metricParams(f));
    return rows[0] ?? null;
  },
  series: (f) => query<MetricSeriesRow>('metric_series', metricParams(f)),
  breakdownNested: (f) =>
    query<NestedRow>('breakdown_nested', {
      ...metricParams(f),
      outer_dim: f.outer_dim,
      inner_dim: f.inner_dim,
    }),
  breakdownNestedTotals: (f: NestedTotalsFilter) =>
    query<NestedTotalsRow>('breakdown_nested_totals', {
      outer_dim: f.outer_dim,
      inner_dim: f.inner_dim ?? '',
      ...(f.date_from ? { date_from: f.date_from } : {}),
      ...(f.date_to ? { date_to: f.date_to } : {}),
      ...(f.campaign_phase_filter ? { campaign_phase_filter: f.campaign_phase_filter } : {}),
      ...(f.publisher_filter ? { publisher_filter: f.publisher_filter } : {}),
      ...(f.market_group_filter ? { market_group_filter: f.market_group_filter } : {}),
      ...(f.creative_format_filter ? { creative_format_filter: f.creative_format_filter } : {}),
      ...(f.kpi_goal_filter ? { kpi_goal_filter: f.kpi_goal_filter } : {}),
    }),
  dimensionValues: (dim: FilterDim, limit?: number) =>
    query<NamedValue>('dimension_values', {
      dimension: dim,
      ...(limit !== undefined ? { limit_rows: limit } : {}),
    }),
  dateRange: async () => {
    const rows = await query<DateRange>('available_date_range', {});
    return rows[0] ?? { earliest_date: '', latest_date: '', distinct_days: 0 };
  },
  campaignWindows: (f: CampaignWindowsFilter) =>
    query<CampaignWindow>('campaign_windows', {
      ...(f.date_from ? { date_from: f.date_from } : {}),
      ...(f.date_to ? { date_to: f.date_to } : {}),
      ...(f.campaign_phase_filter ? { campaign_phase_filter: f.campaign_phase_filter } : {}),
    }),
};

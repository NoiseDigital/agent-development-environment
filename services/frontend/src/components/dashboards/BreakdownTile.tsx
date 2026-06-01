'use client';

// Categorical-breakdown bar chart — one component per dim, picked by `source`.

import { useEffect, useState } from 'react';
import {
  dashboardData,
  type MetricFilter,
  type MetricKey,
  type NamedValue,
} from '../../lib/dashboards';
import { useDashboardFilters } from '../../lib/dashboards/filter-context';
import { useDashboardRefresh } from '../../lib/dashboards/refresh-context';
import { barSpec } from '../../lib/charts/specs';
import VegaChart from '../VegaChart';
import TileChartShell from './TileChartShell';

/** Maps 1:1 to a toolbox tool. Add a member here when adding a tool. */
export type BqBreakdownSource =
  | 'publisher'
  | 'campaign_phase'
  | 'platform_ctr'
  | 'market_group'
  | 'creative_format'
  | 'kpi_goal';

interface BreakdownTileProps {
  title: string;
  source: BqBreakdownSource;
  metric?: MetricKey;
  valueFormat?: string;
}

function methodFor(
  src: BqBreakdownSource,
): (f: MetricFilter) => Promise<NamedValue[]> {
  switch (src) {
    case 'publisher':       return dashboardData.publisherBreakdown;
    case 'campaign_phase':  return dashboardData.campaignBreakdown;
    case 'platform_ctr':    return dashboardData.platformBreakdown;
    case 'market_group':    return dashboardData.marketGroupBreakdown;
    case 'creative_format': return dashboardData.creativeFormatBreakdown;
    case 'kpi_goal':        return dashboardData.kpiGoalBreakdown;
  }
}

export default function BreakdownTile({
  title,
  source,
  metric,
  valueFormat,
}: BreakdownTileProps) {
  const { filters } = useDashboardFilters();
  const { version: refreshVersion } = useDashboardRefresh();
  const [rows, setRows] = useState<NamedValue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dateFrom = filters.date_from;
  const dateTo = filters.date_to;
  const phase = filters.campaign_phase;
  const publisher = filters.publisher;
  const market = filters.market_group;
  const format = filters.creative_format;
  const kpiGoal = filters.kpi_goal;

  // Skip the filter on the dim we're grouping by — otherwise it collapses to one bar.
  const selfDim: Record<BqBreakdownSource, keyof typeof filters | null> = {
    publisher: 'publisher',
    campaign_phase: 'campaign_phase',
    platform_ctr: null,
    market_group: 'market_group',
    creative_format: 'creative_format',
    kpi_goal: 'kpi_goal',
  };
  const skip = selfDim[source];

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const fetcher = methodFor(source);
    fetcher({
      metric,
      date_from: dateFrom,
      date_to: dateTo,
      campaign_phase_filter: skip === 'campaign_phase' ? undefined : phase,
      publisher_filter:      skip === 'publisher'      ? undefined : publisher,
      market_group_filter:   skip === 'market_group'   ? undefined : market,
      creative_format_filter: skip === 'creative_format' ? undefined : format,
      kpi_goal_filter:       skip === 'kpi_goal'       ? undefined : kpiGoal,
    })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setRows([]);
      });
    return () => { cancelled = true; };
  }, [source, metric, dateFrom, dateTo, phase, publisher, market, format, kpiGoal, skip, refreshVersion]);

  const dimKey: string = source === 'platform_ctr' ? 'platform' : source;
  const info = {
    summary:
      source === 'platform_ctr'
        ? 'Bar chart of click-through rate by platform. The taller the bar, the more engaging the platform was over the filtered window.'
        : `Bar chart of ${metric ?? 'spend'} grouped by ${dimKey.replace('_', ' ')}. Bars are sorted descending; hover dims the rest to focus.`,
    metricKeys: [metric ?? 'total_spend', dimKey],
    notes: [
      'The filter on this dimension is automatically suppressed so the bars don\'t collapse to one.',
    ],
  };

  if (rows === null) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="h-full w-full animate-pulse rounded-lg bg-surface-raised/40" />
      </TileChartShell>
    );
  }
  if (error) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-red-400">
          Failed to load — {error}
        </div>
      </TileChartShell>
    );
  }
  if (rows.length === 0) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-zinc-500">
          No data for the selected window.
        </div>
      </TileChartShell>
    );
  }

  const fmt = valueFormat ?? (source === 'platform_ctr' ? '.2%' : '$,.2s');
  return (
    <TileChartShell title={title} info={info}>
      <VegaChart spec={barSpec({ title: '', data: rows, valueFormat: fmt })} fill saveable />
    </TileChartShell>
  );
}

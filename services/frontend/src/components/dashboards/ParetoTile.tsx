'use client';

// Pareto / 80-20 — sorted bars + cumulative-share line.

import { useEffect, useMemo, useState } from 'react';
import {
  dashboardData,
  type MetricFilter,
  type MetricKey,
  type NamedValue,
} from '../../lib/dashboards';
import { useDashboardFilters } from '../../lib/dashboards/filter-context';
import { useDashboardRefresh } from '../../lib/dashboards/refresh-context';
import { paretoSpec } from '../../lib/charts/specs';
import VegaChart from '../VegaChart';
import TileChartShell from './TileChartShell';
import type { BqBreakdownSource } from './BreakdownTile';

interface ParetoTileProps {
  title: string;
  source: BqBreakdownSource;
  metric?: MetricKey;
  valueFormat?: string;
  /** Truncate to the top-N categories. Default = no truncation. */
  topN?: number;
}

function methodFor(src: BqBreakdownSource): (f: MetricFilter) => Promise<NamedValue[]> {
  switch (src) {
    case 'publisher':       return dashboardData.publisherBreakdown;
    case 'campaign_phase':  return dashboardData.campaignBreakdown;
    case 'platform_ctr':    return dashboardData.platformBreakdown;
    case 'market_group':    return dashboardData.marketGroupBreakdown;
    case 'creative_format': return dashboardData.creativeFormatBreakdown;
    case 'kpi_goal':        return dashboardData.kpiGoalBreakdown;
  }
}

const SELF_DIM: Record<BqBreakdownSource, keyof ReturnType<typeof useDashboardFilters>['filters'] | null> = {
  publisher: 'publisher',
  campaign_phase: 'campaign_phase',
  platform_ctr: null,
  market_group: 'market_group',
  creative_format: 'creative_format',
  kpi_goal: 'kpi_goal',
};

export default function ParetoTile({ title, source, metric, valueFormat, topN }: ParetoTileProps) {
  const { filters } = useDashboardFilters();
  const { version: refreshVersion } = useDashboardRefresh();
  const [rows, setRows] = useState<NamedValue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const skip = SELF_DIM[source];

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const fetcher = methodFor(source);
    fetcher({
      metric,
      date_from: filters.date_from,
      date_to: filters.date_to,
      campaign_phase_filter:  skip === 'campaign_phase'  ? undefined : filters.campaign_phase,
      publisher_filter:       skip === 'publisher'       ? undefined : filters.publisher,
      market_group_filter:    skip === 'market_group'    ? undefined : filters.market_group,
      creative_format_filter: skip === 'creative_format' ? undefined : filters.creative_format,
      kpi_goal_filter:        skip === 'kpi_goal'        ? undefined : filters.kpi_goal,
    })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setRows([]);
      });
    return () => { cancelled = true; };
  }, [source, metric, filters.date_from, filters.date_to, filters.campaign_phase, filters.publisher, filters.market_group, filters.creative_format, filters.kpi_goal, skip, refreshVersion]);

  const data = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const truncated = topN && topN > 0 ? sorted.slice(0, topN) : sorted;
    const total = truncated.reduce((s, r) => s + r.value, 0);
    if (total <= 0) return [];
    let running = 0;
    return truncated.map((r) => {
      const share = r.value / total;
      running += share;
      return { name: r.name, value: r.value, share, cum: running };
    });
  }, [rows, topN]);

  const dimKey: string = source === 'platform_ctr' ? 'platform' : source;
  const info = {
    summary: `Sorted bars of ${metric ?? 'spend'} by ${dimKey.replace('_', ' ')}, with an overlaid line showing cumulative share. The dashed reference is 80% — where it crosses tells you how concentrated this dimension is.`,
    metricKeys: [metric ?? 'total_spend', dimKey],
    notes: [
      'White line + right axis: cumulative share (0–100%).',
      'A line crossing 80% on the first few bars means high concentration; a flat line spread across many bars means a long tail.',
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
  if (data.length === 0) {
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
      <VegaChart spec={paretoSpec({ data, valueFormat: fmt })} fill saveable />
    </TileChartShell>
  );
}

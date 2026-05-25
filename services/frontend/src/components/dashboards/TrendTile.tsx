'use client';

// Time-series trend. Single line or dual-axis; reads from the shared
// metric_series so KPIs + trend + narrative share one fetch.

import { useEffect, useState } from 'react';
import {
  singleMetricLineSpec,
  dualMetricLineSpec,
} from '../../lib/vega-specs';
import { useDashboardTotals } from '../../lib/dashboard-totals-context';
import { useDashboardFilters } from '../../lib/dashboard-filter-context';
import { useDashboardRefresh } from '../../lib/dashboard-refresh-context';
import { dashboardData, type CampaignWindow, type MetricSeriesRow } from '../../lib/dashboards';
import VegaChart from '../VegaChart';
import TileChartShell from './TileChartShell';

type TrendMetric =
  | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
  | 'engaged_visits' | 'completed_views';

interface TrendTileProps {
  title: string;
  metric: TrendMetric;
  /** When present, renders a second line on a right axis. */
  secondaryMetric?: TrendMetric;
  /** Overlay top-N campaign flight bands behind the line(s). */
  showCampaignWindows?: boolean;
  maxCampaignWindows?: number;
}

const METRIC_LABEL: Record<TrendMetric, string> = {
  total_spend: 'Spend',
  impressions: 'Impressions',
  clicks: 'Clicks',
  landing_page_views: 'LP Views',
  engaged_visits: 'Engaged Visits',
  completed_views: 'Completed Views',
};

function fmtFor(m: TrendMetric): string {
  return m === 'total_spend' ? '$' : '';
}

export default function TrendTile({
  title,
  metric,
  secondaryMetric,
  showCampaignWindows = true,
  maxCampaignWindows = 6,
}: TrendTileProps) {
  const { series, loading } = useDashboardTotals();
  const { filters } = useDashboardFilters();
  const { version: refreshVersion } = useDashboardRefresh();
  const [windows, setWindows] = useState<CampaignWindow[]>([]);

  // Only date+phase feed this — a campaign IS the campaign regardless of slice.
  useEffect(() => {
    if (!showCampaignWindows) { setWindows([]); return; }
    let cancelled = false;
    dashboardData
      .campaignWindows({
        date_from: filters.date_from,
        date_to: filters.date_to,
        campaign_phase_filter: filters.campaign_phase,
      })
      .then((rows) => { if (!cancelled) setWindows(rows.slice(0, maxCampaignWindows)); })
      .catch(() => { /* overlay is non-essential — drop silently */ });
    return () => { cancelled = true; };
  }, [showCampaignWindows, maxCampaignWindows, filters.date_from, filters.date_to, filters.campaign_phase, refreshVersion]);

  const isDual = !!secondaryMetric && secondaryMetric !== metric;
  const metricList = isDual ? [metric, secondaryMetric!] : [metric];
  const summary = isDual
    ? `${METRIC_LABEL[metric]} (left axis) layered with ${METRIC_LABEL[secondaryMetric!]} (right axis) on independent scales. Each point is a bucket from the trend; hover any week for the crosshair tooltip.`
    : `${METRIC_LABEL[metric]} over time, one point per bucket. Hover for the exact value at any week.`;
  const notes: string[] = [];
  if (showCampaignWindows) {
    notes.push(
      windows.length > 0
        ? `Faint emerald bands behind the line are campaign flight windows (top ${windows.length} by spend). Hover for the campaign name + dates.`
        : 'Campaign flight windows would render here as faint emerald bands; none touched this window.',
    );
  }
  if (isDual) {
    notes.push('Independent left/right Y axes — magnitudes are NOT comparable across the two lines, only their shapes.');
  }
  const info = { summary, metricKeys: metricList, notes };

  if (loading || series === null) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="h-full w-full animate-pulse rounded-lg bg-surface-raised/40" />
      </TileChartShell>
    );
  }
  if (series.length === 0) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-zinc-500">
          No data for the selected window.
        </div>
      </TileChartShell>
    );
  }

  if (!isDual) {
    const data = (series as MetricSeriesRow[]).map((r) => ({
      name: r.name,
      value: Number(r[metric] ?? 0),
    }));
    return (
      <TileChartShell title={title} info={info}>
        <VegaChart
          spec={singleMetricLineSpec({ data, valueFormat: fmtFor(metric), windows })}
          fill
          saveable
        />
      </TileChartShell>
    );
  }

  return (
    <TileChartShell title={title} info={info}>
      <VegaChart
        spec={dualMetricLineSpec({
          data: series as unknown as readonly Record<string, string | number>[],
          primary: {
            field: metric,
            label: METRIC_LABEL[metric],
            format: fmtFor(metric),
          },
          secondary: {
            field: secondaryMetric!,
            label: METRIC_LABEL[secondaryMetric!],
            format: fmtFor(secondaryMetric!),
          },
          windows,
        })}
        fill
        saveable
      />
    </TileChartShell>
  );
}

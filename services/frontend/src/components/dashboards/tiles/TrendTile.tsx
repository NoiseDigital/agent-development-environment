'use client';

// Time-series trend. Single line or dual-axis; reads from the shared
// metric_series so KPIs + trend + narrative share one fetch.

import { useEffect, useState } from 'react';
import {
  singleMetricLineSpec,
  dualMetricLineSpec,
} from '../../../lib/charts/specs';
import { useDashboardTotals } from '../../../lib/dashboards/totals-context';
import { useDashboardFilters } from '../../../lib/dashboards/filter-context';
import { useDashboardRefresh } from '../../../lib/dashboards/refresh-context';
import { dashboardData, type CampaignWindow, type MetricSeriesRow } from '../../../lib/dashboards';
import VegaChart from '../../VegaChart';
import TileChartShell from './TileChartShell';
import CampaignLegend from './CampaignLegend';

type TrendMetric =
  | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
  | 'engaged_visits' | 'completed_views';

interface TrendTileProps {
  title: string;
  metric: TrendMetric;
  /** When present, renders a second line on a right axis. */
  secondaryMetric?: TrendMetric;
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
}: TrendTileProps) {
  const { series, loading } = useDashboardTotals();
  const { filters } = useDashboardFilters();
  const { version: refreshVersion } = useDashboardRefresh();
  const [windows, setWindows] = useState<CampaignWindow[]>([]);

  // Campaign overlay is OPT-IN now — only the campaigns the user picks in
  // the filter bar's "Campaign" multi-select show as markers. Auto-bands
  // were too noisy, and a 1-campaign selection adds no comparison value.
  const selectedCampaigns = (filters.campaign ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  const hasCampaignSelection = selectedCampaigns.length > 0;

  useEffect(() => {
    if (!hasCampaignSelection) { setWindows([]); return; }
    let cancelled = false;
    dashboardData
      .campaignWindows({
        date_from: filters.date_from,
        date_to: filters.date_to,
        campaign_phase_filter: filters.campaign_phase,
      })
      .then((rows) => {
        if (cancelled) return;
        const wanted = new Set(selectedCampaigns.map((s) => s.toLowerCase()));
        setWindows(rows.filter((w) => wanted.has(w.name.toLowerCase())));
      })
      .catch(() => { /* overlay is non-essential — drop silently */ });
    return () => { cancelled = true; };
    // selectedCampaigns is derived from filters.campaign — drive the effect
    // on that string so we don't re-fetch on every render.
  }, [filters.campaign, filters.date_from, filters.date_to, filters.campaign_phase, refreshVersion, hasCampaignSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDual = !!secondaryMetric && secondaryMetric !== metric;
  const metricList = isDual ? [metric, secondaryMetric!] : [metric];
  const summary = isDual
    ? `${METRIC_LABEL[metric]} (left axis) layered with ${METRIC_LABEL[secondaryMetric!]} (right axis) on independent scales. Each point is a bucket from the trend; hover any week for the crosshair tooltip.`
    : `${METRIC_LABEL[metric]} over time, one point per bucket. Hover for the exact value at any week.`;
  const notes: string[] = [];
  if (windows.length > 0) {
    notes.push(
      `${windows.length} campaign flight window${windows.length === 1 ? '' : 's'} overlaid (from the Campaign filter). Names + dates listed in the legend.`,
    );
  } else {
    notes.push(
      'Pick campaigns in the "Campaign" filter above to overlay their flight windows as comparison markers.',
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
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-faint">
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
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <VegaChart
              spec={singleMetricLineSpec({ data, valueFormat: fmtFor(metric), windows })}
              fill
            />
          </div>
          <CampaignLegend windows={windows} />
        </div>
      </TileChartShell>
    );
  }

  return (
    <TileChartShell title={title} info={info}>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
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
          />
        </div>
        <CampaignLegend windows={windows} />
      </div>
    </TileChartShell>
  );
}

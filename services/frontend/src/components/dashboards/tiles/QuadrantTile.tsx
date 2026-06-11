'use client';

// Quadrant scatter — per-dim CPC × CTR (or any rate pair) sized by spend.

import { useEffect, useMemo, useState } from 'react';
import {
  dashboardData,
  type NestedDim,
  type NestedTotalsRow,
} from '../../../lib/dashboards';
import { useDashboardFilters } from '../../../lib/dashboards/filter-context';
import { useDashboardRefresh } from '../../../lib/dashboards/refresh-context';
import { quadrantScatterSpec } from '../../../lib/charts/specs';
import VegaChart from '../../VegaChart';
import TileChartShell from './TileChartShell';

type RateMetric = 'ctr' | 'cvr' | 'cpm' | 'cpc' | 'cpa' | 'vcr';
type SizeMetric = 'total_spend' | 'impressions' | 'clicks' | 'engaged_visits';

interface QuadrantTileProps {
  title: string;
  dim: NestedDim;
  xMetric: RateMetric;
  yMetric: RateMetric;
  sizeMetric?: SizeMetric;
}

const LABEL: Record<RateMetric | SizeMetric, string> = {
  ctr: 'CTR',
  cvr: 'CVR',
  cpm: 'CPM',
  cpc: 'CPC',
  cpa: 'CPA',
  vcr: 'VCR',
  total_spend: 'Spend',
  impressions: 'Impressions',
  clicks: 'Clicks',
  engaged_visits: 'Engaged Visits',
};

function fmtFor(m: RateMetric | SizeMetric): string {
  if (m === 'ctr' || m === 'cvr' || m === 'vcr') return '%';
  if (m === 'cpc' || m === 'cpm' || m === 'cpa') return '$';
  if (m === 'total_spend') return '$';
  return '';
}

type SelfFilterKey =
  | 'publisher' | 'campaign_phase' | 'market_group' | 'creative_format' | 'kpi_goal';

// `platform` and `campaign` aren't on the filter bar, so no self-dim to skip.
const SELF_FILTER: Record<NestedDim, SelfFilterKey | null> = {
  publisher: 'publisher',
  campaign_phase: 'campaign_phase',
  platform: null,
  campaign: null,
  market_group: 'market_group',
  creative_format: 'creative_format',
  kpi_goal: 'kpi_goal',
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export default function QuadrantTile({
  title,
  dim,
  xMetric,
  yMetric,
  sizeMetric = 'total_spend',
}: QuadrantTileProps) {
  const { filters } = useDashboardFilters();
  const { version: refreshVersion } = useDashboardRefresh();
  const [rows, setRows] = useState<NestedTotalsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const skip = SELF_FILTER[dim];

  useEffect(() => {
    let cancelled = false;
    setError(null);
    dashboardData
      .breakdownNestedTotals({
        outer_dim: dim,
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
  }, [dim, filters.date_from, filters.date_to, filters.campaign_phase, filters.publisher, filters.market_group, filters.creative_format, filters.kpi_goal, skip, refreshVersion]);

  const points = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => Number(r[xMetric]) > 0 && Number(r[yMetric]) > 0)
      .map((r) => ({
        name: r.outer_name,
        x: Number(r[xMetric]),
        y: Number(r[yMetric]),
        size: Number(r[sizeMetric]) || 0,
      }));
  }, [rows, xMetric, yMetric, sizeMetric]);

  const info = {
    summary: `Scatter of every ${dim.replace('_', ' ')} on ${LABEL[xMetric]} (x) vs ${LABEL[yMetric]} (y), sized by ${LABEL[sizeMetric]}. Dashed lines mark the medians, splitting the plot into four quadrants.`,
    metricKeys: [xMetric, yMetric, sizeMetric, dim],
    notes: [
      'Quadrant colour: green = cheap + engaged, blue = expensive + engaged, amber = cheap + flat, red = expensive + flat.',
      'Filter for this dimension is suppressed so every value renders as a separate point.',
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
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-danger">
          Failed to load — {error}
        </div>
      </TileChartShell>
    );
  }
  if (points.length === 0) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-faint">
          No data for the selected window.
        </div>
      </TileChartShell>
    );
  }

  const xMedian = median(points.map((p) => p.x));
  const yMedian = median(points.map((p) => p.y));

  return (
    <TileChartShell title={title} info={info}>
      <VegaChart
        spec={quadrantScatterSpec({
          data: points,
          xLabel: LABEL[xMetric],
          yLabel: LABEL[yMetric],
          sizeLabel: LABEL[sizeMetric],
          xFormat: fmtFor(xMetric),
          yFormat: fmtFor(yMetric),
          sizeFormat: fmtFor(sizeMetric),
          xMedian,
          yMedian,
        })}
        fill
      />
    </TileChartShell>
  );
}

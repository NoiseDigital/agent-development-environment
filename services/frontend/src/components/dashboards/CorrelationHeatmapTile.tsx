'use client';

// Pairwise Pearson correlation across core metrics, computed locally from
// the weekly series already in TotalsProvider (no extra BQ call).

import { useMemo } from 'react';
import { useDashboardTotals } from '../../lib/dashboards/totals-context';
import type { MetricSeriesRow } from '../../lib/dashboards';
import { heatmapSpec } from '../../lib/charts/specs';
import VegaChart from '../VegaChart';
import TileChartShell from './TileChartShell';

interface CorrelationHeatmapTileProps {
  title: string;
}

const METRICS: { key: keyof MetricSeriesRow; label: string }[] = [
  { key: 'total_spend',     label: 'Spend' },
  { key: 'impressions',     label: 'Impr.' },
  { key: 'clicks',          label: 'Clicks' },
  { key: 'engaged_visits',  label: 'Engaged' },
  { key: 'ctr',             label: 'CTR' },
  { key: 'cpc',             label: 'CPC' },
];

function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom < 1e-12 ? 0 : num / denom;
}

export default function CorrelationHeatmapTile({ title }: CorrelationHeatmapTileProps) {
  const { series, loading } = useDashboardTotals();

  const matrix = useMemo(() => {
    if (!series || series.length < 3) return null;
    const cols = METRICS.map((m) =>
      series.map((row) => Number(row[m.key] ?? 0)).filter((n) => Number.isFinite(n)),
    );
    return METRICS.map((_, i) =>
      METRICS.map((_, j) => (i === j ? 1 : pearson(cols[i], cols[j]))),
    );
  }, [series]);

  const info = {
    summary:
      'Pairwise Pearson correlation across the dashboard\'s core metrics, computed from the weekly buckets. Cells closer to red co-move together, cells closer to blue move in opposite directions, near-black means uncorrelated.',
    metricKeys: METRICS.map((m) => String(m.key)),
    notes: [
      'Diagonal is always 1.0 by construction (a metric perfectly correlates with itself).',
      'Pairs with white borders are statistically significant — most cells aren\'t flagged here yet.',
      'Computed locally — no extra BQ call.',
    ],
  };

  if (loading || !series) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="h-full w-full animate-pulse rounded-lg bg-surface-raised/40" />
      </TileChartShell>
    );
  }
  if (!matrix) {
    return (
      <TileChartShell title={title} info={info}>
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-zinc-500">
          Not enough history to correlate.
        </div>
      </TileChartShell>
    );
  }

  const labels = METRICS.map((m) => m.label);
  return (
    <TileChartShell title={title} info={info} subtitle="Pearson r — derived from the weekly series">
      <VegaChart
        spec={heatmapSpec({
          rows: labels,
          cols: labels,
          matrix,
        })}
        fill
        saveable
      />
    </TileChartShell>
  );
}

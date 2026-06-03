'use client';

// One KPI card backed by live BigQuery. Reads the dashboard's current totals,
// prior totals (delta), AND weekly series (sparkline) from
// `useDashboardTotals` — three parallel fetches at the provider level, ALL
// KPI tiles share the same Promises. Six cards = three calls, not eighteen.
//
// Layout note: the card uses fixed-height rows (title / value / spark / badge)
// so a card with an anomaly badge stays exactly the same height as one
// without. This keeps the KPI strip in unison across the row.

import { useDashboardTotals } from '../../../lib/dashboards/totals-context';
import { formatByKey, type FormatKey } from '../../../lib/format/format';
import type { MetricTotalsRow } from '../../../lib/dashboards';
import Sparkline from '../../ui/Sparkline';
import MetricInfoTooltip from './MetricInfoTooltip';

export type BqMetricKey = keyof MetricTotalsRow;
export type BqKpiFormat = FormatKey;

export interface KpiTileProps {
  label: string;
  metric: BqMetricKey;
  format?: BqKpiFormat;
  /** When true a rising value is RED (CPC / CPM / CPA — lower is better). */
  betterLower?: boolean;
}

function formatDelta(
  current: number,
  prior: number,
  betterLower: boolean,
): { value: string; good: boolean } | undefined {
  if (!Number.isFinite(prior) || prior === 0) return undefined;
  const pctChange = (current - prior) / prior;
  if (!Number.isFinite(pctChange)) return undefined;
  const sign = pctChange >= 0 ? '+' : '';
  const value = `${sign}${(pctChange * 100).toFixed(1)}%`;
  const good = betterLower ? pctChange < 0 : pctChange > 0;
  return { value, good };
}

/** Z-score of the most recent series point against the rest of the series.
 *  Returns the score, or null when the series is too short / flat to mean
 *  anything. ≥ 2σ is the badge threshold. */
function lastPointZ(values: number[]): number | null {
  if (values.length < 5) return null;
  const last = values[values.length - 1];
  const head = values.slice(0, -1);
  const mean = head.reduce((s, v) => s + v, 0) / head.length;
  const variance =
    head.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, head.length - 1);
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return null;
  return (last - mean) / sd;
}

/** Title row — shared between loading and loaded states so the title's
 *  vertical position is identical in both. Uses `<div>` instead of `<p>`
 *  because the tooltip badge renders its own `<div>` (no nested-div-in-p
 *  hydration error). */
function TitleRow({ label, metric }: { label: string; metric: BqMetricKey }) {
  return (
    <div className="flex h-3 items-center justify-center gap-1 truncate text-[10px] font-medium uppercase tracking-wider text-zinc-500">
      <span className="truncate">{label}</span>
      <MetricInfoTooltip metricKey={metric} labelOverride={label} />
    </div>
  );
}

export default function KpiTile({
  label,
  metric,
  format = 'compact',
  betterLower,
}: KpiTileProps) {
  const { current, prior, series, loading } = useDashboardTotals();

  if (loading || !current) {
    return (
      <div className="grid h-full grid-rows-[auto_1fr_auto_auto] place-items-center gap-1 text-center">
        <TitleRow label={label} metric={metric} />
        <span className="text-[1.6rem] font-semibold leading-none tabular-nums text-zinc-600">—</span>
        <div className="h-[18px]" />
        <div className="h-3" />
      </div>
    );
  }

  const value = formatByKey(current[metric] ?? 0, format);
  const delta = prior
    ? formatDelta(Number(current[metric] ?? 0), Number(prior[metric] ?? 0), !!betterLower)
    : undefined;
  const sparkValues = (series ?? [])
    .map((row) => Number(row[metric] ?? 0))
    .filter((n) => Number.isFinite(n));
  const tone = !delta ? 'neutral' : delta.good ? 'positive' : 'negative';

  const z = lastPointZ(sparkValues);
  const anomaly =
    z !== null && Math.abs(z) >= 2
      ? {
          good: betterLower ? z < 0 : z > 0,
          label: `${z >= 0 ? '+' : ''}${z.toFixed(1)}σ`,
        }
      : null;

  // 4-row grid keeps every card geometrically identical regardless of which
  // cards show a delta, an anomaly, or have a flat sparkline. Empty rows are
  // rendered as placeholders so adjacent cards align value-baseline-to-value.
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto_auto] place-items-center gap-1 text-center">
      <TitleRow label={label} metric={metric} />
      <div className="flex items-baseline justify-center gap-1.5">
        <span className="truncate text-[1.6rem] font-semibold leading-none tabular-nums text-white">
          {value}
        </span>
        {delta && (
          <span
            className={`flex shrink-0 items-center gap-0.5 text-[11px] font-medium ${
              delta.good ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {delta.value.trim().startsWith('-') ? '▼' : '▲'}
            {delta.value}
          </span>
        )}
        {/* Anomaly sits inline next to the delta so the value-baseline of every
            card stays at the same Y position. Sigma label is compact ("+2.1σ"). */}
        {anomaly && (
          <span
            title={`Most recent bucket is ${anomaly.label} from the rest of the series.`}
            className={`rounded-full border px-1.5 py-px text-[9px] font-medium leading-tight ${
              anomaly.good
                ? 'border-emerald-500/40 bg-emerald-400/10 text-emerald-300'
                : 'border-red-500/40 bg-red-400/10 text-red-300'
            }`}
          >
            {anomaly.label}
          </span>
        )}
      </div>
      <div className="h-[18px]">
        {sparkValues.length >= 2 && (
          <Sparkline values={sparkValues} tone={tone} width={96} height={18} ariaLabel={`${label} trend`} />
        )}
      </div>
      <div className="h-3" />
    </div>
  );
}

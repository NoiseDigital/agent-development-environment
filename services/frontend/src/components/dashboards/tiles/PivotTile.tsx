'use client';

// Pivot table fed by live BigQuery via `breakdown_nested_totals` — one BQ
// call returns every metric column the table renders, grouped by (outer,
// inner). Replaces the legacy mock PivotTile end-to-end.
//
// The visual is the same expandable group-rows layout: outer values are the
// group rows, inner values render as expandable children, and a totals row
// is pinned in bold at the bottom (read from the TotalsProvider).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  dashboardData,
  type NestedDim,
  type NestedTotalsRow,
} from '../../../lib/dashboards';
import { useDashboardFilters } from '../../../lib/dashboards/filter-context';
import { useDashboardRefresh } from '../../../lib/dashboards/refresh-context';
import { useDashboardTotals } from '../../../lib/dashboards/totals-context';
import { formatByKey, type FormatKey } from '../../../lib/format';
import MetricInfoTooltip from './MetricInfoTooltip';
import TileChartShell from './TileChartShell';

/** The metric columns the pivot can render. Subset of `MetricTotalsRow` —
 *  only the metrics that make sense in a pivot context (no `budget`). */
type PivotMetric =
  | 'total_spend' | 'impressions' | 'clicks' | 'landing_page_views'
  | 'engaged_visits' | 'completed_views'
  | 'ctr' | 'cvr' | 'cpm' | 'cpc' | 'cpa' | 'vcr';

export interface PivotColumnSpec {
  key: PivotMetric;
  label: string;
  /** Canonical format key from `lib/format.ts`. Same vocabulary the KPI strip
   *  and Vega axes use, so a "Spend" column reads the same everywhere. */
  format: FormatKey;
}

interface PivotTileProps {
  title: string;
  outerDim: NestedDim;
  /** Empty for single-level grouping by outer_dim. */
  innerDim?: NestedDim;
  /** Header label for the first column (the row-name column). */
  rowHeader: string;
  columns: PivotColumnSpec[];
}

interface Group {
  label: string;
  total_spend: number;
  values: NestedTotalsRow;
  children: NestedTotalsRow[];
}

export default function PivotTile({
  title,
  outerDim,
  innerDim,
  rowHeader,
  columns,
}: PivotTileProps) {
  const { filters } = useDashboardFilters();
  const totalsCtx = useDashboardTotals();
  const { version: refreshVersion } = useDashboardRefresh();
  const [rows, setRows] = useState<NestedTotalsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const dateFrom = filters.date_from;
  const dateTo = filters.date_to;
  const phase = filters.campaign_phase;
  const publisher = filters.publisher;
  const market = filters.market_group;
  const format = filters.creative_format;
  const kpiGoal = filters.kpi_goal;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    dashboardData
      .breakdownNestedTotals({
        outer_dim: outerDim,
        inner_dim: innerDim,
        date_from: dateFrom,
        date_to: dateTo,
        campaign_phase_filter: phase,
        publisher_filter: publisher,
        market_group_filter: market,
        creative_format_filter: format,
        kpi_goal_filter: kpiGoal,
      })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setRows([]);
      });
    return () => { cancelled = true; };
  }, [outerDim, innerDim, dateFrom, dateTo, phase, publisher, market, format, kpiGoal, refreshVersion]);

  // Rates in group rows are RE-DERIVED from summed counts, not averaged.
  const groups = useMemo<Group[]>(() => {
    if (!rows) return [];
    if (!innerDim) {
      // Single-level grouping: every row IS a group with no children.
      return rows.map((r) => ({
        label: r.outer_name,
        total_spend: r.total_spend,
        values: r,
        children: [],
      }));
    }
    const byOuter = new Map<string, NestedTotalsRow[]>();
    for (const r of rows) {
      const arr = byOuter.get(r.outer_name) ?? [];
      arr.push(r);
      byOuter.set(r.outer_name, arr);
    }
    return [...byOuter.entries()].map(([label, children]) => ({
      label,
      total_spend: children.reduce((s, r) => s + r.total_spend, 0),
      values: aggregateRows(children),
      children,
    })).sort((a, b) => b.total_spend - a.total_spend);
  }, [rows, innerDim]);

  if (rows === null) {
    return <div className="h-full min-h-[160px] w-full animate-pulse rounded-lg bg-surface-raised/40" />;
  }
  if (error) {
    return (
      <div className="flex h-full min-h-[160px] w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-red-400">
        Failed to load — {error}
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="flex h-full min-h-[160px] w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-zinc-500">
        No data for the selected window.
      </div>
    );
  }

  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const cell = (r: NestedTotalsRow, c: PivotColumnSpec) =>
    formatByKey(Number(r[c.key] ?? 0), c.format);

  const flatRows: ReactNode[] = [];
  groups.forEach((g, gi) => {
    const key = `g-${gi}`;
    const hasChildren = g.children.length > 0;
    const expanded = open.has(key);
    flatRows.push(
      <tr key={key} className="border-t border-zinc-800/70 hover:bg-zinc-800/30">
        <td className="py-1.5 pr-3" style={{ paddingLeft: 8 }}>
          <button
            type="button"
            onClick={() => hasChildren && toggle(key)}
            className={`flex items-center gap-1.5 text-left ${hasChildren ? 'no-drag cursor-pointer' : 'cursor-default'}`}
          >
            <span className="w-3 text-zinc-500">
              {hasChildren ? <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span> : null}
            </span>
            <span className="font-medium text-zinc-200">{g.label}</span>
          </button>
        </td>
        {columns.map((c) => (
          <td key={c.key} className="px-3 py-1.5 text-right tabular-nums text-zinc-300">
            {cell(g.values, c)}
          </td>
        ))}
      </tr>,
    );
    if (expanded) {
      g.children.forEach((child, ci) => {
        flatRows.push(
          <tr key={`${key}.${ci}`} className="border-t border-zinc-800/70 hover:bg-zinc-800/30">
            <td className="py-1.5 pr-3" style={{ paddingLeft: 8 + 18 }}>
              <span className="text-zinc-400">{child.inner_name}</span>
            </td>
            {columns.map((c) => (
              <td key={c.key} className="px-3 py-1.5 text-right tabular-nums text-zinc-300">
                {cell(child, c)}
              </td>
            ))}
          </tr>,
        );
      });
    }
  });

  // Bottom row reads from the shared TotalsProvider — matches the KPI strip.
  const total = totalsCtx.current;

  const info = {
    summary: innerDim
      ? `Performance pivot grouped by ${outerDim.replace('_', ' ')} → ${innerDim.replace('_', ' ')}. Click a group row to expand its inner breakdown. Bottom totals row mirrors the KPI strip exactly.`
      : `Performance pivot grouped by ${outerDim.replace('_', ' ')}. Bottom totals row mirrors the KPI strip exactly.`,
    metricKeys: [outerDim, ...(innerDim ? [innerDim] : []), ...columns.map((c) => c.key)],
    notes: [
      'Rate columns (CTR / CVR / CPC / etc.) in group rows are re-derived from summed counts, not averages of children.',
    ],
  };

  return (
    <TileChartShell title={title} info={info}>
      <div className="no-drag h-full overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500">
              <th className="py-1.5 pr-3 text-left font-medium">{rowHeader}</th>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-1.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    <span>{c.label}</span>
                    <MetricInfoTooltip metricKey={c.key} labelOverride={c.label} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flatRows}
            <tr className="border-t-2 border-zinc-700 font-semibold text-white">
              <td className="py-2 pr-3" style={{ paddingLeft: 8 }}>Total</td>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                  {total ? formatByKey(Number(total[c.key] ?? 0), c.format) : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </TileChartShell>
  );
}

function aggregateRows(rows: NestedTotalsRow[]): NestedTotalsRow {
  const sum = (k: keyof NestedTotalsRow) =>
    rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const total_spend = sum('total_spend');
  const impressions = sum('impressions');
  const clicks = sum('clicks');
  const landing_page_views = sum('landing_page_views');
  const engaged_visits = sum('engaged_visits');
  const completed_views = sum('completed_views');
  const safe = (n: number, d: number) => (d > 0 ? n / d : 0);
  return {
    outer_name: rows[0]?.outer_name ?? '',
    inner_name: '',
    total_spend,
    impressions,
    clicks,
    landing_page_views,
    engaged_visits,
    completed_views,
    budget: sum('budget'),
    ctr: safe(clicks, impressions),
    cvr: safe(engaged_visits, clicks),
    cpm: safe(total_spend * 1000, impressions),
    cpc: safe(total_spend, clicks),
    cpa: safe(total_spend, engaged_visits),
    vcr: safe(completed_views, impressions),
  };
}

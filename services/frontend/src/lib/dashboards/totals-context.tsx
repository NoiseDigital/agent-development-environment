'use client';

// Dashboard totals — fetched ONCE per dashboard render and shared by every
// KPI tile through this context. A naive per-tile fetch would mean N calls
// for N KPIs (typically 6) plus N more for the prior-window comparisons.
// Lifting the fetch here keeps it to two `metric_totals` calls regardless of
// how many KPI tiles consume the result.
//
// Window resolution:
// - If the user has set a date filter, that IS the current window. The prior
//   window is the same span immediately before it.
// - With no filter, the full available BQ history is the universe. We split
//   it in half — back half is "current", front half is "prior" — so the user
//   sees a meaningful delta on first load instead of an empty prior.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { dashboardData, type MetricTotalsRow, type MetricSeriesRow } from '.';
import { useDashboardFilters } from './filter-context';
import { useDashboardRefresh } from './refresh-context';

interface WindowPair {
  current: { date_from: string; date_to: string };
  prior: { date_from: string; date_to: string };
}

interface TotalsValue {
  current: MetricTotalsRow | null;
  prior: MetricTotalsRow | null;
  /** Weekly buckets across the CURRENT window — drives the KPI sparklines.
   *  null until the fetch resolves; empty array if BQ returned no rows. */
  series: MetricSeriesRow[] | null;
  windows: WindowPair | null;
  loading: boolean;
}

const Ctx = createContext<TotalsValue | null>(null);

const DAY_MS = 86_400_000;

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function spanDays(from: string, to: string): number {
  const t = new Date(`${to}T00:00:00Z`).getTime();
  const f = new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((t - f) / DAY_MS) + 1);
}

async function resolveWindows(
  dateFrom: string | undefined,
  dateTo: string | undefined,
): Promise<WindowPair | null> {
  if (dateFrom && dateTo) {
    const days = spanDays(dateFrom, dateTo);
    return {
      current: { date_from: dateFrom, date_to: dateTo },
      prior: {
        date_from: addDays(dateFrom, -days),
        date_to: addDays(dateFrom, -1),
      },
    };
  }
  // No filter — split the full available history in half.
  const range = await dashboardData.dateRange();
  if (!range.earliest_date || !range.latest_date) return null;
  const total = spanDays(range.earliest_date, range.latest_date);
  const half = Math.floor(total / 2);
  if (half < 1) {
    // Trivial range — degenerate, treat the whole thing as current.
    return {
      current: { date_from: range.earliest_date, date_to: range.latest_date },
      prior: { date_from: range.earliest_date, date_to: range.earliest_date },
    };
  }
  const priorTo = addDays(range.earliest_date, half - 1);
  return {
    current: { date_from: addDays(priorTo, 1), date_to: range.latest_date },
    prior: { date_from: range.earliest_date, date_to: priorTo },
  };
}

export function DashboardTotalsProvider({ children }: { children: ReactNode }) {
  const { filters } = useDashboardFilters();
  const { version: refreshVersion } = useDashboardRefresh();
  const [state, setState] = useState<TotalsValue>({
    current: null,
    prior: null,
    series: null,
    windows: null,
    loading: true,
  });

  // Every filter dim from the bar is threaded into metric_totals + metric_series.
  // Categorical filters (publisher / market / format / kpi_goal) are passed
  // alongside campaign_phase + the date window so the KPI strip, sparklines,
  // and the trend tile (which reads from `series`) all narrow to the same
  // slice the bar describes.
  const fromKey = filters.date_from;
  const toKey = filters.date_to;
  const phaseKey = filters.campaign_phase;
  const publisherKey = filters.publisher;
  const marketKey = filters.market_group;
  const formatKey = filters.creative_format;
  const kpiGoalKey = filters.kpi_goal;

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    (async () => {
      const windows = await resolveWindows(fromKey, toKey);
      if (!windows) {
        if (!cancelled) setState({ current: null, prior: null, series: null, windows: null, loading: false });
        return;
      }
      const filterArgs = {
        campaign_phase_filter: phaseKey,
        publisher_filter: publisherKey,
        market_group_filter: marketKey,
        creative_format_filter: formatKey,
        kpi_goal_filter: kpiGoalKey,
      };
      const [current, prior, series] = await Promise.all([
        dashboardData
          .totals({
            date_from: windows.current.date_from,
            date_to: windows.current.date_to,
            ...filterArgs,
          })
          .catch(() => null),
        dashboardData
          .totals({
            date_from: windows.prior.date_from,
            date_to: windows.prior.date_to,
            ...filterArgs,
          })
          .catch(() => null),
        dashboardData
          .series({
            date_from: windows.current.date_from,
            date_to: windows.current.date_to,
            ...filterArgs,
          })
          .catch(() => [] as MetricSeriesRow[]),
      ]);
      if (!cancelled) setState({ current, prior, series, windows, loading: false });
    })();
    return () => { cancelled = true; };
  }, [fromKey, toKey, phaseKey, publisherKey, marketKey, formatKey, kpiGoalKey, refreshVersion]);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardTotals(): TotalsValue {
  return (
    useContext(Ctx) ?? {
      current: null,
      prior: null,
      series: null,
      windows: null,
      loading: false,
    }
  );
}

// ── Media query layer ─────────────────────────────────────────────────────────
// Aggregation over the media model — filter ad lines, roll up their daily
// performance, bucket it into series, group it for pivots, and compute pacing.
// Dashboards read everything through here, so a tab/filter is just a PerfFilter.

import {
  adLines,
  performanceData,
  platformById,
  keywords,
  type AdLine,
  type KpiGoal,
  type PerformanceDay,
} from '../data/media-model';

export interface PerfFilter {
  campaignId?: string;
  clientId?: string;
  kpiGoal?: KpiGoal;
  platformId?: string;
  market?: string;
  marketGroup?: string;
  dateFrom?: string; // YYYY-MM-DD inclusive
  dateTo?: string;
}

export interface MetricTotals {
  spend: number;
  impressions: number;
  viewableImpressions: number;
  clicks: number;
  conversions: number;
  videoCompletions: number;
  // derived
  cpm: number;
  cpc: number;
  ctr: number;
  cvr: number;
  cpa: number;
  vcr: number;
  viewability: number;
}

const div = (a: number, b: number): number => (b > 0 ? a / b : 0);

/** Ad lines matching the plan-level fields of a filter. */
export function selectAdLines(f: PerfFilter): AdLine[] {
  return adLines.filter(
    (l) =>
      (!f.campaignId || l.campaignId === f.campaignId) &&
      (!f.clientId || l.clientId === f.clientId) &&
      (!f.kpiGoal || l.kpiGoal === f.kpiGoal) &&
      (!f.platformId || l.platformId === f.platformId) &&
      (!f.market || l.market === f.market) &&
      (!f.marketGroup || l.marketGroup === f.marketGroup),
  );
}

/** Daily performance rows for the ad lines + date window a filter selects. */
export function selectPerformance(f: PerfFilter): PerformanceDay[] {
  const ids = new Set(selectAdLines(f).map((l) => l.id));
  return performanceData.filter(
    (p) =>
      ids.has(p.adLineId) &&
      (!f.dateFrom || p.date >= f.dateFrom) &&
      (!f.dateTo || p.date <= f.dateTo),
  );
}

/** Roll daily rows into totals + derived rates. */
export function aggregate(rows: PerformanceDay[]): MetricTotals {
  const t = rows.reduce(
    (s, r) => {
      s.spend += r.spend;
      s.impressions += r.impressions;
      s.viewableImpressions += r.viewableImpressions;
      s.clicks += r.clicks;
      s.conversions += r.conversions;
      s.videoCompletions += r.videoCompletions;
      return s;
    },
    { spend: 0, impressions: 0, viewableImpressions: 0, clicks: 0, conversions: 0, videoCompletions: 0 },
  );
  return {
    ...t,
    cpm: div(t.spend, t.impressions) * 1000,
    cpc: div(t.spend, t.clicks),
    ctr: div(t.clicks, t.impressions),
    cvr: div(t.conversions, t.clicks),
    cpa: div(t.spend, t.conversions),
    vcr: div(t.videoCompletions, t.impressions),
    viewability: div(t.viewableImpressions, t.impressions),
  };
}

/** Convenience: totals for whatever a filter selects. */
export function totals(f: PerfFilter): MetricTotals {
  return aggregate(selectPerformance(f));
}

// ── Time series ───────────────────────────────────────────────────────────────

export interface SeriesPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  videoCompletions: number;
}

function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

/** Bucket daily rows into a sorted day- or week-grain series. */
export function timeSeries(rows: PerformanceDay[], bucket: 'day' | 'week' = 'week'): SeriesPoint[] {
  const map = new Map<string, SeriesPoint>();
  for (const r of rows) {
    const key = bucket === 'week' ? weekStart(r.date) : r.date;
    let pt = map.get(key);
    if (!pt) {
      pt = { date: key, spend: 0, impressions: 0, clicks: 0, conversions: 0, videoCompletions: 0 };
      map.set(key, pt);
    }
    pt.spend += r.spend;
    pt.impressions += r.impressions;
    pt.clicks += r.clicks;
    pt.conversions += r.conversions;
    pt.videoCompletions += r.videoCompletions;
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ── Breakdowns (for pivots and comparison charts) ─────────────────────────────

export type AdLineDimension =
  | 'platformId'
  | 'market'
  | 'marketGroup'
  | 'kpiGoal'
  | 'tactic'
  | 'format';

export interface BreakdownRow {
  key: string;
  label: string;
  totals: MetricTotals;
  children?: BreakdownRow[];
}

function dimLabel(dim: AdLineDimension, value: string): string {
  if (dim === 'platformId') return platformById(value).name;
  if (dim === 'kpiGoal') return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

function inWindow(f: PerfFilter, date: string): boolean {
  return (!f.dateFrom || date >= f.dateFrom) && (!f.dateTo || date <= f.dateTo);
}

function aggregateLines(lines: AdLine[], f: PerfFilter): MetricTotals {
  const ids = new Set(lines.map((l) => l.id));
  return aggregate(performanceData.filter((p) => ids.has(p.adLineId) && inWindow(f, p.date)));
}

/** Group the filter's ad lines by one dimension, aggregated, spend-desc. */
export function breakdown(f: PerfFilter, dim: AdLineDimension): BreakdownRow[] {
  const groups = new Map<string, AdLine[]>();
  for (const l of selectAdLines(f)) {
    const v = String(l[dim]);
    const bucket = groups.get(v);
    if (bucket) bucket.push(l);
    else groups.set(v, [l]);
  }
  return [...groups.entries()]
    .map(([v, lines]) => ({ key: v, label: dimLabel(dim, v), totals: aggregateLines(lines, f) }))
    .sort((a, b) => b.totals.spend - a.totals.spend);
}

/** Two-level grouping (e.g. marketGroup → market) for a hierarchical pivot. */
export function breakdownNested(
  f: PerfFilter,
  [outer, inner]: [AdLineDimension, AdLineDimension],
): BreakdownRow[] {
  const groups = new Map<string, AdLine[]>();
  for (const l of selectAdLines(f)) {
    const v = String(l[outer]);
    const bucket = groups.get(v);
    if (bucket) bucket.push(l);
    else groups.set(v, [l]);
  }
  return [...groups.entries()]
    .map(([v, lines]) => {
      const childGroups = new Map<string, AdLine[]>();
      for (const l of lines) {
        const cv = String(l[inner]);
        const b = childGroups.get(cv);
        if (b) b.push(l);
        else childGroups.set(cv, [l]);
      }
      return {
        key: v,
        label: dimLabel(outer, v),
        totals: aggregateLines(lines, f),
        children: [...childGroups.entries()]
          .map(([cv, cl]) => ({ key: cv, label: dimLabel(inner, cv), totals: aggregateLines(cl, f) }))
          .sort((a, b) => b.totals.spend - a.totals.spend),
      };
    })
    .sort((a, b) => b.totals.spend - a.totals.spend);
}

// ── Pacing ────────────────────────────────────────────────────────────────────

export interface Pacing {
  budget: number;
  spend: number;
  pct: number; // spend / budget
}

/** Planned budget vs. spend for whatever a filter selects. */
export function pacing(f: PerfFilter): Pacing {
  const budget = selectAdLines(f).reduce((s, l) => s + l.budget, 0);
  const spend = totals(f).spend;
  return { budget, spend, pct: div(spend, budget) };
}

// ── Keyword performance (search deep-dive) ────────────────────────────────────

export interface KeywordAgg {
  keyword: string;
  matchType: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

/** Keyword-level rows for the search ad lines a filter selects, merged across
 *  ad lines by keyword and ranked by cost. */
export function keywordRows(f: PerfFilter): KeywordAgg[] {
  const ids = new Set(selectAdLines(f).map((l) => l.id));
  const merged = new Map<
    string,
    { matchType: string; impressions: number; clicks: number; cost: number; conversions: number }
  >();
  for (const k of keywords) {
    if (!ids.has(k.adLineId)) continue;
    const cur = merged.get(k.keyword);
    if (cur) {
      cur.impressions += k.impressions;
      cur.clicks += k.clicks;
      cur.cost += k.cost;
      cur.conversions += k.conversions;
    } else {
      merged.set(k.keyword, {
        matchType: k.matchType,
        impressions: k.impressions,
        clicks: k.clicks,
        cost: k.cost,
        conversions: k.conversions,
      });
    }
  }
  return [...merged.entries()]
    .map(([keyword, m]) => ({
      keyword,
      ...m,
      ctr: div(m.clicks, m.impressions),
      cpc: div(m.cost, m.clicks),
    }))
    .sort((a, b) => b.cost - a.cost);
}

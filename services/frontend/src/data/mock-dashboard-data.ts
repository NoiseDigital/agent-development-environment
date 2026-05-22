import { ChartData } from '../types/chart';
import {
  selectAdLines,
  selectPerformance,
  aggregate,
  timeSeries,
  breakdown,
  breakdownNested,
  pacing,
  keywordRows,
  type PerfFilter,
  type MetricTotals,
  type BreakdownRow,
} from '../lib/media-query';
import { clients, campaigns } from './media-model';
import type { UserDashboardSpec } from '../lib/user-dashboards';
import { newId } from '../lib/id';

// ── Tile model ────────────────────────────────────────────────────────────────
// A dashboard tab is a set of tiles on a hidden 12-column grid. Tile DATA is
// derived from the media model (see the builder below); tile LAYOUT is the
// code-defined report arrangement, still draggable/resizable in the UI.

export type TileType = 'chart' | 'text' | 'kpi' | 'pivot' | 'narrative';

export interface GridPos {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface BaseTile {
  id: string;
  layout: GridPos;
}

export interface ChartTile extends BaseTile {
  type: 'chart';
  chart: ChartData;
}

export interface TextTile extends BaseTile {
  type: 'text';
  text: string;
}

/** A change indicator on a KPI card — `good` drives the colour, independent of
 *  sign (a falling CPC is good). */
export interface KpiDelta {
  value: string;
  good: boolean;
}

export interface KpiTile extends BaseTile {
  type: 'kpi';
  label: string;
  value: string;
  delta?: KpiDelta;
  sublabel?: string;
}

export interface PivotColumn {
  key: string;
  label: string;
}

export interface PivotRow {
  label: string;
  values: Record<string, string>;
  /** Row-level trend (spend, recent vs prior half) — top-level rows only. */
  delta?: KpiDelta;
  children?: PivotRow[];
}

export interface PivotTile extends BaseTile {
  type: 'pivot';
  title: string;
  /** Header label for the first (row-name) column, e.g. "Market" or "Keyword". */
  rowHeader: string;
  columns: PivotColumn[];
  rows: PivotRow[];
  total: PivotRow;
}

/** An agent-written summary panel — the "powered by Noise" insight layer. */
export interface NarrativeTile extends BaseTile {
  type: 'narrative';
  title: string;
  points: string[];
}

export type DashboardTile = ChartTile | TextTile | KpiTile | PivotTile | NarrativeTile;

// ── Dashboard model ───────────────────────────────────────────────────────────

export type DashboardOwnership = 'owned' | 'shared' | 'client';

/** One tab of a dashboard — a filtered view, its tiles derived from the model. */
export interface DashboardTab {
  id: string;
  label: string;
  tiles: DashboardTile[];
}

export interface Dashboard {
  id: string;
  name: string;
  client: string;
  clientInitials: string;
  owner: string;
  ownership: DashboardOwnership;
  lastUpdated: string;
  description: string;
  accentColor: string;
  filters: string[];
  /** The campaign whose ad lines + performance this dashboard reports on. */
  campaignId: string;
  tabs: DashboardTab[];
}

// ── Metric formatting + metadata ──────────────────────────────────────────────

const usd0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const usd2 = (n: number) => '$' + n.toFixed(2);
const num0 = (n: number) => Math.round(n).toLocaleString('en-US');
const compact = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
const pct = (n: number) => (n * 100).toFixed(2) + '%';

type MetricKey = keyof MetricTotals;

const METRIC: Record<MetricKey, { label: string; fmt: (n: number) => string; betterLower?: boolean }> = {
  spend: { label: 'Spend', fmt: usd0 },
  impressions: { label: 'Impressions', fmt: compact },
  viewableImpressions: { label: 'Viewable Impr.', fmt: compact },
  clicks: { label: 'Clicks', fmt: num0 },
  conversions: { label: 'Conversions', fmt: num0 },
  videoCompletions: { label: 'Video Completions', fmt: compact },
  cpm: { label: 'CPM', fmt: usd2, betterLower: true },
  cpc: { label: 'Avg. CPC', fmt: usd2, betterLower: true },
  ctr: { label: 'CTR', fmt: pct },
  cvr: { label: 'Conv. Rate', fmt: pct },
  cpa: { label: 'CPA', fmt: usd2, betterLower: true },
  vcr: { label: 'VCR', fmt: pct },
  viewability: { label: 'Viewability', fmt: pct },
};

// ── Tab derivation ────────────────────────────────────────────────────────────

export type TabKind = 'overall' | 'awareness' | 'engagement' | 'conversion';

// Each KPI-goal tab leads with the metrics that goal is optimised for.
const KPI_SET: Record<TabKind, MetricKey[]> = {
  overall: ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'conversions'],
  awareness: ['spend', 'impressions', 'viewableImpressions', 'cpm', 'viewability', 'vcr'],
  engagement: ['spend', 'clicks', 'ctr', 'videoCompletions', 'cpc', 'impressions'],
  conversion: ['spend', 'conversions', 'cvr', 'cpa', 'clicks', 'ctr'],
};

type SeriesMetric = 'spend' | 'impressions' | 'clicks' | 'conversions';

// Each tab's hero trend pairs two metrics on a dual-axis chart (left/right Y).
const TREND_PAIR: Record<TabKind, [SeriesMetric, SeriesMetric]> = {
  overall: ['spend', 'impressions'],
  awareness: ['impressions', 'spend'],
  engagement: ['clicks', 'spend'],
  conversion: ['conversions', 'spend'],
};

const PIVOT_COLUMNS: PivotColumn[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'Avg. CPC' },
];

const fmtWeek = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

function kpiDelta(key: MetricKey, prior: MetricTotals, recent: MetricTotals): KpiDelta | undefined {
  const a = prior[key];
  const b = recent[key];
  if (!a || !isFinite(a) || !isFinite(b)) return undefined;
  const change = (b - a) / a;
  const betterLower = METRIC[key].betterLower ?? false;
  return {
    value: `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`,
    good: betterLower ? change < 0 : change >= 0,
  };
}

function pivotCells(t: MetricTotals): Record<string, string> {
  return {
    spend: usd0(t.spend),
    impressions: compact(t.impressions),
    clicks: num0(t.clicks),
    ctr: pct(t.ctr),
    cpc: usd2(t.cpc),
  };
}

function pivotRow(r: BreakdownRow, deltaByKey?: Map<string, KpiDelta | undefined>): PivotRow {
  return {
    label: r.label,
    values: pivotCells(r.totals),
    delta: deltaByKey?.get(r.key),
    children: r.children?.map((c) => pivotRow(c)),
  };
}

// A short, data-derived analyst summary — the templated stand-in for a live
// agent call. Same data the tiles aggregate, turned into plain-language points.
function buildNarrative(
  filter: PerfFilter,
  kind: TabKind,
  totals: MetricTotals,
  prior: MetricTotals,
  recent: MetricTotals,
): string[] {
  const points: string[] = [];
  const pace = pacing(filter);
  points.push(`Spend is pacing at ${Math.round(pace.pct * 100)}% of the ${usd0(pace.budget)} plan.`);

  if (prior.ctr > 0) {
    const change = (recent.ctr - prior.ctr) / prior.ctr;
    points.push(
      `CTR ${change >= 0 ? 'improved' : 'declined'} ${Math.abs(change * 100).toFixed(0)}% versus the first half of the flight.`,
    );
  }

  const topPlatform = breakdown(filter, 'platformId')[0];
  if (topPlatform && totals.spend > 0) {
    const share = Math.round((topPlatform.totals.spend / totals.spend) * 100);
    points.push(`${topPlatform.label} led delivery at ${usd0(topPlatform.totals.spend)} (${share}% of spend).`);
  }

  if (kind === 'conversion') {
    points.push(`Conversion lines returned a ${usd2(totals.cpa)} blended CPA on ${num0(totals.conversions)} conversions.`);
  } else if (kind === 'awareness') {
    points.push(`Awareness reached ${compact(totals.impressions)} impressions at ${pct(totals.viewability)} viewability.`);
  } else if (kind === 'engagement') {
    points.push(`Engagement lines drove ${num0(totals.clicks)} clicks at a ${pct(totals.ctr)} CTR.`);
  } else {
    points.push(`Delivered ${compact(totals.impressions)} impressions and ${num0(totals.conversions)} conversions to date.`);
  }
  return points;
}

/** Derive a tab's full tile set — KPI strip, a hero trend + analyst narrative,
 *  a platform breakdown, and a market pivot — all from the model. */
export function buildTab(prefix: string, campaignId: string, kind: TabKind): DashboardTile[] {
  const filter: PerfFilter = { campaignId, kpiGoal: kind === 'overall' ? undefined : kind };
  const rows = selectPerformance(filter);
  const totals = aggregate(rows);

  // Split the flight in half for recent-vs-prior deltas.
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const midIdx = Math.floor(dates.length / 2);
  const recentStart = dates[midIdx] ?? '';
  const priorEnd = dates[midIdx - 1] ?? '';
  const prior = aggregate(rows.filter((r) => recentStart && r.date < recentStart));
  const recent = aggregate(rows.filter((r) => recentStart && r.date >= recentStart));

  // KPI strip
  const kpiTiles: KpiTile[] = KPI_SET[kind].map((key, i) => ({
    id: `${prefix}-kpi-${i}`,
    type: 'kpi',
    label: METRIC[key].label,
    value: METRIC[key].fmt(totals[key]),
    delta: kpiDelta(key, prior, recent),
    layout: { x: (i % 6) * 2, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
  }));

  // Hero trend chart (2/3 width, dual-axis) + analyst narrative beside it
  const [trendA, trendB] = TREND_PAIR[kind];
  const series = timeSeries(rows, 'week');
  const trend: ChartData = {
    type: 'line',
    dualAxis: true,
    title: `${METRIC[trendA].label} vs. ${METRIC[trendB].label}`,
    insight: `Weekly ${METRIC[trendA].label.toLowerCase()} and ${METRIC[trendB].label.toLowerCase()}.`,
    data: series.map((p) => ({
      name: fmtWeek(p.date),
      [METRIC[trendA].label]: Math.round(p[trendA]),
      [METRIC[trendB].label]: Math.round(p[trendB]),
    })),
  };
  const trendTile: ChartTile = {
    id: `${prefix}-chart-0`,
    type: 'chart',
    chart: trend,
    layout: { x: 0, y: 2, w: 8, h: 8, minW: 4, minH: 5 },
  };
  const narrativeTile: NarrativeTile = {
    id: `${prefix}-narrative`,
    type: 'narrative',
    title: 'Noise Analyst',
    points: buildNarrative(filter, kind, totals, prior, recent),
    layout: { x: 8, y: 2, w: 4, h: 8, minW: 3, minH: 4 },
  };

  // Full-width platform breakdown
  const platformChart: ChartData = {
    type: 'bar',
    title: 'Spend by Platform',
    insight: 'How budget is distributed across platforms for this view.',
    data: breakdown(filter, 'platformId').map((r) => ({ name: r.label, value: Math.round(r.totals.spend) })),
  };
  const platformTile: ChartTile = {
    id: `${prefix}-chart-1`,
    type: 'chart',
    chart: platformChart,
    layout: { x: 0, y: 10, w: 12, h: 6, minW: 4, minH: 4 },
  };

  // Pivot — with a recent-vs-prior spend trend on each market group
  const priorMap = new Map(breakdown({ ...filter, dateTo: priorEnd }, 'marketGroup').map((r) => [r.key, r.totals]));
  const recentMap = new Map(breakdown({ ...filter, dateFrom: recentStart }, 'marketGroup').map((r) => [r.key, r.totals]));
  const deltaByKey = new Map<string, KpiDelta | undefined>();
  for (const r of breakdown(filter, 'marketGroup')) {
    const p = priorMap.get(r.key);
    const rc = recentMap.get(r.key);
    deltaByKey.set(r.key, p && rc ? kpiDelta('spend', p, rc) : undefined);
  }
  const pivotTile: PivotTile = {
    id: `${prefix}-pivot`,
    type: 'pivot',
    title: 'Performance by Market',
    rowHeader: 'Market',
    columns: PIVOT_COLUMNS,
    rows: breakdownNested(filter, ['marketGroup', 'market']).map((r) => pivotRow(r, deltaByKey)),
    total: { label: 'Total', values: pivotCells(totals) },
    layout: { x: 0, y: 16, w: 12, h: 8, minW: 4, minH: 5 },
  };

  return [...kpiTiles, trendTile, narrativeTile, platformTile, pivotTile];
}

// ── Platform deep-dive tabs ───────────────────────────────────────────────────

const SEARCH_KPIS: MetricKey[] = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'conversions'];

const KEYWORD_COLUMNS: PivotColumn[] = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'Avg. CPC' },
  { key: 'conversions', label: 'Conversions' },
];

/** The Search deep-dive tab — KPI strip, a clicks trend + narrative, and the
 *  keyword-performance table (the grain only search platforms expose). */
function buildSearchTab(prefix: string, campaignId: string): DashboardTile[] {
  const filter: PerfFilter = { campaignId, platformId: 'search' };
  const rows = selectPerformance(filter);
  const totals = aggregate(rows);

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const recentStart = dates[Math.floor(dates.length / 2)] ?? '';
  const prior = aggregate(rows.filter((r) => recentStart && r.date < recentStart));
  const recent = aggregate(rows.filter((r) => recentStart && r.date >= recentStart));

  const kpiTiles: KpiTile[] = SEARCH_KPIS.map((key, i) => ({
    id: `${prefix}-kpi-${i}`,
    type: 'kpi',
    label: METRIC[key].label,
    value: METRIC[key].fmt(totals[key]),
    delta: kpiDelta(key, prior, recent),
    layout: { x: (i % 6) * 2, y: 0, w: 2, h: 2, minW: 2, minH: 2 },
  }));

  const series = timeSeries(rows, 'week');
  const trend: ChartData = {
    type: 'line',
    dualAxis: true,
    title: 'Clicks vs. Spend',
    insight: 'Weekly search clicks and spend across the campaign flight.',
    data: series.map((p) => ({
      name: fmtWeek(p.date),
      Clicks: Math.round(p.clicks),
      Spend: Math.round(p.spend),
    })),
  };
  const trendTile: ChartTile = {
    id: `${prefix}-chart-0`,
    type: 'chart',
    chart: trend,
    layout: { x: 0, y: 2, w: 8, h: 8, minW: 4, minH: 5 },
  };
  const narrativeTile: NarrativeTile = {
    id: `${prefix}-narrative`,
    type: 'narrative',
    title: 'Noise Analyst',
    points: buildNarrative(filter, 'conversion', totals, prior, recent),
    layout: { x: 8, y: 2, w: 4, h: 8, minW: 3, minH: 4 },
  };

  const keywordTile: PivotTile = {
    id: `${prefix}-keywords`,
    type: 'pivot',
    title: 'Keyword Performance',
    rowHeader: 'Keyword',
    columns: KEYWORD_COLUMNS,
    rows: keywordRows(filter).map((k) => ({
      label: k.keyword,
      values: {
        impressions: compact(k.impressions),
        clicks: num0(k.clicks),
        ctr: pct(k.ctr),
        cpc: usd2(k.cpc),
        conversions: num0(k.conversions),
      },
    })),
    total: {
      label: 'Total',
      values: {
        impressions: compact(totals.impressions),
        clicks: num0(totals.clicks),
        ctr: pct(totals.ctr),
        cpc: usd2(totals.cpc),
        conversions: num0(totals.conversions),
      },
    },
    layout: { x: 0, y: 10, w: 12, h: 9, minW: 4, minH: 5 },
  };

  return [...kpiTiles, trendTile, narrativeTile, keywordTile];
}

// ── Dashboard registry ────────────────────────────────────────────────────────

const GOAL_TABS: { id: string; label: string; kind: TabKind }[] = [
  { id: 'overall', label: 'Overall', kind: 'overall' },
  { id: 'awareness', label: 'Awareness', kind: 'awareness' },
  { id: 'engagement', label: 'Engagement', kind: 'engagement' },
  { id: 'conversion', label: 'Conversion', kind: 'conversion' },
];

function buildTabs(prefix: string, campaignId: string): DashboardTab[] {
  const tabs: DashboardTab[] = GOAL_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    tiles: buildTab(`${prefix}-${t.id}`, campaignId, t.kind),
  }));
  // Add a Search deep-dive tab when the campaign runs search ad lines.
  if (selectAdLines({ campaignId, platformId: 'search' }).length > 0) {
    tabs.push({
      id: 'search',
      label: 'Search',
      tiles: buildSearchTab(`${prefix}-search`, campaignId),
    });
  }
  return tabs;
}

const clientById = (id: string) => clients.find((c) => c.id === id) ?? clients[0];

interface DashboardSeed {
  id: string;
  campaignId: string;
  clientId: string;
  owner: string;
  ownership: DashboardOwnership;
  name: string;
  lastUpdated: string;
  description: string;
  filters: string[];
}

const SEEDS: DashboardSeed[] = [
  {
    id: 'dash-1',
    campaignId: 'horizon-q2',
    clientId: 'horizon',
    owner: 'You',
    ownership: 'owned',
    name: 'Horizon Auto — Q2 Working View',
    lastUpdated: '2025-05-12',
    description: 'Full-funnel working view of the Q2 performance campaign across every paid channel.',
    filters: ['Campaign', 'Campaign Phase', 'Market', 'Format'],
  },
  {
    id: 'dash-2',
    campaignId: 'bloom-spring',
    clientId: 'bloom',
    owner: 'You',
    ownership: 'owned',
    name: 'Bloom & Co — Spring Launch',
    lastUpdated: '2025-05-10',
    description: 'Performance of the Spring Collection launch across Meta, Pinterest, and Google.',
    filters: ['Campaign', 'Channel', 'Audience'],
  },
  {
    id: 'dash-3',
    campaignId: 'northedge-mortgage',
    clientId: 'northedge',
    owner: 'Sarah K.',
    ownership: 'shared',
    name: 'NorthEdge — Mortgage Q2 Live',
    lastUpdated: '2025-05-13',
    description: 'Live view of the Mortgage Rates campaign across LinkedIn, Google, and DV360.',
    filters: ['Campaign', 'Market', 'Product'],
  },
  {
    id: 'dash-4',
    campaignId: 'horizon-q2',
    clientId: 'horizon',
    owner: 'Marcus T.',
    ownership: 'client',
    name: 'Horizon Auto — Client Report',
    lastUpdated: '2025-05-08',
    description: 'Client-facing performance report for the Q2 campaign.',
    filters: ['Campaign', 'Market'],
  },
];

export const mockDashboards: Dashboard[] = SEEDS.map((s) => {
  const client = clientById(s.clientId);
  return {
    id: s.id,
    name: s.name,
    client: client.name,
    clientInitials: client.initials,
    owner: s.owner,
    ownership: s.ownership,
    lastUpdated: s.lastUpdated,
    description: s.description,
    accentColor: client.accentColor,
    filters: s.filters,
    campaignId: s.campaignId,
    tabs: buildTabs(s.id, s.campaignId),
  };
});

// ── Generative / user-created dashboards ──────────────────────────────────────

/** Hydrate a user-created dashboard spec into a full Dashboard — tiles rebuilt
 *  fresh from the model. A `defaultTabId` is surfaced by moving it first. */
export function dashboardFromSpec(spec: UserDashboardSpec): Dashboard {
  const campaign = campaigns.find((c) => c.id === spec.campaignId) ?? campaigns[0];
  const client = clientById(campaign.clientId);
  let tabs = buildTabs(spec.id, spec.campaignId);
  if (spec.defaultTabId) {
    const i = tabs.findIndex((t) => t.id === spec.defaultTabId);
    if (i > 0) tabs = [tabs[i], ...tabs.filter((_, idx) => idx !== i)];
  }
  return {
    id: spec.id,
    name: spec.name,
    client: client.name,
    clientInitials: client.initials,
    owner: 'You',
    ownership: 'owned',
    lastUpdated: spec.createdAt.slice(0, 10),
    description: `Generated view of ${campaign.name}.`,
    accentColor: client.accentColor,
    filters: ['Campaign', 'Market', 'Format'],
    campaignId: spec.campaignId,
    tabs,
  };
}

const GOAL_WORDS: { word: string; tab: TabKind | 'search' }[] = [
  { word: 'awareness', tab: 'awareness' },
  { word: 'engagement', tab: 'engagement' },
  { word: 'conversion', tab: 'conversion' },
  { word: 'search', tab: 'search' },
];

/** Compose a dashboard spec from a free-text prompt. Heuristic today — this is
 *  the seam a Media Analyst agent call drops into for true generative layout. */
export function generateDashboardSpec(prompt: string): UserDashboardSpec {
  const p = prompt.toLowerCase();
  const campaign =
    campaigns.find((c) => {
      const name = clientById(c.clientId).name.toLowerCase();
      return p.includes(name) || p.includes(name.split(' ')[0]) || p.includes(c.name.toLowerCase());
    }) ?? campaigns[0];
  const goal = GOAL_WORDS.find((g) => p.includes(g.word));
  const client = clientById(campaign.clientId);
  const trimmed = prompt.trim();
  const name =
    trimmed.length > 0 && trimmed.length <= 60
      ? trimmed
      : `${client.name} — ${goal ? goal.tab[0].toUpperCase() + goal.tab.slice(1) : 'Performance'} View`;
  return {
    id: newId('dash'),
    name,
    campaignId: campaign.id,
    defaultTabId: goal?.tab ?? 'overall',
    createdAt: new Date().toISOString(),
  };
}

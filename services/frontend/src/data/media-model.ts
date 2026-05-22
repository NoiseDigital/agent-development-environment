// ── Media data model ──────────────────────────────────────────────────────────
// The shape real media data takes once we plan and ingest it:
//
//   Client → Campaign → AdLine → PerformanceDay
//
// An AdLine is the atom — one planned unit of media (platform, tactic, format,
// audience, market, KPI goal, budget, flight). It is defined ONCE (in the media
// plan); every dashboard dimension, budget, and goal reads from it, so nothing
// is re-entered downstream. PerformanceDay is the daily ingested outcome.
//
// Mock data here is deterministically generated from the ad lines, so the
// numbers are stable across renders and the dashboards can aggregate real-shaped
// data instead of hand-keyed tile values.

export type KpiGoal = 'awareness' | 'engagement' | 'conversion';

// Platform family — determines the extra detail a platform can report
// (search → keywords, programmatic → placements, …).
export type PlatformKind = 'search' | 'programmatic' | 'social' | 'video';

export interface Platform {
  id: string;
  name: string;
  kind: PlatformKind;
}

export interface Client {
  id: string;
  name: string;
  initials: string;
  accentColor: string;
}

export interface Campaign {
  id: string;
  clientId: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

export interface AdLine {
  id: string;
  campaignId: string;
  clientId: string;
  platformId: string;
  tactic: string;
  format: string;
  audience: string;
  market: string;
  marketGroup: string;
  language: string;
  kpiGoal: KpiGoal;
  budget: number;
  flightStart: string;
  flightEnd: string;
}

export interface PerformanceDay {
  adLineId: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  viewableImpressions: number;
  clicks: number;
  conversions: number;
  videoCompletions: number;
}

// ── Reference data ────────────────────────────────────────────────────────────

export const platforms: Platform[] = [
  { id: 'dv360', name: 'DV360', kind: 'programmatic' },
  { id: 'ttd', name: 'The Trade Desk', kind: 'programmatic' },
  { id: 'meta', name: 'Meta', kind: 'social' },
  { id: 'linkedin', name: 'LinkedIn', kind: 'social' },
  { id: 'pinterest', name: 'Pinterest', kind: 'social' },
  { id: 'search', name: 'Google Search', kind: 'search' },
  { id: 'youtube', name: 'YouTube', kind: 'video' },
  { id: 'spotify', name: 'Spotify', kind: 'video' },
];

export const platformById = (id: string): Platform =>
  platforms.find((p) => p.id === id) ?? platforms[0];

export const clients: Client[] = [
  { id: 'horizon', name: 'Horizon Auto Group', initials: 'HA', accentColor: '#0f4c81' },
  { id: 'bloom', name: 'Bloom & Co.', initials: 'BC', accentColor: '#7c3a52' },
  { id: 'northedge', name: 'NorthEdge Financial', initials: 'NF', accentColor: '#16433a' },
];

export const campaigns: Campaign[] = [
  { id: 'horizon-q2', clientId: 'horizon', name: 'Q2 2025 Performance', startDate: '2025-04-01', endDate: '2025-06-30' },
  { id: 'bloom-spring', clientId: 'bloom', name: 'Spring Launch', startDate: '2025-03-10', endDate: '2025-05-18' },
  { id: 'northedge-mortgage', clientId: 'northedge', name: 'Mortgage Rates Q2', startDate: '2025-04-01', endDate: '2025-06-15' },
];

// market → { group, language }
const MARKETS: Record<string, { group: string; language: string }> = {
  'United States': { group: 'North America', language: 'English' },
  Canada: { group: 'North America', language: 'English' },
  'United Kingdom': { group: 'Europe', language: 'English' },
  Germany: { group: 'Europe', language: 'German' },
  France: { group: 'Europe', language: 'French' },
  Australia: { group: 'APAC', language: 'English' },
};

const audienceForGoal = (g: KpiGoal): string =>
  g === 'conversion' ? 'In-Market' : g === 'engagement' ? 'Affinity' : 'Broad Reach';

// ── Ad lines (the media plan) ─────────────────────────────────────────────────

interface LineSpec {
  platformId: string;
  tactic: string;
  format: string;
  goal: KpiGoal;
  market: string;
  budget: number;
}

const PLAN: Record<string, LineSpec[]> = {
  'horizon-q2': [
    { platformId: 'dv360', tactic: 'Prospecting', format: 'Display', goal: 'awareness', market: 'United States', budget: 42000 },
    { platformId: 'ttd', tactic: 'Prospecting', format: 'Display', goal: 'awareness', market: 'Germany', budget: 16000 },
    { platformId: 'youtube', tactic: 'Awareness', format: 'Video', goal: 'awareness', market: 'United States', budget: 24000 },
    { platformId: 'meta', tactic: 'Prospecting', format: 'Social', goal: 'engagement', market: 'United States', budget: 30000 },
    { platformId: 'meta', tactic: 'Retargeting', format: 'Social', goal: 'conversion', market: 'United States', budget: 18000 },
    { platformId: 'linkedin', tactic: 'Prospecting', format: 'Social', goal: 'engagement', market: 'United Kingdom', budget: 13000 },
    { platformId: 'search', tactic: 'Brand', format: 'Search', goal: 'conversion', market: 'United States', budget: 24000 },
    { platformId: 'search', tactic: 'Non-Brand', format: 'Search', goal: 'conversion', market: 'Canada', budget: 15000 },
  ],
  'bloom-spring': [
    { platformId: 'meta', tactic: 'Prospecting', format: 'Stories', goal: 'awareness', market: 'United States', budget: 22000 },
    { platformId: 'pinterest', tactic: 'Prospecting', format: 'Pin', goal: 'engagement', market: 'United States', budget: 12000 },
    { platformId: 'meta', tactic: 'Retargeting', format: 'Social', goal: 'conversion', market: 'United States', budget: 14000 },
    { platformId: 'ttd', tactic: 'Prospecting', format: 'Display', goal: 'awareness', market: 'Canada', budget: 9000 },
    { platformId: 'search', tactic: 'Brand', format: 'Search', goal: 'conversion', market: 'United States', budget: 11000 },
    { platformId: 'youtube', tactic: 'Awareness', format: 'Video', goal: 'awareness', market: 'United Kingdom', budget: 10000 },
  ],
  'northedge-mortgage': [
    { platformId: 'linkedin', tactic: 'Prospecting', format: 'Social', goal: 'engagement', market: 'United States', budget: 38000 },
    { platformId: 'search', tactic: 'Brand', format: 'Search', goal: 'conversion', market: 'United States', budget: 30000 },
    { platformId: 'search', tactic: 'Non-Brand', format: 'Search', goal: 'conversion', market: 'Canada', budget: 18000 },
    { platformId: 'dv360', tactic: 'Prospecting', format: 'Display', goal: 'awareness', market: 'United States', budget: 26000 },
    { platformId: 'meta', tactic: 'Retargeting', format: 'Social', goal: 'conversion', market: 'United States', budget: 14000 },
    { platformId: 'spotify', tactic: 'Awareness', format: 'Audio', goal: 'awareness', market: 'United States', budget: 9000 },
  ],
};

export const adLines: AdLine[] = campaigns.flatMap((c) =>
  (PLAN[c.id] ?? []).map((s, i) => {
    const m = MARKETS[s.market] ?? { group: 'Other', language: 'English' };
    return {
      id: `${c.id}-L${i + 1}`,
      campaignId: c.id,
      clientId: c.clientId,
      platformId: s.platformId,
      tactic: s.tactic,
      format: s.format,
      audience: audienceForGoal(s.goal),
      market: s.market,
      marketGroup: m.group,
      language: m.language,
      kpiGoal: s.goal,
      budget: s.budget,
      flightStart: c.startDate,
      flightEnd: c.endDate,
    };
  }),
);

// ── Deterministic performance generation ──────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rough per-family benchmarks driving the generator — CPM in dollars, the rest
// as rates. Search runs few, high-intent impressions; programmatic runs many.
const BENCHMARKS: Record<PlatformKind, { cpm: number; ctr: number; cvr: number; vcr: number; viewable: number }> = {
  programmatic: { cpm: 7, ctr: 0.0011, cvr: 0.008, vcr: 0.0, viewable: 0.62 },
  social: { cpm: 10, ctr: 0.009, cvr: 0.015, vcr: 0.25, viewable: 0.7 },
  search: { cpm: 92, ctr: 0.045, cvr: 0.06, vcr: 0.0, viewable: 0.95 },
  video: { cpm: 14, ctr: 0.004, cvr: 0.006, vcr: 0.7, viewable: 0.82 },
};

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function generatePerformance(line: AdLine): PerformanceDay[] {
  const days = eachDay(line.flightStart, line.flightEnd);
  const n = days.length;
  const bench = BENCHMARKS[platformById(line.platformId).kind];

  // Daily weights: a gentle ramp-plateau-taper curve plus deterministic noise.
  const weights = days.map((date, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const trend = 0.65 + 0.5 * Math.sin(Math.PI * t);
    const noise = 0.78 + 0.44 * mulberry32(hashStr(line.id + date))();
    return trend * noise;
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;

  return days.map((date, i) => {
    const spend = (line.budget * weights[i]) / totalWeight;
    const impressions = Math.round((spend / bench.cpm) * 1000);
    return {
      adLineId: line.id,
      date,
      spend: Math.round(spend * 100) / 100,
      impressions,
      viewableImpressions: Math.round(impressions * bench.viewable),
      clicks: Math.round(impressions * bench.ctr),
      conversions: Math.round(impressions * bench.ctr * bench.cvr),
      videoCompletions: Math.round(impressions * bench.vcr),
    };
  });
}

export const performanceData: PerformanceDay[] = adLines.flatMap(generatePerformance);

// ── Search keyword detail ─────────────────────────────────────────────────────
// Search platforms report a grain the others don't — keyword level. This is the
// per-platform extension: keyword rows for every search ad line, generated the
// same deterministic way from the line's budget.

export interface KeywordRow {
  adLineId: string;
  keyword: string;
  matchType: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

const KEYWORD_POOL: Record<string, { brand: string[]; nonBrand: string[] }> = {
  horizon: {
    brand: ['horizon auto', 'horizon auto group', 'horizon ev'],
    nonBrand: ['ev lease deals', 'electric suv 2025', 'best ev rebate', 'hybrid sedan price', '0 apr car financing', 'test drive electric car'],
  },
  bloom: {
    brand: ['bloom & co', 'bloom skincare', 'bloom beauty'],
    nonBrand: ['spring makeup looks', 'vegan moisturizer', 'best vitamin c serum', 'clean beauty brands', 'natural skincare set'],
  },
  northedge: {
    brand: ['northedge financial', 'northedge mortgage'],
    nonBrand: ['mortgage rates today', 'refinance calculator', 'first time home buyer loan', '30 year fixed rate', 'home loan pre approval'],
  },
};

function generateKeywords(line: AdLine): KeywordRow[] {
  const pool = KEYWORD_POOL[line.clientId];
  if (!pool) return [];
  const tactic = line.tactic.toLowerCase();
  const isBrand = tactic.includes('brand') && !tactic.includes('non');
  const terms = isBrand ? pool.brand : pool.nonBrand;
  const weights = terms.map((kw) => 0.5 + mulberry32(hashStr(line.id + kw))());
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  return terms.map((keyword, i) => {
    const rand = mulberry32(hashStr(line.id + keyword + 'm'));
    const cost = (line.budget * weights[i]) / total;
    const cpc = 1.2 + rand() * 2.6;
    const clicks = Math.round(cost / cpc);
    const ctr = 0.03 + rand() * 0.05;
    const impressions = Math.round(clicks / ctr);
    const cvr = 0.04 + rand() * 0.06;
    return {
      adLineId: line.id,
      keyword,
      matchType: isBrand ? 'Exact' : rand() > 0.5 ? 'Phrase' : 'Broad',
      impressions,
      clicks,
      cost: Math.round(cost * 100) / 100,
      conversions: Math.round(clicks * cvr),
    };
  });
}

export const keywords: KeywordRow[] = adLines
  .filter((l) => platformById(l.platformId).kind === 'search')
  .flatMap(generateKeywords);

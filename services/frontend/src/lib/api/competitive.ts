// Client for the Competitive Media Intelligence Estimator. Like statsApi, the
// browser never talks to mcp-stats directly — the request routes through the
// gateway's `/api/v1/stats/competitive` proxy (allowlisted upstream path).

import { postJson } from './http';
import { gatewayBase } from '@/lib/api/gateway';

const BASE_URL = gatewayBase();

export type MediaDimension = 'auto' | 'channel' | 'partner' | 'channel_partner';
export type AnalysisScope = 'market' | 'total';

export interface CompetitiveParams {
  /** Source URI — "upload:<id>" or "bigquery:<dataset>.<table>". */
  source: string;
  sheet?: string;
  /** "basic" grosses observed spend by a flat factor; "advanced" expands per channel. */
  mode?: 'basic' | 'advanced';
  /** Per-market maturity multiplier applied to estimates (market → weight). */
  maturity?: Record<string, number>;
  /** Media grouping advanced mode estimates over. */
  dimension?: MediaDimension;
  /** "total" collapses everything into a single Total Market. */
  scope?: AnalysisScope;
}

export interface CompetitiveKpis {
  observed_spend: number;
  estimated_base: number;
  estimated_low: number;
  estimated_high: number;
  /** Mean data-coverage score across brand/market cells (0–1) — NOT a statistical CI. */
  model_support_score: number;
  brands: number;
  markets: number;
}

export interface MarketRow {
  market: string;
  observed: number;
  base: number;
  low: number;
  high: number;
  competitors: number;
  support: number;
}

export interface BrandRow {
  brand: string;
  observed_spend: number;
  estimated_base: number;
}

export interface SovRow {
  market: string;
  brand: string;
  observed_spend: number;
  market_spend: number;
  spend_sov: number;
  observed_impressions?: number;
  market_impr?: number;
  impression_sov?: number;
}

export interface BrandMarketRow {
  market: string;
  brand: string;
  estimated_base: number;
}

export interface SupportDistRow {
  market: string;
  Low: number;
  Moderate: number;
  High: number;
}

export interface ObservedVsEstimatedRow {
  brand: string;
  market: string;
  observed_spend: number;
  estimated_base: number;
  confidence: number;
}

export interface TopCombinationRow {
  brand: string;
  market: string;
  estimated_base: number;
  support_band: 'Low' | 'Moderate' | 'High';
}

export interface CompetitiveResult {
  kpis: CompetitiveKpis;
  mode: 'basic' | 'advanced';
  by_market: MarketRow[];
  by_brand: BrandRow[];
  sov: SovRow[];
  brand_within_market: BrandMarketRow[];
  support_distribution: SupportDistRow[];
  observed_vs_estimated: ObservedVsEstimatedRow[];
  top_combinations: TopCombinationRow[];
  markets_list: string[];
  insights: RuleInsight[];
  warnings: string[];
}

export interface RuleInsight {
  type: string;
  text: string;
}

// ── Scenario Planner / forecasting ───────────────────────────────────────────
export interface ScenarioParams {
  /** Demand-side multipliers on the modeled history; product = scenario_multiplier. */
  market_mult?: number;
  channel_mult?: number;
  source_mult?: number;
  /** Widens brand-level interval bands (sqrt(step) growth). */
  uncertainty_sensitivity?: number;
  /** Annualised-ish growth applied per step, in percent. */
  growth_pct?: number;
  /** Months to project forward. */
  periods?: number;
  /** Scales all interval margins. */
  range_width?: number;
  /** Selected prediction interval = 1 − alpha. */
  alpha?: number;
  method?: 'scenario_override' | 'trend_only' | 'trend_plus_scenario';
  /** Which brand metrics to forecast. */
  metrics?: ('spend' | 'impressions' | 'sov')[];
  /** Brand "Supported" quality gate. */
  quality?: { min_periods?: number; min_r2?: number; max_p?: number };
}

export interface ForecastParams {
  source: string;
  sheet?: string;
  mode?: 'basic' | 'advanced';
  maturity?: Record<string, number>;
  dimension?: MediaDimension;
  scope?: AnalysisScope;
  scenario?: ScenarioParams;
}

export interface ForecastBand {
  month: string;
  central_forecast: number;
  ci_low?: number;
  ci_high?: number;
  ci_low_80: number;
  ci_high_80: number;
  ci_low_85: number;
  ci_high_85: number;
  ci_low_90: number;
  ci_high_90: number;
  ci_low_95: number;
  ci_high_95: number;
}

export interface ModelStats {
  method: string;
  slope: number | null;
  intercept: number | null;
  p_value: number | null;
  r_squared: number | null;
  n_months: number;
  forecast_method: string;
}

export interface BrandForecast {
  brand: string;
  metric: 'spend' | 'impressions' | 'sov';
  quality: 'Supported' | 'Directional';
  r_squared: number | null;
  p_value: number | null;
  is_pct: boolean;
  current: number;
  forecast_end: number;
  change_pct: number;
  historical_periods: number;
  history: { month: string; value: number }[];
  forecast: ForecastBand[];
}

export interface ForecastResult {
  has_dates: boolean;
  mode?: 'basic' | 'advanced';
  history?: { month: string; scenario_base_spend: number }[];
  total_forecast?: ForecastBand[];
  model_stats?: ModelStats;
  model_support_score?: number;
  reliability?: { score: number; label: 'Low' | 'Moderate' | 'High' };
  brands?: BrandForecast[];
  warnings: string[];
}

export const competitiveApi = {
  run: (params: CompetitiveParams) =>
    postJson<CompetitiveResult>(`${BASE_URL}/api/v1/stats/competitive`, params),
  forecast: (params: ForecastParams) =>
    postJson<ForecastResult>(`${BASE_URL}/api/v1/stats/competitive_forecast`, params),
};

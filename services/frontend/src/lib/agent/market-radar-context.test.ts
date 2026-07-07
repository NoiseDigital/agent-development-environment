import { describe, it, expect } from 'vitest';
import { buildMarketRadarContext } from './market-radar-context';
import type { ForecastResult, MarketRadarResult } from '../api/market-radar';

const source = { kind: 'upload', id: 'u1', name: 'comp.csv' } as const;

const RESULT: MarketRadarResult = {
  kpis: {
    observed_spend: 1_000_000, estimated_base: 1_500_000, estimated_low: 1_200_000,
    estimated_high: 1_800_000, model_support_score: 0.72, brands: 4, markets: 3,
  },
  mode: 'basic',
  by_market: [{ market: 'US', observed: 500_000, base: 800_000, low: 700_000, high: 900_000, competitors: 4, support: 0.8 }],
  by_brand: [{ brand: 'Globex', observed_spend: 400_000, estimated_base: 600_000 }],
  sov: [
    { market: 'US', brand: 'Globex', observed_spend: 300_000, market_spend: 800_000, spend_sov: 0.38 },
    { market: 'US', brand: 'Acme', observed_spend: 250_000, market_spend: 800_000, spend_sov: 0.31 },
  ],
  brand_within_market: [], support_distribution: [], observed_vs_estimated: [],
  top_combinations: [], markets_list: ['US'], insights: [], warnings: [],
};

const FORECAST: ForecastResult = {
  has_dates: true,
  reliability: { score: 0.66, label: 'Moderate' },
  total_forecast: [
    { month: '2024-12', central_forecast: 2_000_000, ci_low_95: 1_600_000, ci_high_95: 2_400_000,
      ci_low_80: 1_800_000, ci_high_80: 2_200_000, ci_low_85: 1_780_000, ci_high_85: 2_220_000,
      ci_low_90: 1_700_000, ci_high_90: 2_300_000 },
  ],
  model_stats: { method: 'ols', slope: 1, intercept: 0, p_value: 0.01, r_squared: 0.8, n_months: 12, forecast_method: 'linear_trend' },
  brands: [
    { brand: 'Globex', metric: 'spend', quality: 'Supported', r_squared: 0.8, p_value: 0.01, is_pct: false,
      current: 500_000, forecast_end: 650_000, change_pct: 30, historical_periods: 12, history: [], forecast: [] },
  ],
  warnings: [],
};

describe('buildMarketRadarContext', () => {
  it('returns empty string with no source', () => {
    expect(buildMarketRadarContext({ source: null, mode: 'basic', columns: [], result: null })).toBe('');
  });

  it('includes the active tab', () => {
    const out = buildMarketRadarContext({ source, mode: 'basic', columns: [], result: RESULT, activeTab: 'scenario' });
    expect(out).toContain('active_tab: scenario');
  });

  it('appends the forecast block when a forecast is present', () => {
    const out = buildMarketRadarContext({ source, mode: 'basic', columns: [], result: RESULT, forecast: FORECAST });
    expect(out).toContain('forecast:');
    expect(out).toContain('reliability: 66% (Moderate)');
    expect(out).toContain('horizon: 1 periods (through 2024-12)');
    expect(out).toContain('method: linear_trend (12 months of history)');
    expect(out).toMatch(/Globex · spend · Supported · \+30%/);
  });

  it('marks the forecast unavailable when there are no dates', () => {
    const out = buildMarketRadarContext({
      source, mode: 'basic', columns: [], result: RESULT,
      forecast: { has_dates: false, warnings: [] },
    });
    expect(out).toContain('forecast:');
    expect(out).toContain('status: unavailable');
  });

  it('omits the forecast block entirely when none is supplied', () => {
    const out = buildMarketRadarContext({ source, mode: 'basic', columns: [], result: RESULT });
    expect(out).not.toContain('forecast:');
  });
});

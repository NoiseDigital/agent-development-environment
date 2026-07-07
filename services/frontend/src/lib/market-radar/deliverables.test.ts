import { describe, it, expect } from 'vitest';
import { buildReportHtml, marketRadarSheets, type ReportMeta } from './deliverables';
import type { MarketRadarResult } from '../api/market-radar';

const RESULT: MarketRadarResult = {
  kpis: {
    observed_spend: 1_000_000, estimated_base: 1_500_000, estimated_low: 1_200_000,
    estimated_high: 1_800_000, model_support_score: 0.72, brands: 4, markets: 3,
  },
  mode: 'advanced',
  by_market: [{ market: 'US', observed: 500_000, base: 800_000, low: 700_000, high: 900_000, competitors: 4, support: 0.8 }],
  by_brand: [{ brand: 'Globex', observed_spend: 400_000, estimated_base: 600_000 }],
  sov: [
    { market: 'US', brand: 'Globex', observed_spend: 300_000, market_spend: 800_000, spend_sov: 0.38 },
    { market: 'US', brand: 'Acme', observed_spend: 250_000, market_spend: 800_000, spend_sov: 0.31 },
  ],
  brand_within_market: [], support_distribution: [],
  observed_vs_estimated: [{ brand: 'Globex', market: 'US', observed_spend: 300_000, estimated_base: 450_000, confidence: 0.7 }],
  top_combinations: [{ brand: 'Globex', market: 'US', estimated_base: 450_000, support_band: 'High' }],
  markets_list: ['US'],
  insights: [{ type: 'Market Intensity', text: 'US is the most contested market.' }],
  warnings: [],
};

const META: ReportMeta = {
  brandName: 'CSAos', accent: '#c20510', sourceLabel: 'comp.csv', generatedAt: 'Jul 6, 2026',
};

describe('marketRadarSheets', () => {
  it('produces the expected multi-sheet structure', () => {
    const sheets = marketRadarSheets(RESULT);
    const names = sheets.map((s) => s.name);
    expect(names).toEqual([
      'Summary', 'Estimates by Market', 'Estimates by Brand', 'Share of Voice',
      'Observed vs Estimated', 'Top Combinations', 'Insights',
    ]);
    // Summary carries the headline KPIs.
    const summary = sheets[0];
    expect(summary.rows).toContainEqual(['Observed spend', 1_000_000]);
    expect(summary.rows).toContainEqual(['Estimated spend (base)', 1_500_000]);
  });
});

describe('buildReportHtml', () => {
  it('is a self-contained branded document citing real figures', () => {
    const html = buildReportHtml(RESULT, META);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('CSAos · Market Radar');
    expect(html).toContain('#c20510'); // tenant accent applied
    expect(html).toContain('comp.csv');
    expect(html).toContain('US'); // a market row
    expect(html).toContain('Globex 38%'); // SOV leader
    expect(html).toContain('US is the most contested market.'); // insight
    expect(html).toContain('DIRECTIONAL'); // disclaimer present
  });

  it('escapes brand/source text', () => {
    const html = buildReportHtml(RESULT, { ...META, sourceLabel: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

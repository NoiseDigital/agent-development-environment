import { describe, it, expect } from 'vitest';
import { buildInsightsPayload, parseInsights, ruleBasedInsights } from './insights';
import type { CorrelateResult } from '../api/stats';

function result(signals: CorrelateResult['top_signals']): CorrelateResult {
  return {
    method: 'pearson', rows: [], cols: [], matrix: [], pvalues: [], significant: [],
    n_rows_used: 200, top_signals: signals,
  };
}

describe('ruleBasedInsights', () => {
  it('flags no-signal when there are none', () => {
    const out = ruleBasedInsights(result([]), 0.05);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('No signal');
    expect(out[0].tone).toBe('negative');
  });

  it('names the strongest significant pair with r and p', () => {
    const out = ruleBasedInsights(
      result([{ a: 'spend', b: 'revenue', r: 0.62, p: 0.0001, abs_r: 0.62 }]),
      0.05,
    );
    expect(out[0].type).toBe('Strongest signal');
    expect(out[0].insight).toContain('spend × revenue');
    expect(out[0].insight).toContain('0.62');
  });

  it('flags near-perfect correlations as likely leakage', () => {
    const out = ruleBasedInsights(
      result([
        { a: 'spend', b: 'revenue', r: 0.62, p: 0.0001, abs_r: 0.62 },
        { a: 'clicks', b: 'ctr', r: 0.97, p: 0.0001, abs_r: 0.97 },
      ]),
      0.05,
    );
    expect(out.some((i) => i.type === 'Check for leakage' && i.insight.includes('clicks × ctr'))).toBe(true);
  });

  it('cautions when even the top pair is not significant', () => {
    const out = ruleBasedInsights(
      result([{ a: 'a', b: 'b', r: 0.2, p: 0.4, abs_r: 0.2 }]),
      0.05,
    );
    expect(out.some((i) => i.type === 'Not significant')).toBe(true);
  });
});

describe('buildInsightsPayload', () => {
  it('summarises the run with rounded r + significance flags', () => {
    const payload = buildInsightsPayload(
      result([{ a: 'spend', b: 'revenue', r: 0.6234, p: 0.001, abs_r: 0.62 }]),
      0.05,
    );
    expect(payload.mode).toBe('correlate');
    expect(payload.rows_analyzed).toBe(200);
    expect(payload.top_signals[0]).toMatchObject({ a: 'spend', b: 'revenue', r: 0.623, significant: true });
  });
});

describe('parseInsights', () => {
  it('parses a ```json fenced reply', () => {
    const out = parseInsights('```json\n{"insights":[{"type":"T","insight":"I","tone":"positive"}]}\n```');
    expect(out).toEqual([{ type: 'T', insight: 'I', tone: 'positive' }]);
  });
  it('returns [] on garbage', () => {
    expect(parseInsights('not json')).toEqual([]);
    expect(parseInsights('')).toEqual([]);
  });
});

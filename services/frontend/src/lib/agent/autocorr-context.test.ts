import { describe, it, expect } from 'vitest';
import { buildAutocorrContext, type AutocorrContextInput } from './autocorr-context';
import type { CorrelateResult, RegressResult, ColumnProfile, ColumnStat } from '../api/stats';

const source = { kind: 'upload', id: 'u1', name: 'data.csv' } as const;
const columns: ColumnProfile[] = [
  { name: 'spend', kind: 'numeric', missing_pct: 0 },
  { name: 'revenue', kind: 'numeric', missing_pct: 2 },
];
const columnStats: ColumnStat[] = [
  { name: 'spend', missing_pct: 0, min: 0, p01: 1, median: 5, p99: 9, max: 10, mean: 5, std: 2, skew: 1.8 },
];

function base(overrides: Partial<AutocorrContextInput> = {}): AutocorrContextInput {
  return {
    source,
    mode: 'correlate',
    columns,
    columnStats,
    setA: ['spend'],
    setB: ['revenue'],
    result: null,
    regResult: null,
    regY: '',
    regX: [],
    qa: null,
    preprocessing: { winsorize: false, log1p: false, zscore: false, difference: false },
    alpha: 0.05,
    lag: 0,
    ...overrides,
  };
}

const CORR: CorrelateResult = {
  method: 'pearson',
  rows: ['spend'], cols: ['revenue'], matrix: [[0.6]], pvalues: [[0.001]], significant: [[true]],
  n_rows_used: 120,
  top_signals: [{ a: 'spend', b: 'revenue', r: 0.6, p: 0.0004, abs_r: 0.6 }],
};

const REG: RegressResult = {
  y: 'revenue', x: ['spend', 'clicks'], n_obs: 120,
  r_squared: 0.71, adj_r_squared: 0.70, f_pvalue: 1e-20,
  coefficients: [
    { term: 'spend', coef: 1.23, std_err: 0.1, t: 12, p_value: 1e-8, ci_low: 1.0, ci_high: 1.46 },
    { term: 'clicks', coef: -0.02, std_err: 0.5, t: -0.04, p_value: 0.9, ci_low: -1.0, ci_high: 0.96 },
  ],
  fit_points: [],
  diagnostics: { durbin_watson: 1.9, condition_number: 12, aic: 900, bic: 910 },
};

describe('buildAutocorrContext', () => {
  it('returns empty string with no source', () => {
    expect(buildAutocorrContext(base({ source: null }))).toBe('');
  });

  it('includes mode and per-column skew', () => {
    const out = buildAutocorrContext(base());
    expect(out).toContain('mode: correlate');
    expect(out).toContain('spend · numeric · 0% · 1.80'); // skew surfaced
    expect(out).toContain('revenue · numeric · 2% · n/a'); // missing skew → n/a
  });

  it('correlation result serializes top signals', () => {
    const out = buildAutocorrContext(base({ result: CORR }));
    expect(out).toContain('status: result');
    expect(out).toContain('method: pearson');
    expect(out).toContain('A=spend B=revenue');
    expect(out).toContain('significant');
  });

  it('regression mode is NOT blind — it serializes the fit (the bug fix)', () => {
    const out = buildAutocorrContext(base({ mode: 'regress', regResult: REG, regY: 'revenue', regX: ['spend', 'clicks'] }));
    expect(out).toContain('mode: regress');
    expect(out).toContain('status: regression result');
    expect(out).toContain('r_squared: 0.710');
    expect(out).toContain('spend · 1.2300');
    // The insignificant driver is flagged ns.
    expect(out).toMatch(/clicks · -0\.0200.*ns/);
    expect(out).toContain('diagnostics: durbin_watson=1.90');
    // No stale correlation 'status: result' leaks in regress mode.
    expect(out).not.toContain('status: result\n');
  });

  it('regression pre-analysis reports no run yet (not a correlation preamble)', () => {
    const out = buildAutocorrContext(base({ mode: 'regress', regY: 'revenue', regX: ['spend'] }));
    expect(out).toContain('status: pre-analysis (no regression has been run yet)');
    expect(out).toContain('y=revenue x=spend');
  });
});

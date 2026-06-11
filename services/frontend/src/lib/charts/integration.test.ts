// Cross-module integration: a chart spec produced by the templated chart
// fast path MUST pass the Vega guard before it reaches the screen. If a
// template ever starts producing a disallowed mark (or breaks the data-row
// cap), this is the single test that catches it instead of a runtime
// rejection in production.

import { describe, it, expect } from 'vitest';
import { applyTemplate } from './templates';
import { checkVegaSpec } from './guard';

const TREND_ROWS = Array.from({ length: 52 }, (_, i) => ({
  name: `2024-W${String(i + 1).padStart(2, '0')}`,
  value: 1000 + i * 50,
}));

const DIM_ROWS = [
  { name: 'Meta', value: 48000 },
  { name: 'YouTube', value: 41000 },
  { name: 'Google', value: 33000 },
  { name: 'X', value: 12000 },
];

describe('templated chart output passes the Vega guard', () => {
  it('weekly_trend → guard OK', () => {
    const spec = applyTemplate({
      shape: 'weekly_trend',
      title: 'Weekly spend, 2024',
      rows: TREND_ROWS,
      valueFormat: '$',
    });
    const result = checkVegaSpec(spec);
    expect(result.ok, result.reason).toBe(true);
  });

  it('bar_by_dim → guard OK', () => {
    const spec = applyTemplate({
      shape: 'bar_by_dim',
      title: 'Spend by publisher',
      rows: DIM_ROWS,
      valueFormat: '$',
    });
    expect(checkVegaSpec(spec).ok).toBe(true);
  });

  it('pareto → guard OK (cumulative line + bar)', () => {
    const spec = applyTemplate({
      shape: 'pareto',
      title: 'Spend concentration',
      rows: DIM_ROWS,
    });
    expect(checkVegaSpec(spec).ok).toBe(true);
  });

  it('guard rejects synthetic templates that exceed the row cap', () => {
    // Defensive: prove the guard is actually doing work. If a template ever
    // emitted >5000 rows the guard should fail BEFORE the renderer chokes.
    const bigRows = Array.from({ length: 5001 }, (_, i) => ({
      name: `r${i}`,
      value: i,
    }));
    const spec = applyTemplate({ shape: 'bar_by_dim', rows: bigRows });
    const result = checkVegaSpec(spec);
    expect(result.ok).toBe(false);
    expect(result.reason ?? '').toMatch(/row|cap|MAX/i);
  });
});

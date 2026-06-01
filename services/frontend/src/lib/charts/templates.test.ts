import { describe, it, expect } from 'vitest';
import {
  applyTemplate,
  coerceTemplatedChartProps,
} from './templates';

describe('applyTemplate', () => {
  const rows = [
    { name: '2024-01', value: 1000 },
    { name: '2024-02', value: 1500 },
    { name: '2024-03', value: 1200 },
  ];

  it('builds a weekly_trend line spec around temporal x', () => {
    const spec = applyTemplate({ shape: 'weekly_trend', rows, title: 'Spend', valueFormat: '$' }) as Record<string, unknown>;
    expect(spec.title).toBe('Spend');
    const encoding = spec.encoding as { x: { type: string } };
    expect(encoding.x.type).toBe('temporal');
    // singleMetricLineSpec is layered (line + crosshair rule).
    expect(Array.isArray(spec.layer)).toBe(true);
  });

  it('builds a bar_by_dim spec sorted by value descending', () => {
    const spec = applyTemplate({ shape: 'bar_by_dim', rows, title: 'Top' }) as Record<string, unknown>;
    expect(spec.title).toBe('Top');
    const encoding = spec.encoding as { x: { sort?: string; type: string } };
    expect(encoding.x.type).toBe('nominal');
    expect(encoding.x.sort).toBe('-y');
  });

  it('computes share + cum for pareto from bare {name, value} rows', () => {
    const spec = applyTemplate({ shape: 'pareto', rows }) as Record<string, unknown>;
    const data = spec.data as { values: Array<{ name: string; share: number; cum: number }> };
    // Sorted descending: 1500, 1200, 1000 → cum reaches 1.0 at the last row.
    expect(data.values[0].name).toBe('2024-02');
    expect(data.values[0].share).toBeCloseTo(1500 / 3700, 5);
    expect(data.values[data.values.length - 1].cum).toBeCloseTo(1, 5);
  });
});

describe('coerceTemplatedChartProps', () => {
  it('accepts a well-formed payload', () => {
    const r = coerceTemplatedChartProps({
      shape: 'bar_by_dim',
      rows: [{ name: 'Meta', value: 100 }],
      title: 'X',
      valueFormat: '$',
    });
    expect(r?.shape).toBe('bar_by_dim');
    expect(r?.rows).toHaveLength(1);
  });

  it('rejects an unknown shape', () => {
    expect(
      coerceTemplatedChartProps({
        shape: 'donut',
        rows: [{ name: 'X', value: 1 }],
      }),
    ).toBeNull();
  });

  it('drops malformed row entries and rejects an empty result', () => {
    expect(
      coerceTemplatedChartProps({
        shape: 'bar_by_dim',
        rows: [{ name: 'X' }, { value: 1 }, 'junk'],
      }),
    ).toBeNull();
  });

  it('rejects a non-object payload', () => {
    expect(coerceTemplatedChartProps(null)).toBeNull();
    expect(coerceTemplatedChartProps('hi')).toBeNull();
  });

  // Real-world refetch regression: BigQuery NUMERIC / INT64 columns sometimes
  // get serialised as strings when the agent forwards them through the JSON
  // envelope. The strict-number filter dropped EVERY row → coerce returned
  // null → TemplatedChartBlock rendered the malformed placeholder → "chart
  // disappeared when I came back to the chat". Tolerate numeric strings.
  it('coerces numeric-string values (BigQuery → JSON round-trip)', () => {
    const r = coerceTemplatedChartProps({
      shape: 'bar_by_dim',
      rows: [
        { name: 'Meta', value: '48000' },
        { name: 'YouTube', value: '41000.5' },
      ],
    });
    expect(r?.rows).toEqual([
      { name: 'Meta', value: 48000 },
      { name: 'YouTube', value: 41000.5 },
    ]);
  });

  it('drops rows whose value is unparseable but keeps the parseable ones', () => {
    const r = coerceTemplatedChartProps({
      shape: 'bar_by_dim',
      rows: [
        { name: 'A', value: 10 },
        { name: 'B', value: 'not a number' },
        { name: 'C', value: '' },
        { name: 'D', value: null },
        { name: 'E', value: 20 },
      ],
    });
    expect(r?.rows).toEqual([
      { name: 'A', value: 10 },
      { name: 'E', value: 20 },
    ]);
  });

  it('rejects values that parse to Infinity / NaN (e.g. "Infinity")', () => {
    const r = coerceTemplatedChartProps({
      shape: 'bar_by_dim',
      rows: [{ name: 'X', value: 'Infinity' }, { name: 'Y', value: 'NaN' }],
    });
    expect(r).toBeNull();
  });
});

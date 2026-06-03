import { describe, it, expect } from 'vitest';
import {
  compact,
  usd,
  usd2,
  usdCompact,
  num,
  pct,
  pctCompact,
  pctDelta,
  usdDelta,
  formatByKey,
} from './format';

// The platform's number-formatting contract. Every dashboard tile and Vega
// axis routes through these functions; locking the output strings here keeps
// the KPI strip and the chart axes underneath in lockstep.

describe('compact — strict sig-fig rule (sub-10 = 1 decimal, 10+ = 0)', () => {
  it('uses 1 decimal for sub-10 K/M/B, 0 for 10+', () => {
    expect(compact(820)).toBe('820');
    expect(compact(1_000)).toBe('1.0K');     // sub-10 K → 1 decimal, NO strip
    expect(compact(1_234)).toBe('1.2K');     // sub-10 K → 1 decimal
    expect(compact(9_999)).toBe('10.0K');    // 9.999 rounds to 10.0; in K → still 1 decimal
    expect(compact(10_000)).toBe('10K');     // exactly 10 K → 0 decimals
    expect(compact(32_000_000)).toBe('32M'); // 10+ M → 0 decimals
    expect(compact(350_000)).toBe('350K');   // 10+ K → 0 decimals
    expect(compact(8_530_117)).toBe('8.5M'); // sub-10 M → 1 decimal
    expect(compact(1_251_251)).toBe('1.3M'); // sub-10 M → 1 decimal
    expect(compact(1.5e9)).toBe('1.5B');     // sub-10 B → 1 decimal
    expect(compact(2.4e9)).toBe('2.4B');
  });
  it('keeps sign on negatives, same sig-fig rule', () => {
    expect(compact(-350_000)).toBe('-350K');
    expect(compact(-1_500_000)).toBe('-1.5M');
  });
  it('renders sub-1 fractions with trimmed decimals', () => {
    expect(compact(0.85)).toBe('0.85');
    expect(compact(0.5)).toBe('0.5');
    expect(compact(0.001)).toBe('0');
    expect(compact(0)).toBe('0');
  });
  it('returns empty string for non-finite input', () => {
    expect(compact(NaN)).toBe('');
    expect(compact(Infinity)).toBe('');
    expect(compact(null)).toBe('');
    expect(compact('foo')).toBe('');
  });
});

describe('usd / usd2 / usdCompact', () => {
  it('usd: whole-dollar with separators', () => {
    expect(usd(0)).toBe('$0');
    expect(usd(42)).toBe('$42');
    expect(usd(1234)).toBe('$1,234');
    expect(usd(1_250_000)).toBe('$1,250,000');
  });
  it('usd rounds to the nearest dollar', () => {
    expect(usd(42.4)).toBe('$42');
    expect(usd(42.5)).toBe('$43');
  });
  it('usd2: cents precision', () => {
    expect(usd2(4.2)).toBe('$4.20');
    expect(usd2(0.05)).toBe('$0.05');
  });
  it('usdCompact: compact for ≥1K, precise below', () => {
    expect(usdCompact(1_200_000)).toBe('$1.2M');
    expect(usdCompact(820)).toBe('$820');
    expect(usdCompact(42)).toBe('$42');
  });
});

describe('num / pct / pctCompact', () => {
  it('num: integer with separators', () => {
    expect(num(9_354)).toBe('9,354');
    expect(num(42)).toBe('42');
  });
  it('pct: two decimals (KPI tiles)', () => {
    expect(pct(0)).toBe('0.00%');
    expect(pct(0.0142)).toBe('1.42%');
    expect(pct(1)).toBe('100.00%');
  });
  it('pctCompact: one decimal trimmed (Vega axes)', () => {
    expect(pctCompact(0.0142)).toBe('1.4%');
    expect(pctCompact(1)).toBe('100%');
    expect(pctCompact(0)).toBe('0%');
  });
});

describe('deltas', () => {
  it('pctDelta returns signed change with the en-dash for negatives', () => {
    expect(pctDelta(100, 120)).toBe('+20%');
    expect(pctDelta(100, 75)).toBe('−25%');
    expect(pctDelta(100, 100)).toBe('0%');
  });
  it('pctDelta returns empty string when the baseline is zero and the target is nonzero', () => {
    expect(pctDelta(0, 10)).toBe('');
  });
  it('pctDelta handles a zero-to-zero baseline as 0%', () => {
    expect(pctDelta(0, 0)).toBe('0%');
  });
  it('usdDelta signs the absolute dollar change', () => {
    expect(usdDelta(1000, 1500)).toBe('+$500');
    expect(usdDelta(1000, 700)).toBe('−$300');
    expect(usdDelta(0, 12_000)).toBe('+$12,000');
    expect(usdDelta(1000, 1000)).toBe('$0');
  });
});

describe('formatByKey', () => {
  it('dispatches by key', () => {
    expect(formatByKey(1_200_000, 'usdCompact')).toBe('$1.2M');
    expect(formatByKey(9_354, 'compact')).toBe('9.4K');
    expect(formatByKey(0.0142, 'pct')).toBe('1.42%');
  });
  it('falls back to compact for an unknown key', () => {
    expect(formatByKey(9_354, 'nonsense')).toBe('9.4K');
  });
});

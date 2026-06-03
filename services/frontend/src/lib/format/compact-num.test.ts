import { describe, it, expect } from 'vitest';
import { compactNum } from './compact-num';

describe('compactNum', () => {
  it('uses uppercase K/M/B with strict sig-fig rule (sub-10 = 1 decimal, 10+ = 0)', () => {
    expect(compactNum(820)).toBe('820');
    expect(compactNum(1_234)).toBe('1.2K');
    expect(compactNum(10_000)).toBe('10K');     // 10+ → 0 decimals
    expect(compactNum(350_000)).toBe('350K');
    expect(compactNum(1_251_251)).toBe('1.3M');
    expect(compactNum(32_000_000)).toBe('32M'); // 10+ M → 0 decimals
    expect(compactNum(1.5e9)).toBe('1.5B');
  });

  it('handles negative magnitudes with the same rule', () => {
    expect(compactNum(-350_000)).toBe('-350K');
    expect(compactNum(-1_500_000)).toBe('-1.5M');
  });

  it('prefixes $ when the format string contains $', () => {
    expect(compactNum(350_000, '$')).toBe('$350K');
    expect(compactNum(1_251_251, '$,.2s')).toBe('$1.3M');
    expect(compactNum(42, '$,.0f')).toBe('$42');
  });

  it('formats as percentage when the format string contains %', () => {
    expect(compactNum(0.142, '.1%')).toBe('14.2%');
    expect(compactNum(0, '%')).toBe('0%');
    expect(compactNum(1, '%')).toBe('100%');
  });

  it('preserves two decimals for fractional values (e.g. correlation r)', () => {
    expect(compactNum(0.85)).toBe('0.85');
    expect(compactNum(-0.5)).toBe('-0.5');
    expect(compactNum(0.001)).toBe('0');
    expect(compactNum(0)).toBe('0');
  });

  it('rounds integers >= 1', () => {
    expect(compactNum(42.4)).toBe('42');
    expect(compactNum(42.6)).toBe('43');
  });

  it('returns empty string for non-finite or non-number input', () => {
    expect(compactNum(null)).toBe('');
    expect(compactNum('foo')).toBe('');
    expect(compactNum(NaN)).toBe('');
    expect(compactNum(Infinity)).toBe('');
  });
});

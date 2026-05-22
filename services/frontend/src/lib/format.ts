// Shared number formatting — one source of truth so the recommendation block,
// the Plan page, and the line-diff visual render values the same way.

/** Whole-dollar currency, e.g. $42,000. */
export const usd = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');

/** Compact magnitude, e.g. 1.2M / 340K / 820. */
export const compact = (n: number): string =>
  n >= 1e6
    ? (n / 1e6).toFixed(1) + 'M'
    : n >= 1e3
      ? Math.round(n / 1e3) + 'K'
      : String(Math.round(n));

/** A rate as a percentage, e.g. 0.0142 → "1.42%". */
export const pct = (n: number): string => (n * 100).toFixed(2) + '%';

/** Signed percentage change from `from` to `to`, e.g. +14% / −8%. Returns an
 *  empty string when there is no meaningful baseline. */
export function pctDelta(from: number, to: number): string {
  if (from === 0) return to === 0 ? '0%' : '';
  const d = ((to - from) / Math.abs(from)) * 100;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  return `${sign}${Math.abs(d).toFixed(0)}%`;
}

/** Signed whole-dollar delta, e.g. +$6,000 / −$2,000. */
export function usdDelta(from: number, to: number): string {
  const d = to - from;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  return `${sign}${usd(Math.abs(d))}`;
}

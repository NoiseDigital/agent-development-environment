// Canonical number formatting — ONE algorithm per shape, consumed by every
// dashboard tile AND by the Vega custom format type (`compactNum`). When the
// rules change here, axes/tooltips and the surrounding tiles change together
// by construction — no tile renders "$5,302,593" next to a "32M" axis again.
//
// All functions handle non-finite input (NaN / Infinity / non-number) by
// returning an empty string. Callers should never have to guard.

const NON_FINITE = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

// ─── Compact magnitude ─────────────────────────────────────────────────────
// One rule for every K/M/B value:
//   - scaled magnitude < 10  → exactly ONE decimal: "1.0K", "8.5M", "1.3B"
//   - scaled magnitude ≥ 10  → exactly ZERO decimals: "32K", "350M", "29B"
//
// No trailing-zero stripping (that's where the previous inconsistency came
// from: $8.0M would render as $8M next to a 1.3B that kept its decimal —
// same row, two visual conventions). With this rule, a tile that shows
// "$8.5M" always shows the decimal; a tile that shows "29M" always doesn't.
//
// Sub-1 fractions (correlation r, ratios) drop trailing zeros for terseness;
// they're rare enough that the visual contract for the K/M/B range is what
// matters for dashboards.

/** 1.2K / 32M / 2.4B / 850 / 0.85 / 0 / '' (non-finite). */
export function compact(n: unknown): string {
  if (!NON_FINITE(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return _scaled(n / 1e9, 'B');
  if (abs >= 1e6) return _scaled(n / 1e6, 'M');
  if (abs >= 1e3) return _scaled(n / 1e3, 'K');
  if (abs >= 1) return String(Math.round(n));
  if (abs > 0) return n.toFixed(2).replace(/\.?0+$/, '');
  return '0';
}

/** Internal: scaled value + suffix with the consistent sig-fig rule. */
function _scaled(scaled: number, suffix: string): string {
  return scaled.toFixed(Math.abs(scaled) < 10 ? 1 : 0) + suffix;
}

// ─── Currency ──────────────────────────────────────────────────────────────

/** Whole-dollar with thousands separators: $42,000. */
export const usd = (n: unknown): string =>
  NON_FINITE(n) ? '$' + Math.round(n).toLocaleString('en-US') : '';

/** Cents-precision: $4.20. */
export const usd2 = (n: unknown): string =>
  NON_FINITE(n) ? '$' + n.toFixed(2) : '';

/** Compact currency: $1.2M / $340K / $820. Stays full precision below $1K
 *  so a small CPC / spend doesn't read as `$0K`. */
export const usdCompact = (n: unknown): string => {
  if (!NON_FINITE(n)) return '';
  return Math.abs(n) >= 1e3 ? '$' + compact(n) : '$' + Math.round(n).toLocaleString('en-US');
};

// ─── Counts and rates ──────────────────────────────────────────────────────

/** Integer with thousands separators: 9,354. */
export const num = (n: unknown): string =>
  NON_FINITE(n) ? Math.round(n).toLocaleString('en-US') : '';

/** Percentage with two decimals: 0.0142 → "1.42%". KPI / pivot cards use this. */
export const pct = (n: unknown): string =>
  NON_FINITE(n) ? (n * 100).toFixed(2) + '%' : '';

/** Compact percentage — one decimal, trailing zero stripped: "14.2%", "100%".
 *  Used by chart axes / tooltips where space is tight. */
export const pctCompact = (n: unknown): string => {
  if (!NON_FINITE(n)) return '';
  return (n * 100).toFixed(1).replace(/\.0$/, '') + '%';
};

// ─── Deltas ────────────────────────────────────────────────────────────────

/** Signed pct change from `from` to `to`: +14% / −8%. Empty when there is
 *  no meaningful baseline (from === 0 and the destination isn't zero too). */
export function pctDelta(from: number, to: number): string {
  if (from === 0) return to === 0 ? '0%' : '';
  const d = ((to - from) / Math.abs(from)) * 100;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  return `${sign}${Math.abs(d).toFixed(0)}%`;
}

/** Signed whole-dollar delta: +$6,000 / −$2,000. */
export function usdDelta(from: number, to: number): string {
  const d = to - from;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  return `${sign}${usd(Math.abs(d))}`;
}

// ─── Named-formatter dispatch ──────────────────────────────────────────────
// Tile specs name formatters by string ("usd", "compact", "pct") so the same
// JSON-shaped spec can come from buildTab(), the agent, or a future DB-backed
// dashboard config. Adding a new format is two lines: the function above, an
// entry below, and every tile that maps `format → fn` picks it up.

export type FormatKey =
  | 'usd'        // $42,000
  | 'usd2'       // $4.20
  | 'usdCompact' // $1.2M
  | 'compact'    // 32M / 9.4K
  | 'num'        // 9,354
  | 'pct';       // 1.42%

export const FORMATTERS: Record<FormatKey, (n: unknown) => string> = {
  usd,
  usd2,
  usdCompact,
  compact,
  num,
  pct,
};

/** Format `n` by key. Defaults to `compact` for unknown keys so a typo in a
 *  spec degrades gracefully rather than blanking the cell. */
export function formatByKey(n: unknown, key: FormatKey | string | undefined): string {
  if (key && key in FORMATTERS) return FORMATTERS[key as FormatKey](n);
  return compact(n);
}

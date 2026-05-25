// The Vega adapter for the platform's canonical number formatters
// (`lib/format.ts`). Registered as a custom Vega-Lite `numberFormatType` so
// every axis label, legend, and tooltip uses the same K/M/B + $ + % rules
// the surrounding tiles render with — one rule set, two consumers.
//
// Vega calls this with `(value, formatString)`. We treat the format string
// as a hint: `$` anywhere → currency-compact, `%` anywhere → percent-compact,
// everything else → plain compact.

import { compact, pctCompact, usdCompact } from './format';

export function compactNum(v: unknown, format?: string): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  if (format && format.includes('%')) return pctCompact(v);
  if (format && format.includes('$')) return usdCompact(v);
  return compact(v);
}

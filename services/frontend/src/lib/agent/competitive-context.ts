// Build the "Competitive context" preamble the competitive assistant reads.
// Centralised here so the page produces a stable shape — the agent's prompt
// parses these exact field names.

import type { CompetitiveResult } from '../api/competitive';
import type { SourceRef } from '../../types/source';
import { sourceUri } from '../../types/source';

export interface CompetitiveContextInput {
  source: SourceRef | null;
  mode: 'basic' | 'advanced';
  /** Detected column names — known for uploads, unknown for BigQuery until run. */
  columns: string[];
  result: CompetitiveResult | null;
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const band = (score: number) => (score >= 0.7 ? 'High' : score >= 0.4 ? 'Moderate' : 'Low');

/** Build a multi-line preamble for the competitive assistant. Two shapes:
 *  - PRE-RUN (a source is selected but no estimate has run): lists detected
 *    columns so the assistant can greet + recommend mode.
 *  - RESULT (an estimate has run): adds KPIs, top markets/competitors, and SOV
 *    leaders so the assistant can interpret. Returns '' when no source. */
export function buildCompetitiveContext(input: CompetitiveContextInput): string {
  const { source, mode, columns, result } = input;
  if (!source) return '';

  const lines: string[] = ['[Competitive context]'];
  lines.push(`source: ${sourceUri(source)}`);
  lines.push(`mode: ${mode}`);

  // PRE-RUN — guide setup.
  if (!result) {
    lines.push('status: pre-run (no estimate has been run yet)');
    lines.push(
      `columns: ${columns.length > 0 ? columns.join(', ') : '(unknown — BigQuery, run to inspect)'}`,
    );
    return lines.join('\n');
  }

  // RESULT — interpret.
  const k = result.kpis;
  const gross = k.estimated_base / Math.max(k.observed_spend, 1);
  lines.push('status: result');
  lines.push(`observed_spend: ${usd.format(k.observed_spend)}`);
  lines.push(
    `estimated_spend: ${usd.format(k.estimated_base)} (range ${usd.format(k.estimated_low)} – ${usd.format(k.estimated_high)})`,
  );
  lines.push(`gross_up: ${gross.toFixed(1)}x`);
  lines.push(`model_support: ${pct(k.model_support_score)} (${band(k.model_support_score)})`);
  lines.push(`brands: ${k.brands}   markets: ${k.markets}`);
  lines.push(`warnings: ${result.warnings.length > 0 ? result.warnings.join('; ') : '(none)'}`);

  if (result.by_market.length > 0) {
    lines.push('top_markets (by estimated spend):');
    for (const m of result.by_market.slice(0, 5)) {
      lines.push(`  - ${m.market} est=${usd.format(m.base)} support=${pct(m.support)}`);
    }
  }
  if (result.by_brand.length > 0) {
    lines.push('top_competitors (by estimated spend):');
    for (const b of result.by_brand.slice(0, 5)) {
      lines.push(`  - ${b.brand} est=${usd.format(b.estimated_base)}`);
    }
  }

  // SOV leaders — top 2 brands by spend share within each market (sov is sorted
  // by spend_sov desc upstream, so first-seen-per-market are the leaders).
  const leaders = new Map<string, string[]>();
  for (const s of result.sov) {
    const cur = leaders.get(s.market) ?? [];
    if (cur.length < 2) {
      cur.push(`${s.brand} ${pct(s.spend_sov)}`);
      leaders.set(s.market, cur);
    }
  }
  if (leaders.size > 0) {
    lines.push('sov_leaders:');
    for (const [market, brands] of [...leaders].slice(0, 5)) {
      lines.push(`  - ${market}: ${brands.join(', ')}`);
    }
  }

  return lines.join('\n');
}

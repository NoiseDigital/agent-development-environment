// Build the "Analyze context" preamble the assistant agent reads.
// Centralised here so the page and any future re-uses produce a stable
// shape — the agent's prompt parses these exact field names.

import type { CorrelateResult, QaResult } from './stats-api';
import type { SourceRef } from '../types/source';
import { sourceUri } from '../types/source';

export interface AnalyzeContextInput {
  source: SourceRef | null;
  setA: string[];
  setB: string[];
  result: CorrelateResult | null;
  qa: QaResult | null;
  preprocessing: {
    winsorize: boolean;
    log1p: boolean;
    zscore: boolean;
    difference: boolean;
  };
  alpha: number;
  lag: number;
}

/** Build a multi-line preamble for the assistant. Returns an empty string
 *  when there isn't a meaningful analysis to discuss — the panel will fall
 *  back to a generic "run an analysis first" message. */
export function buildAnalyzeContext(input: AnalyzeContextInput): string {
  const { source, setA, setB, result, qa, preprocessing, alpha, lag } = input;
  if (!result || !source) return '';

  const lines: string[] = ['[Analyze context]'];
  lines.push(`source: ${sourceUri(source)}`);
  lines.push(`method: ${result.method}`);
  lines.push(`rows_analyzed: ${result.n_rows_used}`);
  lines.push(`set_a: ${setA.join(', ') || '(none)'}`);
  lines.push(`set_b: ${setB.length > 0 ? setB.join(', ') : '(self)'}`);
  const prep = Object.entries(preprocessing)
    .filter(([, v]) => v)
    .map(([k]) => k);
  lines.push(`preprocessing: ${prep.length > 0 ? prep.join(', ') : 'none'}`);
  lines.push(`alpha: ${alpha}`);
  lines.push(`lag_b: ${lag}`);
  lines.push(
    `qa_warnings: ${
      qa && qa.warnings.length > 0 ? qa.warnings.join('; ') : '(none)'
    }`,
  );

  if (result.top_signals.length > 0) {
    lines.push('top_signals (top 10 by |r|):');
    for (const s of result.top_signals.slice(0, 10)) {
      const sig = s.p < alpha ? 'significant' : 'ns';
      lines.push(
        `  - A=${s.a} B=${s.b} r=${s.r.toFixed(3)} p=${
          s.p < 0.001 ? s.p.toExponential(1) : s.p.toFixed(3)
        } ${sig}`,
      );
    }
  } else {
    lines.push('top_signals: (none)');
  }

  return lines.join('\n');
}

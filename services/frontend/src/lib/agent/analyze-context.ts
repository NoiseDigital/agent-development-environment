// Build the "Analyze context" preamble the assistant agent reads.
// Centralised here so the page and any future re-uses produce a stable
// shape — the agent's prompt parses these exact field names.

import type { ColumnProfile, CorrelateResult, QaResult } from '../api/stats';
import type { SourceRef } from '../../types/source';
import { sourceUri } from '../../types/source';

export interface AnalyzeContextInput {
  source: SourceRef | null;
  columns: ColumnProfile[];
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

/** Build a multi-line preamble for the assistant. Two shapes:
 *  - PRE-ANALYSIS (a source is selected but no correlation has run): lists the
 *    columns + QA so the assistant can greet and guide the user through setup.
 *  - RESULT (a correlation has run): adds the method, settings, and top signals
 *    so the assistant can interpret.
 *  Returns '' only when no source is selected. */
export function buildAnalyzeContext(input: AnalyzeContextInput): string {
  const { source, columns, setA, setB, result, qa, preprocessing, alpha, lag } = input;
  if (!source) return '';

  const lines: string[] = ['[Analyze context]'];
  lines.push(`source: ${sourceUri(source)}`);

  // Column profile — always included; drives the guided-setup recommendations.
  if (columns.length > 0) {
    lines.push('columns (name · type · missing%):');
    for (const c of columns.slice(0, 40)) {
      lines.push(`  - ${c.name} · ${c.kind} · ${Math.round(c.missing_pct)}%`);
    }
  }
  lines.push(
    `qa_warnings: ${qa && qa.warnings.length > 0 ? qa.warnings.join('; ') : '(none)'}`,
  );

  // PRE-ANALYSIS — no result yet. Guide setup.
  if (!result) {
    lines.push('status: pre-analysis (no correlation has been run yet)');
    lines.push(
      `current_selection: set_a=${setA.join(', ') || '(none)'} set_b=${setB.join(', ') || '(none)'}`,
    );
    return lines.join('\n');
  }

  // RESULT — interpret.
  lines.push('status: result');
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

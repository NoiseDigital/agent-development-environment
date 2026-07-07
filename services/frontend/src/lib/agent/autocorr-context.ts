// Build the "AutoCorr context" preamble the assistant agent reads.
// Centralised here so the page and any future re-uses produce a stable
// shape — the agent's prompt parses these exact field names.

import type {
  ColumnProfile,
  ColumnStat,
  CorrelateResult,
  QaResult,
  RegressResult,
} from '../api/stats';
import type { SourceRef } from '../../types/source';
import { sourceUri } from '../../types/source';

export interface AutocorrContextInput {
  source: SourceRef | null;
  /** Which analysis the page is on — decides whether we serialize correlation
   *  or regression state. Without this the assistant was blind in regress mode. */
  mode: 'correlate' | 'regress';
  columns: ColumnProfile[];
  /** Per-column distribution stats — used to surface skew so the assistant can
   *  reason about heavy tails (Spearman / log1p) instead of guessing. */
  columnStats?: ColumnStat[];
  setA: string[];
  setB: string[];
  result: CorrelateResult | null;
  regResult: RegressResult | null;
  regY: string;
  regX: string[];
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

const fmtP = (p: number) => (p < 0.001 ? p.toExponential(1) : p.toFixed(3));

/** Build a multi-line preamble for the assistant. Shapes by mode + progress:
 *  - PRE-ANALYSIS (source selected, nothing run): columns + QA so the assistant
 *    can greet and guide setup.
 *  - CORRELATION RESULT: method, settings, top signals.
 *  - REGRESSION RESULT: fit quality, coefficients (with CIs + significance),
 *    diagnostics — so the assistant is grounded in regress mode too.
 *  Returns '' only when no source is selected. */
export function buildAutocorrContext(input: AutocorrContextInput): string {
  const {
    source, mode, columns, columnStats, setA, setB, result, regResult,
    regY, regX, qa, preprocessing, alpha, lag,
  } = input;
  if (!source) return '';

  const lines: string[] = ['[AutoCorr context]'];
  lines.push(`source: ${sourceUri(source)}`);
  lines.push(`mode: ${mode}`);

  // Column profile — always included; drives the guided-setup recommendations.
  // Skew rides along (when profiled) so heavy-tailed columns are visible.
  if (columns.length > 0) {
    const skewOf = new Map((columnStats ?? []).map((s) => [s.name, s.skew]));
    lines.push('columns (name · type · missing% · skew):');
    for (const c of columns.slice(0, 40)) {
      const sk = skewOf.get(c.name);
      const skStr = typeof sk === 'number' && Number.isFinite(sk) ? sk.toFixed(2) : 'n/a';
      lines.push(`  - ${c.name} · ${c.kind} · ${Math.round(c.missing_pct)}% · ${skStr}`);
    }
  }
  lines.push(
    `qa_warnings: ${qa && qa.warnings.length > 0 ? qa.warnings.join('; ') : '(none)'}`,
  );

  const prep = Object.entries(preprocessing)
    .filter(([, v]) => v)
    .map(([k]) => k);

  // ── Regression mode ────────────────────────────────────────────────────────
  if (mode === 'regress') {
    if (!regResult) {
      lines.push('status: pre-analysis (no regression has been run yet)');
      lines.push(`current_selection: y=${regY || '(none)'} x=${regX.join(', ') || '(none)'}`);
      return lines.join('\n');
    }
    const r = regResult;
    lines.push('status: regression result');
    lines.push(`y: ${r.y}`);
    lines.push(`x: ${r.x.join(', ')}`);
    lines.push(`n_obs: ${r.n_obs}`);
    lines.push(`r_squared: ${r.r_squared.toFixed(3)}  adj_r_squared: ${r.adj_r_squared.toFixed(3)}`);
    lines.push(`f_pvalue: ${fmtP(r.f_pvalue)}`);
    lines.push(`preprocessing: ${prep.length > 0 ? prep.join(', ') : 'none'}  lag_x: ${lag}`);
    lines.push('coefficients (term · coef · 95% CI · p · sig):');
    for (const c of r.coefficients) {
      const sig = c.p_value < alpha ? 'significant' : 'ns';
      lines.push(
        `  - ${c.term} · ${c.coef.toFixed(4)} · [${c.ci_low.toFixed(4)}, ${c.ci_high.toFixed(4)}] · ${fmtP(c.p_value)} · ${sig}`,
      );
    }
    lines.push(
      `diagnostics: durbin_watson=${r.diagnostics.durbin_watson.toFixed(2)} condition_number=${r.diagnostics.condition_number.toFixed(0)} aic=${r.diagnostics.aic.toFixed(0)}`,
    );
    return lines.join('\n');
  }

  // ── Correlation mode ───────────────────────────────────────────────────────
  if (!result) {
    lines.push('status: pre-analysis (no correlation has been run yet)');
    lines.push(
      `current_selection: set_a=${setA.join(', ') || '(none)'} set_b=${setB.join(', ') || '(none)'}`,
    );
    return lines.join('\n');
  }

  lines.push('status: result');
  lines.push(`method: ${result.method}`);
  lines.push(`rows_analyzed: ${result.n_rows_used}`);
  lines.push(`set_a: ${setA.join(', ') || '(none)'}`);
  lines.push(`set_b: ${setB.length > 0 ? setB.join(', ') : '(self)'}`);
  lines.push(`preprocessing: ${prep.length > 0 ? prep.join(', ') : 'none'}`);
  lines.push(`alpha: ${alpha}`);
  lines.push(`lag_b: ${lag}`);

  if (result.top_signals.length > 0) {
    lines.push('top_signals (top 10 by |r|):');
    for (const s of result.top_signals.slice(0, 10)) {
      const sig = s.p < alpha ? 'significant' : 'ns';
      lines.push(`  - A=${s.a} B=${s.b} r=${s.r.toFixed(3)} p=${fmtP(s.p)} ${sig}`);
    }
  } else {
    lines.push('top_signals: (none)');
  }

  return lines.join('\n');
}

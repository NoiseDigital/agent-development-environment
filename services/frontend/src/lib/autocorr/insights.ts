// Pure helpers for the AutoCorr insights tile: the payload sent to
// autocorr_insights_agent, and a deterministic rule-based fallback shown while
// the agent runs or if it fails (so there's always something on screen — same
// contract as Market Radar's tile).

import type { CorrelateResult } from '../api/stats';

export interface AutocorrInsight {
  type: string;
  insight: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

const r3 = (n: number) => Number(n.toFixed(3));

/** Compact JSON summary of a correlation result for the insights agent. */
export function buildInsightsPayload(result: CorrelateResult, alpha: number) {
  return {
    mode: 'correlate',
    method: result.method,
    rows_analyzed: result.n_rows_used,
    alpha,
    top_signals: result.top_signals.slice(0, 8).map((s) => ({
      a: s.a,
      b: s.b,
      r: r3(s.r),
      p: s.p,
      significant: s.p < alpha,
    })),
  };
}

/** Deterministic fallback insights derived from the top signals — no LLM. Used
 *  until the agent responds, or if it errors. Kept intentionally conservative:
 *  it only states what the numbers directly show. */
export function ruleBasedInsights(result: CorrelateResult, alpha: number): AutocorrInsight[] {
  const signals = result.top_signals;
  if (signals.length === 0) {
    return [
      {
        type: 'No signal',
        insight: `No column pairs cleared the bar on ${result.n_rows_used} rows — the selected variables move independently here.`,
        tone: 'negative',
      },
    ];
  }

  const out: AutocorrInsight[] = [];
  const fmtR = (n: number) => n.toFixed(2);
  const fmtP = (p: number) => (p < 0.001 ? '≈0' : p.toFixed(3));

  // Strongest significant pair.
  const topSig = signals.find((s) => s.p < alpha);
  if (topSig) {
    out.push({
      type: 'Strongest signal',
      insight: `${topSig.a} × ${topSig.b} is the strongest significant relationship (r=${fmtR(topSig.r)}, p=${fmtP(topSig.p)}) across ${result.n_rows_used} rows.`,
      tone: 'positive',
    });
  }

  // Possible leakage — very high |r| is often definitional.
  const veryHigh = signals.find((s) => Math.abs(s.r) > 0.9);
  if (veryHigh && veryHigh !== topSig) {
    out.push({
      type: 'Check for leakage',
      insight: `${veryHigh.a} × ${veryHigh.b} is near-perfect (r=${fmtR(veryHigh.r)}) — likely a definitional or mechanical link rather than a finding.`,
      tone: 'negative',
    });
  }

  // Strongest but non-significant — a caution.
  const topOverall = signals[0];
  if (topOverall.p >= alpha) {
    out.push({
      type: 'Not significant',
      insight: `Even the top pair ${topOverall.a} × ${topOverall.b} (r=${fmtR(topOverall.r)}) is not significant (p=${fmtP(topOverall.p)}) — treat with caution.`,
      tone: 'negative',
    });
  }

  // A negative relationship, if a notable one exists.
  const neg = signals.find((s) => s.r < -0.3 && s.p < alpha);
  if (neg && neg !== topSig) {
    out.push({
      type: 'Inverse link',
      insight: `${neg.a} moves inversely with ${neg.b} (r=${fmtR(neg.r)}, p=${fmtP(neg.p)}) — worth understanding why.`,
      tone: 'neutral',
    });
  }

  return out.slice(0, 4);
}

/** Parse the agent's JSON reply (tolerating a ```json fence). */
export function parseInsights(text: string): AutocorrInsight[] {
  if (!text) return [];
  let raw = text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  try {
    const parsed = JSON.parse(raw) as { insights?: AutocorrInsight[] };
    return Array.isArray(parsed.insights) ? parsed.insights : [];
  } catch {
    return [];
  }
}

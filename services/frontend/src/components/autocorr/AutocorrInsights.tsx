'use client';

// Analyst insights for /autocorr — the sibling of MarketRadarInsights. Calls
// autocorr_insights_agent (a one-shot ADK agent) with a summary of the current
// correlation result and renders structured bullets. While the agent runs (or if
// it fails), it falls back to deterministic rule-based insights so there's always
// something on screen.

import { useEffect, useState } from 'react';

import { adkApi } from '../../lib/agent/adk-api';
import { getCurrentUser } from '../../lib/auth';
import type { CorrelateResult } from '../../lib/api/stats';
import {
  buildInsightsPayload,
  parseInsights,
  ruleBasedInsights,
  type AutocorrInsight,
} from '../../lib/autocorr/insights';

const AGENT = 'autocorr_insights_agent';

const TONE: Record<string, string> = {
  positive: 'border-positive/30 bg-positive/10',
  negative: 'border-danger/30 bg-danger/10',
  neutral: 'border-line/50 bg-surface-sunken/40',
};

export default function AutocorrInsights({
  result,
  alpha,
}: {
  result: CorrelateResult;
  alpha: number;
}) {
  const [insights, setInsights] = useState<AutocorrInsight[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setInsights(null);
    adkApi
      .runOneShot(AGENT, getCurrentUser().uid, JSON.stringify(buildInsightsPayload(result, alpha)))
      .then((text) => {
        if (cancelled) return;
        const parsed = parseInsights(text);
        setInsights(parsed.length > 0 ? parsed : null);
      })
      .catch(() => {
        if (!cancelled) setInsights(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [result, alpha]);

  // Agent insights when available; otherwise the deterministic rule-based ones.
  const cards: AutocorrInsight[] = insights ?? ruleBasedInsights(result, alpha);
  const isAgent = insights !== null;

  if (cards.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
          Analyst insights
        </h3>
        {loading && <span className="text-[10px] text-faint">generating…</span>}
        {!loading && !isAgent && <span className="text-[10px] text-faint">rule-based</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((ins, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 ${TONE[ins.tone ?? 'neutral'] ?? TONE.neutral}`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-accent-400">
              {ins.type}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{ins.insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

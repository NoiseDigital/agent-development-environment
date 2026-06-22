'use client';

// Analyst insights for /competitive — calls competitive_insights_agent (a
// one-shot ADK agent) with a summary of the estimate, and renders structured
// bullets. While the agent runs (or if it fails), it falls back to the
// deterministic rule-based insights already on the result, so there's always
// something on screen.

import { useEffect, useState } from 'react';

import { adkApi } from '../../lib/agent/adk-api';
import { getCurrentUser } from '../../lib/auth';
import type { CompetitiveResult } from '../../lib/api/competitive';

const AGENT = 'competitive_insights_agent';

interface AgentInsight {
  type: string;
  insight: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

const TONE: Record<string, string> = {
  positive: 'border-positive/30 bg-positive/10',
  negative: 'border-danger/30 bg-danger/10',
  neutral: 'border-line/50 bg-surface-sunken/40',
};

function sovLeaders(result: CompetitiveResult) {
  const seen = new Map<string, string[]>();
  for (const s of result.sov) {
    const cur = seen.get(s.market) ?? [];
    if (cur.length < 2) {
      cur.push(`${s.brand} ${(s.spend_sov * 100).toFixed(0)}%`);
      seen.set(s.market, cur);
    }
  }
  return [...seen].slice(0, 5).map(([market, brands]) => `${market}: ${brands.join(', ')}`);
}

function buildPayload(result: CompetitiveResult) {
  const k = result.kpis;
  return {
    mode: result.mode,
    observed_spend: Math.round(k.observed_spend),
    estimated_spend: Math.round(k.estimated_base),
    estimate_range: [Math.round(k.estimated_low), Math.round(k.estimated_high)],
    model_support: k.model_support_score,
    brands: k.brands,
    markets: k.markets,
    top_markets: result.by_market.slice(0, 5).map((m) => ({
      market: m.market,
      estimated: Math.round(m.base),
      support: Number(m.support.toFixed(2)),
    })),
    top_competitors: result.by_brand.slice(0, 5).map((b) => ({
      brand: b.brand,
      estimated: Math.round(b.estimated_base),
    })),
    sov_leaders: sovLeaders(result),
    low_support_cells: result.observed_vs_estimated.filter((c) => c.confidence < 0.4).length,
  };
}

function parse(text: string): AgentInsight[] {
  if (!text) return [];
  let raw = text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  try {
    const parsed = JSON.parse(raw) as { insights?: AgentInsight[] };
    return Array.isArray(parsed.insights) ? parsed.insights : [];
  } catch {
    return [];
  }
}

export default function CompetitiveInsights({ result }: { result: CompetitiveResult }) {
  const [insights, setInsights] = useState<AgentInsight[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setInsights(null);
    adkApi
      .runOneShot(AGENT, getCurrentUser().uid, JSON.stringify(buildPayload(result)))
      .then((text) => {
        if (cancelled) return;
        const parsed = parse(text);
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
  }, [result]);

  // Agent insights when available; otherwise the deterministic rule-based ones.
  const cards: AgentInsight[] =
    insights ??
    result.insights.map((r) => ({ type: r.type, insight: r.text, tone: 'neutral' as const }));
  const isAgent = insights !== null;

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

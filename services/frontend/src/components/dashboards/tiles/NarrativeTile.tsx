'use client';

// Noise Analyst — calls dashboard_insights_agent via ADK /run. Re-runs on
// refresh + filter change (totals payload is the input).

import { useEffect, useState } from 'react';
import {
  dashboardData,
  type MetricTotalsRow,
  type NamedValue,
} from '../../../lib/dashboards';
import { useDashboardFilters } from '../../../lib/dashboards/filter-context';
import { useDashboardRefresh } from '../../../lib/dashboards/refresh-context';
import { useDashboardTotals } from '../../../lib/dashboards/totals-context';
import { useDashboardEdit } from '../../../lib/dashboards/edit-context';
import { tileManifestList } from '../../../lib/dashboards/context';
import { adkApi } from '../../../lib/agent/adk-api';
import { getCurrentUser } from '../../../lib/auth';
import TileChartShell from './TileChartShell';

interface NarrativeTileProps {
  title: string;
}

interface InsightBullet {
  headline: string;
  body: string;
  tone: 'positive' | 'negative' | 'neutral';
}

const INSIGHTS_AGENT = 'dashboard_insights_agent';

function windowLabel(from?: string, to?: string): string {
  if (!from && !to) return 'All available history';
  if (from && to) return `${from} → ${to}`;
  return from ?? `up to ${to}`;
}

const TONE_RING: Record<InsightBullet['tone'], string> = {
  positive: 'bg-emerald-400/15 text-emerald-300 border-emerald-500/30',
  negative: 'bg-red-400/15 text-red-300 border-red-500/30',
  neutral:  'bg-zinc-700/30 text-zinc-300 border-zinc-700',
};

export default function NarrativeTile({ title }: NarrativeTileProps) {
  const { filters } = useDashboardFilters();
  const { current, prior, loading: totalsLoading } = useDashboardTotals();
  const { version: refreshVersion } = useDashboardRefresh();
  const editCtx = useDashboardEdit();
  const [insights, setInsights] = useState<InsightBullet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [topPublisher, setTopPublisher] = useState<NamedValue | null>(null);

  useEffect(() => {
    let cancelled = false;
    dashboardData
      .publisherBreakdown({ date_from: filters.date_from, date_to: filters.date_to })
      .then((rows) => { if (!cancelled && rows.length > 0) setTopPublisher(rows[0]); })
      .catch(() => { /* analyst still works without this line */ });
    return () => { cancelled = true; };
  }, [filters.date_from, filters.date_to, refreshVersion]);

  useEffect(() => {
    if (totalsLoading || !current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Tab manifest — what the user is looking at right now. Lets the agent
    // ground its bullets in visible tiles ("the Spend trend tile shows…")
    // and call out angles the user might miss given the current layout.
    const dashboardContext = editCtx
      ? {
          dashboard_name: editCtx.dashboardName,
          tab_label: editCtx.activeTab.label,
          other_tabs: editCtx.tabs
            .filter((t) => t.id !== editCtx.activeTab.id)
            .map((t) => t.label),
          tiles_on_tab: tileManifestList(editCtx.activeTab.tiles),
        }
      : null;
    const payload = JSON.stringify({
      window: windowLabel(filters.date_from, filters.date_to),
      filters,
      current: stripNonNumeric(current),
      prior: prior ? stripNonNumeric(prior) : null,
      top_publisher: topPublisher,
      dashboard: dashboardContext,
    });
    adkApi
      .runOneShot(INSIGHTS_AGENT, getCurrentUser().uid, payload)
      .then((text) => {
        if (cancelled) return;
        const parsed = parseInsightsResponse(text);
        setInsights(parsed);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to generate');
        setInsights([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // `prior` + `topPublisher` resolve from the same upstream as `current`; omitted to dedupe.
  }, [current, totalsLoading, refreshVersion, filters.date_from, filters.date_to, filters.campaign_phase, filters.publisher, filters.market_group, filters.creative_format, filters.kpi_goal, editCtx?.activeTab.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (totalsLoading || loading || insights === null) {
    return (
      <TileChartShell title={title}>
        <div className="space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-raised/40" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-raised/40" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-raised/40" />
        </div>
      </TileChartShell>
    );
  }

  if (error || insights.length === 0) {
    return (
      <TileChartShell title={title}>
        <p className="text-xs text-zinc-500">
          {error ?? 'No insights for the selected window.'}
        </p>
      </TileChartShell>
    );
  }

  return (
    <TileChartShell title={title}>
      <ul className="h-full space-y-2 overflow-y-auto pr-1">
        {insights.map((it, i) => (
          <li key={i} className={`rounded-md border px-2.5 py-2 ${TONE_RING[it.tone]}`}>
            <p className="text-[12px] font-semibold leading-tight">{it.headline}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-300">{it.body}</p>
          </li>
        ))}
      </ul>
    </TileChartShell>
  );
}

function stripNonNumeric(row: MetricTotalsRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// Tolerate occasional markdown fences around the JSON.
function parseInsightsResponse(text: string): InsightBullet[] {
  if (!text) return [];
  let raw = text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  try {
    const parsed = JSON.parse(raw) as { insights?: InsightBullet[] };
    return Array.isArray(parsed.insights) ? parsed.insights : [];
  } catch {
    return [];
  }
}

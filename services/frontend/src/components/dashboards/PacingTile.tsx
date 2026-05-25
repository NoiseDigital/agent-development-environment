'use client';

// Budget pacing — filled bar of spent / budget with on-pace / hot / cold hint.

import { useEffect, useState } from 'react';
import { dashboardData } from '../../lib/dashboards';
import { useDashboardFilters } from '../../lib/dashboard-filter-context';
import { useDashboardRefresh } from '../../lib/dashboard-refresh-context';
import { usdCompact } from '../../lib/format';
import TileChartShell from './TileChartShell';

interface PacingTileProps {
  title: string;
  expectedShare?: number;
}

export default function PacingTile({ title, expectedShare }: PacingTileProps) {
  const pacingInfo = {
    summary:
      'Planned vs. delivered spend. The filled bar shows what\'s been spent out of the budget for the current filter set; the white tick (when shown) marks where pacing should be at this point in the window.',
    metricKeys: ['total_spend', 'budget'],
    notes: [
      'Red fill = over budget. Green fill = within budget.',
      expectedShare !== undefined
        ? '"Hot" means ahead of plan, "cold" means behind plan.'
        : 'A target pacing tick can be added by passing `expectedShare`.',
    ],
  };
  const { filters } = useDashboardFilters();
  const { version: refreshVersion } = useDashboardRefresh();
  const [rows, setRows] = useState<{ budget: number; spent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    dashboardData
      .pacing({
        campaign_phase_filter: filters.campaign_phase,
      })
      .then((data) => {
        if (cancelled) return;
        const budget = data.find((r) => r.name === 'Budget')?.value ?? 0;
        const spent = data.find((r) => r.name === 'Spent')?.value ?? 0;
        setRows({ budget, spent });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setRows({ budget: 0, spent: 0 });
      });
    return () => { cancelled = true; };
  }, [filters.campaign_phase, refreshVersion]);

  if (rows === null) {
    return (
      <TileChartShell title={title} info={pacingInfo}>
        <div className="h-full w-full animate-pulse rounded-lg bg-surface-raised/40" />
      </TileChartShell>
    );
  }
  if (error) {
    return (
      <TileChartShell title={title} info={pacingInfo}>
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-red-400">
          Failed to load — {error}
        </div>
      </TileChartShell>
    );
  }
  if (rows.budget <= 0) {
    return (
      <TileChartShell title={title} info={pacingInfo}>
        <div className="flex h-full w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-zinc-500">
          No budget set for this slice.
        </div>
      </TileChartShell>
    );
  }

  const share = rows.spent / rows.budget;
  const clamped = Math.max(0, Math.min(1, share));
  const overSpent = share > 1;

  // Pacing hint: if a target share is supplied (e.g. 0.5 = halfway through the
  // window), compare actual share against it. Otherwise we just show the
  // headline pct with no judgement.
  let hint: { label: string; tone: 'positive' | 'negative' | 'neutral' } = {
    label: `${(share * 100).toFixed(0)}% of budget spent`,
    tone: 'neutral',
  };
  if (typeof expectedShare === 'number' && expectedShare > 0) {
    const diff = share - expectedShare;
    if (Math.abs(diff) < 0.05) {
      hint = { label: 'On pace', tone: 'positive' };
    } else if (diff > 0) {
      hint = { label: `Pacing ${(diff * 100).toFixed(0)}pp hot`, tone: 'negative' };
    } else {
      hint = { label: `Pacing ${Math.abs(diff * 100).toFixed(0)}pp cold`, tone: 'negative' };
    }
  }
  const toneColor =
    hint.tone === 'positive' ? 'text-emerald-300'
    : hint.tone === 'negative' ? 'text-red-300'
    : 'text-zinc-400';

  return (
    <TileChartShell title={title} info={pacingInfo}>
      <div className="flex h-full flex-col justify-center gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[2rem] font-semibold leading-none tabular-nums text-white">
            {(share * 100).toFixed(0)}%
          </span>
          <span className={`text-[11px] font-medium ${toneColor}`}>{hint.label}</span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`absolute inset-y-0 left-0 ${overSpent ? 'bg-red-400' : 'bg-emerald-400'}`}
            style={{ width: `${clamped * 100}%` }}
          />
          {typeof expectedShare === 'number' && expectedShare > 0 && expectedShare <= 1 && (
            <div
              className="absolute inset-y-0 w-px bg-white/70"
              style={{ left: `${expectedShare * 100}%` }}
              title={`Expected pace at ${(expectedShare * 100).toFixed(0)}%`}
            />
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>
            Spent <span className="font-medium text-white">{usdCompact(rows.spent)}</span>
          </span>
          <span>
            of <span className="font-medium text-white">{usdCompact(rows.budget)}</span>
          </span>
        </div>
      </div>
    </TileChartShell>
  );
}

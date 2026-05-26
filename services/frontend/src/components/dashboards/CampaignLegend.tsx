'use client';

// Inline chip strip — one chip per campaign band rendered behind the trend
// chart. Sits below the chart so the in-plot area stays clean (labels were
// colliding for campaigns with overlapping windows).

import type { CampaignWindow } from '../../lib/dashboards';

interface CampaignLegendProps {
  windows: readonly CampaignWindow[];
}

function fmt(iso: string): string {
  // YYYY-MM-DD → "Sep 23". Render in UTC so the day never shifts.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function CampaignLegend({ windows }: CampaignLegendProps) {
  if (!windows || windows.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-zinc-400">
      <span className="font-medium uppercase tracking-wider text-zinc-500">
        Campaigns
      </span>
      {windows.map((w) => (
        <span key={`${w.name}-${w.start_date}`} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500/40" />
          <span className="text-zinc-300">{w.name}</span>
          <span className="text-zinc-600">
            {fmt(w.start_date)} – {fmt(w.end_date)}
          </span>
        </span>
      ))}
    </div>
  );
}

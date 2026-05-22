'use client';

import type { KpiTile as KpiTileData } from '../data/mock-dashboard-data';

// A single metric card — the unit of a report's KPI strip. Compact by design:
// label, a prominent value, and a coloured change chip vs. the prior period.
export default function KpiTile({ tile }: { tile: KpiTileData }) {
  const { delta } = tile;
  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {tile.label}
      </p>
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[1.6rem] font-semibold leading-none tabular-nums text-white">
          {tile.value}
        </span>
        {delta && (
          <span
            className={`flex shrink-0 items-center gap-0.5 text-[11px] font-medium ${
              delta.good ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {delta.value.trim().startsWith('-') ? '▼' : '▲'}
            {delta.value}
          </span>
        )}
      </div>
      {tile.sublabel && (
        <p className="truncate text-[10px] text-zinc-500">{tile.sublabel}</p>
      )}
    </div>
  );
}

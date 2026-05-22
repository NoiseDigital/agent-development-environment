'use client';

import type { NarrativeTile as NarrativeTileData } from '../data/mock-dashboard-data';

// The agent-written summary panel — the "powered by Noise" insight layer a
// static report can't produce. Points are derived from the same data the tiles
// aggregate; a live Media Analyst call replaces the templated copy later.
export default function NarrativeTile({ tile }: { tile: NarrativeTileData }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 flex shrink-0 items-center gap-1.5">
        <svg className="h-4 w-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <span className="text-sm font-medium text-white">{tile.title}</span>
      </div>
      <ul className="no-drag flex-1 space-y-2.5 overflow-auto text-xs leading-relaxed text-zinc-400">
        {tile.points.map((point, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-400" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

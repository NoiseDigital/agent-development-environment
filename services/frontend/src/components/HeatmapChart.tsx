'use client';

import { Fragment } from 'react';

interface HeatmapChartProps {
  rows: string[];
  cols: string[];
  matrix: (number | null)[][];
  significant?: boolean[][];
}

// Correlation coefficient → cell colour: red for positive, blue for negative,
// alpha scaled by |r| so weak correlations fade toward the dark background.
function cellColor(r: number | null): string {
  if (r === null || Number.isNaN(r)) return 'transparent';
  const a = Math.min(1, Math.abs(r));
  return r >= 0 ? `rgba(239, 68, 68, ${a})` : `rgba(96, 165, 250, ${a})`;
}

export default function HeatmapChart({ rows, cols, matrix, significant }: HeatmapChartProps) {
  if (!rows?.length || !cols?.length || !matrix?.length) {
    return <p className="text-xs text-zinc-500">No correlation data.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-auto">
        <div
          className="grid gap-px bg-zinc-800 text-[11px] rounded-md overflow-hidden"
          style={{
            gridTemplateColumns: `minmax(96px, auto) repeat(${cols.length}, minmax(54px, 1fr))`,
          }}
        >
          {/* Header row: empty corner + column labels */}
          <div className="bg-zinc-900" />
          {cols.map((c) => (
            <div
              key={c}
              className="bg-zinc-900 px-1.5 py-2 text-center text-zinc-400 truncate"
              title={c}
            >
              {c}
            </div>
          ))}

          {/* Body rows */}
          {rows.map((rowName, i) => (
            <Fragment key={rowName}>
              <div
                className="bg-zinc-900 px-2 py-2 text-right text-zinc-400 truncate flex items-center justify-end"
                title={rowName}
              >
                {rowName}
              </div>
              {cols.map((colName, j) => {
                const r = matrix[i]?.[j] ?? null;
                const sig = significant?.[i]?.[j] ?? true;
                return (
                  <div
                    key={colName}
                    className={`flex items-center justify-center py-2.5 font-medium tabular-nums ${
                      sig ? 'text-white' : 'text-zinc-500 opacity-40'
                    }`}
                    style={{ backgroundColor: cellColor(r) }}
                    title={`${rowName} × ${colName}: ${
                      r === null ? 'n/a' : r.toFixed(3)
                    }${sig ? '' : ' (not significant)'}`}
                  >
                    {r === null ? '—' : r.toFixed(2)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(96,165,250,0.9)' }} />
          negative
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(239,68,68,0.9)' }} />
          positive
        </span>
        <span className="opacity-50">dimmed = not significant</span>
      </div>
    </div>
  );
}

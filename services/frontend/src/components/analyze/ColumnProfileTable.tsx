'use client';

// Per-column distribution stats for /analyze — surfaces skew + outliers so the
// user (and the assistant) can pick the right method/preprocessing. Collapsed by
// default so it doesn't crowd the results.

import type { ColumnStat } from '../../lib/api/stats';

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) !== 0 && (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e6)) return n.toExponential(1);
  return Number(n.toFixed(2)).toLocaleString();
}

export default function ColumnProfileTable({ columns }: { columns: ColumnStat[] }) {
  if (columns.length === 0) return null;
  const skewed = columns.filter((c) => Math.abs(c.skew) >= 2).length;

  return (
    <details className="rounded-xl border border-line/80 bg-surface-sunken/40">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-foreground">
        Column distribution
        <span className="ml-2 text-[11px] font-normal text-faint">
          {columns.length} numeric{skewed > 0 ? ` · ${skewed} highly skewed` : ''}
        </span>
      </summary>
      <div className="overflow-x-auto border-t border-line/60">
        <table className="w-full text-xs">
          <thead className="text-faint">
            <tr className="text-right">
              <th className="px-3 py-2 text-left font-medium">Column</th>
              <th className="px-3 py-2 font-medium">Missing</th>
              <th className="px-3 py-2 font-medium">Min</th>
              <th className="px-3 py-2 font-medium">p01</th>
              <th className="px-3 py-2 font-medium">Median</th>
              <th className="px-3 py-2 font-medium">p99</th>
              <th className="px-3 py-2 font-medium">Max</th>
              <th className="px-3 py-2 font-medium">Std</th>
              <th className="px-3 py-2 font-medium">Skew</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {columns.map((c) => {
              const hi = Math.abs(c.skew) >= 2;
              return (
                <tr key={c.name} className="text-right hover:bg-surface/30">
                  <td className="px-3 py-1.5 text-left font-medium text-muted">{c.name}</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{c.missing_pct}%</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmt(c.min)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmt(c.p01)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-foreground">{fmt(c.median)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmt(c.p99)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmt(c.max)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmt(c.std)}</td>
                  <td className={`px-3 py-1.5 tabular-nums ${hi ? 'font-semibold text-warning' : 'text-subtle'}`}>
                    {fmt(c.skew)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line/60 px-3 py-1.5 text-[11px] text-faint">
          High |skew| (≥ 2) means heavy tails — consider <b>Spearman</b> or <b>Log1p</b>.
        </p>
      </div>
    </details>
  );
}

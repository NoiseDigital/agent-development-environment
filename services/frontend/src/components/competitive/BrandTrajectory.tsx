'use client';

// Brand Trajectory tab for /competitive — per-brand forecasts (top 8 brands) for
// a chosen metric, as history→forecast lines plus a summary table with a
// Supported/Directional quality gate. Reads BrandForecast[] from the forecast.

import { useState } from 'react';

import VegaChart from '../VegaChart';
import { multiLineSpec } from '../../lib/charts/specs';
import type { BrandForecast } from '../../lib/api/competitive';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fmtVal = (n: number, pct: boolean) =>
  pct ? `${(n * 100).toFixed(1)}%` : usd.format(n);
const fmtChange = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`;
const fmtStat = (n: number | null, d = 3) => (n == null ? '—' : n.toFixed(d));

const METRICS: { key: BrandForecast['metric']; label: string }[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'sov', label: 'Share of voice' },
  { key: 'impressions', label: 'Impressions' },
];

export default function BrandTrajectory({ brands }: { brands: BrandForecast[] }) {
  const available = METRICS.filter((m) => brands.some((b) => b.metric === m.key));
  const [metric, setMetric] = useState<BrandForecast['metric']>(available[0]?.key ?? 'spend');

  const rows = brands.filter((b) => b.metric === metric);
  const isPct = rows[0]?.is_pct ?? metric === 'sov';

  // History (solid) + forecast central (dashed) per brand, as one temporal series.
  const lineData = rows.flatMap((b) => [
    ...b.history.map((h) => ({ month: h.month, value: h.value, series: b.brand, phase: 'history' })),
    ...b.forecast.map((f) => ({
      month: f.month,
      value: f.central_forecast,
      series: b.brand,
      phase: 'forecast',
    })),
  ]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Run the forecast to see brand trajectories.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 w-fit">
        {available.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              metric === m.key ? 'bg-surface-raised text-foreground' : 'text-faint hover:text-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line/80 bg-surface-sunken/40 p-3">
        <VegaChart
          spec={multiLineSpec({
            title: `Brand ${metric === 'sov' ? 'share of voice' : metric} — trajectory`,
            subtitle: 'Solid = modeled history · dashed = forecast (top 8 brands)',
            data: lineData,
            valueFormat: isPct ? '%' : '$',
          })}
          saveable
        />
      </div>

      <div className="rounded-xl border border-line/80 bg-surface-sunken/40 p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-faint">
              <tr className="text-right">
                <th className="px-3 py-2 text-left font-medium">Brand</th>
                <th className="px-3 py-2 font-medium">Current</th>
                <th className="px-3 py-2 font-medium">Forecast end</th>
                <th className="px-3 py-2 font-medium">Change</th>
                <th className="px-3 py-2 font-medium">R²</th>
                <th className="px-3 py-2 font-medium">p</th>
                <th className="px-3 py-2 text-left font-medium">Quality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((b) => (
                <tr key={b.brand} className="text-right hover:bg-surface/30">
                  <td className="px-3 py-1.5 text-left font-medium text-muted">{b.brand}</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmtVal(b.current, b.is_pct)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-foreground">{fmtVal(b.forecast_end, b.is_pct)}</td>
                  <td className={`px-3 py-1.5 tabular-nums ${b.change_pct >= 0 ? 'text-positive' : 'text-warning'}`}>
                    {fmtChange(b.change_pct)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmtStat(b.r_squared)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-subtle">{fmtStat(b.p_value, 4)}</td>
                  <td className={`px-3 py-1.5 text-left font-medium ${b.quality === 'Supported' ? 'text-positive' : 'text-faint'}`}>
                    {b.quality}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 pt-2 text-[11px] text-faint">
            <b>Supported</b> = enough history with a statistically meaningful trend; <b>Directional</b> = thin or weak signal — treat as a rough read.
          </p>
        </div>
      </div>
    </div>
  );
}

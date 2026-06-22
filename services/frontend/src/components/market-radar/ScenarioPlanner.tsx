'use client';

// Scenario Planner tab for /competitive — projects total competitive spend
// forward with an OLS trend + prediction-interval fan, tunable via scenario
// sliders. Reads a ForecastResult computed server-side (market_radar.forecast).

import InfoHint from '../ui/InfoHint';
import VegaChart from '../VegaChart';
import { forecastFanSpec } from '../../lib/charts/specs';
import type { ForecastResult, ScenarioParams } from '../../lib/api/market-radar';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fmtUsd = (n: number) => usd.format(n);
const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;
const fmtNum = (n: number | null | undefined, digits = 3) =>
  n == null ? '—' : n.toFixed(digits);

const METHODS: { key: NonNullable<ScenarioParams['method']>; label: string }[] = [
  { key: 'scenario_override', label: 'Scenario override' },
  { key: 'trend_plus_scenario', label: 'Trend + scenario' },
  { key: 'trend_only', label: 'Trend only' },
];

function Slider({
  label, value, min, max, step, onChange, fmt, hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="flex items-center gap-1 text-subtle">
          {label}
          {hint && <InfoHint text={hint} />}
        </span>
        <span className="font-mono text-foreground">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-500"
      />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line/50 bg-surface-sunken/40 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

interface Props {
  params: ScenarioParams;
  onChange: (next: ScenarioParams) => void;
  onRun: () => void;
  loading: boolean;
  forecast: ForecastResult | null;
}

export default function ScenarioPlanner({ params, onChange, onRun, loading, forecast }: Props) {
  const set = (patch: Partial<ScenarioParams>) => onChange({ ...params, ...patch });
  const p = {
    market_mult: params.market_mult ?? 1,
    channel_mult: params.channel_mult ?? 1,
    source_mult: params.source_mult ?? 1,
    growth_pct: params.growth_pct ?? 5,
    periods: params.periods ?? 6,
    range_width: params.range_width ?? 1,
    alpha: params.alpha ?? 0.05,
    method: params.method ?? 'scenario_override',
  };

  const fanHistory = (forecast?.history ?? []).map((h) => ({
    month: h.month,
    value: h.scenario_base_spend,
  }));
  const fanForecast = (forecast?.total_forecast ?? []).map((f) => ({
    month: f.month,
    central: f.central_forecast,
    lo80: f.ci_low_80, hi80: f.ci_high_80,
    lo90: f.ci_low_90, hi90: f.ci_high_90,
    lo95: f.ci_low_95, hi95: f.ci_high_95,
  }));
  const stats = forecast?.model_stats;
  const rel = forecast?.reliability;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="rounded-xl border border-line/50 bg-surface-sunken/40 p-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
          <Slider label="Market multiplier" value={p.market_mult} min={0.5} max={2} step={0.05}
            onChange={(v) => set({ market_mult: v })} fmt={(v) => `${v.toFixed(2)}×`}
            hint="Scales the whole landscape up/down for a demand scenario." />
          <Slider label="Channel multiplier" value={p.channel_mult} min={0.5} max={2} step={0.05}
            onChange={(v) => set({ channel_mult: v })} fmt={(v) => `${v.toFixed(2)}×`} />
          <Slider label="Source coverage" value={p.source_mult} min={0.7} max={1.3} step={0.05}
            onChange={(v) => set({ source_mult: v })} fmt={(v) => `${v.toFixed(2)}×`}
            hint="Adjust if you think trackers see more/less of the market than usual." />
          <Slider label="Growth / period" value={p.growth_pct} min={-25} max={50} step={1}
            onChange={(v) => set({ growth_pct: v })} fmt={(v) => `${v}%`} />
          <Slider label="Forecast months" value={p.periods} min={3} max={24} step={1}
            onChange={(v) => set({ periods: v })} />
          <Slider label="Range width" value={p.range_width} min={0.5} max={2} step={0.05}
            onChange={(v) => set({ range_width: v })} fmt={(v) => `${v.toFixed(2)}×`}
            hint="Scales the width of the prediction-interval fan." />
          <Slider label="Alpha (interval)" value={p.alpha} min={0.01} max={0.2} step={0.01}
            onChange={(v) => set({ alpha: v })} fmt={(v) => `${((1 - v) * 100).toFixed(0)}% CI`} />
          <div>
            <div className="mb-1 text-[11px] text-subtle">Forecast method</div>
            <select
              value={p.method}
              onChange={(e) => set({ method: e.target.value as ScenarioParams['method'] })}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-accent-500 focus:outline-none"
            >
              {METHODS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={onRun}
              disabled={loading}
              className="w-full rounded-lg bg-inverse px-3 py-2 text-xs font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90 disabled:opacity-40"
            >
              {loading ? 'Forecasting…' : forecast ? 'Update forecast' : 'Run forecast'}
            </button>
          </div>
        </div>
      </div>

      {!forecast ? (
        <p className="text-sm text-muted">
          Run the forecast to project competitive spend forward with prediction intervals.
        </p>
      ) : !forecast.has_dates ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {forecast.warnings[forecast.warnings.length - 1] ??
            'Forecasting needs a date column in your export.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Model support" value={fmtPct(forecast.model_support_score ?? 0)} />
            <Kpi
              label="Forecast reliability"
              value={fmtPct(rel?.score ?? 0)}
              sub={rel?.label}
            />
            <Kpi
              label="Trend p-value"
              value={fmtNum(stats?.p_value, 4)}
              sub={stats?.method === 'fallback' ? 'flat fallback' : undefined}
            />
            <Kpi label="R²" value={fmtNum(stats?.r_squared)} />
          </div>

          <div className="rounded-xl border border-line/50 bg-surface-sunken/40 p-3">
            <VegaChart
              spec={forecastFanSpec({
                title: 'Total competitive spend — forecast',
                subtitle: 'Modeled history → dashed projection with 80/90/95% intervals',
                history: fanHistory,
                forecast: fanForecast,
              })}
              saveable
            />
          </div>

          <details className="rounded-xl border border-line/50 bg-surface-sunken/40">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-foreground">
              Forecast QA table
            </summary>
            <div className="overflow-x-auto border-t border-line/45">
              <table className="w-full text-xs">
                <thead className="text-faint">
                  <tr className="text-right">
                    <th className="px-3 py-2 text-left font-medium">Month</th>
                    <th className="px-3 py-2 font-medium">Central</th>
                    <th className="px-3 py-2 font-medium">Sel. low</th>
                    <th className="px-3 py-2 font-medium">Sel. high</th>
                    <th className="px-3 py-2 font-medium">90% low</th>
                    <th className="px-3 py-2 font-medium">90% high</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {(forecast.total_forecast ?? []).map((f) => (
                    <tr key={f.month} className="text-right hover:bg-surface/30">
                      <td className="px-3 py-1.5 text-left text-subtle">{f.month.slice(0, 7)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-foreground">{fmtUsd(f.central_forecast)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-subtle">{fmtUsd(f.ci_low ?? f.ci_low_90)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-subtle">{fmtUsd(f.ci_high ?? f.ci_high_90)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-faint">{fmtUsd(f.ci_low_90)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-faint">{fmtUsd(f.ci_high_90)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

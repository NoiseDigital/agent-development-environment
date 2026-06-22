'use client';

// Output for an OLS regression run from /analyze: a fit-quality summary, the
// coefficient table (with significance), and an actual-vs-predicted scatter.

import type { RegressResult } from '../../lib/api/stats';
import { fitScatterSpec } from '../../lib/charts/specs';
import InfoHint from '../ui/InfoHint';
import VegaChart from '../VegaChart';

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) !== 0 && (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e6)) return n.toExponential(2);
  return n.toFixed(digits);
}

function pCell(p: number): string {
  return p < 0.001 ? '<0.001' : p.toFixed(3);
}

export default function RegressionResults({
  result,
  alpha,
}: {
  result: RegressResult;
  alpha: number;
}) {
  const scatter = fitScatterSpec({
    title: 'Actual vs predicted',
    subtitle: `R² ${fmt(result.r_squared, 3)} · ${result.n_obs.toLocaleString()} obs`,
    data: result.fit_points,
  });

  const stats: { label: string; value: string }[] = [
    { label: 'R²', value: fmt(result.r_squared, 3) },
    { label: 'Adj. R²', value: fmt(result.adj_r_squared, 3) },
    { label: 'F p-value', value: pCell(result.f_pvalue) },
    { label: 'Observations', value: result.n_obs.toLocaleString() },
  ];

  // Residual diagnostics with their standard interpretation flags.
  const d = result.diagnostics;
  const dwOk = d.durbin_watson >= 1.5 && d.durbin_watson <= 2.5;
  const condWarn = d.condition_number > 30;
  const diagnostics: { label: string; value: string; warn: boolean; hint: string }[] = [
    {
      label: 'Durbin-Watson',
      value: fmt(d.durbin_watson, 2),
      warn: !dwOk,
      hint: 'Residual autocorrelation — ~2 is clean; far from 2 suggests time-structure left in the residuals.',
    },
    {
      label: 'Condition no.',
      value: fmt(d.condition_number, 0),
      warn: condWarn,
      hint: 'Multicollinearity — > 30 means predictors overlap, so individual coefficients get unstable.',
    },
    { label: 'AIC', value: fmt(d.aic, 0), warn: false, hint: 'Model-comparison score (lower is better).' },
    { label: 'BIC', value: fmt(d.bic, 0), warn: false, hint: 'Like AIC, penalises extra predictors more.' },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Fit summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line/50 bg-surface-sunken/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-faint">{s.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Model line */}
      <p className="text-xs text-subtle">
        OLS · <span className="text-foreground">{result.y}</span> ~{' '}
        {result.x.join(' + ')}
        {result.coefficients.some((c) => c.term === 'const') ? ' + const' : ''}
      </p>

      {/* Residual diagnostics */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
        {diagnostics.map((dg) => (
          <span key={dg.label} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-faint">
              {dg.label}
              <InfoHint text={dg.hint} />
            </span>
            <span className={`tabular-nums ${dg.warn ? 'font-semibold text-warning' : 'text-foreground'}`}>
              {dg.value}
            </span>
          </span>
        ))}
      </div>

      {/* Coefficient table */}
      <div className="overflow-hidden rounded-xl border border-line/50">
        <table className="w-full text-xs">
          <thead className="bg-surface-sunken/60 text-faint">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Term</th>
              <th className="px-3 py-2 text-right font-medium">Coefficient</th>
              <th className="px-3 py-2 text-right font-medium">Std. err</th>
              <th className="px-3 py-2 text-right font-medium">t</th>
              <th className="px-3 py-2 text-right font-medium">p-value</th>
              <th className="px-3 py-2 text-right font-medium">95% CI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {result.coefficients.map((c) => {
              const sig = c.p_value < alpha;
              return (
                <tr key={c.term} className="hover:bg-surface/40">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {c.term === 'const' ? <span className="text-faint">const (intercept)</span> : c.term}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmt(c.coef)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-subtle">{fmt(c.std_err)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-subtle">{fmt(c.t, 2)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${sig ? 'font-semibold text-foreground' : 'text-faint'}`}>
                    {pCell(c.p_value)}
                    {sig && <span className="ml-1 text-accent">●</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-subtle whitespace-nowrap">
                    [{fmt(c.ci_low)}, {fmt(c.ci_high)}]
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line/45 bg-surface-sunken/40 px-3 py-1.5 text-[11px] text-faint">
          <span className="text-accent">●</span> significant at α = {alpha}. A small p-value means the
          predictor&apos;s effect is unlikely to be noise — it doesn&apos;t prove causation.
        </p>
      </div>

      {/* Actual vs predicted */}
      <div className="rounded-xl border border-line/50 bg-surface-sunken/40 p-3">
        <VegaChart spec={scatter} saveable />
      </div>
    </div>
  );
}

'use client';

// Competitive Media Intelligence Estimator — upload a competitive ad-spend export
// (MediaRadar / Pathmatics), then read directional spend estimates, share-of-voice,
// and model-support scoring across markets and brands. All math runs server-side in
// mcp-stats (market_radar.run); this page is the guided wizard + dashboards.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import BrandTrajectory from '../../components/market-radar/BrandTrajectory';
import MarketRadarAssistantPanel from '../../components/market-radar/MarketRadarAssistantPanel';
import MarketRadarInsights from '../../components/market-radar/MarketRadarInsights';
import ScenarioPlanner from '../../components/market-radar/ScenarioPlanner';
import InfoHint from '../../components/ui/InfoHint';
import VegaChart from '../../components/VegaChart';
import {
  marketRadarApi,
  type AnalysisScope,
  type MarketRadarResult,
  type ForecastResult,
  type MediaDimension,
  type ScenarioParams,
  type SovRow,
} from '../../lib/api/market-radar';
import { sourcesApi } from '../../lib/api/sources';
import { buildMarketRadarContext } from '../../lib/agent/market-radar-context';
import { barSpec, rangeBarSpec, scatterSpec, stackedBarSpec } from '../../lib/charts/specs';
import { downloadCsv, downloadJson } from '../../lib/autocorr/export';
import { track } from '../../lib/analytics/track';
import {
  sourceLabel,
  sourceUri,
  type BigQueryTableRef,
  type SourceRef,
  type Upload,
} from '../../types/source';

type SourceKind = 'bigquery' | 'upload';

const SELECT_CLASS =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-accent-500 focus:outline-none';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fmtUsd = (n: number) => usd.format(n);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sov', label: 'Share of Voice' },
  { key: 'estimates', label: 'Estimates & Support' },
  { key: 'competitors', label: 'Competitors' },
  { key: 'scenario', label: 'Scenario Planner' },
  { key: 'trajectory', label: 'Brand Trajectory' },
  { key: 'export', label: 'Export' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

// ── Small presentational primitives ──────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-line/50 bg-surface-sunken/40 p-3">
      <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
        {title}
        {hint && <InfoHint text={hint} />}
      </h2>
      {children}
    </section>
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

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-line/50 bg-surface-sunken/40 p-3">{children}</div>;
}

// Top-N brands as stacked SOV series; everything else collapses into "Other" so
// the chart legend stays readable when a market has dozens of tracked brands.
function topSovSeries(sov: SovRow[], limit = 8) {
  const totals = new Map<string, number>();
  sov.forEach((s) => totals.set(s.brand, (totals.get(s.brand) ?? 0) + s.observed_spend));
  const top = new Set(
    [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([b]) => b),
  );
  const out: { category: string; series: string; value: number }[] = [];
  const other = new Map<string, number>();
  for (const s of sov) {
    if (top.has(s.brand)) out.push({ category: s.market, series: s.brand, value: s.spend_sov });
    else other.set(s.market, (other.get(s.market) ?? 0) + s.spend_sov);
  }
  for (const [market, v] of other) out.push({ category: market, series: 'Other', value: v });
  return out;
}

const BAND_CLASS: Record<string, string> = {
  High: 'text-positive',
  Moderate: 'text-foreground',
  Low: 'text-warning',
};

export default function MarketRadarPage() {
  // ── Source picker state ────────────────────────────────────────────────────
  const [sourceKind, setSourceKind] = useState<SourceKind>('upload');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadId, setUploadId] = useState('');
  const [sheet, setSheet] = useState('');
  const [bqDatasets, setBqDatasets] = useState<string[]>([]);
  const [bqDataset, setBqDataset] = useState('');
  const [bqTables, setBqTables] = useState<BigQueryTableRef[]>([]);
  const [bqTable, setBqTable] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── Run config + result ────────────────────────────────────────────────────
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic');
  const [dimension, setDimension] = useState<MediaDimension>('auto');
  const [scope, setScope] = useState<AnalysisScope>('market');
  const [result, setResult] = useState<MarketRadarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');

  // Per-market maturity overrides (markets unset here default to 1.0 server-side).
  const [maturity, setMaturity] = useState<Record<string, number>>({});
  // Scenario Planner config + its forecast result (computed on demand).
  const [scenario, setScenario] = useState<ScenarioParams>({});
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const selectedUpload = uploads.find((u) => u.id === uploadId) ?? null;
  const sheetNames = selectedUpload?.metadata.sheet_names ?? [];

  const source: SourceRef | null = useMemo(
    () =>
      sourceKind === 'upload'
        ? selectedUpload
          ? { kind: 'upload', id: selectedUpload.id, name: selectedUpload.name }
          : null
        : bqDataset && bqTable
          ? { kind: 'bigquery', dataset: bqDataset, table: bqTable }
          : null,
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    [sourceKind, selectedUpload, bqDataset, bqTable],
  );
  const sourceRefUri = source ? sourceUri(source) : '';

  // Column names the assistant uses to recommend mode (uploads expose them in
  // metadata; BigQuery tables don't until the estimate runs).
  const detectedColumns = useMemo(() => {
    const meta = selectedUpload?.metadata;
    if (!meta) return [];
    if (sheet && meta.sheets?.[sheet]) return meta.sheets[sheet];
    return meta.columns ?? [];
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
  }, [selectedUpload, sheet]);

  const contextPrefix = useMemo(
    () => buildMarketRadarContext({ source, mode, columns: detectedColumns, result }),
    [source, mode, detectedColumns, result],
  );

  const loadUploads = async () => {
    try {
      setUploads(await sourcesApi.listUploads());
    } catch {
      /* listing failures are non-fatal — BigQuery still works */
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUploads();
    sourcesApi.bigQueryDatasets().then(setBqDatasets).catch(() => setBqDatasets([]));
  }, []);

  useEffect(() => {
    if (!bqDataset) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBqTables([]);
      return;
    }
    sourcesApi.bigQueryTables(bqDataset).then(setBqTables).catch(() => setBqTables([]));
  }, [bqDataset]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const created = await sourcesApi.upload(file);
      await loadUploads();
      setSourceKind('upload');
      setSheet(created.metadata.sheet_names?.[0] ?? '');
      setUploadId(created.id);
      track('source_uploaded', { file_type: file.name.split('.').pop()?.toLowerCase() ?? 'unknown' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  // A starter CSV showing the expected schema (required + optional columns).
  const downloadTemplate = () => {
    downloadCsv('competitive-template.csv', [
      {
        brand: 'Acme',
        market: 'US',
        channel: 'CTV',
        partner: 'Hulu',
        spend: 125000,
        impressions: 4200000,
        source: 'MediaRadar',
        date: '2024-01-01',
      },
    ]);
  };

  const runEstimate = async () => {
    if (!sourceRefUri) return;
    setLoading(true);
    setError(null);
    try {
      const r = await marketRadarApi.run({
        source: sourceRefUri,
        sheet: sheet || undefined,
        mode,
        maturity,
        dimension,
        scope,
      });
      setResult(r);
      setForecast(null); // a fresh estimate invalidates the prior forecast
      setTab('overview');
      track('market_radar_run', { mode, source_kind: sourceKind });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Estimation failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runForecast = async () => {
    if (!sourceRefUri) return;
    setForecastLoading(true);
    setError(null);
    try {
      const f = await marketRadarApi.forecast({
        source: sourceRefUri,
        sheet: sheet || undefined,
        mode,
        maturity,
        dimension,
        scope,
        scenario,
      });
      setForecast(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forecast failed');
    } finally {
      setForecastLoading(false);
    }
  };

  // Auto-run the forecast the first time the user opens a forecast tab.
  useEffect(() => {
    if ((tab === 'scenario' || tab === 'trajectory') && result && !forecast && !forecastLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      runForecast();
    }
  }, [tab, result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived chart data (only when we have a result) ────────────────────────
  const kpis = result?.kpis;
  const marketRange = result?.by_market.map((m) => ({
    name: m.market,
    low: m.low,
    base: m.base,
    high: m.high,
  }));
  const sovData = result ? topSovSeries(result.sov) : [];
  const supportData = (result?.support_distribution ?? []).flatMap((r) => [
    { category: r.market, series: 'High', value: r.High },
    { category: r.market, series: 'Moderate', value: r.Moderate },
    { category: r.market, series: 'Low', value: r.Low },
  ]);
  const ovePoints = (result?.observed_vs_estimated ?? []).map((r) => ({
    x: r.observed_spend,
    y: r.estimated_base,
  }));
  const competitorBars = (result?.by_brand ?? []).map((b) => ({
    name: b.brand,
    value: b.estimated_base,
  }));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line/45 px-8 py-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Market Radar</h1>
          <p className="text-sm text-muted">
            Estimate competitor spend, share-of-voice, and model support from a media export.
          </p>
        </div>
        {source && <span className="text-xs text-faint">{sourceLabel(source)}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Controls rail ────────────────────────────────────────────────── */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-line/45">
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <Section
              title="Data source"
              hint="Upload a MediaRadar / Pathmatics export (brand, spend, source required; market, channel, impressions optional) or pick a BigQuery table."
            >
              <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
                {(['upload', 'bigquery'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSourceKind(k)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      sourceKind === k ? 'bg-surface-raised text-foreground' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {k === 'upload' ? 'Upload' : 'BigQuery'}
                  </button>
                ))}
              </div>

              {sourceKind === 'bigquery' ? (
                <div className="space-y-2">
                  <select
                    className={SELECT_CLASS}
                    value={bqDataset}
                    onChange={(e) => {
                      setBqDataset(e.target.value);
                      setBqTable('');
                    }}
                  >
                    <option value="">Select dataset…</option>
                    {bqDatasets.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  {bqDataset && (
                    <select className={SELECT_CLASS} value={bqTable} onChange={(e) => setBqTable(e.target.value)}>
                      <option value="">Select table…</option>
                      {bqTables.map((t) => (
                        <option key={t.table} value={t.table}>
                          {t.table}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    className={SELECT_CLASS}
                    value={uploadId}
                    onChange={(e) => {
                      setUploadId(e.target.value);
                      const u = uploads.find((x) => x.id === e.target.value);
                      setSheet(u?.metadata.sheet_names?.[0] ?? '');
                    }}
                  >
                    <option value="">Select upload…</option>
                    {uploads.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  {sheetNames.length > 1 && (
                    <select className={SELECT_CLASS} value={sheet} onChange={(e) => setSheet(e.target.value)}>
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                  <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    className="w-full rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent-500 hover:text-foreground disabled:opacity-50"
                  >
                    {uploading ? 'Uploading…' : '＋ Upload a file'}
                  </button>
                </div>
              )}
            </Section>

            <Section
              title="Estimation mode"
              hint="Basic grosses observed spend by a flat coverage factor. Advanced expands each channel separately (search/social/CTV/… have different coverage gaps) — use it when your export has a channel or partner column."
            >
              <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
                {(['basic', 'advanced'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                      mode === m ? 'bg-surface-raised text-foreground' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {mode === 'advanced' && (
                <label className="block space-y-1">
                  <span className="flex items-center gap-1 text-[11px] text-subtle">
                    Media dimension
                    <InfoHint text="What advanced mode groups by: channel, partner/publisher, or both. Auto picks channel when present." />
                  </span>
                  <select
                    className={SELECT_CLASS}
                    value={dimension}
                    onChange={(e) => setDimension(e.target.value as MediaDimension)}
                  >
                    <option value="auto">Auto</option>
                    <option value="channel">Channel</option>
                    <option value="partner">Partner / publisher</option>
                    <option value="channel_partner">Channel × partner</option>
                  </select>
                </label>
              )}

              <label className="block space-y-1">
                <span className="flex items-center gap-1 text-[11px] text-subtle">
                  Analysis scope
                  <InfoHint text="Per-market keeps each market separate; Total collapses everything into one market (share-of-voice across the whole dataset)." />
                </span>
                <select
                  className={SELECT_CLASS}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as AnalysisScope)}
                >
                  <option value="market">Per market</option>
                  <option value="total">Total market</option>
                </select>
              </label>
            </Section>

            {result && result.markets_list.length > 0 && (
              <Section
                title="Market maturity"
                hint="Multiplier on each market's estimate — raise it for markets you believe are under-tracked. Re-run the estimate to apply."
              >
                <div className="space-y-2.5">
                  {result.markets_list.map((m) => {
                    const v = maturity[m] ?? 1;
                    return (
                      <div key={m}>
                        <div className="mb-0.5 flex justify-between text-[11px]">
                          <span className="truncate text-subtle">{m}</span>
                          <span className="font-mono text-foreground">{v.toFixed(2)}×</span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={2}
                          step={0.05}
                          value={v}
                          onChange={(e) =>
                            setMaturity((prev) => ({ ...prev, [m]: Number(e.target.value) }))
                          }
                          className="w-full accent-accent-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>

          <div className="shrink-0 border-t border-line/45 p-3">
            <button
              type="button"
              onClick={runEstimate}
              disabled={!sourceRefUri || loading}
              className="w-full rounded-lg bg-inverse px-3 py-2.5 text-xs font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Estimating…' : 'Run estimate'}
            </button>
          </div>
        </aside>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {!result ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="max-w-md space-y-2">
                <h2 className="text-lg font-semibold text-foreground">Estimate competitor media spend</h2>
                <p className="text-sm text-muted">
                  Upload a competitive export on the left, choose a mode, and run the estimate. You&apos;ll
                  get spend estimates with low/high ranges, share-of-voice by market, and a model-support
                  score telling you how much to trust each number.
                </p>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="text-xs font-medium text-accent-400 transition-colors hover:text-accent-500"
                >
                  ⤓ Download CSV template
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Tab bar */}
              <div className="flex gap-1 border-b border-line/45">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      tab === t.key
                        ? 'border-accent-500 text-foreground'
                        : 'border-transparent text-muted hover:text-foreground'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
                  {result.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}

              {/* ── Overview ──────────────────────────────────────────────── */}
              {tab === 'overview' && kpis && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <Kpi label="Observed spend" value={fmtUsd(kpis.observed_spend)} sub="As reported in the export" />
                    <Kpi
                      label="Estimated spend"
                      value={fmtUsd(kpis.estimated_base)}
                      sub={`${fmtUsd(kpis.estimated_low)} – ${fmtUsd(kpis.estimated_high)}`}
                    />
                    <Kpi
                      label="Model support"
                      value={fmtPct(kpis.model_support_score)}
                      sub={mode === 'advanced' ? 'Advanced (per-channel)' : 'Basic (flat factor)'}
                    />
                    <Kpi label="Brands" value={fmtInt(kpis.brands)} />
                    <Kpi label="Markets" value={fmtInt(kpis.markets)} />
                    <Kpi
                      label="Gross-up"
                      value={`${(kpis.estimated_base / Math.max(kpis.observed_spend, 1)).toFixed(2)}×`}
                      sub="Estimated ÷ observed"
                    />
                  </div>
                  <MarketRadarInsights result={result} />
                  {marketRange && marketRange.length > 0 && (
                    <Card>
                      <VegaChart
                        spec={rangeBarSpec({
                          title: 'Estimated spend by market',
                          subtitle: 'Bar = low–high range · tick = base estimate',
                          data: marketRange,
                        })}
                        saveable
                      />
                    </Card>
                  )}
                </div>
              )}

              {/* ── Share of Voice ────────────────────────────────────────── */}
              {tab === 'sov' && (
                <div className="space-y-5">
                  <Card>
                    <VegaChart
                      spec={stackedBarSpec({
                        title: 'Spend share of voice by market',
                        subtitle: 'Share of observed spend within each market (top 8 brands + Other)',
                        data: sovData,
                        categoryLabel: 'Market',
                        seriesLabel: 'Brand',
                        normalize: true,
                      })}
                      saveable
                    />
                  </Card>
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-faint">
                          <tr className="text-right">
                            <th className="px-3 py-2 text-left font-medium">Market</th>
                            <th className="px-3 py-2 text-left font-medium">Brand</th>
                            <th className="px-3 py-2 font-medium">Observed</th>
                            <th className="px-3 py-2 font-medium">Spend SOV</th>
                            <th className="px-3 py-2 font-medium">Impr. SOV</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/60">
                          {result.sov.slice(0, 40).map((s, i) => (
                            <tr key={i} className="text-right hover:bg-surface/30">
                              <td className="px-3 py-1.5 text-left text-subtle">{s.market}</td>
                              <td className="px-3 py-1.5 text-left font-medium text-muted">{s.brand}</td>
                              <td className="px-3 py-1.5 tabular-nums text-subtle">{fmtUsd(s.observed_spend)}</td>
                              <td className="px-3 py-1.5 tabular-nums text-foreground">{fmtPct(s.spend_sov)}</td>
                              <td className="px-3 py-1.5 tabular-nums text-subtle">
                                {s.impression_sov != null ? fmtPct(s.impression_sov) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}

              {/* ── Estimates & Support ───────────────────────────────────── */}
              {tab === 'estimates' && (
                <div className="space-y-5">
                  <Card>
                    <VegaChart
                      spec={scatterSpec({
                        title: 'Observed vs estimated spend',
                        subtitle: 'Each point is a brand × market — the trendline is the effective gross-up',
                        data: ovePoints,
                        xLabel: 'Observed spend',
                        yLabel: 'Estimated spend',
                      })}
                      saveable
                    />
                  </Card>
                  <Card>
                    <VegaChart
                      spec={stackedBarSpec({
                        title: 'Model support by market',
                        subtitle: 'Brand × market cells binned by data-coverage band',
                        data: supportData,
                        categoryLabel: 'Market',
                        seriesLabel: 'Support',
                      })}
                      saveable
                    />
                  </Card>
                </div>
              )}

              {/* ── Competitors ───────────────────────────────────────────── */}
              {tab === 'competitors' && (
                <div className="space-y-5">
                  <Card>
                    <VegaChart
                      spec={barSpec({
                        title: 'Top competitors by estimated spend',
                        data: competitorBars,
                        valueFormat: '$',
                      })}
                      saveable
                    />
                  </Card>
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-faint">
                          <tr className="text-right">
                            <th className="px-3 py-2 text-left font-medium">Brand</th>
                            <th className="px-3 py-2 text-left font-medium">Market</th>
                            <th className="px-3 py-2 font-medium">Estimated spend</th>
                            <th className="px-3 py-2 text-left font-medium">Support</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/60">
                          {result.top_combinations.map((c, i) => (
                            <tr key={i} className="hover:bg-surface/30">
                              <td className="px-3 py-1.5 font-medium text-muted">{c.brand}</td>
                              <td className="px-3 py-1.5 text-subtle">{c.market}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                                {fmtUsd(c.estimated_base)}
                              </td>
                              <td className={`px-3 py-1.5 font-medium ${BAND_CLASS[c.support_band] ?? 'text-subtle'}`}>
                                {c.support_band}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}

              {/* ── Scenario Planner ──────────────────────────────────────── */}
              {tab === 'scenario' && (
                <ScenarioPlanner
                  params={scenario}
                  onChange={setScenario}
                  onRun={runForecast}
                  loading={forecastLoading}
                  forecast={forecast}
                />
              )}

              {/* ── Brand Trajectory ──────────────────────────────────────── */}
              {tab === 'trajectory' &&
                (forecastLoading && !forecast ? (
                  <p className="text-sm text-muted">Forecasting brand trajectories…</p>
                ) : forecast && !forecast.has_dates ? (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                    {forecast.warnings[forecast.warnings.length - 1] ??
                      'Brand trajectories need a date column in your export.'}
                  </div>
                ) : (
                  <BrandTrajectory brands={forecast?.brands ?? []} />
                ))}

              {/* ── Export ────────────────────────────────────────────────── */}
              {tab === 'export' && (
                <div className="max-w-md space-y-3">
                  <p className="text-sm text-muted">Download the estimator output for reporting or a deeper dive.</p>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => downloadCsv('competitive-by-market.csv', result.by_market)}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
                    >
                      ⤓ Estimates by market (CSV)
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadCsv('competitive-sov.csv', result.sov)}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
                    >
                      ⤓ Share of voice (CSV)
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadCsv('competitive-observed-vs-estimated.csv', result.observed_vs_estimated)}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
                    >
                      ⤓ Observed vs estimated (CSV)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadJson('competitive-result.json', { source: sourceRefUri, ...result })
                      }
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
                    >
                      ⤓ Full result (JSON)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Competitive Assistant (right rail) ───────────────────────────── */}
        <MarketRadarAssistantPanel contextPrefix={contextPrefix} sourceKey={sourceRefUri} />
      </div>
    </div>
  );
}

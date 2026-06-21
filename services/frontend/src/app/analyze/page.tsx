'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sourcesApi } from '../../lib/api/sources';
import { statsApi, type CorrelateResult, type QaResult, type ColumnProfile, type RegressResult, type PairsResult, type ColumnStat } from '../../lib/api/stats';
import { downloadCsv, downloadJson } from '../../lib/analyze/export';
import { track } from '../../lib/analytics/track';
import type { Upload, SourceRef, BigQueryTableRef } from '../../types/source';
import { sourceUri, sourceLabel } from '../../types/source';
import { heatmapSpec, scatterSpec } from '../../lib/charts/specs';
import { buildAnalyzeContext } from '../../lib/agent/analyze-context';
import VegaChart from '../../components/VegaChart';
import InfoHint from '../../components/ui/InfoHint';
import AnalyzeAssistantPanel from '../../components/analyze/AnalyzeAssistantPanel';
import RegressionResults from '../../components/analyze/RegressionResults';
import ColumnProfileTable from '../../components/analyze/ColumnProfileTable';

// ── Layout primitive — a card-shaped section used in the controls rail. ────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line/80 bg-surface-sunken/40 p-3 space-y-2">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
          {title}
          {hint && <InfoHint text={hint} />}
        </h2>
      </header>
      {children}
    </section>
  );
}

// ── Control helpers ────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="flex items-center gap-1 text-subtle">{label}{hint && <InfoHint text={hint} />}</span>
        <span className="font-mono text-foreground">{value}</span>
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

// Only numeric columns can be correlated. Non-numeric columns are shown but
// disabled with a type tag, and sparse numeric columns are flagged — so users
// are guided toward columns worth analyzing rather than picking dead ends.
function ColumnSelect({
  label, hint, tip, columns, selected, onChange, loading,
}: {
  label: string; hint?: string; tip?: string; columns: ColumnProfile[];
  selected: string[]; onChange: (cols: string[]) => void; loading?: boolean;
}) {
  const toggle = (c: string) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const numericNames = columns.filter((c) => c.kind === 'numeric').map((c) => c.name);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-muted">
          {label} {hint && <span className="font-normal text-disabled">{hint}</span>}
          {tip && <InfoHint text={tip} />}
        </span>
        <span className="flex gap-2 text-[10px]">
          <button type="button" onClick={() => onChange(numericNames)} className="text-faint hover:text-foreground">All</button>
          <button type="button" onClick={() => onChange([])} className="text-faint hover:text-foreground">Clear</button>
        </span>
      </div>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-line bg-surface-sunken">
        {loading ? (
          <p className="px-2.5 py-2 text-[11px] text-disabled">Profiling columns…</p>
        ) : columns.length === 0 ? (
          <p className="px-2.5 py-2 text-[11px] text-disabled">No columns</p>
        ) : (
          columns.map((c) => {
            const numeric = c.kind === 'numeric';
            const sel = selected.includes(c.name);
            return (
              <label
                key={c.name}
                title={numeric ? undefined : `${c.kind} column — not correlatable`}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${
                  numeric ? 'cursor-pointer text-muted hover:bg-surface' : 'cursor-not-allowed text-disabled'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!numeric}
                  checked={sel}
                  onChange={() => numeric && toggle(c.name)}
                  className="accent-accent-500 disabled:opacity-40"
                />
                <span className="flex-1 truncate">{c.name}</span>
                {numeric ? (
                  c.missing_pct >= 25 && (
                    <span className="shrink-0 text-[10px] text-warning" title="High missingness">
                      {c.missing_pct.toFixed(0)}% null
                    </span>
                  )
                ) : (
                  <span className="shrink-0 text-[10px] uppercase text-disabled">
                    {c.kind === 'datetime' ? 'date' : 'text'}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

const Toggle = ({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent-500" />
    <span className="flex items-center gap-1">{label}{hint && <InfoHint text={hint} />}</span>
  </label>
);

// ── Page ──────────────────────────────────────────────────────────────────────

type SourceKind = 'upload' | 'bigquery';

export default function AnalyzePage() {
  // Source selection
  const [sourceKind, setSourceKind] = useState<SourceKind>('bigquery');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadId, setUploadId] = useState('');
  const [sheet, setSheet] = useState('');
  const [bqDatasets, setBqDatasets] = useState<string[]>([]);
  const [bqDataset, setBqDataset] = useState('');
  const [bqTables, setBqTables] = useState<BigQueryTableRef[]>([]);
  const [bqTable, setBqTable] = useState('');
  const [columnProfiles, setColumnProfiles] = useState<ColumnProfile[]>([]);
  const [columnStats, setColumnStats] = useState<ColumnStat[]>([]);
  const [describing, setDescribing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Analysis mode
  const [mode, setMode] = useState<'correlate' | 'regress'>('correlate');

  // Correlation controls
  const [setA, setSetA] = useState<string[]>([]);
  const [setB, setSetB] = useState<string[]>([]);
  const [method, setMethod] = useState<'pearson' | 'spearman'>('pearson');
  const [alpha, setAlpha] = useState(0.05);
  const [lag, setLag] = useState(0);
  const [topN, setTopN] = useState(20);
  const [winsorize, setWinsorize] = useState(false);
  const [log1p, setLog1p] = useState(false);
  const [zscore, setZscore] = useState(false);
  const [difference, setDifference] = useState(false);

  // Segmentation (shared by correlate + regress)
  const [groupCol, setGroupCol] = useState('');
  const [groupVal, setGroupVal] = useState('');
  const [timeCol, setTimeCol] = useState('');

  // Regression controls
  const [regY, setRegY] = useState('');
  const [regX, setRegX] = useState<string[]>([]);
  const [regConst, setRegConst] = useState(true);
  const [regZscore, setRegZscore] = useState(false);
  const [regDiff, setRegDiff] = useState(false);
  const [regLag, setRegLag] = useState(0);

  // Results
  const [result, setResult] = useState<CorrelateResult | null>(null);
  const [regResult, setRegResult] = useState<RegressResult | null>(null);
  const [qa, setQa] = useState<QaResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scatter explorer — populated when a Top-signal row is clicked.
  const [scatter, setScatter] = useState<PairsResult | null>(null);
  const [scatterLoading, setScatterLoading] = useState(false);

  // ── Derived source + columns ────────────────────────────────────────────
  const selectedUpload = uploads.find((u) => u.id === uploadId) || null;
  const sheetNames = selectedUpload?.metadata.sheet_names ?? [];
  // Memoised so downstream hooks (the assistant context preamble) can list
  // it as a dep without re-running on every render.
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

  // ── Catalog loading ─────────────────────────────────────────────────────
  const loadUploads = useCallback(async () => {
    try {
      setUploads(await sourcesApi.listUploads());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load uploads');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUploads();
    sourcesApi.bigQueryDatasets().then(setBqDatasets).catch(() => setBqDatasets([]));
  }, [loadUploads]);

  // Reset analysis, then profile the columns + run QA whenever the resolved
  // source (or sheet) changes. `describe` drives the dtype-aware column picker.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSetA([]);
    setSetB([]);
    setResult(null);
    setRegY('');
    setRegX([]);
    setRegResult(null);
    setGroupCol('');
    setGroupVal('');
    setTimeCol('');
    setScatter(null);
    setError(null);
    if (!sourceRefUri) {
      setQa(null);
      setColumnProfiles([]);
      setColumnStats([]);
      return;
    }
    statsApi.qa(sourceRefUri, sheet || undefined).then(setQa).catch(() => setQa(null));
    statsApi
      .profile(sourceRefUri, sheet || undefined)
      .then((p) => setColumnStats(p.columns))
      .catch(() => setColumnStats([]));
    setDescribing(true);
    statsApi
      .describe(sourceRefUri, sheet || undefined)
      .then((d) => setColumnProfiles(d.columns))
      .catch(() => setColumnProfiles([]))
      .finally(() => setDescribing(false));
  }, [sourceRefUri, sheet]);

  const pickDataset = async (dataset: string) => {
    setBqDataset(dataset);
    setBqTable('');
    setBqTables([]);
    if (dataset) {
      try {
        setBqTables(await sourcesApi.bigQueryTables(dataset));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to list tables');
      }
    }
  };

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
      // Extension only — never the filename (can carry client/PII).
      track('source_uploaded', { file_type: file.name.split('.').pop()?.toLowerCase() ?? 'unknown' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const run = async () => {
    if (!source) return;
    setRunning(true);
    setError(null);
    setScatter(null);
    try {
      setResult(
        await statsApi.correlate({
          source: sourceUri(source),
          sheet: sheet || undefined,
          set_a: setA,
          set_b: setB,
          method,
          alpha,
          lag,
          top_n: topN,
          winsorize,
          log1p,
          zscore,
          difference,
          group_col: groupCol,
          group_val: groupVal,
          time_col: timeCol,
        }),
      );
      track('analysis_run', { method, source_kind: sourceUri(source).split(':')[0] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const runRegress = async () => {
    if (!source || !regY || regX.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      setRegResult(
        await statsApi.regress({
          source: sourceUri(source),
          sheet: sheet || undefined,
          y: regY,
          x: regX,
          add_constant: regConst,
          zscore: regZscore,
          difference: regDiff,
          lag: regLag,
          group_col: groupCol,
          group_val: groupVal,
          time_col: timeCol,
        }),
      );
      track('regression_run', { source_kind: sourceUri(source).split(':')[0] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regression failed');
      setRegResult(null);
    } finally {
      setRunning(false);
    }
  };

  // Numeric columns — the only ones a regression can use for Y / X.
  const numericColumns = columnProfiles.filter((c) => c.kind === 'numeric').map((c) => c.name);
  // Segmentation column options.
  const segmentColumns = columnProfiles
    .filter((c) => c.kind === 'categorical' || c.kind === 'datetime')
    .map((c) => c.name);
  const datetimeColumns = columnProfiles.filter((c) => c.kind === 'datetime').map((c) => c.name);
  const groupValues = columnProfiles.find((c) => c.name === groupCol)?.values ?? [];

  // Fetch the (x,y) points for a column pair when the user clicks a Top signal.
  const openScatter = async (a: string, b: string) => {
    if (!source) return;
    setScatterLoading(true);
    try {
      setScatter(
        await statsApi.pairs({
          source: sourceUri(source),
          sheet: sheet || undefined,
          a,
          b,
          method,
          lag,
          winsorize,
          log1p,
          zscore,
          difference,
          group_col: groupCol,
          group_val: groupVal,
          time_col: timeCol,
        }),
      );
    } catch {
      setScatter(null);
    } finally {
      setScatterLoading(false);
    }
  };

  // Export the correlation result — top-signals CSV + a reproducible run-details
  // JSON. The heatmap PNG is exported from its own chart toolbar (saveable).
  const exportResults = () => {
    if (!result) return;
    downloadCsv(
      'analyze-top-signals.csv',
      result.top_signals.map((s) => ({ a: s.a, b: s.b, r: s.r, p: s.p })),
    );
    downloadJson('analyze-run-details.json', {
      source: sourceRefUri,
      method: result.method,
      rows_used: result.n_rows_used,
      set_a: setA,
      set_b: setB,
      ...result.params,
    });
  };

  const heatmapChart = result
    ? heatmapSpec({
        title: `Correlation — ${result.method === 'spearman' ? 'Spearman' : 'Pearson'}`,
        subtitle: `${result.n_rows_used.toLocaleString()} rows analyzed${source ? ` · ${sourceLabel(source)}` : ''}`,
        rows: result.rows,
        cols: result.cols,
        matrix: result.matrix,
        significant: result.significant,
      })
    : null;

  // Context preamble for the Analyze Assistant — rebuilt on every render so
  // it's always current with the latest result + controls.
  const contextPrefix = useMemo(
    () =>
      buildAnalyzeContext({
        source,
        columns: columnProfiles,
        setA,
        setB,
        result,
        qa,
        preprocessing: { winsorize, log1p, zscore, difference },
        alpha,
        lag,
      }),
    [source, columnProfiles, setA, setB, result, qa, winsorize, log1p, zscore, difference, alpha, lag],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-8 py-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Analyze</h1>
          <p className="mt-0.5 text-xs text-faint">
            Correlate drivers against KPIs across any data source.
          </p>
        </div>
        {source && (
          <div className="hidden items-center gap-2 text-[11px] text-faint md:flex">
            <span className="rounded-full bg-surface px-2 py-0.5 text-subtle">
              {sourceLabel(source)}
            </span>
            {qa && (
              <span className="text-disabled">
                {qa.row_count.toLocaleString()} rows · {qa.column_count} cols
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Controls rail ────────────────────────────────────────────── */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-line/60">
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {/* Source */}
            <Section title="Data source">
              <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
                {(['bigquery', 'upload'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSourceKind(k)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      sourceKind === k ? 'bg-surface-raised text-foreground' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {k === 'bigquery' ? 'BigQuery' : 'Upload'}
                  </button>
                ))}
              </div>

              {sourceKind === 'bigquery' ? (
                <>
                  <select
                    value={bqDataset}
                    onChange={(e) => pickDataset(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground focus:border-line-strong focus:outline-none"
                  >
                    <option value="">Select dataset…</option>
                    {bqDatasets.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {bqDataset && (
                    <select
                      value={bqTable}
                      onChange={(e) => setBqTable(e.target.value)}
                      className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground focus:border-line-strong focus:outline-none"
                    >
                      <option value="">Select table…</option>
                      {bqTables.map((t) => (
                        <option key={t.table} value={t.table}>{t.table}</option>
                      ))}
                    </select>
                  )}
                </>
              ) : (
                <>
                  <select
                    value={uploadId}
                    onChange={(e) => {
                      setUploadId(e.target.value);
                      const u = uploads.find((x) => x.id === e.target.value);
                      setSheet(u?.metadata.sheet_names?.[0] ?? '');
                    }}
                    className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground focus:border-line-strong focus:outline-none"
                  >
                    <option value="">Select an upload…</option>
                    {uploads.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {sheetNames.length > 0 && (
                    <select
                      value={sheet}
                      onChange={(e) => setSheet(e.target.value)}
                      className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground focus:border-line-strong focus:outline-none"
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>Sheet: {s}</option>
                      ))}
                    </select>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls,.xlsb"
                    onChange={handleUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground disabled:opacity-50"
                  >
                    {uploading ? 'Uploading…' : 'Upload a file'}
                  </button>
                </>
              )}
            </Section>

            {/* Analysis mode */}
            <Section title="Analysis" hint="Correlation surfaces which variables move together. Regression fits an outcome (Y) on one or more predictors (X) and reports each driver's effect.">
              <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
                {(['correlate', 'regress'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      mode === m ? 'bg-surface-raised text-foreground' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {m === 'regress' ? 'Regression' : 'Correlation'}
                  </button>
                ))}
              </div>
            </Section>

            {/* Segmentation — applies to both modes; the time column also fixes
                the ordering used by Difference / Lag (otherwise raw row order). */}
            <Section title="Segmentation" hint="Optional. Segment to one slice (e.g. one channel), and set a time column so Difference / Lag order rows correctly.">
              <label className="mb-1 block text-[11px] font-medium text-subtle">Group by</label>
              <select
                value={groupCol}
                onChange={(e) => { setGroupCol(e.target.value); setGroupVal(''); }}
                disabled={describing}
                className="mb-2 w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground outline-none transition-colors focus:border-line-strong disabled:opacity-50"
              >
                <option value="">(whole dataset)</option>
                {segmentColumns.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {groupCol && groupValues.length > 0 && (
                <>
                  <label className="mb-1 block text-[11px] font-medium text-subtle">Value</label>
                  <select
                    value={groupVal}
                    onChange={(e) => setGroupVal(e.target.value)}
                    className="mb-2 w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground outline-none transition-colors focus:border-line-strong"
                  >
                    <option value="">(all values)</option>
                    {groupValues.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </>
              )}
              <label className="mb-1 block text-[11px] font-medium text-subtle">Time column</label>
              <select
                value={timeCol}
                onChange={(e) => setTimeCol(e.target.value)}
                disabled={describing}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground outline-none transition-colors focus:border-line-strong disabled:opacity-50"
              >
                <option value="">(none)</option>
                {datetimeColumns.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Section>

            {mode === 'correlate' && (
            <>
            {/* Columns */}
            <Section title="Columns">
              <ColumnSelect label="Set A" hint="drivers" tip="Variables you think influence the outcome — e.g. spend, impressions. Only numeric columns can be correlated." columns={columnProfiles} selected={setA} onChange={setSetA} loading={describing} />
              <ColumnSelect label="Set B" hint="KPIs · optional" tip="Outcomes to test Set A against. Leave empty to correlate Set A against itself." columns={columnProfiles} selected={setB} onChange={setSetB} loading={describing} />
            </Section>

            {/* Method */}
            <Section title="Method" hint="Pearson measures linear correlation; Spearman measures rank (monotonic) correlation — more robust to outliers and non-linear-but-ordered trends.">
              <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
                {(['pearson', 'spearman'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                      method === m ? 'bg-surface-raised text-foreground' : 'text-faint hover:text-muted'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Section>

            {/* Preprocessing */}
            <Section title="Preprocessing">
              <div className="grid grid-cols-2 gap-2">
                <Toggle label="Winsorize" checked={winsorize} onChange={setWinsorize} hint="Clip extreme outliers to a percentile range before correlating." />
                <Toggle label="Log1p" checked={log1p} onChange={setLog1p} hint="Apply log(1 + x) — compresses skewed, heavy-tailed values." />
                <Toggle label="Z-Score" checked={zscore} onChange={setZscore} hint="Standardize each column to mean 0, standard deviation 1." />
                <Toggle label="Difference" checked={difference} onChange={setDifference} hint="Correlate period-over-period change instead of absolute values — removes shared trends." />
              </div>
            </Section>

            {/* Settings */}
            <Section title="Settings">
              <Slider label="Alpha" value={alpha} min={0.001} max={0.2} step={0.001} onChange={setAlpha} hint="Significance threshold. Correlations with a p-value above alpha are dimmed as not significant." />
              <Slider label="Lag B" value={lag} min={-12} max={12} step={1} onChange={setLag} hint="Shift Set B by N periods to test lead/lag — e.g. does spend predict next-week clicks." />
              <Slider label="Top N" value={topN} min={5} max={200} step={5} onChange={setTopN} hint="How many of the strongest correlations to list under Top signals." />
            </Section>
            </>
            )}

            {mode === 'regress' && (
            <>
            {/* Target & predictors */}
            <Section title="Target & predictors">
              <label className="mb-1.5 block text-[11px] font-medium text-subtle">Outcome (Y)</label>
              <select
                value={regY}
                onChange={(e) => setRegY(e.target.value)}
                disabled={describing}
                className="mb-3 w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground outline-none transition-colors focus:border-line-strong disabled:opacity-50"
              >
                <option value="">{describing ? 'Profiling…' : 'Select outcome…'}</option>
                {numericColumns.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <ColumnSelect
                label="Predictors (X)"
                hint="numeric"
                tip="One or more drivers to fit the outcome on. Only numeric columns can be used."
                columns={columnProfiles.filter((c) => c.name !== regY)}
                selected={regX}
                onChange={setRegX}
                loading={describing}
              />
            </Section>

            {/* Options */}
            <Section title="Options">
              <div className="grid grid-cols-2 gap-2">
                <Toggle label="Intercept" checked={regConst} onChange={setRegConst} hint="Add a constant term — fits the baseline level of Y when all predictors are 0." />
                <Toggle label="Z-Score" checked={regZscore} onChange={setRegZscore} hint="Standardize columns so coefficients are comparable across different scales." />
                <Toggle label="Difference" checked={regDiff} onChange={setRegDiff} hint="Fit on period-over-period change — removes shared trends before regressing." />
              </div>
              <div className="mt-2">
                <Slider label="Lag X" value={regLag} min={-12} max={12} step={1} onChange={setRegLag} hint="Shift the predictors by N periods to test lead/lag — does X predict a later Y." />
              </div>
            </Section>
            </>
            )}
          </div>

          {/* Run button — pinned to the bottom of the rail so it's always reachable. */}
          <div className="shrink-0 border-t border-line/60 p-3">
            <button
              type="button"
              onClick={mode === 'regress' ? runRegress : run}
              disabled={!source || running || (mode === 'regress' && (!regY || regX.length === 0))}
              className="w-full rounded-lg bg-inverse px-3 py-2.5 text-xs font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? 'Running…' : mode === 'regress' ? 'Run regression' : 'Run analysis'}
            </button>
          </div>
        </aside>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {qa && (() => {
            // Per-column missingness already shows inline in the column picker —
            // collapse those into a count and only enumerate other QA warnings.
            const missing = qa.warnings.filter((w) => /missing/i.test(w));
            const other = qa.warnings.filter((w) => !/missing/i.test(w));
            return (
              <div
                className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
                  qa.ok
                    ? 'border-positive/30 bg-positive/10 text-positive'
                    : 'border-warning/30 bg-warning/10 text-warning'
                }`}
              >
                <span className="font-medium">
                  Data QA — {qa.row_count.toLocaleString()} rows, {qa.column_count} columns.
                </span>
                {qa.ok && ' No issues found.'}
                {missing.length > 0 && (
                  <span>{' '}{missing.length} column{missing.length === 1 ? '' : 's'} with high missingness — see the % null tags in the column list.</span>
                )}
                {other.length > 0 && (
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {other.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {columnStats.length > 0 && (
            <div className="mb-4 max-w-4xl">
              <ColumnProfileTable columns={columnStats} />
            </div>
          )}

          {mode === 'regress' ? (
            regResult ? (
              <RegressionResults result={regResult} alpha={alpha} />
            ) : (
              <EmptyResults source={source} running={running} />
            )
          ) : result ? (
            <div className="max-w-4xl space-y-6">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={exportResults}
                  title="Download top signals (CSV) + run details (JSON)"
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
                >
                  ⤓ Export
                </button>
              </div>

              {/* Heatmap */}
              {heatmapChart && (
                <div className="rounded-xl border border-line/80 bg-surface-sunken/40 p-3">
                  <VegaChart spec={heatmapChart} saveable />
                </div>
              )}

              {/* Top signals — click a row to plot the pair below */}
              <TopSignalsTable
                signals={result.top_signals}
                alpha={alpha}
                onRowClick={openScatter}
              />

              {/* Scatter explorer */}
              {(scatter || scatterLoading) && (
                <div className="rounded-xl border border-line/80 bg-surface-sunken/40 p-3">
                  {scatterLoading ? (
                    <p className="px-2 py-10 text-center text-xs text-faint">Loading scatter…</p>
                  ) : scatter && scatter.points.length > 0 ? (
                    <VegaChart
                      spec={scatterSpec({
                        title: `${scatter.a} vs ${scatter.b}`,
                        subtitle:
                          scatter.r != null
                            ? `r ${scatter.r.toFixed(3)} · ${scatter.n.toLocaleString()} points`
                            : `${scatter.n} points`,
                        data: scatter.points,
                        xLabel: scatter.a,
                        yLabel: scatter.b,
                      })}
                      saveable
                    />
                  ) : (
                    <p className="px-2 py-10 text-center text-xs text-faint">
                      Not enough points to plot this pair.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <EmptyResults source={source} running={running} />
          )}
        </main>

        {/* ── Analyze Assistant (pinned right rail) ─────────────────────── */}
        <AnalyzeAssistantPanel contextPrefix={contextPrefix} sourceKey={sourceRefUri} />
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyResults({ source, running }: { source: SourceRef | null; running: boolean }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-sunken/40 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface">
        <svg className="h-5 w-5 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 19V6l-3 1.5M15 5v13l3-1.5M9 6l6 -1M9 19l6 -1" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-foreground">
        {running ? 'Running analysis…' : source ? 'Ready to analyze' : 'Pick a data source'}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-faint">
        {running
          ? 'Crunching correlations across your selected columns.'
          : source
            ? 'Pick driver columns (Set A), optionally choose KPIs (Set B), then click Run analysis.'
            : 'Choose a BigQuery table or upload a file in the rail on the left to begin.'}
      </p>
    </div>
  );
}

// ── Top signals — sortable, with magnitude bars + significance markers ────────

function TopSignalsTable({
  signals,
  alpha,
  onRowClick,
}: {
  signals: CorrelateResult['top_signals'];
  alpha: number;
  onRowClick?: (a: string, b: string) => void;
}) {
  const [sortKey, setSortKey] = useState<'r' | 'p'>('r');

  const sorted = useMemo(() => {
    const arr = [...signals];
    if (sortKey === 'r') arr.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    else arr.sort((a, b) => a.p - b.p);
    return arr;
  }, [signals, sortKey]);

  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-line/80 bg-surface-sunken/40 p-4">
        <h3 className="text-sm font-medium text-foreground">Top signals</h3>
        <p className="mt-2 text-xs text-faint">No signals returned.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line/80 bg-surface-sunken/40">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
        <h3 className="text-sm font-medium text-foreground">Top signals</h3>
        <div className="flex gap-1 rounded-md border border-line bg-surface p-0.5">
          {(['r', 'p'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSortKey(k)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                sortKey === k ? 'bg-surface-raised text-foreground' : 'text-faint hover:text-muted'
              }`}
            >
              {k === 'r' ? '|r|' : 'p'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line/60 text-left text-faint">
              <Th>A</Th>
              <Th>B</Th>
              <Th align="right">r</Th>
              <Th>Magnitude</Th>
              <Th align="right">p-value</Th>
              <Th align="right" className="w-12">Sig?</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const sig = s.p < alpha;
              const tone = s.r >= 0 ? 'text-rose-300' : 'text-sky-300';
              const bar = s.r >= 0 ? 'bg-rose-400/70' : 'bg-sky-400/70';
              const mag = Math.min(1, Math.abs(s.r));
              return (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(s.a, s.b)}
                  title="Plot this pair"
                  className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface/30"
                >
                  <Td><span className="text-muted">{s.a}</span></Td>
                  <Td><span className="text-muted">{s.b}</span></Td>
                  <Td align="right" className={`tabular-nums ${tone}`}>{s.r.toFixed(3)}</Td>
                  <Td>
                    <div className="relative h-2 w-full overflow-hidden rounded bg-surface">
                      <div
                        className={`absolute inset-y-0 left-0 rounded ${bar}`}
                        style={{ width: `${mag * 100}%` }}
                      />
                    </div>
                  </Td>
                  <Td align="right" className="tabular-nums text-faint">
                    {s.p < 0.001 ? s.p.toExponential(1) : s.p.toFixed(3)}
                  </Td>
                  <Td align="right">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        sig
                          ? 'border border-positive/40 bg-positive/10 text-positive'
                          : 'border border-line-strong/60 bg-surface-raised/40 text-faint'
                      }`}
                      title={sig ? `p < α (${alpha})` : `p ≥ α (${alpha}) — not significant`}
                    >
                      {sig ? '✓' : '—'}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children, align = 'left', className = '',
}: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-medium uppercase tracking-wider ${className}`}
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children, align = 'left', className = '',
}: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <td className={`px-3 py-2 ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}

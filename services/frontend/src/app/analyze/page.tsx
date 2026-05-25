'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { sourcesApi } from '../../lib/sources-api';
import { statsApi, type CorrelateResult, type QaResult, type ColumnProfile } from '../../lib/stats-api';
import type { Upload, SourceRef, BigQueryTableRef } from '../../types/source';
import { sourceUri, sourceLabel } from '../../types/source';
import { heatmapSpec } from '../../lib/vega-specs';
import VegaChart from '../../components/VegaChart';
import InfoHint from '../../components/InfoHint';

// ── Control helpers ───────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-zinc-400 flex items-center gap-1">{label}{hint && <InfoHint text={hint} />}</span>
        <span className="text-zinc-200 font-mono">{value}</span>
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
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-zinc-300 flex items-center gap-1">
          {label} {hint && <span className="text-zinc-600 font-normal">{hint}</span>}
          {tip && <InfoHint text={tip} />}
        </span>
        <span className="flex gap-2 text-[10px]">
          <button type="button" onClick={() => onChange(numericNames)} className="text-zinc-500 hover:text-white">All</button>
          <button type="button" onClick={() => onChange([])} className="text-zinc-500 hover:text-white">Clear</button>
        </span>
      </div>
      <div className="border border-zinc-800 rounded-lg bg-zinc-950 max-h-40 overflow-y-auto">
        {loading ? (
          <p className="text-[11px] text-zinc-600 px-2.5 py-2">Profiling columns…</p>
        ) : columns.length === 0 ? (
          <p className="text-[11px] text-zinc-600 px-2.5 py-2">No columns</p>
        ) : (
          columns.map((c) => {
            const numeric = c.kind === 'numeric';
            const sel = selected.includes(c.name);
            return (
              <label
                key={c.name}
                title={numeric ? undefined : `${c.kind} column — not correlatable`}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${
                  numeric ? 'text-zinc-300 hover:bg-zinc-900 cursor-pointer' : 'text-zinc-600 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!numeric}
                  checked={sel}
                  onChange={() => numeric && toggle(c.name)}
                  className="accent-accent-500 disabled:opacity-40"
                />
                <span className="truncate flex-1">{c.name}</span>
                {numeric ? (
                  c.missing_pct >= 25 && (
                    <span className="text-[10px] text-amber-500 shrink-0" title="High missingness">
                      {c.missing_pct.toFixed(0)}% null
                    </span>
                  )
                ) : (
                  <span className="text-[10px] uppercase text-zinc-600 shrink-0">
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
  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
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
  const [describing, setDescribing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Analysis controls
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

  // Results
  const [result, setResult] = useState<CorrelateResult | null>(null);
  const [qa, setQa] = useState<QaResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived source + columns ────────────────────────────────────────────
  const selectedUpload = uploads.find((u) => u.id === uploadId) || null;
  const sheetNames = selectedUpload?.metadata.sheet_names ?? [];
  const source: SourceRef | null =
    sourceKind === 'upload'
      ? selectedUpload
        ? { kind: 'upload', id: selectedUpload.id, name: selectedUpload.name }
        : null
      : bqDataset && bqTable
        ? { kind: 'bigquery', dataset: bqDataset, table: bqTable }
        : null;
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
    loadUploads();
    sourcesApi.bigQueryDatasets().then(setBqDatasets).catch(() => setBqDatasets([]));
  }, [loadUploads]);

  // Reset analysis, then profile the columns + run QA whenever the resolved
  // source (or sheet) changes. `describe` drives the dtype-aware column picker.
  useEffect(() => {
    setSetA([]);
    setSetB([]);
    setResult(null);
    setError(null);
    if (!sourceRefUri) {
      setQa(null);
      setColumnProfiles([]);
      return;
    }
    statsApi.qa(sourceRefUri, sheet || undefined).then(setQa).catch(() => setQa(null));
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
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setResult(null);
    } finally {
      setRunning(false);
    }
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

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-800/60 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Analyze</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Correlate drivers against KPIs across any data source.
          </p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Controls ──────────────────────────────────────────────────── */}
        <aside className="w-80 shrink-0 border-r border-zinc-800/60 overflow-y-auto p-4 space-y-5">
          {/* Source */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Data source</h2>

            <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
              {(['bigquery', 'upload'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSourceKind(k)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    sourceKind === k ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
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
                  className="w-full px-2.5 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-zinc-600"
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
                    className="w-full px-2.5 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-zinc-600"
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
                  className="w-full px-2.5 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-zinc-600"
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
                    className="w-full px-2.5 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-zinc-600"
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
                  className="w-full px-3 py-1.5 text-[11px] font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-white disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Uploading…' : 'Upload a file'}
                </button>
              </>
            )}
          </div>

          {/* Column sets */}
          <div className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Columns</h2>
            <ColumnSelect label="Set A" hint="drivers" tip="Variables you think influence the outcome — e.g. spend, impressions. Only numeric columns can be correlated." columns={columnProfiles} selected={setA} onChange={setSetA} loading={describing} />
            <ColumnSelect label="Set B" hint="KPIs · optional" tip="Outcomes to test Set A against. Leave empty to correlate Set A against itself." columns={columnProfiles} selected={setB} onChange={setSetB} loading={describing} />
          </div>

          {/* Method */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              Method
              <InfoHint text="Pearson measures linear correlation; Spearman measures rank (monotonic) correlation — more robust to outliers and non-linear-but-ordered trends." />
            </h2>
            <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
              {(['pearson', 'spearman'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                    method === m ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Preprocessing */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Preprocessing</h2>
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Winsorize" checked={winsorize} onChange={setWinsorize} hint="Clip extreme outliers to a percentile range before correlating." />
              <Toggle label="Log1p" checked={log1p} onChange={setLog1p} hint="Apply log(1 + x) — compresses skewed, heavy-tailed values." />
              <Toggle label="Z-Score" checked={zscore} onChange={setZscore} hint="Standardize each column to mean 0, standard deviation 1." />
              <Toggle label="Difference" checked={difference} onChange={setDifference} hint="Correlate period-over-period change instead of absolute values — removes shared trends." />
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Settings</h2>
            <Slider label="Alpha" value={alpha} min={0.001} max={0.2} step={0.001} onChange={setAlpha} hint="Significance threshold. Correlations with a p-value above alpha are dimmed as not significant." />
            <Slider label="Lag B" value={lag} min={-12} max={12} step={1} onChange={setLag} hint="Shift Set B by N periods to test lead/lag — e.g. does spend predict next-week clicks." />
            <Slider label="Top N" value={topN} min={5} max={200} step={5} onChange={setTopN} hint="How many of the strongest correlations to list under Top signals." />
          </div>

          <button
            type="button"
            onClick={run}
            disabled={!source || running}
            className="w-full px-3 py-2.5 text-xs font-semibold text-black bg-white rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {running ? 'Running…' : 'Run analysis'}
          </button>
        </aside>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg">
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
                className={`mb-4 px-3 py-2 text-xs rounded-lg border ${
                  qa.ok
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
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
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {other.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {!result ? (
            <div className="flex flex-col items-center justify-center h-72 text-center">
              <p className="text-zinc-500 text-sm">
                {source ? 'Configure the analysis and click Run.' : 'Select a data source to begin.'}
              </p>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl">
              {heatmapChart && <VegaChart spec={heatmapChart} saveable />}

              {/* Top signals */}
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                <h3 className="text-white font-medium text-sm mb-3">Top signals</h3>
                {result.top_signals.length === 0 ? (
                  <p className="text-xs text-zinc-500">No signals.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 text-left border-b border-zinc-800/60">
                        <th className="py-1.5 font-medium">A</th>
                        <th className="py-1.5 font-medium">B</th>
                        <th className="py-1.5 font-medium text-right">r</th>
                        <th className="py-1.5 font-medium text-right">p-value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.top_signals.map((s, i) => (
                        <tr key={i} className="border-b border-zinc-800/60 last:border-0">
                          <td className="py-1.5 text-zinc-300 truncate">{s.a}</td>
                          <td className="py-1.5 text-zinc-300 truncate">{s.b}</td>
                          <td
                            className="py-1.5 text-right font-mono tabular-nums"
                            style={{ color: s.r >= 0 ? '#f87171' : '#60a5fa' }}
                          >
                            {s.r.toFixed(3)}
                          </td>
                          <td className="py-1.5 text-right font-mono tabular-nums text-zinc-500">
                            {s.p < 0.001 ? s.p.toExponential(1) : s.p.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

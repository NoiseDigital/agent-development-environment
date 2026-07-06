'use client';

// The shared data-source picker for the analysis modules (AutoCorr, Market
// Radar). Owns its own catalog state (uploads + BigQuery datasets/tables) and
// lifts only the resolved selection up via onChange — so every module gets an
// identical control, styled once. Extracted from the per-page copies that had
// drifted in padding, button copy, and toggle order.

import { useEffect, useMemo, useRef, useState } from 'react';

import { sourcesApi } from '../../lib/api/sources';
import { track } from '../../lib/analytics/track';
import {
  sourceUri,
  type BigQueryTableRef,
  type SourceRef,
  type Upload,
} from '../../types/source';

type SourceKind = 'bigquery' | 'upload';

const SELECT_CLASS =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground focus:border-accent-500 focus:outline-none';

export interface SourceSelection {
  /** Null until a complete source (table picked / upload selected) is chosen. */
  source: SourceRef | null;
  /** sourceUri(source), or '' when none — the wire form for the stats API. */
  uri: string;
  sheet: string;
  /** Column names known from upload metadata (empty for BigQuery until run). */
  columns: string[];
}

interface Props {
  onChange: (selection: SourceSelection) => void;
  /** Surfaced inline; a parent can also show it in its own error banner. */
  onError?: (message: string) => void;
}

export default function SourcePicker({ onChange, onError }: Props) {
  const [sourceKind, setSourceKind] = useState<SourceKind>('bigquery');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadId, setUploadId] = useState('');
  const [sheet, setSheet] = useState('');
  const [bqDatasets, setBqDatasets] = useState<string[]>([]);
  const [bqDataset, setBqDataset] = useState('');
  const [bqTables, setBqTables] = useState<BigQueryTableRef[]>([]);
  const [bqTable, setBqTable] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const columns = useMemo(() => {
    const meta = selectedUpload?.metadata;
    if (!meta) return [];
    if (sheet && meta.sheets?.[sheet]) return meta.sheets[sheet];
    return meta.columns ?? [];
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
  }, [selectedUpload, sheet]);

  // Lift the resolved selection up whenever it changes.
  useEffect(() => {
    onChange({ source, uri: source ? sourceUri(source) : '', sheet, columns });
  }, [source, sheet, columns]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      const created = await sourcesApi.upload(file);
      await loadUploads();
      setSourceKind('upload');
      setSheet(created.metadata.sheet_names?.[0] ?? '');
      setUploadId(created.id);
      // Extension only — never the filename (can carry client/PII).
      track('source_uploaded', { file_type: file.name.split('.').pop()?.toLowerCase() ?? 'unknown' });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
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
            onChange={(e) => {
              setBqDataset(e.target.value);
              setBqTable('');
            }}
            className={SELECT_CLASS}
          >
            <option value="">Select dataset…</option>
            {bqDatasets.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {bqDataset && (
            <select value={bqTable} onChange={(e) => setBqTable(e.target.value)} className={SELECT_CLASS}>
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
            className={SELECT_CLASS}
          >
            <option value="">Select an upload…</option>
            {uploads.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          {sheetNames.length > 0 && (
            <select value={sheet} onChange={(e) => setSheet(e.target.value)} className={SELECT_CLASS}>
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
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { sourcesApi } from '../lib/sources-api';
import type { Upload, SourceRef } from '../types/source';
import { sourceUri, uploadToRef } from '../types/source';
import { useResizable } from '../hooks/useResizable';
import ResizeHandle from './ResizeHandle';

interface SourcesSidebarProps {
  /** Sources currently active in the conversation. */
  selected: SourceRef[];
  onChange: (refs: SourceRef[]) => void;
}

function fmtSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SourcesSidebar({ selected, onChange }: SourcesSidebarProps) {
  const { width, startResize } = useResizable({ initial: 288, min: 240, max: 460, edge: 'left' });
  const [collapsed, setCollapsed] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // BigQuery catalog browser
  const [bqOpen, setBqOpen] = useState(false);
  const [datasets, setDatasets] = useState<string[]>([]);
  const [bqDataset, setBqDataset] = useState('');
  const [bqTables, setBqTables] = useState<{ dataset: string; table: string }[]>([]);
  const [bqBusy, setBqBusy] = useState(false);

  const selectedUris = new Set(selected.map(sourceUri));

  const toggle = (ref: SourceRef) => {
    const uri = sourceUri(ref);
    onChange(
      selectedUris.has(uri)
        ? selected.filter((s) => sourceUri(s) !== uri)
        : [...selected, ref],
    );
  };

  const refreshUploads = useCallback(async () => {
    try {
      setUploads(await sourcesApi.listUploads());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load uploads');
    }
  }, []);

  useEffect(() => {
    refreshUploads();
  }, [refreshUploads]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const created = await sourcesApi.upload(file);
      await refreshUploads();
      onChange([...selected, uploadToRef(created)]); // auto-activate the new upload
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleDelete = async (u: Upload) => {
    try {
      await sourcesApi.removeUpload(u.id);
      setUploads((prev) => prev.filter((x) => x.id !== u.id));
      const uri = sourceUri(uploadToRef(u));
      if (selectedUris.has(uri)) onChange(selected.filter((s) => sourceUri(s) !== uri));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const toggleBq = async () => {
    setBqOpen((v) => !v);
    if (!bqOpen && datasets.length === 0) {
      try {
        setBqBusy(true);
        setDatasets(await sourcesApi.bigQueryDatasets());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'BigQuery unavailable');
      } finally {
        setBqBusy(false);
      }
    }
  };

  const pickDataset = async (dataset: string) => {
    setBqDataset(dataset);
    setBqTables([]);
    if (!dataset) return;
    try {
      setBqBusy(true);
      setBqTables(await sourcesApi.bigQueryTables(dataset));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list tables');
    } finally {
      setBqBusy(false);
    }
  };

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 border-l border-zinc-800 bg-black flex flex-col items-center py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Show sources"
          className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M9 3h6M4 7h16" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="relative shrink-0 border-l border-zinc-800 bg-black flex flex-col"
      style={{ width }}
    >
      <ResizeHandle side="left" onPointerDown={startResize} />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Sources</h2>
          <p className="text-[11px] text-zinc-500">{selected.length} active in chat</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Hide sources"
          className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="text-[11px] text-red-400 px-4 py-2">{error}</p>}

        {/* ── Uploads ─────────────────────────────────────────────────────── */}
        <div className="p-3 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Uploads</h3>
            <input ref={fileInput} type="file" accept=".csv,.txt,.xlsx,.xls,.xlsb" onChange={handleUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="text-[11px] font-medium text-zinc-400 hover:text-white disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading…' : '+ Upload file'}
            </button>
          </div>
          {uploads.length === 0 ? (
            <p className="text-[11px] text-zinc-600 py-1">No uploaded files.</p>
          ) : (
            <ul className="space-y-1">
              {uploads.map((u) => {
                const ref = uploadToRef(u);
                const active = selectedUris.has(sourceUri(ref));
                return (
                  <li
                    key={u.id}
                    className={`group flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      active ? 'border-blue-500/40 bg-blue-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                    }`}
                  >
                    <input type="checkbox" checked={active} onChange={() => toggle(ref)} className="mt-0.5 accent-blue-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate" title={u.name}>{u.name}</p>
                      <p className="text-[10px] text-zinc-500">
                        <span className="uppercase">{(u.file_ext || '').replace('.', '') || 'file'}</span>
                        {u.metadata?.columns?.length ? ` · ${u.metadata.columns.length} cols` : ''}
                        {u.size_bytes ? ` · ${fmtSize(u.size_bytes)}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(u)}
                      title="Delete upload"
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-600 hover:text-red-400 transition-all shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── BigQuery catalog ────────────────────────────────────────────── */}
        <div className="p-3">
          <button
            type="button"
            onClick={toggleBq}
            className="flex items-center justify-between w-full mb-2"
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">BigQuery</h3>
            <svg className={`w-3 h-3 text-zinc-500 transition-transform ${bqOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {bqOpen && (
            <div className="space-y-2">
              <select
                value={bqDataset}
                onChange={(e) => pickDataset(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-white focus:outline-none focus:border-zinc-600"
              >
                <option value="">Select dataset…</option>
                {datasets.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {bqBusy && <p className="text-[11px] text-zinc-600">Loading…</p>}

              {bqTables.length > 0 && (
                <ul className="space-y-1">
                  {bqTables.map((t) => {
                    const ref: SourceRef = { kind: 'bigquery', dataset: t.dataset, table: t.table };
                    const active = selectedUris.has(sourceUri(ref));
                    return (
                      <li
                        key={t.table}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                          active ? 'border-blue-500/40 bg-blue-500/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                        }`}
                      >
                        <input type="checkbox" checked={active} onChange={() => toggle(ref)} className="accent-blue-500 shrink-0" />
                        <span className="text-xs text-white truncate" title={`${t.dataset}.${t.table}`}>{t.table}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-zinc-800 shrink-0">
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Checked sources are passed to the analyst with your next message.
        </p>
      </div>
    </aside>
  );
}

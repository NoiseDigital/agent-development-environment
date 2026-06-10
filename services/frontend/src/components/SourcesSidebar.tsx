'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { sourcesApi } from '../lib/api/sources';
import type { Upload, SourceRef } from '../types/source';
import { sourceUri, uploadToRef } from '../types/source';
import { useSidebarCollapsed } from '../contexts/SidebarContext';
import CollapsiblePanel from './ui/CollapsiblePanel';

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
  const [collapsed, setCollapsed] = useSidebarCollapsed('sources');
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

  return (
    <CollapsiblePanel
      collapsed={collapsed}
      resize={{ initial: 288, min: 240, max: 460 }}
      side="left"
      className="bg-canvas border-line/60"
      rail={
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Show sources"
          className="w-9 h-9 flex items-center justify-center text-faint hover:text-foreground hover:bg-surface-raised rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M9 3h6M4 7h16" />
          </svg>
        </button>
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-line/60 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Sources</h2>
          <p className="text-[11px] text-faint">{selected.length} active in chat</p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Hide sources"
          className="p-1.5 text-disabled hover:text-muted hover:bg-surface-raised rounded-md transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="text-[11px] text-danger px-4 py-2">{error}</p>}

        {/* ── Uploads ─────────────────────────────────────────────────────── */}
        <div className="p-3 border-b border-line/60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">Uploads</h3>
            <input ref={fileInput} type="file" accept=".csv,.txt,.xlsx,.xls,.xlsb" onChange={handleUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="text-[11px] font-medium text-subtle hover:text-foreground disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading…' : '+ Upload file'}
            </button>
          </div>
          {uploads.length === 0 ? (
            <p className="text-[11px] text-disabled py-1">No uploaded files.</p>
          ) : (
            <ul className="space-y-1">
              {uploads.map((u) => {
                const ref = uploadToRef(u);
                const active = selectedUris.has(sourceUri(ref));
                return (
                  <li
                    key={u.id}
                    className={`group flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      active ? 'border-accent-500/40 bg-accent-500/10' : 'border-line bg-surface-sunken hover:border-line-strong'
                    }`}
                  >
                    <input type="checkbox" checked={active} onChange={() => toggle(ref)} className="mt-0.5 accent-accent-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground truncate" title={u.name}>{u.name}</p>
                      <p className="text-[10px] text-faint">
                        <span className="uppercase">{(u.file_ext || '').replace('.', '') || 'file'}</span>
                        {u.metadata?.columns?.length ? ` · ${u.metadata.columns.length} cols` : ''}
                        {u.size_bytes ? ` · ${fmtSize(u.size_bytes)}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(u)}
                      title="Delete upload"
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-disabled hover:text-danger transition-all shrink-0"
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
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">BigQuery</h3>
            <svg className={`w-3 h-3 text-faint transition-transform ${bqOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {bqOpen && (
            <div className="space-y-2">
              <select
                value={bqDataset}
                onChange={(e) => pickDataset(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-surface border border-line rounded-md text-foreground focus:outline-none focus:border-line-strong"
              >
                <option value="">Select dataset…</option>
                {datasets.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {bqBusy && <p className="text-[11px] text-disabled">Loading…</p>}

              {bqTables.length > 0 && (
                <ul className="space-y-1">
                  {bqTables.map((t) => {
                    const ref: SourceRef = { kind: 'bigquery', dataset: t.dataset, table: t.table };
                    const active = selectedUris.has(sourceUri(ref));
                    return (
                      <li
                        key={t.table}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                          active ? 'border-accent-500/40 bg-accent-500/10' : 'border-line bg-surface-sunken hover:border-line-strong'
                        }`}
                      >
                        <input type="checkbox" checked={active} onChange={() => toggle(ref)} className="accent-accent-500 shrink-0" />
                        <span className="text-xs text-foreground truncate" title={`${t.dataset}.${t.table}`}>{t.table}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-line/60 shrink-0">
        <p className="text-[10px] text-disabled leading-relaxed">
          Checked sources are passed to the analyst with your next message.
        </p>
      </div>
    </CollapsiblePanel>
  );
}

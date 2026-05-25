'use client';

// Searchable multi-select. Value is pipe-delimited ("Meta|Google|Amazon")
// so the existing string-typed filter pipeline works unchanged; the BQ
// WHERE uses `IN UNNEST(SPLIT(LOWER(@x), '|'))` to expand it.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NamedValue } from '../../lib/dashboards';

interface MultiSelectFilterProps {
  label: string;
  /** Current pipe-delimited value. Empty string / undefined → "All". */
  value: string | undefined;
  options: NamedValue[];
  loading: boolean;
  /** Fires with the new pipe-delimited string, or undefined when cleared. */
  onChange: (next: string | undefined) => void;
}

function decode(v: string | undefined): string[] {
  if (!v) return [];
  return v.split('|').filter(Boolean);
}

function encode(selected: string[]): string | undefined {
  return selected.length === 0 ? undefined : selected.join('|');
}

export default function MultiSelectFilter({
  label,
  value,
  options,
  loading,
  onChange,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(decode(value)), [value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    onChange(encode([...next]));
  };

  const selectAllVisible = () => {
    const next = new Set(selected);
    filtered.forEach((o) => next.add(o.name));
    onChange(encode([...next]));
  };

  const clearAll = () => onChange(undefined);

  // Display: "All", "Meta", "Meta + 2 more" etc.
  const display = (() => {
    const arr = [...selected];
    if (arr.length === 0) return 'All';
    if (arr.length === 1) return arr[0];
    return `${arr[0]} + ${arr.length - 1} more`;
  })();

  return (
    <div ref={rootRef} className="relative">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`flex w-36 items-center justify-between gap-2 rounded-md border bg-zinc-900 px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          selected.size > 0
            ? 'border-accent-400/60 text-white'
            : 'border-zinc-800 text-zinc-300 hover:border-zinc-700'
        }`}
      >
        <span className="truncate text-left">{display}</span>
        <svg className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-950 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          {/* Search */}
          <div className="border-b border-zinc-800 p-2">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
            />
          </div>

          {/* Select all visible / clear all */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1.5 text-[10px]">
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              Select{query ? ' visible' : ' all'}
            </button>
            <span className="text-zinc-600">{selected.size} selected</span>
            <button
              type="button"
              onClick={clearAll}
              className="rounded px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              Clear all
            </button>
          </div>

          {/* Option list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-zinc-500">No matches.</p>
            ) : (
              filtered.map((o) => {
                const checked = selected.has(o.name);
                return (
                  <button
                    key={o.name}
                    type="button"
                    onClick={() => toggle(o.name)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/60"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        checked ? 'border-accent-400 bg-accent-400' : 'border-zinc-600'
                      }`}
                    >
                      {checked && (
                        <svg className="h-2.5 w-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{o.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

// 9 swatches + native colour picker. Visible only in edit mode.

import { useEffect, useRef, useState } from 'react';

const SWATCHES = [
  { name: 'Slate',     hex: '#1f2937' },
  { name: 'Indigo',    hex: '#4338ca' },
  { name: 'Violet',    hex: '#7c3aed' },
  { name: 'Magenta',   hex: '#be185d' },
  { name: 'Red',       hex: '#b91c1c' },
  { name: 'Amber',     hex: '#b45309' },
  { name: 'Emerald',   hex: '#047857' },
  { name: 'Teal',      hex: '#0f766e' },
  { name: 'Cyan',      hex: '#0e7490' },
];

interface AccentColorPickerProps {
  current: string;
  onSelect: (hex: string) => void;
  /** When set, shows a Reset action that emits this value. */
  defaultColor?: string;
}

export default function AccentColorPicker({
  current,
  onSelect,
  defaultColor,
}: AccentColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-away closes the popover. Keeping it focused on a known anchor
  // means we don't need a portal or scroll listener.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Change header color"
        aria-label="Change header color"
        className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-white/40 shadow-sm transition-transform hover:scale-110"
        style={{ backgroundColor: current }}
      >
        <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Header color
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SWATCHES.map((s) => {
              const selected = s.hex.toLowerCase() === current.toLowerCase();
              return (
                <button
                  key={s.hex}
                  type="button"
                  onClick={() => onSelect(s.hex)}
                  title={s.name}
                  aria-label={s.name}
                  className={`h-9 w-full rounded-md border-2 transition-transform hover:scale-105 ${
                    selected ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.15)]' : 'border-zinc-800'
                  }`}
                  style={{ backgroundColor: s.hex }}
                />
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
            <label className="flex flex-1 items-center gap-2 text-[11px] text-zinc-400">
              <span className="shrink-0">Custom</span>
              {/* Native color input — the OS gives us the wheel/HSV picker. */}
              <input
                type="color"
                value={current}
                onChange={(e) => onSelect(e.target.value)}
                className="h-7 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent"
              />
            </label>
            {defaultColor && current.toLowerCase() !== defaultColor.toLowerCase() && (
              <button
                type="button"
                onClick={() => onSelect(defaultColor)}
                className="rounded px-2 py-1 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

// 9 swatches + native colour picker popover. Controlled by the parent so
// the banner can be the click target — no separate swatch button.

import { useEffect, useRef } from 'react';

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
  open: boolean;
  current: string;
  onSelect: (hex: string) => void;
  onClose: () => void;
  /** When set, shows a Reset action that emits this value. */
  defaultColor?: string;
}

export default function AccentColorPicker({
  open,
  current,
  onSelect,
  onClose,
  defaultColor,
}: AccentColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-away closes the popover. The picker is anchored to its parent's
  // positioning context — the caller wraps it in `relative`.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      // Stop the banner's onClick from catching the popover's own clicks.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute left-6 top-full z-50 mt-2 w-56 rounded-lg border border-line-strong bg-surface-sunken p-3 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
    >
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-faint">
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
                selected ? 'border-foreground shadow-[0_0_0_2px_rgba(255,255,255,0.15)]' : 'border-line'
              }`}
              style={{ backgroundColor: s.hex }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <label className="flex flex-1 items-center gap-2 text-[11px] text-subtle">
          <span className="shrink-0">Custom</span>
          <input
            type="color"
            value={current}
            onChange={(e) => onSelect(e.target.value)}
            className="h-7 w-12 cursor-pointer rounded border border-line-strong bg-transparent"
          />
        </label>
        {defaultColor && current.toLowerCase() !== defaultColor.toLowerCase() && (
          <button
            type="button"
            onClick={() => onSelect(defaultColor)}
            className="rounded px-2 py-1 text-[10px] font-medium text-subtle transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

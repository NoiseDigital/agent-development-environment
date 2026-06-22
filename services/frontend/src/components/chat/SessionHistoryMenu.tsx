'use client';

// Shared "recent chats" popover for agents that live embedded in a page (the
// AutoCorr / Market Radar assistant rails) and the Agents nav. Portal-rendered
// with position:fixed so it sits on the top layer and isn't clipped by the
// scrollable panel it's anchored in. Presentational — the caller supplies rows.

import { createPortal } from 'react-dom';

export interface SessionRow {
  id: string;
  name: string;
  ts: number;
}

/** ADK sometimes reports seconds; normalize to ms. */
export function toMs(ts: number): number {
  return ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
}

export function relTime(ms: number): string {
  if (!ms) return '';
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

interface Props {
  open: boolean;
  /** Viewport anchor — the menu's top-right corner pins here. */
  anchor: { x: number; y: number } | null;
  title: string;
  /** null = loading. */
  rows: SessionRow[] | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function SessionHistoryMenu({ open, anchor, title, rows, onSelect, onClose }: Props) {
  if (!open || !anchor || typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        role="menu"
        style={{ position: 'fixed', left: anchor.x, top: anchor.y, transform: 'translateX(-100%)', zIndex: 9999 }}
        className="w-60 overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-lg shadow-black/40"
      >
        <div className="border-b border-line/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
          {title}
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {rows === null ? (
            <div className="space-y-1.5 px-3 py-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface/60" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-surface/60" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-faint">No past chats yet.</p>
          ) : (
            rows.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-[10px] text-faint">{relTime(s.ts)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

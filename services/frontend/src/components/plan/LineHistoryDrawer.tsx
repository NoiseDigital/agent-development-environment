'use client';

// Per-line edit history — slides in from the right with the most-recent
// edits at the top. Backed by `loadLineHistory(lineId)` so the panel
// reflects what's actually saved, not what's in the spreadsheet's local
// React state.

import type { PlanEdit } from '../../data/plans';

interface DrawerProps {
  lineId: string;
  entries: PlanEdit[];
  onClose: () => void;
}

const fieldLabel: Record<string, string> = {
  publisher: 'Publisher',
  platform: 'Platform',
  objective: 'Objective',
  marketingObjective: 'Marketing Goal',
  creativeFormat: 'Format',
  budget: 'Budget',
  flightStart: 'Flight Start',
  flightEnd: 'Flight End',
};

export default function LineHistoryDrawer({ lineId, entries, onClose }: DrawerProps) {
  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <aside className="flex w-[360px] flex-col border-l border-line bg-surface-sunken shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <div className="flex shrink-0 items-center justify-between border-b border-line/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-faint">Edit history</p>
            <p className="truncate font-mono text-[12px] text-foreground">{lineId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {entries.length === 0 ? (
            <p className="text-[11px] text-faint">
              No edits yet. Changes you make to this line will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e, i) => (
                <li key={i} className="rounded-lg border border-line/60 bg-surface/40 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] font-medium text-foreground">
                      {fieldLabel[e.field] ?? e.field}
                    </span>
                    <span className="text-[10px] text-faint">{relativeTime(e.at)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-danger/10 px-1.5 py-0.5 text-danger line-through">
                      {e.before ?? '—'}
                    </span>
                    <span className="text-disabled">→</span>
                    <span className="rounded bg-positive/10 px-1.5 py-0.5 text-positive">
                      {e.after ?? '—'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-faint">by {e.by}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/** "5m ago" / "3h ago" / "yesterday" / explicit date. Enough resolution
 *  for an edit log; the absolute date kicks in past a week. */
function relativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(at).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
